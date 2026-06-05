import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { blockIfInheritingMenu } from "@/lib/brand";
import { resolveActiveMenuId } from "@/lib/menu";
import {
  fetchGloriaFoodMenu,
  fetchGloriaFoodPictures,
  mapMenu,
  parseSource,
  type ImportPreview,
} from "@/lib/menu-import/gloriafood";

// Preview is fast (menu + pictures fetch ~2 s + parse ~100 ms). Commit
// is the slow path now that image import is wired in: 157 image
// downloads + Vercel Blob uploads for Luigi's menu, capped at 8x
// parallelism. Bumped maxDuration to 300s (Vercel Pro ceiling) so the
// commit doesn't get truncated on chains with hundreds of images.
export const maxDuration = 300;

/**
 * POST /api/menu/import-gloriafood — preview a GloriaFood menu.
 *
 * Body: { source: string }
 *   `source` accepts:
 *     • Full GloriaFood embed snippet (the `<span class="glf-button"
 *       data-glf-cuid="..." data-glf-ruid="...">…<script src=…></script>`)
 *     • The restaurant's ordering URL
 *       (https://<branded-domain>/ordering/restaurant/menu?restaurant_uid=…)
 *     • Just the restaurant UID (UUID alone)
 *
 * Response: ImportPreview (categories, items, modifier groups, stats)
 *
 * No DB writes happen here — owner sees the preview, then PUTs to
 * the same route to commit (matches the import-pdf POST/PUT pattern).
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Importing into an inheriting child location would shadow the
  // parent menu in a confusing way — block early with a clear msg.
  const blocked = await blockIfInheritingMenu(restaurantId);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as { source?: string };
  if (typeof body.source !== "string" || !body.source.trim()) {
    return NextResponse.json(
      { error: "Provide the embed snippet, ordering URL, or restaurant UID." },
      { status: 400 },
    );
  }

  let parsed;
  try {
    parsed = parseSource(body.source);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }

  let preview: ImportPreview;
  try {
    // Fetch menu + pictures in parallel — they're independent endpoints
    // on the same host so there's no benefit to serialising. mapMenu
    // takes both so item/category sourceImageUrls land on the preview.
    const [menu, pictures] = await Promise.all([
      fetchGloriaFoodMenu(parsed),
      fetchGloriaFoodPictures(parsed),
    ]);
    preview = mapMenu(menu, pictures);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[import-gloriafood] preview failed:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  // Surface the existing FFOS categories so the UI can offer
  // "merge into <existing category>" instead of duplicating when
  // the owner re-imports.
  const existingCategories = await prisma.menuCategory.findMany({
    where: { restaurantId, isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });

  console.log(
    `[import-gloriafood] preview: ${preview.stats.categories} cats, ${preview.stats.items} items, ${preview.stats.modifierGroups} groups, ${preview.stats.modifierOptions} opts`,
  );

  return NextResponse.json({
    source: parsed,
    preview,
    existingCategories,
  });
}

/**
 * PUT /api/menu/import-gloriafood — commit the previewed import.
 *
 * Body: ImportPreview shape (categories + categoryGroups) plus
 * optional per-category `existingCategoryId` to merge into existing
 * FFOS categories instead of creating new ones.
 *
 * Behaviour (one transaction):
 *   - Categories: create or reuse based on existingCategoryId.
 *     New categories get sortOrder appended after the current max.
 *   - Items: de-duped against existing items in the same category
 *     by case-insensitive name match. Duplicates are skipped (not
 *     overwritten — owner can delete-then-reimport if they want a
 *     refresh).
 *   - Variants: created under each item with their absolute prices.
 *   - Modifier groups: created at the correct scope (item-level if
 *     it was attached to an item; variant-level if attached to a
 *     specific size; category-level if a category-shared group).
 *   - Modifier options: created under each group.
 *
 * Returns: { categoriesCreated, itemsCreated, variantsCreated,
 *            groupsCreated, optionsCreated, itemsSkippedDuplicate }
 */
