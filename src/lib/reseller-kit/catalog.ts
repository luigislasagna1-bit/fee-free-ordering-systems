/**
 * The Marketing Kit asset catalog (Luigi 2026-08-14).
 *
 * CODE, not database rows: a template IS a React component, so a row without a matching
 * renderer is a broken asset. Keeping the catalog in code means the two ship together and
 * cannot drift. Same reasoning as FLYER_TEMPLATES in src/lib/marketing-templates.ts.
 */
import type { KitBrand, KitBrandTier } from "./brand";
import type { KitTemplate } from "./types";
import { thirdPartyComparisonsEnabled } from "./comparisons";
import { flagshipOnepager } from "./templates/flagship-onepager";
import { wholeSystem } from "./templates/whole-system";
import { ownYourOrders } from "./templates/own-your-orders";
import { feeComparison } from "./templates/fee-comparison";
import { combineDontChoose } from "./templates/combine-dont-choose";

export const KIT_TEMPLATES: KitTemplate[] = [
  // Luigi's reference artwork, reproduced exactly — only the QR is personalised.
  flagshipOnepager,
  // The current-offering one-pager: same job, built from what the product actually does today.
  wholeSystem,
  ownYourOrders,
  feeComparison,
  combineDontChoose,
];

export function kitTemplate(id: string): KitTemplate | null {
  return KIT_TEMPLATES.find((t) => t.id === id) ?? null;
}

export function isKitTemplate(id: unknown): id is string {
  return typeof id === "string" && KIT_TEMPLATES.some((t) => t.id === id);
}

/**
 * The catalog one partner may actually use, after brand-tier and kill-switch filtering.
 *
 * `brandTiers` is how a template FORCES platform branding — the partner-recruiting asset
 * uses `["platform"]`, because de-branding an asset that recruits into OUR partner programme
 * would imply the applicant is joining the reseller's own programme instead.
 */
export function visibleKitTemplates(brand: KitBrand): KitTemplate[] {
  const comparisonsOn = thirdPartyComparisonsEnabled();
  return KIT_TEMPLATES.filter((t) => {
    if (!t.brandTiers.includes(brand.tier as KitBrandTier)) return false;
    if (t.hasThirdPartyMarks && !comparisonsOn) return false;
    return true;
  });
}
