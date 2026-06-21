import crypto from "node:crypto";
import prisma from "@/lib/db";
import { slugify } from "@/lib/utils";
import { defaultsForCountry } from "@/lib/regions";
import type { ImportPreview } from "./gloriafood";

/** Unclaimed import-to-try sandboxes are cleaned up this many days after creation. */
export const SANDBOX_TTL_DAYS = 7;

/**
 * Provision a fresh, LIVE-out-of-the-box temp restaurant for the public
 * import-to-try demo + its SandboxRestaurant tracking row (email lead +
 * single-use claim token + TTL). Mirrors scripts/create-demo-restaurant.ts'
 * live config (published, cash, pickup, open 24/7) so the storefront renders and
 * can take a test order immediately — no account, no setup.
 *
 * Returns the ids needed to commit the menu, redirect to the demo storefront,
 * and carry the restaurant into signup (the claim token).
 */
export async function provisionSandbox(opts: {
  restaurantName: string;
  email: string;
  country?: string | null;
  ipHash?: string | null;
  sourceLabel?: string | null;
}): Promise<{ restaurantId: string; slug: string; claimToken: string }> {
  const country = (opts.country || "CA").toUpperCase().slice(0, 2);
  const region = defaultsForCountry(country);
  const base = slugify(opts.restaurantName).slice(0, 40) || "menu";
  // "try-" prefix marks it as a sandbox + keeps it out of the real-slug namespace.
  let slug = `try-${base}`;
  for (let n = 1; await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } }); n++) {
    slug = `try-${base}-${n}`;
  }
  const freePlan = await prisma.subscriptionPlan.findUnique({ where: { slug: "free" } }).catch(() => null);
  const now = new Date();

  const restaurant = await prisma.restaurant.create({
    data: {
      name: opts.restaurantName.trim().slice(0, 100) || "My Restaurant",
      slug,
      subdomain: slug,
      country,
      timezone: region.timezone,
      currency: region.currency,
      defaultLanguage: "en",
      // LIVE out of the box (like the demo restaurant) so the storefront works.
      acceptsPickup: true,
      acceptsDelivery: false,
      acceptsDineIn: false,
      acceptsReservations: false,
      paymentMethods: JSON.stringify(["cash"]),
      subscriptionStatus: "free",
      subscriptionPlanId: freePlan?.id ?? null,
      publishedAt: now,
      ownerEmailVerifiedAt: now,
      slogan: "Live preview — import-to-try",
    },
    select: { id: true, slug: true },
  });

  await prisma.openingHours.createMany({
    data: Array.from({ length: 7 }, (_, d) => ({
      restaurantId: restaurant.id,
      dayOfWeek: d,
      isOpen: true,
      openTime: "00:00",
      closeTime: "23:59",
    })),
  });

  const claimToken = crypto.randomBytes(32).toString("base64url");
  await prisma.sandboxRestaurant.create({
    data: {
      restaurantId: restaurant.id,
      email: opts.email.trim().toLowerCase().slice(0, 254),
      sourceLabel: opts.sourceLabel?.slice(0, 200) ?? null,
      ipHash: opts.ipHash ?? null,
      claimToken,
      expiresAt: new Date(now.getTime() + SANDBOX_TTL_DAYS * 86_400_000),
    },
  });

  return { restaurantId: restaurant.id, slug: restaurant.slug, claimToken };
}

type Opt = { name: string; priceAdjustment: number; isDefault: boolean; isAvailable: boolean; sortOrder: number };
const mapOpts = (opts: ReadonlyArray<{ name: string; priceAdjustment: number; isDefault: boolean; isAvailable: boolean; sortOrder?: number }>): Opt[] =>
  opts.map((o, oi) => ({ name: o.name, priceAdjustment: o.priceAdjustment, isDefault: o.isDefault, isAvailable: o.isAvailable, sortOrder: o.sortOrder ?? oi }));

/**
 * Commit a parsed GloriaFood import into a FRESH sandbox restaurant. Faithful to
 * the admin importer (variants + modifier groups at item / variant / category
 * scope + one library-group entry per distinct name) but simplified for an empty
 * target — no merge/dedup — and photos are set INLINE to the source GloriaFood
 * CDN url for an instant demo (no Vercel Blob cost; re-hosting happens on claim).
 */
