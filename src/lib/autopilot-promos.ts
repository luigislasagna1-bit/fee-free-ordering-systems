/**
 * Autopilot pre-made promos (Luigi 2026-06-09, C).
 *
 * When an Autopilot campaign is switched ON, it auto-generates the campaign's
 * coupon(s) as `Promotion` rows (campaignRef set) — exactly like the Kickstarter
 * First-Buy promo. They then appear under Promotions → Pre-made, carry their
 * USED count, and the owner can fine-tune the discount / copy without touching
 * the campaign. Switching the campaign OFF soft-disables them (isActive=false),
 * keeping any owner edits for when it's re-enabled.
 *
 *   reengagement   → WIN1..WIN5 progressive ladder (10 → 20% off), one promo per
 *                    message in the win-back sequence (DESIGN-MARKETING-SUITE §5).
 *   second_order   → a single "2NDOFF" 15%-off promo.
 *   cart_abandonment → no FIXED promo (the recovery offer is dynamic).
 *
 * Campaign promos default to channel "website" (re-engage/2nd-order target the
 * restaurant's OWN past customers) and stackingRule "master" (they layer on top
 * of whatever else is running). All idempotent + internally safe.
 */
import prisma from "@/lib/db";

type PromoDef = {
  campaignRef: string;
  campaignSequence: number | null;
  code: string;
  percent: number;
  name: string;
};

/** The progressive win-back ladder — bigger discounts for longer-lapsed
 *  customers (the cron sends WINn to the n-th recency tier). Luigi's values
 *  from the GloriaFood walkthrough. */
export const REENGAGE_TIERS: PromoDef[] = [
  { campaignRef: "autopilot_reengage_win1", campaignSequence: 1, code: "WIN1", percent: 10, name: "10% off your next online order" },
  { campaignRef: "autopilot_reengage_win2", campaignSequence: 2, code: "WIN2", percent: 15, name: "15% off your next online order" },
  { campaignRef: "autopilot_reengage_win3", campaignSequence: 3, code: "WIN3", percent: 15, name: "15% off your next online order" },
  { campaignRef: "autopilot_reengage_win4", campaignSequence: 4, code: "WIN4", percent: 20, name: "20% off your next online order" },
  { campaignRef: "autopilot_reengage_win5", campaignSequence: 5, code: "WIN5", percent: 20, name: "20% off your next online order" },
];

const SECOND_ORDER: PromoDef = {
  campaignRef: "autopilot_2nd_order",
  campaignSequence: null,
  code: "2NDOFF",
  percent: 15,
  name: "15% OFF, yours for the taking",
};

/** Ensure one campaign promo exists + matches the enabled state. Creates it on
 *  first enable (with the tier's default discount); only flips isActive on an
 *  existing row so owner edits survive. */
async function ensurePromo(restaurantId: string, def: PromoDef, enabled: boolean): Promise<void> {
  const existing = await prisma.promotion.findFirst({
    where: { restaurantId, campaignRef: def.campaignRef },
    select: { id: true, isActive: true },
  });
  if (existing) {
    if (existing.isActive !== enabled) {
      await prisma.promotion.update({ where: { id: existing.id }, data: { isActive: enabled } });
    }
    return;
  }
  if (!enabled) return; // nothing to create when disabling
  await prisma.promotion.create({
    data: {
      restaurantId,
      name: def.name,
      description: "Win-back offer — we miss you!",
      promotionType: "percentage_off",
      isActive: true,
      stackingRule: "master",
      orderType: "both",
      customerType: "returning",
      minimumOrder: 0,
      ruleConfig: { discountPercent: def.percent },
      // Emailed code (not auto-applied, not a menu banner).
      autoApply: false,
      showOnBanner: false,
      couponCode: def.code,
      channel: "website",
      campaignRef: def.campaignRef,
      campaignSequence: def.campaignSequence,
    },
  });
}

/**
 * Create / enable / soft-disable the pre-made promos for an Autopilot campaign.
 * Idempotent + internally safe — never throws into the toggle path.
 */
export async function syncCampaignPromos(restaurantId: string, campaignType: string, enabled: boolean): Promise<void> {
  try {
    if (campaignType === "reengagement") {
      for (const tier of REENGAGE_TIERS) await ensurePromo(restaurantId, tier, enabled);
    } else if (campaignType === "second_order") {
      await ensurePromo(restaurantId, SECOND_ORDER, enabled);
    }
    // cart_abandonment: dynamic recovery offer, no fixed pre-made promo.
  } catch (e) {
    console.error("[autopilot-promos syncCampaignPromos]", e);
  }
}
