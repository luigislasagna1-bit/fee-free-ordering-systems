/**
 * Coupon-grant ledger — the shared engine under Kickstarter, Autopilot, and
 * (future) flyer/QR campaigns. See `model CustomerCoupon` in schema.prisma.
 *
 * Core principle (Luigi 2026-06-09): a coupon is consumed by FULFILLMENT, not
 * by placement. A coupon applied to an order counts as "used" while that order
 * is live, becomes terminally "redeemed" when the order COMPLETES, and is
 * "released" (available again) if the order is MISSED / rejected / cancelled.
 * So a coupon is never burned by an order that never actually happened —
 * anywhere in the system, for every campaign.
 *
 *   granted ──apply──▶ applied ──order completes──▶ redeemed
 *                ▲          │
 *                └──────────┘  order failed → released → available again
 *
 * `granted` rows are created PROACTIVELY by targeted campaigns (an Autopilot
 * win-back, a Kickstarter invite, a flyer QR) — those land in later phases via
 * grantCoupon(). Rule-based offers (first-buy = "any new customer") skip the
 * grant step: their `applied` row is created at checkout by recordAppliedCoupons.
 *
 * Every function is internally try/caught and NEVER throws into a hot path:
 * the ledger is a correctness/marketing layer, never a reason an order fails.
 */
import prisma from "@/lib/db";

/** A coupon counts as "used" (blocks re-grant of a once-per-lifetime offer)
 *  while it is applied to a live order OR terminally redeemed. `granted`,
 *  `released`, `expired`, `revoked` do NOT count as used. */
export const USED_STATUSES = ["applied", "redeemed"] as const;

export function normalizeEmail(e?: string | null): string | null {
  if (!e) return null;
  const v = e.trim().toLowerCase();
  return v || null;
}

/** Loose phone normalization for identity matching — strip everything but
 *  digits so "+1 (905) 385-4444" and "9053854444" match. Falls back to the
 *  trimmed raw value if there are too few digits to be a real number. */
export function normalizePhone(p?: string | null): string | null {
  if (!p) return null;
  const digits = p.replace(/\D/g, "");
  if (digits.length >= 7) return digits;
  const v = p.trim();
  return v || null;
}

/** OR-clauses to match a ledger row by email OR phone. Empty when anonymous. */
function identityClauses(email: string | null, phone: string | null): Array<{ email: string } | { phone: string }> {
  const ors: Array<{ email: string } | { phone: string }> = [];
  if (email) ors.push({ email });
  if (phone) ors.push({ phone });
  return ors;
}

/**
 * Record that a set of campaign / once-per-lifetime promos was APPLIED to a
 * freshly-placed order. One `applied` row per (promotion, order) — it counts as
 * used for eligibility until the order completes (→ redeemed) or fails
 * (→ released). Only TRACKABLE promos get a row (campaignRef set OR
 * onceLifetimePerClient); generic always-on promos don't need the ledger.
 * Idempotent per (promotionId, appliedOrderId).
 */
export async function recordAppliedCoupons(args: {
  restaurantId: string;
  orderId: string;
  email?: string | null;
  phone?: string | null;
  customerId?: string | null;
  appliedPromoIds: string[];
}): Promise<void> {
  try {
    const email = normalizeEmail(args.email);
    const phone = normalizePhone(args.phone);
    if (!email && !phone) return; // anonymous cart — nothing to tie a grant to
    const ids = Array.from(new Set(args.appliedPromoIds.filter(Boolean)));
    if (ids.length === 0) return;

    const promos = await prisma.promotion.findMany({
      where: {
        id: { in: ids },
        restaurantId: args.restaurantId,
        // Only track promos where "used / not used" actually matters.
        OR: [{ campaignRef: { not: null } }, { onceLifetimePerClient: true }],
      },
      select: { id: true, campaignRef: true, couponCode: true, autoApply: true },
    });
    if (promos.length === 0) return;

    for (const p of promos) {
      // If a targeted grant for this promo+identity already exists and is live
      // (granted/released), reuse it — flip to applied + pin to this order.
      const reusable = await prisma.customerCoupon.findFirst({
        where: {
          restaurantId: args.restaurantId,
          promotionId: p.id,
          status: { in: ["granted", "released"] },
          OR: identityClauses(email, phone),
        },
        select: { id: true },
      });
      if (reusable) {
        await prisma.customerCoupon.update({
          where: { id: reusable.id },
          data: {
            status: "applied",
            appliedOrderId: args.orderId,
            appliedAt: new Date(),
            // Backfill identity/customer if we learned more this time.
            email: email ?? undefined,
            phone: phone ?? undefined,
            customerId: args.customerId ?? undefined,
          },
        });
        continue;
      }
      // Idempotency: don't double-record the same promo for the same order.
      const already = await prisma.customerCoupon.findFirst({
        where: { promotionId: p.id, appliedOrderId: args.orderId },
        select: { id: true },
      });
      if (already) continue;

      await prisma.customerCoupon.create({
        data: {
          restaurantId: args.restaurantId,
          promotionId: p.id,
          campaignRef: p.campaignRef,
          email,
          phone,
          customerId: args.customerId ?? null,
          code: p.couponCode,
          autoApply: p.autoApply,
          status: "applied",
          grantSource: p.campaignRef ? `campaign:${p.campaignRef}` : "rule:lifetime",
          appliedOrderId: args.orderId,
          appliedAt: new Date(),
        },
      });
    }
  } catch (e) {
    console.error("[coupon-ledger recordAppliedCoupons]", e);
  }
}

