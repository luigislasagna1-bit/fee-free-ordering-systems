/**
 * Autopilot drip STEPS — the server layer for owner-configurable multi-email
 * win-back sequences (Luigi 2026-06-10).
 *
 * A campaign (reengagement / second_order) owns an ordered list of AutopilotStep
 * rows. Each step is one follow-up email with its own delay + discount % + copy.
 * The cron (`runSteppedCampaign`) sends the highest DUE step per candidate; a
 * re-order restarts the ladder. The step's discount % is mirrored to the
 * matching campaignSequence Promotion (via `syncStepsToPromos`) so the email
 * advertises exactly what the ordering page applies.
 *
 * reengagement caps at 5 steps (the WIN1..5 promo slots); second_order is a
 * single step (2NDOFF). cart_abandonment is NOT stepped (own sweep).
 */
import prisma from "@/lib/db";
import { syncStepsToPromos } from "@/lib/autopilot-promos";

export type StepInput = {
  stepNumber: number;
  delayHours: number;
  discountPercent: number;
  subject: string;
  emailBody: string;
  isEnabled: boolean;
};

/** Max steps per campaign type — bounded by the fixed WIN promo slots. */
export function maxSteps(campaignType: string): number {
  if (campaignType === "reengagement") return 5;
  if (campaignType === "second_order") return 1;
  return 0;
}

const REENGAGE_DEFAULTS: StepInput[] = [
  { stepNumber: 1, delayHours: 7 * 24, discountPercent: 10, isEnabled: true,
    subject: "We miss you at {restaurant_name}!",
    emailBody: "Hi {customer_name},\n\nIt's been a little while since your last order and we'd love to see you again. Here's a welcome-back treat:\n\n{coupon_section}\n\nOrder anytime: {restaurant_link}" },
  { stepNumber: 2, delayHours: 14 * 24, discountPercent: 15, isEnabled: true,
    subject: "Still thinking of you — here's a little more off",
    emailBody: "Hi {customer_name},\n\nWe bumped up your offer — come back and enjoy something delicious on us:\n\n{coupon_section}\n\nOrder anytime: {restaurant_link}" },
  { stepNumber: 3, delayHours: 21 * 24, discountPercent: 15, isEnabled: true,
    subject: "Your table's waiting — 15% off",
    emailBody: "Hi {customer_name},\n\nA fresh batch is always better with you here. Your offer's still good:\n\n{coupon_section}\n\nOrder anytime: {restaurant_link}" },
  { stepNumber: 4, delayHours: 28 * 24, discountPercent: 20, isEnabled: true,
    subject: "We'd really love you back — 20% off",
    emailBody: "Hi {customer_name},\n\nHere's our best offer yet — come treat yourself:\n\n{coupon_section}\n\nOrder anytime: {restaurant_link}" },
  { stepNumber: 5, delayHours: 35 * 24, discountPercent: 20, isEnabled: true,
    subject: "One last one, just for you — 20% off",
    emailBody: "Hi {customer_name},\n\nWe don't want to lose you. Here's 20% off, no strings:\n\n{coupon_section}\n\nOrder anytime: {restaurant_link}" },
];

const SECOND_ORDER_DEFAULTS: StepInput[] = [
  { stepNumber: 1, delayHours: 24, discountPercent: 15, isEnabled: true,
    subject: "Thanks for your order — here's 15% off the next one",
    emailBody: "Hi {customer_name},\n\nThanks for ordering from {restaurant_name}! Here's a little something for next time:\n\n{coupon_section}\n\nOrder anytime: {restaurant_link}" },
];

export function defaultSteps(campaignType: string): StepInput[] {
  if (campaignType === "reengagement") return REENGAGE_DEFAULTS.map((s) => ({ ...s }));
  if (campaignType === "second_order") return SECOND_ORDER_DEFAULTS.map((s) => ({ ...s }));
  return [];
}

/** Is this campaign type driven by drip steps (vs the legacy single send)? */
export function isSteppedType(campaignType: string): boolean {
  return campaignType === "reengagement" || campaignType === "second_order";
}

/**
 * Ensure the campaign is ready to send a stepped sequence: an AutopilotCampaign
 * anchor row exists (AutopilotSend FK + cron loop), default steps are seeded if
 * none exist, and each step's % is mirrored to its promo. Called when a stepped
 * campaign is toggled ON. Idempotent + internally safe.
 */
