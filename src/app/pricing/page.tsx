import { resolveLocale } from "@/lib/i18n-server";
import { unstable_cache } from "next/cache";
import prisma from "@/lib/db";
import { PricingClient, type PricingAddOn } from "./PricingClient";
import { marketingMetadata } from "@/lib/seo";

export const metadata = marketingMetadata({
  title: "Pricing — Fee Free Ordering",
  description: "Free for your first 100 orders every month with 0% commission. Add only the à-la-carte add-ons you need — no contracts, cancel anytime.",
  path: "/pricing",
});

/**
 * Public pricing page. Pulls REAL add-on prices from the catalog (superadmin
 * sets them) so the page always reflects live pricing instead of "coming soon".
 * The catalog rarely changes, so the DB read is cached for 5 minutes across all
 * visitors (the page itself stays dynamic because the locale is cookie-based).
 */
const getCatalog = unstable_cache(
  async (): Promise<PricingAddOn[]> => {
    return prisma.addOn.findMany({
      where: { isActive: true, slug: { not: "free" } },
      select: { slug: true, name: true, monthlyPriceCents: true, comingSoon: true, inGrowthNet: true, displayOrder: true },
      orderBy: { displayOrder: "asc" },
    });
  },
  ["public-pricing-catalog"],
  { revalidate: 300, tags: ["addon-catalog"] },
);

export default async function PricingPage() {
  const locale = await resolveLocale();
  const addOns = await getCatalog().catch(() => [] as PricingAddOn[]);
  return <PricingClient locale={locale} addOns={addOns} />;
}
