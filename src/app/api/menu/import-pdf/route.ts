import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import {
  extractMenuWithRegex,
  type ExtractedCategory,
} from "@/lib/menu-extractor";
import { extractMenuWithSplitting } from "@/lib/menu-pdf-splitter";
import { blockIfInheritingMenu } from "@/lib/brand";

// PDF parsing is slow — large print-designed menus can take 60-90 seconds
// to extract. The legacy 60s cap was the Hobby plan ceiling. On Pro plan
// (which we're now on) Vercel allows up to 300s. We use the full window
// so big PDFs don't get cut off. If a route ever does take 300s, that's
// a real bug to investigate, not a "user's fault" timeout.
export const maxDuration = 300;

/**
 * POST /api/menu/import-pdf — extract menu from uploaded PDF.
 *
 * Request: multipart/form-data with `pdf` file (max 10 MB).
 * Response:
 *   {
 *     method: "claude" | "regex_fallback",
 *     note?: string,
 *     categories: [
 *       { name: "Pizzas", items: [{ name, description, price }, ...] },
 *       ...
 *     ],
 *     existingCategories: [{ id, name }, ...]   // restaurant's existing cats for merge UI
 *   }
 *
 * Strategy:
 *   - Try Claude first (best quality, handles multi-column layouts, real menus)
 *   - Fall back to regex if Claude isn't configured OR throws
 *   - Both produce the same shape so the UI doesn't need to branch
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Importing a PDF would write categories + items to this location's
  // restaurantId — but an inheriting location can't have its own menu.
  // Block early with a clear message.
  const blocked = await blockIfInheritingMenu(restaurantId);
  if (blocked) return blocked;

  // Two ways to receive the PDF:
  //   1. JSON { blobUrl } — the client uploaded directly to Vercel Blob first
  //      and is just sending us the URL. This is the preferred path for ALL
  //      menu PDFs because it bypasses Vercel's 4.5MB serverless body limit.
  //   2. multipart/form-data with `pdf` file — only works for files under
  //      ~4MB. Kept as a fallback for tiny test PDFs and for local dev.
  const contentType = req.headers.get("content-type") || "";
  let buffer: Buffer;

  if (contentType.includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as { blobUrl?: string };
    if (!body.blobUrl || typeof body.blobUrl !== "string") {
      return NextResponse.json({ error: "Missing blobUrl" }, { status: 400 });
    }
    // Sanity check: only allow blobs from Vercel Blob's hostnames so a
    // caller can't trick us into fetching arbitrary URLs from the open
    // internet.
    try {
      const u = new URL(body.blobUrl);
      if (!/^[a-z0-9.-]+\.public\.blob\.vercel-storage\.com$/.test(u.hostname)) {
        return NextResponse.json({ error: "blobUrl must be a Vercel Blob URL" }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: "Invalid blobUrl" }, { status: 400 });
    }

    // Fetch the PDF bytes from blob storage. This stays inside Vercel's
    // network (blob is hosted on Vercel infra), so it's fast.
    const blobRes = await fetch(body.blobUrl);
    if (!blobRes.ok) {
      return NextResponse.json({ error: `Failed to fetch blob (HTTP ${blobRes.status})` }, { status: 502 });
    }
    const len = parseInt(blobRes.headers.get("content-length") || "0", 10);
    if (len > 25 * 1024 * 1024) {
      return NextResponse.json({ error: "PDF must be under 25 MB" }, { status: 400 });
    }
    buffer = Buffer.from(await blobRes.arrayBuffer());
  } else if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("pdf") as File | null;
    if (!file) return NextResponse.json({ error: "No PDF file provided" }, { status: 400 });
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      return NextResponse.json({ error: "File must be a PDF" }, { status: 400 });
    }
    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json(
        { error: "PDF too large for direct upload (>4MB). Use the blob upload flow." },
        { status: 413 }
      );
    }
    buffer = Buffer.from(await file.arrayBuffer());
  } else {
    return NextResponse.json(
      { error: "Expected application/json with blobUrl, or multipart/form-data" },
      { status: 400 }
    );
  }

  // ─── Try Claude first (with auto-splitting for big PDFs) ───────────
  // extractMenuWithSplitting handles the Anthropic 100-page limit
  // server-side: it counts pages, and if > 80 (a safe margin under
  // the 100 cap) it splits the PDF into chunks via pdf-lib, calls
  // Claude once per chunk sequentially, then merges the categories
  // de-duping by name. Owner gets a seamless one-upload experience
  // regardless of menu size. Confirmed during Luigi's UAT 2026-05-26
  // — a 125-page Italian AYCE menu that previously bounced now
  // imports cleanly in ~2 chunks.
  let categories: ExtractedCategory[] | null = null;
  let method: "claude" | "regex_fallback" = "claude";
  let note: string | undefined;
  let pageCount: number | null = null;
  let chunkCount = 1;

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const result = await extractMenuWithSplitting(buffer);
      categories = result.categories;
      pageCount = result.pageCount;
      chunkCount = result.chunkCount;
      if (chunkCount > 1) {
        note = `Menu was ${pageCount} pages — split into ${chunkCount} chunks for processing, then merged.`;
      }
      if (categories.length === 0) {
        note = (note ? note + " " : "") + "Claude returned no items — falling back to regex parser.";
        categories = null;
      }
    } catch (err: any) {
      console.error("[import-pdf] Claude extraction failed:", err?.message ?? err);
      note = `Claude extraction failed (${err?.message ?? "unknown"}); using regex fallback.`;
    }
  } else {
    note = "ANTHROPIC_API_KEY not configured; using regex fallback. Set it in Vercel env vars for better extraction.";
  }

  // ─── Regex fallback ─────────────────────────────────────────────────
  if (!categories) {
    method = "regex_fallback";
    try {
      const { extractText } = await import("unpdf");
      const { text } = await extractText(new Uint8Array(buffer), { mergePages: true });
      if (!text.trim()) {
        return NextResponse.json({
          error: "No text could be extracted from this PDF. It may be a scanned image. Try a text-based PDF or paste the menu manually.",
        }, { status: 422 });
      }
      categories = extractMenuWithRegex(text);
    } catch (err: any) {
      console.error("[import-pdf] Regex fallback also failed:", err?.message ?? err);
      return NextResponse.json({
        error: "Failed to parse this PDF. Try a different file or paste your menu manually.",
      }, { status: 422 });
    }
  }

  if (!categories || categories.length === 0 || categories.every((c) => c.items.length === 0)) {
    // Surface the diagnostic note (Claude's actual error if it failed,
    // or "Claude returned no items" if it ran cleanly but extracted
    // nothing). Without this, the toast just says "no items detected"
    // and the owner has no path forward; with it, support sees
    // "Claude extraction failed (Error 400: image too large)" or
    // similar and knows what to do.
    const detail = note ? ` Details: ${note}` : "";
    return NextResponse.json({
      error:
        "No menu items detected. This usually means: (a) the PDF is a scanned image (we can't read pixel text — try a text-based PDF), (b) the layout is unusual enough that our reader can't find dish names, or (c) the menu uses photo-only design with no readable text. You can still add items manually below." + detail,
      note,
      pageCount,
    }, { status: 422 });
  }

  // Restaurant's existing categories for the merge-into-existing UI
  const existingCategories = await prisma.menuCategory.findMany({
    where: { restaurantId, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });

  const totalItems = categories.reduce((s, c) => s + c.items.length, 0);
  console.log(`[import-pdf] ${method}: ${categories.length} categories, ${totalItems} items`);

  return NextResponse.json({
    method,
    note,
    categories,
    existingCategories,
    pageCount,
    chunkCount,
  });
}

/**
 * PUT /api/menu/import-pdf — confirm the import.
 *
 * Request:
 *   {
 *     categories: [
 *       {
 *         name: "Pizzas",
 *         existingCategoryId: null | "cat_xxx",  // when set, merge into that
 *         items: [{ name, description, price }, ...]
 *       },
 *       ...
 *     ]
 *   }
 *
 * Behavior: in one transaction:
 *   - For each category: create it if no existingCategoryId, else use the
 *     existing one.
 *   - For each item: create with the right categoryId. sortOrder continues
 *     after any items already in that category.
 *
 * Returns: { categoriesCreated, itemsCreated }.
 */