/**
 * Order COMPLETED → flip its applied rows to terminally `redeemed`. Bookkeeping:
 * an `applied` row already counts as used, so this is for audit/clarity and to
 * stop a later release from freeing a coupon that was genuinely fulfilled.
 * Idempotent (status guard). Never throws.
 */
export async function redeemCouponsForOrder(orderId: string): Promise<void> {
  try {
    await prisma.customerCoupon.updateMany({
      where: { appliedOrderId: orderId, status: "applied" },
      data: { status: "redeemed", redeemedAt: new Date() },
    });
  } catch (e) {
    console.error("[coupon-ledger redeemCouponsForOrder]", e);
  }
}

/**
 * Order FAILED (missed = auto-rejected / rejected / cancelled) → release its
 * applied rows so the coupon is AVAILABLE again. This is the one rule that makes
 * "a missed order never burns the offer" true for every campaign. Idempotent
 * (status guard + clears appliedOrderId). Never throws.
 */
export async function releaseCouponsForOrder(orderId: string): Promise<void> {
  try {
    await prisma.customerCoupon.updateMany({
      where: { appliedOrderId: orderId, status: "applied" },
      data: { status: "released", releasedAt: new Date(), appliedOrderId: null },
    });
  } catch (e) {
    console.error("[coupon-ledger releaseCouponsForOrder]", e);
  }
}

/**
 * Which of the given promotions has this customer already USED (applied to a
 * live order or redeemed)? Matched by email OR phone, so a guest who used the
 * offer with an email and returns with only a phone is still recognised.
 * Released / granted rows do NOT count — a missed order keeps the offer. Returns
 * the set of used promotionIds. Read-only; safe to call in the checkout path.
 */
export async function usedPromoIds(args: {
  restaurantId: string;
  promotionIds: string[];
  email?: string | null;
  phone?: string | null;
}): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    const ids = Array.from(new Set(args.promotionIds.filter(Boolean)));
    if (ids.length === 0) return out;
    const identity = identityClauses(normalizeEmail(args.email), normalizePhone(args.phone));
    if (identity.length === 0) return out;
    const rows = await prisma.customerCoupon.findMany({
      where: {
        restaurantId: args.restaurantId,
        promotionId: { in: ids },
        status: { in: ["applied", "redeemed"] },
        OR: identity,
      },
      select: { promotionId: true },
    });
    for (const r of rows) out.add(r.promotionId);
  } catch (e) {
    console.error("[coupon-ledger usedPromoIds]", e);
  }
  return out;
}

/**
 * Which of the given once-per-lifetime promotions has this customer already used?
 * THE single source of truth for once-per-lifetime enforcement — called by BOTH
 * the order route (charge) and the cart-preview route (apply-promos) so the
 * previewed total always matches the real charge (Luigi 2026-06-26).
 *
 * It is PER-PROMO precise (it asks "did they use THIS promo", never the old
 * coarse "did they use ANY promo → block ALL"), and it covers two signals:
 *
 *   1. The CustomerCoupon ledger (cross-identity by email/phone) — every promo
 *      redeemed since the ledger shipped (2026-06-09).
 *   2. A scan of the customer's OWN prior fulfilled orders' `appliedPromos`
 *      JSON — catches redemptions made BEFORE the ledger existed. Scoped to
 *      this one customer (by id / email / phone) and pre-filtered to orders
 *      that actually carried a discount, so it's bounded by a single
 *      customer's history, never a full-table scan.
 *
 * Read-only; internally try/caught; never throws into the order/checkout path.
 */
