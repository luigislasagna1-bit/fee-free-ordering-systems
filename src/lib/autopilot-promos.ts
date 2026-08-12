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

/**
 * How long an already-EMAILED offer code stays redeemable after its campaign is
 * switched off. The bug (Luigi 2026-07-14, "CARTBACK invalid or expired"): a
 * campaign toggle-off flipped the shared promo to isActive=false, which instantly
 * killed every code already sitting in customers' inboxes — a freshly-delivered
 * offer read "invalid or expired." Fix: disabling a campaign no longer deactivates
 * the code; it keeps it redeemable for this grace window (then it expires
 * naturally). NEW sends still stop immediately — the cron never runs a disabled
 * campaign — so only outstanding codes get the grace.
 */
export const OFFER_GRACE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * The isActive/endsAt patch for a campaign promo given the campaign's enabled
 * state + the row's current endsAt. Enabled → fully live + open-ended. Disabled →
 * keep it redeemable but stamp a grace end (once — don't keep pushing it out on
 * repeated disables), so delivered codes are honored, then expire.
 */
export function activationPatch(
  enabled: boolean,
  existingEndsAt: Date | null,
  now: Date = new Date(),
): { isActive?: boolean; endsAt?: Date | null } {
  if (enabled) return { isActive: true, endsAt: null };
  if (existingEndsAt == null) return { isActive: true, endsAt: new Date(now.getTime() + OFFER_GRACE_MS) };
  return {}; // already in a grace window — leave it
}

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
      select: { id: true, isActive: true, endsAt: true },
    });
    if (existing) {
      // Disabling keeps the code redeemable for a grace window instead of killing
      // codes already in inboxes (the "invalid or expired" bug).
      const patch = activationPatch(enabled, existing.endsAt);
      if (Object.keys(patch).length) {
        await prisma.promotion.update({ where: { id: existing.id }, data: patch });
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
    select: { id: true, isActive: true, endsAt: true },
  });
  if (existing) {
    // Disabling keeps emailed codes redeemable for the grace window (see
    // activationPatch) rather than instantly invalidating inbox codes.
    const patch = activationPatch(enabled, existing.endsAt);
    if (Object.keys(patch).length) {
      await prisma.promotion.update({ where: { id: existing.id }, data: patch });
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

// ─── Campaign ownership ──────────────────────────────────────────────────────
// Luigi 2026-08-11, from Ben Bilton's WIN1 report.
//
// The autopilot codes are ordinary Promotion rows, so they show up in the
// Promotions list next to hand-made promos behind the same power button. On
// 2026-07-03 a routine "retire my old promos" pass switched off fifteen rows in
// thirty seconds — eight the owner meant to retire, and CARTBACK + WIN1..WIN5,
// which were the live coupons of campaigns that were still running. Nothing
// warned him, and the drip kept advertising the dead codes for five weeks.
//
// The campaign toggle is the source of truth for these rows. `isCampaignOwned`
// names them; `liveCampaignRefs` says which are currently claimed by an ENABLED
// campaign, so the API can refuse to deactivate one and the UI can explain why.
// Turning the CAMPAIGN off is still the supported way to retire a code — that
// path runs `activationPatch`, which keeps codes already sitting in customers'
// inboxes redeemable for the grace window instead of killing them outright.

/** True for a promo row that an Autopilot campaign creates and owns. */
export function isCampaignOwned(campaignRef: string | null | undefined): boolean {
  return !!campaignRef && campaignRef.startsWith("autopilot_");
}

/** Which per-campaign toggle governs a given campaignRef. */
function toggleKeyForRef(campaignRef: string): "reEngageEnabled" | "secondOrderEnabled" | "cartAbandonmentEnabled" | null {
  if (REENGAGE_TIERS.some((t) => t.campaignRef === campaignRef)) return "reEngageEnabled";
  if (campaignRef === SECOND_ORDER.campaignRef) return "secondOrderEnabled";
  if (campaignRef === CART_RECOVERY.campaignRef) return "cartAbandonmentEnabled";
  return null;
}

/**
 * The campaignRefs whose campaign is switched ON for this restaurant — i.e. the
 * codes that are actively being emailed and must stay redeemable.
 *
 * Returns an empty set when the master switch is off or no state row exists, so
 * a store that never enabled Autopilot is never gated. Never throws: a lookup
 * failure degrades to "nothing is locked" rather than blocking an owner's edit.
 */
export async function liveCampaignRefs(restaurantId: string): Promise<Set<string>> {
  const live = new Set<string>();
  try {
    const state = await prisma.autopilotState.findUnique({
      where: { restaurantId },
      select: { masterEnabled: true, reEngageEnabled: true, secondOrderEnabled: true, cartAbandonmentEnabled: true },
    });
    if (!state?.masterEnabled) return live;
    const allRefs = [...REENGAGE_TIERS.map((t) => t.campaignRef), SECOND_ORDER.campaignRef, CART_RECOVERY.campaignRef];
    for (const ref of allRefs) {
      const key = toggleKeyForRef(ref);
      if (key && state[key]) live.add(ref);
    }
  } catch (e) {
    console.error("[autopilot-promos liveCampaignRefs]", e);
  }
  return live;
}

/**
 * The discount each drip STEP advertises, keyed by stepNumber. Single batched
 * query (Luigi 2026-06-10): the cron looks this up once per campaign and reads
 * `{couponCode, discountPercent}` per step — the code the email shows + the
 * ordering page pre-applies via `?coupon=CODE`. stepNumber maps to
 * Promotion.campaignSequence (second_order's null sequence → step 1).
 *
 * ⚠️ ONLY REDEEMABLE CODES (Luigi 2026-08-11, Ben Bilton's WIN1 report).
 * This used to select on `campaignRef` alone, so a step whose promo row was
 * inactive or expired still got stamped into the email as `?coupon=WIN1` — a
 * code that reads "invalid or expired" the moment the customer taps it. That
 * is exactly what happened here: a routine promo cleanup on 2026-07-03 switched
 * WIN1–WIN5 off from the Promotions list, and the drip kept advertising them
 * for five weeks (54 emails, 52 customers, 0 redemptions).
 *
 * A step with no live promo now simply returns nothing, and the caller falls
 * back to a plain "Order now" email with no coupon block — a quieter email
 * beats a broken promise. Same gate as `resolveCouponForCampaign`
 * (src/lib/autopilot.ts) so the two campaign paths can't disagree.
 */
export async function getStepPromos(
  restaurantId: string,
  campaignType: string,
  now: Date = new Date(),
): Promise<Map<number, { couponCode: string; discountPercent: number }>> {
  const map = new Map<number, { couponCode: string; discountPercent: number }>();
  const refs = campaignRefsFor(campaignType);
  if (!refs.length) return map;
  const promos = await prisma.promotion.findMany({
    where: {
      restaurantId,
      campaignRef: { in: refs },
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
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
    select: { id: true, ruleConfig: true, endsAt: true },
  });
  if (existing) {
    const rc =
      existing.ruleConfig && typeof existing.ruleConfig === "object" && !Array.isArray(existing.ruleConfig)
        ? (existing.ruleConfig as Record<string, unknown>)
        : {};
    // isActive/endsAt via activationPatch (grace on disable so emailed codes stay
    // honored); the step editor still writes through discount % + name.
    await prisma.promotion.update({
      where: { id: existing.id },
      data: {
        ...activationPatch(active, existing.endsAt),
        ruleConfig: { ...rc, discountPercent },
        name: nameForStepPromo(def, discountPercent),
      },
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
