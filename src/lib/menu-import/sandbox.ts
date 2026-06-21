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
  // PERF: a big real menu (Luigi's = 163 items / 485 groups / 12,349 options)
  // blows the 90s transaction cap if we do everything the admin importer does.
  // The sandbox is a throwaway DEMO, so we drop two costs the admin path pays
  // that the storefront doesn't need:
  //   1. the modifier-LIBRARY duplication (an admin-editor sidebar nicety — it's
  //      backfilled when the visitor claims the restaurant, or on re-import), and
  //   2. the separate per-group option insert — options are NESTED into each
  //      group's create instead (one round-trip per group, not two).
  // That roughly halves the writes and removes ~500 round-trips, bringing Luigi's
  // menu comfortably under the cap.
  const catIdBySource = new Map<number, string>();
  await prisma.$transaction(
    async (tx) => {
      // Create the hierarchy (categories → items → variants → groups), buffering
      // EVERY option with its resolved groupId, then flush all options in a few
      // big createMany calls at the end. Nested `options:{create}` would emit one
      // INSERT per option (12k round-trips); this is a handful of round-trips.
      const optionBuf: Array<{ modifierGroupId: string } & Opt> = [];
      const pushOpts = (groupId: string, opts: any[]) => { for (const o of mapOpts(opts)) optionBuf.push({ modifierGroupId: groupId, ...o }); };

      let catSort = 0;
      for (const cat of preview.categories) {
        if (!cat.items?.length) continue;
        const created = await tx.menuCategory.create({
          data: { restaurantId, name: cat.name, description: cat.description, imageUrl: cat.sourceImageUrl ?? null, sortOrder: catSort++, isActive: cat.isActive, isHidden: cat.isHidden },
          select: { id: true },
        });
        catIdBySource.set(cat.sourceId, created.id);

        let itemSort = 0;
        for (const item of cat.items) {
          const ci = await tx.menuItem.create({
            data: { restaurantId, categoryId: created.id, name: item.name, description: item.description, imageUrl: item.sourceImageUrl ?? null, price: item.basePrice, isAvailable: item.isAvailable, isHidden: item.isHidden, isSoldOut: item.isSoldOut, hasVariants: item.hasVariants, availableDays: item.availableDays, sortOrder: itemSort++ },
            select: { id: true },
          });

          for (let vi = 0; vi < item.variants.length; vi++) {
            const v = item.variants[vi];
            const cv = await tx.itemVariant.create({ data: { menuItemId: ci.id, name: v.name, price: v.price, isDefault: v.isDefault, sortOrder: vi }, select: { id: true } });
            for (const g of v.groups) {
              const cg = await tx.modifierGroup.create({ data: { menuItemId: ci.id, variantId: cv.id, name: g.name, required: g.required, minSelect: g.minSelect, maxSelect: g.maxSelect, maxPerOption: g.maxPerOption, sortOrder: g.sortOrder }, select: { id: true } });
              pushOpts(cg.id, g.options);
            }
          }
          for (const g of item.itemGroups) {
            const cg = await tx.modifierGroup.create({ data: { menuItemId: ci.id, name: g.name, required: g.required, minSelect: g.minSelect, maxSelect: g.maxSelect, maxPerOption: g.maxPerOption, sortOrder: g.sortOrder }, select: { id: true } });
            pushOpts(cg.id, g.options);
          }
        }
      }

      for (const g of preview.categoryGroups) {
        const cid = catIdBySource.get(g.sourceCategoryId);
        if (!cid) continue;
        const cg = await tx.modifierGroup.create({ data: { categoryId: cid, name: g.name, required: g.required, minSelect: g.minSelect, maxSelect: g.maxSelect, maxPerOption: g.maxPerOption, sortOrder: g.sortOrder }, select: { id: true } });
        pushOpts(cg.id, g.options);
      }

      // Flush all options in chunks (well under Postgres' 65535-parameter cap).
      for (let i = 0; i < optionBuf.length; i += 4000) {
        await tx.modifierOption.createMany({ data: optionBuf.slice(i, i + 4000) });
      }
    },
    { maxWait: 15_000, timeout: 165_000 },
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
