import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import {
  extractMenuWithClaude,
  extractMenuWithRegex,
  type ExtractedCategory,
} from "@/lib/menu-extractor";

// Claude PDF parsing is slow; bump the function timeout. Vercel Hobby caps
// out at 60s, which is plenty for typical menus (5-15 seconds).
export const maxDuration = 60;

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

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("pdf") as File | null;
  if (!file) return NextResponse.json({ error: "No PDF file provided" }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
    return NextResponse.json({ error: "File must be a PDF" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "PDF must be under 10 MB" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // ─── Try Claude first ───────────────────────────────────────────────
  let categories: ExtractedCategory[] | null = null;
  let method: "claude" | "regex_fallback" = "claude";
  let note: string | undefined;

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      categories = await extractMenuWithClaude(buffer);
      if (categories.length === 0) {
        note = "Claude returned no items — falling back to regex parser.";
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
    return NextResponse.json({
      error: "No menu items detected. The PDF may be a scanned image or use an unusual layout. You can still add items manually below.",
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

      // Find current max item sort for that category
      const itemMaxSort = await tx.menuItem.aggregate({
        where: { restaurantId, categoryId },
        _max: { sortOrder: true },
      });
      let nextItemSort = (itemMaxSort._max.sortOrder ?? -1) + 1;

      for (const item of cat.items) {
        if (!item?.name || typeof item.price !== "number" || item.price <= 0) continue;
        await tx.menuItem.create({
          data: {
            restaurantId,
            categoryId,
            name: item.name.slice(0, 120),
            description: (item.description ?? "").slice(0, 500),
            price: item.price,
            sortOrder: nextItemSort++,
          },
        });
        itemsCreated++;
      }
    }
  });

  return NextResponse.json({ categoriesCreated, itemsCreated });
}