export async function ensureSteppedCampaign(restaurantId: string, campaignType: string, enabled: boolean): Promise<void> {
  if (!isSteppedType(campaignType)) return;
  try {
    const defaults = defaultSteps(campaignType);
    // Anchor row — mirrors AutopilotState's enabled, gives AutopilotSend its FK,
    // and keeps the cron's AutopilotCampaign loop picking this campaign up.
    await prisma.autopilotCampaign.upsert({
      where: { restaurantId_campaignType: { restaurantId, campaignType } },
      update: { isEnabled: enabled },
      create: {
        restaurantId, campaignType, isEnabled: enabled,
        subject: defaults[0]?.subject ?? "", emailBody: defaults[0]?.emailBody ?? "", delayHours: defaults[0]?.delayHours ?? 168,
      },
    });
    // Seed defaults only on ENABLE (never conjure dormant steps on disable).
    if (enabled && defaults.length) {
      const count = await prisma.autopilotStep.count({ where: { restaurantId, campaignType } });
      if (count === 0) {
        await prisma.autopilotStep.createMany({
          data: defaults.map((s) => ({ restaurantId, campaignType, ...s })),
        });
      }
    }
    await syncStepsToPromos(restaurantId, campaignType, enabled);
  } catch (e) {
    console.error("[autopilot-steps ensureSteppedCampaign]", e);
  }
}

/** Read a campaign's steps, ordered. */
export async function getSteps(restaurantId: string, campaignType: string) {
  return prisma.autopilotStep.findMany({
    where: { restaurantId, campaignType },
    orderBy: { stepNumber: "asc" },
    select: { stepNumber: true, delayHours: true, discountPercent: true, subject: true, emailBody: true, isEnabled: true },
  });
}

/**
 * Replace a campaign's steps with the owner's edited list (renumbered 1..N,
 * capped at maxSteps), then mirror % to promos. Keeps the AutopilotCampaign
 * anchor in sync. Session-scoped restaurantId is supplied by the caller.
 */
export async function saveSteps(restaurantId: string, campaignType: string, steps: StepInput[], campaignEnabled: boolean): Promise<void> {
  if (!isSteppedType(campaignType)) return;
  const cap = maxSteps(campaignType);
  // Sanitize + renumber sequentially so stepNumber maps cleanly to WINn.
  const clean: StepInput[] = steps.slice(0, cap).map((s, i) => ({
    stepNumber: i + 1,
    delayHours: Math.max(1, Math.round(Number(s.delayHours) || 0)),
    discountPercent: Math.min(100, Math.max(0, Math.round(Number(s.discountPercent) || 0))),
    subject: String(s.subject ?? "").slice(0, 300),
    emailBody: String(s.emailBody ?? "").slice(0, 5000),
    isEnabled: s.isEnabled !== false,
  }));

  // Drop any rows beyond the new count.
  await prisma.autopilotStep.deleteMany({ where: { restaurantId, campaignType, stepNumber: { gt: clean.length } } });
  for (const s of clean) {
    await prisma.autopilotStep.upsert({
      where: { restaurantId_campaignType_stepNumber: { restaurantId, campaignType, stepNumber: s.stepNumber } },
      update: { delayHours: s.delayHours, discountPercent: s.discountPercent, subject: s.subject, emailBody: s.emailBody, isEnabled: s.isEnabled },
      create: { restaurantId, campaignType, stepNumber: s.stepNumber, delayHours: s.delayHours, discountPercent: s.discountPercent, subject: s.subject, emailBody: s.emailBody, isEnabled: s.isEnabled },
    });
  }

  // Keep the anchor row present (FK for AutopilotSend + cron loop).
  await prisma.autopilotCampaign.upsert({
    where: { restaurantId_campaignType: { restaurantId, campaignType } },
    update: {},
    create: {
      restaurantId, campaignType, isEnabled: campaignEnabled,
      subject: clean[0]?.subject ?? "", emailBody: clean[0]?.emailBody ?? "", delayHours: clean[0]?.delayHours ?? 168,
    },
  });

  await syncStepsToPromos(restaurantId, campaignType, campaignEnabled);
}
