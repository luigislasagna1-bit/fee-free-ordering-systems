/**
 * ONE shared assembly of everything the promo engine needs to know about WHO
 * is ordering and WHICH promotions are in play — used by BOTH checkout routes:
 *
 *   - /api/public/apply-promos  (cart PREVIEW)
 *   - /api/orders               (CHARGE)
 *
 * so the previewed discount always equals the charged discount to the cent
 * (launch Blocker #7). Before this module the two routes duplicated the logic
 * and had drifted in four spots — member signal, brand/franchise promo scope,
 * once-per-lifetime identity, and new-vs-returning identity keys — letting a
 * cart preview a discount the charge then refused (customer charged MORE than
 * shown). Any future change to promo pooling or customer identity MUST go
 * here, never in one route alone.
 *
 * Canonical definitions (the single source of truth):
 *
 *   PROMO POOL   = this restaurant's own active promotions PLUS the parent's
 *                  `scope:"brand"` promotions when this is a franchise child.
 *                  Capped at PROMO_POOL_TAKE per the scaling rule.
 *
 *   MEMBER       = signed in to a per-restaurant customer account (the
 *                  `ff_rest_account` session) OR the resolved email has a
 *                  marketplace CustomerAccount. Typing an email alone never
 *                  proves the restaurant login — but the CustomerAccount
 *                  email check is kept because the charge has always granted
 *                  it and members type their own email at checkout.
 *
 *   CUSTOMER ID  = the signed-in session's Customer row, else the Customer
 *                  row matching the typed email. Used for once-per-lifetime
 *                  history scans and VIP target matching.
 *
 *   NEW CUSTOMER = zero prior non-failed orders IN THIS CHANNEL matching the
 *                  customer id OR email OR phone. Unidentified carts stay
 *                  optimistic (preview passes the client's banner flag; the
 *                  charge defaults to true) — the moment any identity exists
 *                  both routes re-derive from the same query, so they agree.
 */
import prisma from "@/lib/db";
import { getCurrentRestaurantCustomer } from "@/lib/restaurant-customer-session";
import { usedLifetimePromoIds, findActiveGrants, resolveGrantById } from "@/lib/coupon-ledger";
import { partitionMemberOnly, qualifyingMemberOnlyPromos } from "@/lib/vip-membership";

export type PromoChannel = "website" | "marketplace";

/** Cap per the standing scaling rule (no unbounded findMany on a hot path).
 *  No real restaurant has anywhere near this many ACTIVE promos, so this never
 *  truncates a real result; it only bounds worst-case memory. */
export const PROMO_POOL_TAKE = 500;

type RestaurantRef = { id: string; parentRestaurantId?: string | null };

/** The one where-clause for "promotions that can apply at this restaurant":
 *  its own + the parent's brand-scoped ones (franchise children inherit brand
 *  campaigns). Shared by the pool fetch AND the grant re-fetch so a granted
 *  brand promo resolves identically in preview and charge. */
export function promotionPoolWhere(restaurant: RestaurantRef) {
  const promoOwnerIds: string[] = [restaurant.id];
  if (restaurant.parentRestaurantId) promoOwnerIds.push(restaurant.parentRestaurantId);
  return {
    isActive: true,
    OR: [
      { restaurantId: restaurant.id },
      { restaurantId: { in: promoOwnerIds }, scope: "brand" },
    ],
  };
}

/** Fetch the full active promo pool for an order at this restaurant —
 *  including the parent's brand-scoped promos — with the VIP target links the
 *  member-only partition needs. THE pool query for both checkout routes. */
export async function getActivePromotionsForOrder(restaurant: RestaurantRef) {
  return prisma.promotion.findMany({
    where: promotionPoolWhere(restaurant),
    include: { groupLinks: { select: { groupId: true, customerId: true, email: true, phone: true } } },
    take: PROMO_POOL_TAKE,
  });
}

/** Acquisition-channel gate: a marketplace order only gets "marketplace"/
 *  "both" promos; a website order only "website"/"both". */
export function promoChannelOk(promo: { channel?: string | null }, channel: PromoChannel): boolean {
  return promo.channel === "both" || promo.channel === channel;
}

export type PromoOrderContext = {
  /** The final promo pool, ready for the engine: public promos filtered by
   *  channel + suppressions, PLUS this identity's granted / member-only promos
   *  forced to autoApply (a forced ?grant= gift is also forced exclusive so it
   *  can win by value). */
  activePromos: any[];
  isNewCustomer: boolean;
  isMember: boolean;
  /** promoId → true for every once-per-lifetime promo this identity already
   *  redeemed (ledger + order-history, same source both routes). */
  hasUsedLifetime: Record<string, boolean>;
  /** Canonical Customer row id: session first, else typed-email match. */
  customerId: string | null;
  /** Resolved contact identity: typed at checkout, else the session's own. */
  email: string | null;
  phone: string | null;
  /** SERVER-VERIFIED signed-in identity only — for things that must never be
   *  reachable by typing someone's email (?grant= gifts, reward balance). */
  sessionCustomerId: string | null;
  sessionEmail: string | null;
  sessionPhone: string | null;
  /** True when we know who this is (any of email / phone / customerId). While
   *  false, isNewCustomer is the optimistic passthrough and lifetime/member
   *  checks are skipped — the charge re-derives once identity exists. */
  identified: boolean;
  /** Promo ids force-included via a validated ?grant= gift (marked exclusive).
   *  The order route single-uses the grant after the order is created. */
  grantForcedIds: Set<string>;
  /** Identity is known-returning while a kickstarter first-buy promo is live —
   *  lets the cart show the "new customers only" note. */
  newCustomerOfferUnavailable: boolean;
};

