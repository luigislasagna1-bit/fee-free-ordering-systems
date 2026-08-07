/**
 * THE customer-facing name of the store-credit program, and THE test for whether
 * the program is live.
 *
 * Every restaurant renames Reward Dollars — Luigi's store calls them "Luigi
 * Bucks". The fallback chain (plural → singular → localized default) was
 * open-coded at ~15 call sites in three subtly different variants: some skipped
 * the singular step, several hardcoded the English "Reward Dollars" as the final
 * fallback, and three different definitions of "rewards are active" existed
 * (emails checked `rewardsEnabled`; the printed receipt also required
 * `order.customerId`; customer web pages used a third form). One seam, so a
 * store's chosen name and the on/off switch mean the same thing everywhere.
 *
 * Pure module — no Prisma, no server-only — so emails, receipts, client
 * components and tests can all share it. Callers pass the already-translated
 * default because only they hold a `t()`.
 */

export type RewardLabelSource = {
  rewardLabelPlural?: string | null;
  rewardLabelSingular?: string | null;
};

export type RewardsGateSource = {
  rewardsEnabled?: boolean | null;
} & RewardLabelSource;

/**
 * The store's name for its credit, e.g. "Luigi Bucks".
 *
 * @param fallback the localized default, e.g. t("customer.confirmation.rewardDefaultName").
 *                 Never hardcode English here.
 */
export function resolveRewardLabel(
  restaurant: RewardLabelSource | null | undefined,
  fallback: string,
): string {
  return (
    restaurant?.rewardLabelPlural?.trim() ||
    restaurant?.rewardLabelSingular?.trim() ||
    fallback
  );
}

/**
 * Is the credit program live for this restaurant?
 *
 * Deliberately keyed on `rewardsEnabled` ALONE — the master switch. Note this
 * gates DISPLAY of credit lines, including on historical orders: a store that
 * turns the program off stops showing credit on old receipts. That is the
 * long-standing, accepted behaviour; it is preserved here rather than changed.
 *
 * `rewardRedeemEnabled` is intentionally not consulted (it is auto-coupled to
 * the master switch and a stale value would silently hide real money).
 */
export function rewardsActive(restaurant: RewardsGateSource | null | undefined): boolean {
  return restaurant?.rewardsEnabled === true;
}

/**
 * The full gate used by every payload builder: the program is on AND this order
 * actually tendered credit. Below this, callers pass nothing at all — which is
 * what keeps non-rewards restaurants rendering exactly as they did before.
 */
export function orderShowsCredit(
  restaurant: RewardsGateSource | null | undefined,
  order: { creditApplied?: number | null } | null | undefined,
): boolean {
  return rewardsActive(restaurant) && (order?.creditApplied ?? 0) > 0;
}
