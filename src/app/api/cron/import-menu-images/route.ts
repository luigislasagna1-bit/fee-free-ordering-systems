import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// Generous ceiling — a run does a bounded batch at low concurrency, so it
// normally finishes in seconds; this only matters if many images are slow.
export const maxDuration = 300;

/**
 * GET /api/cron/import-menu-images — background photo "drip" importer.
 *
 * GloriaFood's image CDN serves every photo fine to a normal client, but
 * THROTTLES bursts from a datacenter IP (Vercel) — returning 403/429 under
 * load. So the menu importer ENQUEUES photos (PendingMenuImage rows) and this
 * cron — run every minute — pulls a SMALL batch at LOW concurrency with a pause
 * between requests, re-hosts each on Vercel Blob, sets the item/category
 * imageUrl, and deletes the row.
 *
 * CRITICAL: a throttle response (any 4xx that isn't 404/410) is TEMPORARY, so
 * we RETRY it on a later run — we do NOT drop it. (The first version treated
 * every 4xx as permanent and deleted throttled photos, so the queue emptied
 * with zero photos landing.) Only a genuine 404/410 (image truly gone) is
 * dropped. Spreading the work thin + retrying is what makes EVERY photo
 * eventually land. Luigi/Fabrizio 2026-06-17.
 *
 * Idempotent + overlap-safe: rows are deleted as they succeed, blob writes use
 * allowOverwrite (GloriaFood reuses a photo across items → same path; a retry
 * re-writes the same path), and item/category updates use updateMany so a
 * since-deleted target is a no-op. `lastError` records why a row is still stuck.
 */
const BATCH = 25; // images per run
const CONCURRENCY = 2; // simultaneous downloads — gentle, to stay under the burst-ban
const MAX_ATTEMPTS = 40; // throttled photos ARE available; give them many gentle retries before giving up
const TIMEOUT_MS = 20_000;
const DELAY_MS = 350; // pause between requests per worker — spread the load over time
const FETCH_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/jpeg,image/png,image/*,*/*",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ ok: true, skipped: "no BLOB token" });
  }

  // Fewest-attempts first (fresh ones win), oldest first within that.
  const rows = await prisma.pendingMenuImage.findMany({
    orderBy: [{ attempts: "asc" }, { createdAt: "asc" }],
    take: BATCH,
  });
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, imported: 0, retried: 0, dropped: 0, remaining: 0 });
  }

  const { put } = await import("@vercel/blob");
  let imported = 0;
  let retried = 0;
  let dropped = 0;

  // Record a failure: retry (bump attempts + remember why) unless it's a
  // permanent "gone" or we've exhausted the attempt cap.
  const fail = async (row: (typeof rows)[number], reason: string, permanent: boolean) => {
    if (permanent || row.attempts + 1 >= MAX_ATTEMPTS) {
      await prisma.pendingMenuImage.delete({ where: { id: row.id } }).catch(() => {});
      dropped++;
      console.warn(`[import-menu-images] drop ${row.sourceUrl}: ${reason}${permanent ? " (gone)" : ` (>=${MAX_ATTEMPTS} tries)`}`);
    } else {
      await prisma.pendingMenuImage
        .update({ where: { id: row.id }, data: { attempts: { increment: 1 }, lastTriedAt: new Date(), lastError: reason.slice(0, 200) } })
        .catch(() => {});
      retried++;
    }
  };

  let idx = 0;
  const worker = async () => {
    while (idx < rows.length) {
      const row = rows[idx++];
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(row.sourceUrl, { cache: "no-store", signal: ctrl.signal, headers: FETCH_HEADERS });
        if (!res.ok) {
          // Only 404/410 mean the image is genuinely gone → drop. Everything
          // else (403/429/5xx-shaped-as-4xx) is the CDN throttling our IP →
          // keep the row and retry next run.
          await fail(row, `HTTP ${res.status}`, res.status === 404 || res.status === 410);
          continue;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        const filename = row.sourceUrl.split("/").pop() || `gf-${row.id}.jpg`;
        const blob = await put(`${row.restaurantId}/menu/${filename}`, buf, {
          access: "public",
          addRandomSuffix: false,
          allowOverwrite: true, // shared photos hit the same path; retries re-write it
          contentType: res.headers.get("content-type") ?? "image/jpeg",
        });
        // Set the target's imageUrl, then drop the queue row. updateMany so a
        // since-deleted item/category is a clean no-op rather than a throw.
        if (row.menuItemId) {
          await prisma.menuItem.updateMany({ where: { id: row.menuItemId }, data: { imageUrl: blob.url } });
        } else if (row.menuCategoryId) {
          await prisma.menuCategory.updateMany({ where: { id: row.menuCategoryId }, data: { imageUrl: blob.url } });
        }
        await prisma.pendingMenuImage.delete({ where: { id: row.id } }).catch(() => {});
        imported++;
      } catch (e) {
        // Network / timeout / blob error — all transient. Retry next run.
        await fail(row, e instanceof Error ? e.message : String(e), false);
      } finally {
        clearTimeout(timer);
        await sleep(DELAY_MS); // be gentle — pace requests to dodge the burst-ban
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const remaining = await prisma.pendingMenuImage.count();
  console.log(`[import-menu-images] imported ${imported}, retried ${retried}, dropped ${dropped}, ${remaining} remaining`);
  return NextResponse.json({ ok: true, imported, retried, dropped, remaining });
}
