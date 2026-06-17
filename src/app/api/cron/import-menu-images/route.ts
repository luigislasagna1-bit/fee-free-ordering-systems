import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// Generous ceiling — a run does a bounded batch with low concurrency, so it
// normally finishes in seconds; this only matters if many images time out.
export const maxDuration = 300;

/**
 * GET /api/cron/import-menu-images — background photo "drip" importer.
 *
 * GloriaFood's image CDN bans bursts, so the menu importer ENQUEUES photos
 * (PendingMenuImage rows) instead of downloading 200+ inline (which only got
 * ~24 through before the rest were blocked). This cron — run every minute —
 * fetches a small batch, re-hosts each on Vercel Blob with LOW concurrency,
 * sets the item/category imageUrl, and deletes the row. A transient failure
 * (network / 5xx / timeout) bumps `attempts` and retries on a later run; a
 * permanent 4xx or too many attempts drops the row. Spreading the work across
 * runs (never a burst) is what makes EVERY photo eventually land — the menu
 * itself already imported instantly. Luigi/Fabrizio 2026-06-16.
 *
 * Idempotent + overlap-safe: rows are deleted as they're processed, blob
 * filenames are deterministic (overwrite, no dupes), and the item/category
 * update uses updateMany so a since-deleted target is a no-op.
 */
const BATCH = 40; // images per run
const CONCURRENCY = 4; // simultaneous downloads — gentle on the CDN to avoid the burst-ban
const MAX_ATTEMPTS = 25; // give up on a stubborn image after ~25 passes
const TIMEOUT_MS = 20_000;
const FETCH_HEADERS: Record<string, string> = {
  // Some CDNs reject non-browser requests — present as a real browser.
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/jpeg,image/png,image/*,*/*",
};

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

  let idx = 0;
  const worker = async () => {
    while (idx < rows.length) {
      const row = rows[idx++];
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(row.sourceUrl, { cache: "no-store", signal: ctrl.signal, headers: FETCH_HEADERS });
        if (!res.ok) {
          // 4xx (gone/forbidden) is permanent → drop. 5xx → retry.
          if (res.status >= 400 && res.status < 500) {
            await prisma.pendingMenuImage.delete({ where: { id: row.id } }).catch(() => {});
            dropped++;
            continue;
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const buf = Buffer.from(await res.arrayBuffer());
        const filename = row.sourceUrl.split("/").pop() || `gf-${row.id}.jpg`;
        const blob = await put(`${row.restaurantId}/menu/${filename}`, buf, {
          access: "public",
          addRandomSuffix: false,
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
        // Transient — bump attempts and retry next run (or drop after the cap).
        if (row.attempts + 1 >= MAX_ATTEMPTS) {
          await prisma.pendingMenuImage.delete({ where: { id: row.id } }).catch(() => {});
          dropped++;
          console.warn(`[import-menu-images] giving up on ${row.sourceUrl} after ${MAX_ATTEMPTS} tries:`, e instanceof Error ? e.message : String(e));
        } else {
          await prisma.pendingMenuImage
            .update({ where: { id: row.id }, data: { attempts: { increment: 1 }, lastTriedAt: new Date() } })
            .catch(() => {});
          retried++;
        }
      } finally {
        clearTimeout(timer);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const remaining = await prisma.pendingMenuImage.count();
  console.log(`[import-menu-images] imported ${imported}, retried ${retried}, dropped ${dropped}, ${remaining} remaining`);
  return NextResponse.json({ ok: true, imported, retried, dropped, remaining });
}
