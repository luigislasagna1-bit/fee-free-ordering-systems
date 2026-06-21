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
  type LibPlan = { name: string; required: boolean; minSelect: number; maxSelect: number; maxPerOption: number; sortOrder: number; options: Opt[] };
  const libByKey = new Map<string, LibPlan>();
  const collect = (g: { name: string; required: boolean; minSelect: number; maxSelect: number; maxPerOption: number; sortOrder: number; options: any[] }) => {
    const key = g.name.trim().toLowerCase();
    if (libByKey.has(key)) return;
    libByKey.set(key, { name: g.name, required: g.required, minSelect: g.minSelect, maxSelect: g.maxSelect, maxPerOption: g.maxPerOption, sortOrder: g.sortOrder, options: mapOpts(g.options) });
  };
  for (const cat of preview.categories) {
    for (const it of cat.items) {
      for (const g of it.itemGroups) collect(g);
      for (const v of it.variants) for (const g of v.groups) collect(g);
    }
  }
  for (const g of preview.categoryGroups) collect(g);

  await prisma.$transaction(
    async (tx) => {
      // Library groups (one per distinct name) — fresh restaurant, so all new.
      const libId = new Map<string, string>();
      let libSort = 0;
      for (const [key, plan] of libByKey) {
        const lib = await tx.modifierGroup.create({
          data: { restaurantId, name: plan.name, required: plan.required, minSelect: plan.minSelect, maxSelect: plan.maxSelect, maxPerOption: plan.maxPerOption, sortOrder: libSort++ },
          select: { id: true },
        });
        libId.set(key, lib.id);
        if (plan.options.length) await tx.modifierOption.createMany({ data: plan.options.map((o) => ({ modifierGroupId: lib.id, ...o })) });
      }
      const libFor = (name: string) => libId.get(name.trim().toLowerCase()) ?? null;

      const catIdBySource = new Map<number, string>();
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
              const cg = await tx.modifierGroup.create({ data: { menuItemId: ci.id, variantId: cv.id, name: g.name, required: g.required, minSelect: g.minSelect, maxSelect: g.maxSelect, maxPerOption: g.maxPerOption, sortOrder: g.sortOrder, libraryGroupId: libFor(g.name) }, select: { id: true } });
              if (g.options.length) await tx.modifierOption.createMany({ data: mapOpts(g.options).map((o) => ({ modifierGroupId: cg.id, ...o })) });
            }
          }
          for (const g of item.itemGroups) {
            const cg = await tx.modifierGroup.create({ data: { menuItemId: ci.id, name: g.name, required: g.required, minSelect: g.minSelect, maxSelect: g.maxSelect, maxPerOption: g.maxPerOption, sortOrder: g.sortOrder, libraryGroupId: libFor(g.name) }, select: { id: true } });
            if (g.options.length) await tx.modifierOption.createMany({ data: mapOpts(g.options).map((o) => ({ modifierGroupId: cg.id, ...o })) });
          }
        }
      }

      for (const g of preview.categoryGroups) {
        const cid = catIdBySource.get(g.sourceCategoryId);
        if (!cid) continue;
        const cg = await tx.modifierGroup.create({ data: { categoryId: cid, name: g.name, required: g.required, minSelect: g.minSelect, maxSelect: g.maxSelect, maxPerOption: g.maxPerOption, sortOrder: g.sortOrder, libraryGroupId: libFor(g.name) }, select: { id: true } });
        if (g.options.length) await tx.modifierOption.createMany({ data: mapOpts(g.options).map((o) => ({ modifierGroupId: cg.id, ...o })) });
      }
    },
    { maxWait: 10_000, timeout: 90_000 },
  );
}