export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    categories: Array<{
      name: string;
      existingCategoryId: string | null;
      items: Array<{ name: string; description: string; price: number }>;
    }>;
  };

  if (!Array.isArray(body.categories) || body.categories.length === 0) {
    return NextResponse.json({ error: "categories array required" }, { status: 400 });
  }

  let categoriesCreated = 0;
  let itemsCreated = 0;
  let itemsSkippedDuplicate = 0;

  // Pre-fetch the max sortOrder among existing categories so newly-created
  // ones append at the end.
  const catMaxSort = await prisma.menuCategory.aggregate({
    where: { restaurantId },
    _max: { sortOrder: true },
  });
  let nextCatSort = (catMaxSort._max.sortOrder ?? -1) + 1;

  await prisma.$transaction(async (tx) => {
    for (const cat of body.categories) {
      if (!cat.items || cat.items.length === 0) continue;

      // Resolve the target category id
      let categoryId: string;
      if (cat.existingCategoryId) {
        // Verify it belongs to this restaurant before writing items into it
        const existing = await tx.menuCategory.findFirst({
          where: { id: cat.existingCategoryId, restaurantId },
          select: { id: true },
        });
        if (!existing) continue; // skip — user passed a foreign id, just ignore
        categoryId = existing.id;
      } else {
        const created = await tx.menuCategory.create({
          data: {
            restaurantId,
            name: (cat.name || "Menu").slice(0, 60),
            sortOrder: nextCatSort++,
            isActive: true,
          },
          select: { id: true },
        });
        categoryId = created.id;
        categoriesCreated++;
      }

      // De-dup against items ALREADY in this category (case-insensitive
      // name match, trimmed). Without this, re-importing the same menu
      // — or merging a new menu into an existing category that already
      // has overlapping dishes — produces silent duplicates that the
      // owner then has to clean up by hand. Confirmed by Luigi during
      // UAT 2026-05-26.
      const existingItems = await tx.menuItem.findMany({
        where: { restaurantId, categoryId },
        select: { name: true, sortOrder: true },
      });
      const existingNames = new Set(existingItems.map((it) => it.name.trim().toLowerCase()));
      let nextItemSort = existingItems.reduce((max, it) => Math.max(max, it.sortOrder), -1) + 1;

      for (const item of cat.items) {
        if (!item?.name) continue;
        // Accept price = 0 (AYCE menus etc.); reject negatives + obviously bad numbers
        const price = typeof item.price === "number" && Number.isFinite(item.price) && item.price >= 0 && item.price <= 10000 ? item.price : 0;
        const normalizedName = item.name.trim().toLowerCase();
        if (existingNames.has(normalizedName)) {
          itemsSkippedDuplicate++;
          continue;
        }
        existingNames.add(normalizedName);
        await tx.menuItem.create({
          data: {
            restaurantId,
            categoryId,
            name: item.name.slice(0, 120),
            description: (item.description ?? "").slice(0, 500),
            price,
            sortOrder: nextItemSort++,
          },
        });
        itemsCreated++;
      }
    }
  });

  return NextResponse.json({ categoriesCreated, itemsCreated, itemsSkippedDuplicate });
}
