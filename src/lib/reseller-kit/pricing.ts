/**
 * Live add-on prices for the optional flyer price block (Luigi 2026-08-14).
 *
 * WHY THIS IS OFF BY DEFAULT, and why it reads the DB rather than a constant:
 *
 *  1. There is no pricing constants file — the `AddOn` table IS the source of truth, and
 *     /pricing already reads it. Hardcoding "$19.99 Hosted Website" on a flyer (as the
 *     reference designs did) bakes in a number nobody can audit, and `prisma/seed-addons.ts`
 *     still carries `monthlyPriceCents: 0` placeholders for several slugs with the note
 *     "superadmin sets real price later" — so the reference figures were not even coming from
 *     the system of record.
 *  2. `AddOn.monthlyPriceCents` carries NO currency; the platform has a single global
 *     PLATFORM_CURRENCY. An Italian partner printing "$19.99" is simply wrong, so prices are
 *     suppressed entirely for partners outside the platform currency's country.
 *  3. A de-branded or branded partner is the vendor of record and may resell at their OWN
 *     price. Printing ours under their brand would be factually wrong, so the block is
 *     suppressed for them and they can type their own figures instead.
 *
 * Cached with the same key + tag the public pricing page uses, so a superadmin price edit
 * invalidates flyer prices too rather than leaving them stale for five minutes.
 */
import { unstable_cache } from "next/cache";
import prisma from "@/lib/db";
import { formatCurrency, PLATFORM_CURRENCY } from "@/lib/utils";
import type { KitBrandTier } from "./brand";

const getCatalog = unstable_cache(
  async () =>
    prisma.addOn.findMany({
      where: { isActive: true, slug: { not: "free" }, comingSoon: false, monthlyPriceCents: { gt: 0 } },
      select: { slug: true, name: true, monthlyPriceCents: true, displayOrder: true },
      orderBy: { displayOrder: "asc" },
      take: 6,
    }),
  ["public-pricing-catalog"],
  { revalidate: 300, tags: ["addon-catalog"] },
);

export interface PriceRow {
  label: string;
  price: string;
}

export async function loadPriceRows(opts: {
  enabled: boolean;
  brandTier: KitBrandTier;
}): Promise<PriceRow[]> {
  // Only the platform-branded tier may print platform prices — see (3) above.
  if (!opts.enabled || opts.brandTier !== "platform") return [];
  try {
    const rows = await getCatalog();
    return rows.map((r) => ({
      label: r.name,
      price: `${formatCurrency(r.monthlyPriceCents / 100, PLATFORM_CURRENCY)}/mo`,
    }));
  } catch {
    // A pricing lookup failing must never cost the partner their flyer — it just prints
    // without the optional price block.
    return [];
  }
}