export async function PUT(req: NextRequest) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const blocked = await blockIfInheritingMenu(restaurantId);
  if (blocked) return blocked;

  // Imported categories belong to the active menu (so they show to customers).
  const activeMenuId = await resolveActiveMenuId(restaurantId);

  const body = (await req.json().catch(() => ({}))) as {
    preview?: ImportPreview;
    /** Per-category override: sourceId → existing FFOS category id to merge into. */
    mergeMap?: Record<string, string>;
  };
  const preview = body.preview;
  if (!preview || !Array.isArray(preview.categories)) {
    return NextResponse.json({ error: "preview required" }, { status: 400 });
  }
  const mergeMap = body.mergeMap ?? {};

  let categoriesCreated = 0;
  let itemsCreated = 0;
  let variantsCreated = 0;
  let groupsCreated = 0;
  let optionsCreated = 0;
  let libraryGroupsCreated = 0;
  let itemsSkippedDuplicate = 0;

  const catMaxSort = await prisma.menuCategory.aggregate({
    where: { restaurantId },
    _max: { sortOrder: true },
  });
  let nextCatSort = (catMaxSort._max.sortOrder ?? -1) + 1;

  // ── Build library group plan ───────────────────────────────────────
  // Modifier-groups library (the right-side panel on /admin/menu) only
  // surfaces groups where restaurantId IS set AND menuItemId IS null.
  // If we just created item-attached groups, owners would see "No
  // modifier groups yet" in the sidebar even though every imported
  // item has its groups correctly attached — confusing and broken UX.
  //
  // Fix: for every distinct group name across the entire preview, create
  // ONE library entry up-front (with the option list as the canonical
  // template), then set `libraryGroupId` on each item/variant/category-
  // scoped instance so owners can see the provenance in the editor.
  // De-dup is by case-insensitive trimmed name, scoped to this
  // restaurant — if owner re-imports we reuse rather than duplicate.
  type LibPlan = { name: string; required: boolean; minSelect: number; maxSelect: number; maxPerOption: number; sortOrder: number; options: Array<{ name: string; priceAdjustment: number; isDefault: boolean; isAvailable: boolean; sortOrder: number }> };
  const libPlanByKey = new Map<string, LibPlan>();
  const collectLib = (g: { name: string; required: boolean; minSelect: number; maxSelect: number; maxPerOption: number; sortOrder: number; options: Array<any> }) => {
    const key = g.name.trim().toLowerCase();
    if (libPlanByKey.has(key)) return;
    libPlanByKey.set(key, {
      name: g.name,
      required: g.required,
      minSelect: g.minSelect,
      maxSelect: g.maxSelect,
      maxPerOption: g.maxPerOption,
      sortOrder: g.sortOrder,
      options: g.options.map((o: any, oi: number) => ({
        name: o.name,
        priceAdjustment: o.priceAdjustment,
        isDefault: o.isDefault,
        isAvailable: o.isAvailable,
        sortOrder: o.sortOrder ?? oi,
      })),
    });
  };
  for (const cat of preview.categories) {
    for (const it of cat.items) {
      for (const g of it.itemGroups) collectLib(g);
      for (const v of it.variants) for (const g of v.groups) collectLib(g);
    }
  }
  for (const g of preview.categoryGroups) collectLib(g);

  // ── Image pre-fetch ────────────────────────────────────────────────
  // Download every category/item image referenced in the preview from
  // FoodBooking's CDN and re-host on Vercel Blob. We do this BEFORE the
  // DB transaction so the slow part (network I/O) doesn't lock the
  // transaction. The resulting urlByPreviewKey map is consulted by the
  // category/item create calls below. Images that fail to download or
  // upload are silently skipped — the rest of the import still lands,
  // owner just doesn't get those specific images.
  let imagesImported = 0;
  let imagesFailed = 0;
  const blobUrlBySource = new Map<string, string>(); // source URL → blob URL
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const sourceUrls = new Set<string>();
    for (const cat of preview.categories) {
      if (cat.sourceImageUrl) sourceUrls.add(cat.sourceImageUrl);
      for (const it of cat.items) {
        if (it.sourceImageUrl) sourceUrls.add(it.sourceImageUrl);
      }
    }
    if (sourceUrls.size > 0) {
      const { put } = await import("@vercel/blob");
      const PARALLEL = 8;
      const urls = [...sourceUrls];
      let idx = 0;
      const worker = async () => {
        while (idx < urls.length) {
          const my = idx++;
          const src = urls[my];
          try {
            const imgRes = await fetch(src, { cache: "no-store" });
            if (!imgRes.ok) {
              imagesFailed++;
              console.warn(`[import-gloriafood] image ${src} → HTTP ${imgRes.status}`);
              continue;
            }
            const buf = Buffer.from(await imgRes.arrayBuffer());
            // Keep the original filename so the blob URL is human-readable
            // and stable across re-imports of the same image.
            const filename = src.split("/").pop() || `gf-${my}.jpg`;
            const blob = await put(`${restaurantId}/menu/${filename}`, buf, {
              access: "public",
              addRandomSuffix: false,
              contentType: imgRes.headers.get("content-type") ?? "image/jpeg",
            });
            blobUrlBySource.set(src, blob.url);
            imagesImported++;
          } catch (e) {
            imagesFailed++;
            console.warn(`[import-gloriafood] image upload failed for ${src}:`, e instanceof Error ? e.message : String(e));
          }
        }
      };
      await Promise.all(Array.from({ length: PARALLEL }, worker));
    }
  } else {
    console.warn("[import-gloriafood] BLOB_READ_WRITE_TOKEN not set — skipping image import");
  }

  // Bigger commits than the PDF importer — 12k+ options for Luigi's
  // menu — so bump the transaction timeout from the Prisma default
  // (5 s) to a comfortable 90 s. Still inside Vercel maxDuration.
  await prisma.$transaction(
    async (tx) => {
      // ── Phase 1: Library groups ─────────────────────────────────────
      // Create one library entry per distinct group name. If a library
      // group with this name already exists in the restaurant (re-import
      // case) we reuse it instead of duplicating. The instances we
      // create later link back via libraryGroupId, so owners can see
      // the source-of-truth row in the sidebar and the per-item
      // attachments stay in sync.
      const libIdByKey = new Map<string, string>();
      if (libPlanByKey.size > 0) {
        const existingLib = await tx.modifierGroup.findMany({
          where: { restaurantId, menuItemId: null, categoryId: null, variantId: null },
          select: { id: true, name: true },
        });
        for (const e of existingLib) {
          libIdByKey.set(e.name.trim().toLowerCase(), e.id);
        }
        let libSortStart = await tx.modifierGroup.count({
          where: { restaurantId, menuItemId: null, categoryId: null, variantId: null },
        });
        for (const [key, plan] of libPlanByKey.entries()) {
          if (libIdByKey.has(key)) continue; // reuse — re-import case
          const lib = await tx.modifierGroup.create({
            data: {
              restaurantId,
              name: plan.name,
              required: plan.required,
              minSelect: plan.minSelect,
              maxSelect: plan.maxSelect,
              maxPerOption: plan.maxPerOption,
              sortOrder: libSortStart++,
            },
            select: { id: true },
          });
          libIdByKey.set(key, lib.id);
          libraryGroupsCreated++;
          if (plan.options.length > 0) {
            await tx.modifierOption.createMany({
              data: plan.options.map((o) => ({ modifierGroupId: lib.id, ...o })),
            });
            optionsCreated += plan.options.length;
          }
        }
      }
      const libIdFor = (name: string) => libIdByKey.get(name.trim().toLowerCase()) ?? null;

      // ── Phase 2: Categories + items ─────────────────────────────────
      // Track source category id → resolved FFOS category id so the
      // category-level shared groups (categoryGroups[]) can attach
      // to the right row after we've created them.
      const catIdMap = new Map<number, string>();

      for (const cat of preview.categories) {
        if (!cat.items || cat.items.length === 0) continue;

        let categoryId: string;
        const mergeTarget = mergeMap[String(cat.sourceId)];
        if (mergeTarget) {
          const existing = await tx.menuCategory.findFirst({
            where: { id: mergeTarget, restaurantId },
            select: { id: true },
          });
          if (!existing) continue;
          categoryId = existing.id;
        } else {
          const created = await tx.menuCategory.create({
            data: {
              restaurantId,
              menuId: activeMenuId ?? undefined,
              name: cat.name,
              description: cat.description,
              imageUrl: cat.sourceImageUrl ? (blobUrlBySource.get(cat.sourceImageUrl) ?? null) : null,
              sortOrder: nextCatSort++,
              isActive: cat.isActive,
              isHidden: cat.isHidden,
            },
            select: { id: true },
          });
          categoryId = created.id;
          categoriesCreated++;
        }
        catIdMap.set(cat.sourceId, categoryId);

        // De-dup existing items in this category by case-insensitive
        // trimmed name. Same approach as import-pdf.
        const existingItems = await tx.menuItem.findMany({
          where: { restaurantId, categoryId },
          select: { name: true, sortOrder: true },
        });
        const existingNames = new Set(existingItems.map((it) => it.name.trim().toLowerCase()));
        let nextItemSort = existingItems.reduce((m, it) => Math.max(m, it.sortOrder), -1) + 1;

        for (const item of cat.items) {
          const normalized = item.name.trim().toLowerCase();
          if (existingNames.has(normalized)) {
            itemsSkippedDuplicate++;
            continue;
          }
          existingNames.add(normalized);

          const createdItem = await tx.menuItem.create({
            data: {
              restaurantId,
              categoryId,
              name: item.name,
              description: item.description,
              imageUrl: item.sourceImageUrl ? (blobUrlBySource.get(item.sourceImageUrl) ?? null) : null,
              price: item.basePrice,
              isAvailable: item.isAvailable,
              isHidden: item.isHidden,
              isSoldOut: item.isSoldOut,
              hasVariants: item.hasVariants,
              availableDays: item.availableDays,
              sortOrder: nextItemSort++,
            },
            select: { id: true },
          });
          itemsCreated++;

          // Variants — preserved in order. Each variant carries its own
          // set of modifier groups (e.g. "Toppings (Large)" vs "(Small)").
          const variantIdBySourceId = new Map<number, string>();
          for (let vi = 0; vi < item.variants.length; vi++) {
            const v = item.variants[vi];
            const createdVariant = await tx.itemVariant.create({
              data: {
                menuItemId: createdItem.id,
                name: v.name,
                price: v.price,
                isDefault: v.isDefault,
                sortOrder: vi,
              },
              select: { id: true },
            });
            variantsCreated++;
            variantIdBySourceId.set(v.sourceId, createdVariant.id);

            // Variant-level modifier groups
            for (const g of v.groups) {
              const createdGroup = await tx.modifierGroup.create({
                data: {
                  menuItemId: createdItem.id,
                  variantId: createdVariant.id,
                  name: g.name,
                  required: g.required,
                  minSelect: g.minSelect,
                  maxSelect: g.maxSelect,
                  maxPerOption: g.maxPerOption,
                  sortOrder: g.sortOrder,
                  libraryGroupId: libIdFor(g.name),
                },
                select: { id: true },
              });
              groupsCreated++;
              if (g.options.length > 0) {
                await tx.modifierOption.createMany({
                  data: g.options.map((o, oi) => ({
                    modifierGroupId: createdGroup.id,
                    name: o.name,
                    priceAdjustment: o.priceAdjustment,
                    isDefault: o.isDefault,
                    isAvailable: o.isAvailable,
                    sortOrder: o.sortOrder ?? oi,
                  })),
                });
                optionsCreated += g.options.length;
              }
            }
          }

          // Item-level modifier groups (apply to the whole item
          // regardless of variant — e.g. "Add to Garlic Bread (4pc)").
          for (const g of item.itemGroups) {
            const createdGroup = await tx.modifierGroup.create({
              data: {
                menuItemId: createdItem.id,
                name: g.name,
                required: g.required,
                minSelect: g.minSelect,
                maxSelect: g.maxSelect,
                maxPerOption: g.maxPerOption,
                sortOrder: g.sortOrder,
                libraryGroupId: libIdFor(g.name),
              },
              select: { id: true },
            });
            groupsCreated++;
            if (g.options.length > 0) {
              await tx.modifierOption.createMany({
                data: g.options.map((o, oi) => ({
                  modifierGroupId: createdGroup.id,
                  name: o.name,
                  priceAdjustment: o.priceAdjustment,
                  isDefault: o.isDefault,
                  isAvailable: o.isAvailable,
                  sortOrder: o.sortOrder ?? oi,
                })),
              });
              optionsCreated += g.options.length;
            }
          }
        }
      }

      // ── Category-level shared modifier groups (e.g. "Pizza 1 Crust"
      //    shared across every pizza in PIZZAS). ───────────────────────
      for (const g of preview.categoryGroups) {
        const targetCatId = catIdMap.get(g.sourceCategoryId);
        if (!targetCatId) continue; // category was skipped (no items)
        const createdGroup = await tx.modifierGroup.create({
          data: {
            categoryId: targetCatId,
            name: g.name,
            required: g.required,
            minSelect: g.minSelect,
            maxSelect: g.maxSelect,
            maxPerOption: g.maxPerOption,
            sortOrder: g.sortOrder,
            libraryGroupId: libIdFor(g.name),
          },
          select: { id: true },
        });
        groupsCreated++;
        if (g.options.length > 0) {
          await tx.modifierOption.createMany({
            data: g.options.map((o, oi) => ({
              modifierGroupId: createdGroup.id,
              name: o.name,
              priceAdjustment: o.priceAdjustment,
              isDefault: o.isDefault,
              isAvailable: o.isAvailable,
              sortOrder: o.sortOrder ?? oi,
            })),
          });
          optionsCreated += g.options.length;
        }
      }
    },
    {
      maxWait: 10_000,
      timeout: 90_000,
    },
  );

  console.log(
    `[import-gloriafood] committed: ${categoriesCreated} cats, ${itemsCreated} items (${itemsSkippedDuplicate} dupes skipped), ${variantsCreated} variants, ${libraryGroupsCreated} library groups, ${groupsCreated} attached groups, ${optionsCreated} options, ${imagesImported} images (${imagesFailed} failed)`,
  );

  return NextResponse.json({
    categoriesCreated,
    itemsCreated,
    variantsCreated,
    groupsCreated,
    libraryGroupsCreated,
    optionsCreated,
    itemsSkippedDuplicate,
    imagesImported,
    imagesFailed,
  });
}
