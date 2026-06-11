import { hasFeature, type Feature } from "@/lib/entitlements";
import prisma from "@/lib/db";
import { FeatureLockedView } from "@/components/admin/FeatureLockedView";

/**
 * Server-side paid-feature gate for a whole admin page.
 *
 * Returns a locked upsell view (<FeatureLockedView>) when the restaurant lacks
 * the entitlement, or null when they have it. Pages call it right after they
 * resolve restaurantId:
 *
 *   const gate = await featureGate(restaurantId, "marketing_studio", "marketing_studio");
 *   if (gate) return gate;
 *
 * The add-on name / description / price shown on the wall come from the AddOn
 * catalog row (single lookup, only when locked). Luigi 2026-06-11.
 */
export async function featureGate(restaurantId: string, feature: Feature, addOnSlug: string) {
  if (await hasFeature(restaurantId, feature)) return null;
  const addOn = await prisma.addOn.findUnique({
    where: { slug: addOnSlug },
    select: { name: true, description: true, monthlyPriceCents: true },
  });
  return (
    <FeatureLockedView
      name={addOn?.name ?? addOnSlug}
      description={addOn?.description ?? null}
      slug={addOnSlug}
      monthlyPriceCents={addOn?.monthlyPriceCents ?? 0}
    />
  );
}