export async function commitSandboxMenu(restaurantId: string, preview: ImportPreview): Promise<void> {
  // PERF: a big real menu (Luigi's = 163 items / 206 variants / 485 groups /
  // 12,349 options) was ~867 INDIVIDUAL creates → ~89s, slow enough that the
  // client sometimes errored-then-retried ("had to do it twice" → dup sandboxes
  // the TTL cron later swept). We now batch each hierarchy LEVEL into ONE
  // createManyAndReturn (a handful of round-trips for the whole tree, not ~867),
  // then flush options in chunked createMany. Brings Luigi's menu to a few seconds.
  //
  // CORRELATION SAFETY (non-negotiable — this is a faithful import): on Postgres,
  // createManyAndReturn returns rows in input order (INSERT … RETURNING), but
  // Prisma doesn't formally guarantee it, so we never trust it blindly. Every
  // level carries a unique-within-scope key (sortOrder scoped by its parent id),
  // and assertOrder() verifies the returned row at index i is exactly the one we
  // sent at index i. If the order ever fails to hold we THROW — the endpoint then
  // deletes the half-built sandbox — rather than silently attach the wrong
  // modifier groups/options to the wrong item.
  const assertOrder = (rows: any[], data: any[], keys: string[], level: string) => {
    if (rows.length !== data.length) throw new Error(`sandbox import: ${level} count mismatch (${rows.length}/${data.length})`);
    for (let i = 0; i < rows.length; i++) {
      for (const k of keys) {
        if ((rows[i][k] ?? null) !== (data[i][k] ?? null)) {
          throw new Error(`sandbox import: ${level} return order not preserved at row ${i} (${k})`);
        }
      }
    }
  };
  // createManyAndReturn, chunked to stay under Postgres' 65535-parameter cap on
  // very large menus. Chunks are sliced + concatenated in order, so the global
  // index correlation (and assertOrder above) still holds.
  const cmar = async (create: (rows: any[]) => Promise<any[]>, data: any[]): Promise<any[]> => {
    if (!data.length) return [];
    if (data.length <= 2000) return create(data);
    const out: any[] = [];
    for (let i = 0; i < data.length; i += 2000) out.push(...(await create(data.slice(i, i + 2000))));
    return out;
  };

  await prisma.$transaction(
    async (tx) => {
      // ── 1. CATEGORIES (only those with items) — sortOrder is the unique key ──
      const cats = preview.categories.filter((c) => c.items?.length);
      const catData = cats.map((c, i) => ({
        restaurantId, name: c.name, description: c.description, imageUrl: c.sourceImageUrl ?? null,
        sortOrder: i, isActive: c.isActive, isHidden: c.isHidden,
      }));
      if (!catData.length) return; // empty menu — nothing to commit
      const catRows = await cmar((d) => tx.menuCategory.createManyAndReturn({ data: d, select: { id: true, sortOrder: true } }), catData);
      assertOrder(catRows, catData, ["sortOrder"], "category");
      const catIdBySource = new Map<number, string>();
      cats.forEach((c, i) => catIdBySource.set(c.sourceId, catRows[i].id));

      // ── 2. ITEMS (flat; (categoryId, sortOrder) is the unique key) ──
      const itemData: any[] = [];
      const itemSrc: any[] = [];
      cats.forEach((c, ci) => {
        const categoryId = catRows[ci].id;
        c.items.forEach((item: any, isort: number) => {
          itemData.push({
            restaurantId, categoryId, name: item.name, description: item.description,
            imageUrl: item.sourceImageUrl ?? null, price: item.basePrice, isAvailable: item.isAvailable,
            isHidden: item.isHidden, isSoldOut: item.isSoldOut, hasVariants: item.hasVariants,
            availableDays: item.availableDays, sortOrder: isort,
          });
          itemSrc.push(item);
        });
      });
      const itemRows = await cmar((d) => tx.menuItem.createManyAndReturn({ data: d, select: { id: true, categoryId: true, sortOrder: true } }), itemData);
      assertOrder(itemRows, itemData, ["categoryId", "sortOrder"], "item");

      // ── 3. VARIANTS (flat; (menuItemId, sortOrder) is the unique key) ──
      const variantData: any[] = [];
      const variantSrc: { itemId: string; variant: any }[] = [];
      itemSrc.forEach((item, k) => {
        const menuItemId = itemRows[k].id;
        item.variants.forEach((v: any, vi: number) => {
          variantData.push({ menuItemId, name: v.name, price: v.price, isDefault: v.isDefault, sortOrder: vi });
          variantSrc.push({ itemId: menuItemId, variant: v });
        });
      });
      const variantRows = await cmar((d) => tx.itemVariant.createManyAndReturn({ data: d, select: { id: true, menuItemId: true, sortOrder: true } }), variantData);
      assertOrder(variantRows, variantData, ["menuItemId", "sortOrder"], "variant");

      // ── 4. GROUPS (variant- / item- / category-scoped). We assign a fresh
      //     sequential sortOrder PER SCOPE (preserving source order) so the tuple
      //     (menuItemId, variantId, categoryId, sortOrder) is unique per row. ──
      const groupData: any[] = [];
      const groupSrc: any[][] = []; // parallel: each group's source options
      variantSrc.forEach((vs, j) => {
        const variantId = variantRows[j].id;
        vs.variant.groups.forEach((g: any, gi: number) => {
          groupData.push({ menuItemId: vs.itemId, variantId, categoryId: null, name: g.name, required: g.required, minSelect: g.minSelect, maxSelect: g.maxSelect, maxPerOption: g.maxPerOption, sortOrder: gi });
          groupSrc.push(g.options);
        });
      });
      itemSrc.forEach((item, k) => {
        const menuItemId = itemRows[k].id;
        item.itemGroups.forEach((g: any, gi: number) => {
          groupData.push({ menuItemId, variantId: null, categoryId: null, name: g.name, required: g.required, minSelect: g.minSelect, maxSelect: g.maxSelect, maxPerOption: g.maxPerOption, sortOrder: gi });
          groupSrc.push(g.options);
        });
      });
      const catGroupSort = new Map<string, number>();
      for (const g of preview.categoryGroups) {
        const categoryId = catIdBySource.get(g.sourceCategoryId);
        if (!categoryId) continue;
        const seq = catGroupSort.get(categoryId) ?? 0;
        catGroupSort.set(categoryId, seq + 1);
        groupData.push({ menuItemId: null, variantId: null, categoryId, name: g.name, required: g.required, minSelect: g.minSelect, maxSelect: g.maxSelect, maxPerOption: g.maxPerOption, sortOrder: seq });
        groupSrc.push(g.options);
      }
      const groupRows = await cmar((d) => tx.modifierGroup.createManyAndReturn({ data: d, select: { id: true, menuItemId: true, variantId: true, categoryId: true, sortOrder: true } }), groupData);
      assertOrder(groupRows, groupData, ["menuItemId", "variantId", "categoryId", "sortOrder"], "group");

      // ── 5. OPTIONS — resolve each group's id, then flush in chunks ──
      const optionBuf: Array<{ modifierGroupId: string } & Opt> = [];
      groupSrc.forEach((opts, g) => {
        const modifierGroupId = groupRows[g].id;
        for (const o of mapOpts(opts)) optionBuf.push({ modifierGroupId, ...o });
      });
      for (let i = 0; i < optionBuf.length; i += 4000) {
        await tx.modifierOption.createMany({ data: optionBuf.slice(i, i + 4000) });
      }
    },
    { maxWait: 15_000, timeout: 120_000 },
  );
}

