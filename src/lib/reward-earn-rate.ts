/**
 * Standing earn-rate OVERRIDES (Luigi 2026-07-19: "VIP members earn double").
 *
 * Resolution: the customer's personal rate (Customer.rewardEarnPercent) wins;
 * else the HIGHEST rate among their VIP groups (CustomerGroup.rewardEarnPercent);
 * else null — and the caller keeps computing the restaurant base EXACTLY as it
 * always has (per_dollar or percent branch untouched), so a customer with no
 * override earns byte-identically to before this feature existed.
 *
 * Overrides are always expressed as a PERCENT of the earn basis (10 = 10%
 * back), independent of the restaurant's earn MODE — the admin UI shows one
 * number, and per-dollar stores don't need a second unit. Overrides never
 * stack with each other or with the base (highest single rate applies); earn
 * still requires a signed-in account at order time (the caller's existing
 * gate — this module only resolves the rate).
 *
 * Never throws: any DB hiccup returns null (base rate), because earn must
 * never break an order.
 *
 * prisma is imported LAZILY inside the loader (vip-membership.ts pattern) so
 * the pure helpers stay unit-testable without a DATABASE_URL.
 */

/** Pick the winning override from already-loaded values. Pure. */
export function pickOverridePct(
  personalPct: number | null | undefined,
  groupPcts: Array<number | null | undefined>,
): number | null {
  if (typeof personalPct === "number" && personalPct > 0) return personalPct;
  const rates = groupPcts.filter((p): p is number => typeof p === "number" && p > 0);
  return rates.length ? Math.max(...rates) : null;
}

/** Earn amount for a basis at an override percent. Callers use this ONLY when
 *  an override exists; the no-override path must keep its original math. */
export function earnAtPct(basis: number, pct: number): number {
  return basis * (pct / 100);
}

/**
 * Effective override for an ORDER: prefer the placement-time snapshot
 * (Order.rewardEarnOverridePct, stamped at create — 2026-07-22) and only
 * fall back to live resolution for legacy/pre-field orders. Semantics of
 * the stamp: >0 = frozen override pct; 0 = resolved-at-placement "no
 * override" (use the base rate); null/undefined = no stamp → resolve live.
 * BOTH earn legs (awardForOrder + projectOrderEarn) MUST go through this
 * single function so promised == granted by construction.
 */
export async function effectiveOverridePct(
  stamp: number | null | undefined,
  restaurantId: string,
  customerId: string,
): Promise<number | null> {
  if (typeof stamp === "number") return stamp > 0 ? stamp : null;
  return loadEarnOverridePct(restaurantId, customerId);
}

/**
 * Load the customer's effective override for this restaurant, or null.
 * Membership resolves through the SAME canonical function the VIP promo
 * engine uses (resolveIdentityTargets: signed-in customerId + exact email,
 * phone deliberately never a key) so "who is in the group" can never differ
 * between a member's special applying and their earn rate applying.
 */
export async function loadEarnOverridePct(
  restaurantId: string,
  customerId: string,
): Promise<number | null> {
  try {
    const prisma = (await import("@/lib/db")).default;
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { rewardEarnPercent: true, email: true },
    });
    if (!customer) return null;
    if (typeof customer.rewardEarnPercent === "number" && customer.rewardEarnPercent > 0) {
      return customer.rewardEarnPercent;
    }
    // EARLY EXIT (review 2026-07-19): most restaurants have no group rates —
    // one tiny indexed query decides that BEFORE the (heavier) identity
    // resolution, so the zero-override common case skips the email scan on
    // the per-request order page and every earn/projection call.
    const ratedGroups = await prisma.customerGroup.findMany({
      where: { restaurantId, rewardEarnPercent: { gt: 0 } },
      select: { id: true, rewardEarnPercent: true },
    });
    if (ratedGroups.length === 0) return null;
    const { resolveIdentityTargets } = await import("@/lib/vip-membership");
    const { groupIds } = await resolveIdentityTargets(restaurantId, {
      customerId,
      email: customer.email,
    });
    if (groupIds.size === 0) return null;
    return pickOverridePct(null, ratedGroups.filter((g) => groupIds.has(g.id)).map((g) => g.rewardEarnPercent));
  } catch (e) {
    // Attributable (review 2026-07-19): a swallowed failure here silently
    // degrades a VIP to the base rate — the log must say WHO so an
    // under-granted order can be traced and comped.
    console.error(`[reward loadEarnOverridePct] degraded to base rate for restaurant=${restaurantId} customer=${customerId}`, e);
    return null;
  }
}