/**
 * Build the shared promo-evaluation context. Both routes call this with the
 * same inputs at the same point in their flow; everything order-specific that
 * can't drift (subtotal, items, orderType, scheduled time, zone, coupon code)
 * stays in the caller's engine ctx.
 *
 * Reads the per-restaurant customer session cookie itself, so the caller
 * must be a route handler / server context. All grant + member lookups are
 * internally try/caught (a promo perk must never fail an order); the core
 * identity queries are not — the callers' own error handling applies.
 */
export async function buildPromoOrderContext(args: {
  restaurant: RestaurantRef;
  channel: PromoChannel;
  /** Identity typed at checkout (raw — normalized here). */
  email?: string | null;
  phone?: string | null;
  /** Promo ids the customer manually removed from the cart. */
  suppressedPromoIds?: unknown;
  /** Code-less personal gift chosen via ?grant= — honored ONLY for the
   *  server-verified signed-in customer. */
  grantId?: string | null;
  /** Pre-identity fallback for isNewCustomer: the preview passes the client's
   *  banner flag so an unidentified cart previews what the banner promised;
   *  the charge omits it (optimistic true, its historical behavior). */
  optimisticIsNewCustomer?: boolean;
}): Promise<PromoOrderContext> {
  const { restaurant, channel } = args;

  const activePromosAll = await getActivePromotionsForOrder(restaurant);

  // Drop promos the customer chose to remove from the cart, so a different
  // (otherwise-blocked) deal can take over.
  const suppressed = new Set(
    Array.isArray(args.suppressedPromoIds) ? args.suppressedPromoIds.map((x: unknown) => String(x)) : [],
  );
  // Member-only (VIP) promos are linked to ≥1 target — keep them OUT of the
  // public pool; they're added back below only for identified members.
  const { general: publicPromos, memberOnly: memberOnlyPromos } = partitionMemberOnly(activePromosAll as any[]);
  const activePromos: any[] = publicPromos.filter((p: any) => !suppressed.has(p.id) && promoChannelOk(p, channel));

  // ── Canonical identity ────────────────────────────────────────────────────
  const typedEmail = typeof args.email === "string" ? args.email.trim().toLowerCase() || null : null;
  const typedPhone = typeof args.phone === "string" ? args.phone.trim() || null : null;

  let sessionCustomerId: string | null = null;
  let sessionEmail: string | null = null;
  let sessionPhone: string | null = null;
  try {
    const me = await getCurrentRestaurantCustomer({ expectedRestaurantId: restaurant.id });
    if (me) {
      sessionCustomerId = me.id ?? null;
      sessionEmail = me.email?.trim().toLowerCase() ?? null;
      sessionPhone = me.phone?.trim() ?? null;
    }
  } catch { /* not signed in — identity falls back to what was typed */ }

  const email = typedEmail ?? sessionEmail;
  const phone = typedPhone ?? sessionPhone;

  // Canonical Customer row: the session's own row wins; else map the typed
  // email to this restaurant's customer ledger (rows are stored lowercased).
  let customerId: string | null = sessionCustomerId;
  if (!customerId && email) {
    const existing = await prisma.customer.findFirst({
      where: { restaurantId: restaurant.id, email },
      select: { id: true },
    });
    customerId = existing?.id ?? null;
  }
  const identified = !!(email || phone || customerId);

  // ── New vs returning ─────────────────────────────────────────────────────
  // Judged on FULFILLED orders only — a missed/rejected/cancelled order never
  // served the customer, so it must not flip them to "returning" — and WITHIN
  // this order's channel (the marketplace is a separate customer base, so a
  // website regular is "new" there and keeps its first-buy). Matching id OR
  // email OR phone closes the rotate-an-email loophole the same way for both
  // routes.
  let isNewCustomer = args.optimisticIsNewCustomer ?? true;
  if (identified) {
    const priorFulfilled = await prisma.order.count({
      where: {
        restaurantId: restaurant.id,
        status: { notIn: ["cancelled", "rejected"] }, // "missed" == auto-rejected
        viaMarketplace: channel === "marketplace",
        OR: [
          ...(customerId ? [{ customerId }] : []),
          ...(email ? [{ customerEmail: email }] : []),
          ...(phone ? [{ customerPhone: phone }] : []),
        ],
      },
    });
    isNewCustomer = priorFulfilled === 0;
  }
  const newCustomerOfferUnavailable =
    identified && !isNewCustomer &&
    activePromos.some((p: any) => p.campaignRef === "kickstarter_first_buy" && p.isActive);

  // ── Member signal (canonical — see module doc) ───────────────────────────
  // A signed-in per-restaurant customer IS a member; so is a resolved email
  // with a marketplace CustomerAccount. Both routes use exactly this, closing
  // the old divergence where a signed-in customer PREVIEWED a member-only
  // discount and was then CHARGED full price.
  let isMember = !!sessionCustomerId;
  if (!isMember && email) {
    const account = await prisma.customerAccount.findUnique({ where: { email }, select: { id: true } });
    isMember = !!account;
  }

  // ── Auto-apply VIP-group / assigned grants (Program 3) ───────────────────
  // A member identified by email/phone gets their granted promo applied with
  // NO code; the Promotion itself is autoApply:false so it never leaks to
  // non-members. Force autoApply on an in-memory copy so the engine applies
  // it (still isEligible- and lifetime-gated). A ?grant= gift is resolved
  // ONLY against the server-verified session identity — never the typed
  // email — and forced exclusive so a chosen gift can WIN by value.
  const grantForcedIds = new Set<string>();
  if (identified) {
    try {
      const grants = await findActiveGrants({ restaurantId: restaurant.id, email, phone });
      const autoIds = new Set(grants.filter((g) => g.autoApply).map((g) => g.promotionId));
      if (typeof args.grantId === "string" && args.grantId && sessionCustomerId) {
        const g = await resolveGrantById({
          restaurantId: restaurant.id,
          grantId: args.grantId,
          customerId: sessionCustomerId,
          email: sessionEmail,
          phone: sessionPhone,
        });
        if (g && !suppressed.has(g.promotionId)) { autoIds.add(g.promotionId); grantForcedIds.add(g.promotionId); }
      }
      if (autoIds.size > 0) {
        for (let i = 0; i < activePromos.length; i++) {
          if (autoIds.has(activePromos[i].id)) {
            activePromos[i] = { ...activePromos[i], autoApply: true, ...(grantForcedIds.has(activePromos[i].id) ? { stackingRule: "exclusive" } : {}) };
            autoIds.delete(activePromos[i].id);
          }
        }
        if (autoIds.size > 0) {
          // Granted promos that weren't in the filtered pool (e.g. hidden
          // code-only promos). Same brand-scope-aware where as the pool so a
          // granted BRAND promo resolves in preview exactly as at charge.
          const extra = await prisma.promotion.findMany({
            where: { ...promotionPoolWhere(restaurant), id: { in: [...autoIds] } },
          });
          for (const p of extra) {
            if (!suppressed.has(p.id)) {
              activePromos.push({ ...(p as any), autoApply: true, ...(grantForcedIds.has(p.id) ? { stackingRule: "exclusive" } : {}) });
            }
          }
        }
      }
    } catch (e) { console.error("[promo-order-context grants]", e); }
  }

  // ── Member-only VIP specials (Phase 1) ───────────────────────────────────
  // A promo attached to a VIP target is hidden from the public pool and
  // applies ONLY for members — signed in OR typing a matching email. Force
  // autoApply; the engine still gates eligibility, and onceLifetimePerClient
  // (below) limits repeat use.
  if (memberOnlyPromos.length && identified) {
    try {
      const mine = await qualifyingMemberOnlyPromos(
        restaurant.id,
        { customerId, email, phone },
        memberOnlyPromos as any[],
      );
      for (const p of mine) {
        if (!suppressed.has(p.id) && promoChannelOk(p, channel)) activePromos.push({ ...(p as any), autoApply: true });
      }
    } catch (e) { console.error("[promo-order-context memberOnly]", e); }
  }

  // ── Once-per-lifetime redemptions ────────────────────────────────────────
  // Same per-promo source of truth for both routes: the fulfillment-tied
  // ledger (email/phone) + this customer's own order-history scan (covers
  // pre-ledger redemptions). Runs AFTER the add-backs so granted / member-only
  // promos are lifetime-gated too.
  const hasUsedLifetime: Record<string, boolean> = {};
  {
    const lifetimeIds = activePromos.filter((p: any) => p.onceLifetimePerClient).map((p: any) => p.id);
    if (lifetimeIds.length > 0 && identified) {
      const used = await usedLifetimePromoIds({
        restaurantId: restaurant.id,
        promotionIds: lifetimeIds,
        customerId,
        email,
        phone,
      });
      for (const id of used) hasUsedLifetime[id] = true;
    }
  }

  return {
    activePromos,
    isNewCustomer,
    isMember,
    hasUsedLifetime,
    customerId,
    email,
    phone,
    sessionCustomerId,
    sessionEmail,
    sessionPhone,
    identified,
    grantForcedIds,
    newCustomerOfferUnavailable,
  };
}