/**
 * Fully delete a sandbox restaurant and everything under it (options → groups →
 * variants → items → categories → hours → the sandbox row → the restaurant).
 * Used by the public endpoint's failure cleanup and the TTL-cleanup cron so a
 * failed/expired sandbox never lingers as an orphan live restaurant.
 */
export async function deleteSandbox(restaurantId: string): Promise<void> {
  // Modifier groups/options are scoped via menuItem / variant / category — NOT
  // restaurantId (that's only set on library groups) — so resolve them through
  // the restaurant's items + categories, else deleting menuItems FK-fails.
  const [items, cats] = await Promise.all([
    prisma.menuItem.findMany({ where: { restaurantId }, select: { id: true } }),
    prisma.menuCategory.findMany({ where: { restaurantId }, select: { id: true } }),
  ]);
  const itemIds = items.map((i) => i.id);
  const catIds = cats.map((c) => c.id);
  const groups = await prisma.modifierGroup.findMany({
    where: { OR: [{ menuItemId: { in: itemIds } }, { categoryId: { in: catIds } }, { restaurantId }] },
    select: { id: true },
  });
  const groupIds = groups.map((g) => g.id);
  await prisma.modifierOption.deleteMany({ where: { modifierGroupId: { in: groupIds } } });
  await prisma.modifierGroup.deleteMany({ where: { id: { in: groupIds } } });
  await prisma.itemVariant.deleteMany({ where: { menuItemId: { in: itemIds } } });
  await prisma.menuItem.deleteMany({ where: { restaurantId } });
  await prisma.menuCategory.deleteMany({ where: { restaurantId } });
  await prisma.openingHours.deleteMany({ where: { restaurantId } });
  await prisma.sandboxRestaurant.deleteMany({ where: { restaurantId } });
  await prisma.restaurant.delete({ where: { id: restaurantId } });
}