export async function usedLifetimePromoIds(args: {
  restaurantId: string;
  promotionIds: string[];
  customerId?: string | null;
  email?: string | null;
  phone?: string | null;
}): Promise<Set<string>> {
  const out = new Set<string>();
  const ids = Array.from(new Set(args.promotionIds.filter(Boolean)));
  if (ids.length === 0) return out;
  try {
    // 1. Precise cross-identity ledger.
    const ledger = await usedPromoIds({
      restaurantId: args.restaurantId,
      promotionIds: ids,
      email: args.email,
      phone: args.phone,
    });
    for (const id of ledger) out.add(id);
    // Short-circuit if everything's already known used.
    if (ids.every((id) => out.has(id))) return out;

    // 2. Order-history scan (covers pre-ledger redemptions). Match this
    //    customer broadly — being permissive here is the SAFE direction
    //    (catch a prior use → block re-use). Bounded by one customer's orders.
    const email = normalizeEmail(args.email);
    const phone = normalizePhone(args.phone);
    const idOr: any[] = [];
    if (args.customerId) idOr.push({ customerId: args.customerId });
    if (email) idOr.push({ customerEmail: { equals: email, mode: "insensitive" } });
    if (phone) idOr.push({ customerPhone: phone });
    if (idOr.length === 0) return out;
    const want = new Set(ids);
    const rows = await prisma.order.findMany({
      where: {
        restaurantId: args.restaurantId,
        status: { notIn: ["cancelled", "rejected"] }, // "missed" == auto-rejected
        promoDiscount: { gt: 0 },
        OR: idOr,
      },
      select: { appliedPromos: true },
    });
    for (const r of rows) {
      const ap: unknown = (r as any).appliedPromos;
      let arr: any[] = [];
      if (Array.isArray(ap)) arr = ap;
      else if (typeof ap === "string") { try { arr = JSON.parse(ap); } catch { arr = []; } }
      for (const p of arr) {
        const pid = p?.promoId;
        if (typeof pid === "string" && want.has(pid)) out.add(pid);
      }
    }
  } catch (e) {
    console.error("[coupon-ledger usedLifetimePromoIds]", e);
  }
  return out;
}

/**
 * Proactively GRANT a coupon to a specific customer — used by targeted
 * campaigns (Autopilot win-back, Kickstarter invite, flyer QR) in later phases.
 * Idempotent per (restaurant, promotion, identity): if the customer already
 * holds a live grant (granted/applied/redeemed) for this promo, does nothing.
 * Returns the grant id, or null on no-op/error.
 */
export async function grantCoupon(args: {
  restaurantId: string;
  promotionId: string;
  email?: string | null;
  phone?: string | null;
  customerId?: string | null;
  code?: string | null;
  autoApply?: boolean;
  campaignRef?: string | null;
  grantSource?: string | null;
  expiresAt?: Date | null;
}): Promise<string | null> {
  try {
    const email = normalizeEmail(args.email);
    const phone = normalizePhone(args.phone);
    if (!email && !phone) return null;
    const existing = await prisma.customerCoupon.findFirst({
      where: {
        restaurantId: args.restaurantId,
        promotionId: args.promotionId,
        status: { in: ["granted", "applied", "redeemed"] },
        OR: identityClauses(email, phone),
      },
      select: { id: true },
    });
    if (existing) return existing.id;
    const row = await prisma.customerCoupon.create({
      data: {
        restaurantId: args.restaurantId,
        promotionId: args.promotionId,
        campaignRef: args.campaignRef ?? null,
        email,
        phone,
        customerId: args.customerId ?? null,
        code: args.code ?? null,
        autoApply: args.autoApply ?? false,
        status: "granted",
        grantSource: args.grantSource ?? null,
        expiresAt: args.expiresAt ?? null,
      },
      select: { id: true },
    });
    return row.id;
  } catch (e) {
    console.error("[coupon-ledger grantCoupon]", e);
    return null;
  }
}

/**
 * Active (status `granted`, not expired) coupon grants for an identity — the
 * input to auto-apply resolution at checkout (consumed by targeted campaigns in
 * later phases). Read-only.
 */
export async function findActiveGrants(args: {
  restaurantId: string;
  email?: string | null;
  phone?: string | null;
}): Promise<Array<{ id: string; promotionId: string; code: string | null; autoApply: boolean; campaignRef: string | null }>> {
  try {
    const identity = identityClauses(normalizeEmail(args.email), normalizePhone(args.phone));
    if (identity.length === 0) return [];
    const now = new Date();
    const rows = await prisma.customerCoupon.findMany({
      where: {
        restaurantId: args.restaurantId,
        status: "granted",
        OR: identity,
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
      },
      select: { id: true, promotionId: true, code: true, autoApply: true, campaignRef: true },
    });
    return rows;
  } catch (e) {
    console.error("[coupon-ledger findActiveGrants]", e);
    return [];
  }
}
