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

/** The pre-set, working default for cart-abandonment recovery. Any customer
 *  (abandoners may be new or returning) — unlike the WIN/2NDOFF promos, which are
 *  audience-restricted. Luigi 2026-06-10. */
const CART_RECOVERY: PromoDef = {
  campaignRef: "autopilot_cart_recovery",
  campaignSequence: null,
  code: "CARTBACK",
  percent: 10,
  name: "10% off — finish your order",
};

/**
 * Ensure the cart-abandonment recovery coupon exists + matches the enabled flag.
 * Returns the promo id so the campaign can default to it. Idempotent + safe.
 */
export async function ensureCartRecoveryPromo(restaurantId: string, enabled: boolean): Promise<string | null> {
  try {
    const existing = await prisma.promotion.findFirst({
      where: { restaurantId, campaignRef: CART_RECOVERY.campaignRef },
      select: { id: true, isActive: true },
    });
    if (existing) {
      if (existing.isActive !== enabled) {
        await prisma.promotion.update({ where: { id: existing.id }, data: { isActive: enabled } });
      }
      return existing.id;
    }
    if (!enabled) return null;
    const created = await prisma.promotion.create({
      data: {
        restaurantId,
        name: CART_RECOVERY.name,
        description: "Come back and finish your order!",
        promotionType: "percentage_off",
        isActive: true,
        stackingRule: "master",
        orderType: "both",
        customerType: "any",
        minimumOrder: 0,
        ruleConfig: { discountPercent: CART_RECOVERY.percent },
        autoApply: false,
        showOnBanner: false,
        displayMode: "hidden_coupon_only",
        couponCode: CART_RECOVERY.code,
        channel: "website",
        campaignRef: CART_RECOVERY.campaignRef,
      },
      select: { id: true },
    });
    return created.id;
  } catch (e) {
    console.error("[autopilot-promos ensureCartRecoveryPromo]", e);
    return null;
  }
}

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
      // Emailed code: hidden from the menu, applied via the email's ?coupon link.
      autoApply: false,
      showOnBanner: false,
      displayMode: "hidden_coupon_only",
      couponCode: def.code,
      channel: "website",
      campaignRef: def.campaignRef,
      campaignSequence: def.campaignSequence,
    },
  });
}

/** The campaignRefs that belong to a given campaign type (drip steps). */
function campaignRefsFor(campaignType: string): string[] {
  if (campaignType === "reengagement") return REENGAGE_TIERS.map((t) => t.campaignRef);
  if (campaignType === "second_order") return [SECOND_ORDER.campaignRef];
  return [];
}

/**
 * The discount each drip STEP advertises, keyed by stepNumber. Single batched
 * query (Luigi 2026-06-10): the cron looks this up once per campaign and reads
 * `{couponCode, discountPercent}` per step — the code the email shows + the
 * ordering page pre-applies via `?coupon=CODE`. stepNumber maps to
 * Promotion.campaignSequence (second_order's null sequence → step 1).
 */
export async function getStepPromos(
  restaurantId: string,
  campaignType: string,
): Promise<Map<number, { couponCode: string; discountPercent: number }>> {
  const map = new Map<number, { couponCode: string; discountPercent: number }>();
  const refs = campaignRefsFor(campaignType);
  if (!refs.length) return map;
  const promos = await prisma.promotion.findMany({
    where: { restaurantId, campaignRef: { in: refs } },
    select: { campaignSequence: true, couponCode: true, ruleConfig: true },
  });
  for (const p of promos) {
    const stepNumber = p.campaignSequence ?? 1;
    const rc = p.ruleConfig as { discountPercent?: unknown } | null;
    const pct = typeof rc?.discountPercent === "number" ? rc.discountPercent : 0;
    if (p.couponCode) map.set(stepNumber, { couponCode: p.couponCode, discountPercent: pct });
  }
  return map;
}

/** All PromoDefs for a campaign type (the step → promo mapping). */
function defsFor(campaignType: string): PromoDef[] {
  if (campaignType === "reengagement") return REENGAGE_TIERS;
  if (campaignType === "second_order") return [SECOND_ORDER];
  return [];
}

/** The promo's display name, derived from the CURRENT discount so the title
 *  always matches what it actually gives (Luigi 2026-06-10 — otherwise a WIN
 *  promo whose % the owner lowered to 5 still reads "10% off"). */
export function nameForStepPromo(def: PromoDef, pct: number): string {
  if (def.campaignRef === SECOND_ORDER.campaignRef) return `${pct}% OFF, yours for the taking`;
  return `${pct}% off your next online order`;
}

/** Create-or-update one step's promo so its discount AND TITLE match the step.
 *  Unlike `ensurePromo` (which preserves the % on existing rows), this WRITES
 *  THROUGH the step's discountPercent + regenerates the name — the step editor
 *  is the source of truth. Only creates a missing row when active. */
async function upsertStepPromo(restaurantId: string, def: PromoDef, discountPercent: number, active: boolean): Promise<void> {
  const existing = await prisma.promotion.findFirst({
    where: { restaurantId, campaignRef: def.campaignRef },
    select: { id: true, ruleConfig: true },
  });
  if (existing) {
    const rc =
      existing.ruleConfig && typeof existing.ruleConfig === "object" && !Array.isArray(existing.ruleConfig)
        ? (existing.ruleConfig as Record<string, unknown>)
        : {};
    await prisma.promotion.update({
      where: { id: existing.id },
      data: { isActive: active, ruleConfig: { ...rc, discountPercent }, name: nameForStepPromo(def, discountPercent) },
    });
    return;
  }
  if (!active) return; // don't mint a disabled promo
  await prisma.promotion.create({
    data: {
      restaurantId,
      name: nameForStepPromo(def, discountPercent),
      description: "Win-back offer — we miss you!",
      promotionType: "percentage_off",
      isActive: true,
      stackingRule: "master",
      orderType: "both",
      customerType: "returning",
      minimumOrder: 0,
      ruleConfig: { discountPercent },
      autoApply: false,
      showOnBanner: false,
      displayMode: "hidden_coupon_only",
      couponCode: def.code,
      channel: "website",
      campaignRef: def.campaignRef,
      campaignSequence: def.campaignSequence,
    },
  });
}

/**
 * Push every step's discount % into its matching pre-made Promotion so the email
 * advertises exactly what the ordering page applies (Luigi 2026-06-10). Call
 * after steps are saved or when the campaign is toggled. A promo is active only
 * when the campaign is enabled AND its step exists AND the step is enabled.
 * Idempotent + internally safe — never throws.
 */
export async function syncStepsToPromos(restaurantId: string, campaignType: string, campaignEnabled: boolean): Promise<void> {
  try {
    const defs = defsFor(campaignType);
    if (!defs.length) return;
    const steps = await prisma.autopilotStep.findMany({
      where: { restaurantId, campaignType },
      select: { stepNumber: true, discountPercent: true, isEnabled: true },
    });
    const byStep = new Map(steps.map((s) => [s.stepNumber, s]));
    for (const def of defs) {
      const stepNum = def.campaignSequence ?? 1;
      const step = byStep.get(stepNum);
      const active = campaignEnabled && !!step && step.isEnabled;
      const pct = step ? step.discountPercent : def.percent;
      await upsertStepPromo(restaurantId, def, pct, active);
    }
  } catch (e) {
    console.error("[autopilot-promos syncStepsToPromos]", e);
  }
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
