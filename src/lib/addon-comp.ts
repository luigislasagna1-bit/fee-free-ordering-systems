/**
 * Free-partner-period ("complimentary add-on") helpers — PURE, no prisma /
 * stripe imports so unit tests can import them without a DATABASE_URL
 * (same reasoning as the lazy-prisma note in src/lib/dunning.ts).
 *
 * Background (Luigi 2026-07-10/11): the platform's test→live Stripe switch
 * left pre-live add-on subscriptions as status="trialing" rows with NO Stripe
 * subscription — complimentary until trialEndsAt, then switched off by the
 * /api/cron/expire-addon-trials sweep. These rows must be CONVERTIBLE to a
 * real paid subscription before that date, and the Add-ons UI must present
 * them as "free until X", never as "renews automatically".
 */

/** Free-partner-period detector: trialing with NO Stripe subscription.
 *  Stripe-billed trials always carry their sub id; permanent superadmin comps
 *  use status "active" — neither matches. Mirrors the scope guards in
 *  /api/cron/expire-addon-trials and the admin-layout banner query. */
export function isComplimentaryAddOnRow(
  row: { status: string; stripeSubscriptionId: string | null } | null | undefined,
): boolean {
  return !!row && row.status === "trialing" && !row.stripeSubscriptionId;
}

/**
 * When a complimentary add-on converts to a PAID subscription before its free
 * period ends, carry the remaining free days into Stripe as `trial_end` so the
 * owner's card is saved now but billing starts exactly when the promised free
 * period ends (the partner banner says "subscribe with a card to KEEP it" —
 * not "start paying twice for the same days").
 *
 * Returns a unix-seconds timestamp for subscription_data.trial_end, or null
 * when billing should just start immediately: not a complimentary row, no
 * trialEndsAt, or the free period has ALREADY ended (billing now is then
 * consistent with the promise — the free period is over).
 *
 * Stripe Checkout rejects trial_end less than 48h in the future, so when the
 * free period ends within ~2 days the timestamp is clamped UP to now+49h
 * rather than dropped: the platform grants up to ~49h extra free service, but
 * the owner is NEVER billed before the promised end date — the card copy
 * ("billing only starts when the free period ends") stays true in every case.
 * (Adversarial review 2026-07-11: dropping to null here charged last-minute
 * converters immediately while the UI still promised deferred billing.)
 */
export function complimentaryTrialCarryOverSec(
  row:
    | { status: string; stripeSubscriptionId: string | null; trialEndsAt: Date | null }
    | null
    | undefined,
  now: Date = new Date(),
): number | null {
  if (!isComplimentaryAddOnRow(row) || !row?.trialEndsAt) return null;
  const endMs = row.trialEndsAt.getTime();
  if (endMs <= now.getTime()) return null;
  const MIN_MARGIN_MS = 49 * 60 * 60 * 1000;
  return Math.floor(Math.max(endMs, now.getTime() + MIN_MARGIN_MS) / 1000);
}
