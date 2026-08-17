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
 *                  Judged TWICE when it matters: over every order, and over
 *                  non-phone orders only — a promo that is not available by
 *                  phone (Promotion.phoneOrders=false) counts "first order"
 *                  among the orders on the channels it applies to.
 *
 *   PHONE ORDERS = a promo with Promotion.phoneOrders=false is never in play
 *                  on a Nabil AI phone order (orderSource "voice") — dropped
 *                  from the pool here AND refused by the engine's shared
 *                  isEligible(); one rule (`phoneOrdersOk`), two readers.
 */
import prisma from "@/lib/db";
import { getCurrentRestaurantCustomer } from "@/lib/restaurant-customer-session";
import { usedLifetimePromoIds, findActiveGrants, resolveGrantById } from "@/lib/coupon-ledger";
import { partitionMemberOnly, qualifyingMemberOnlyPromos } from "@/lib/vip-membership";
import { resolvePromoMenuRefsForServing } from "@/lib/menu";
import { phoneDigitsKey } from "@/lib/phone";
import { CUSTOMER_ROW_ORDER } from "@/lib/customer-row";
import { KICKSTARTER_FIRST_BUY_REF } from "@/lib/assigned-promos";
import { phoneOrdersOk, type PromoOrderSource } from "@/lib/promo-engine";
import { PHONE_ORDER_CHANNEL } from "@/lib/phone-order-channel";

export type PromoChannel = "website" | "marketplace";

/** HOW the order is being placed ("web" | "voice") — defined next to the engine
 *  gate that reads it (src/lib/promo-engine.ts) and re-exported here for the
 *  routes. See `phoneOrdersOk` there for the one rule. */
export type { PromoOrderSource };

/** The one gate for "may this promo be in the pool for HOW this order is
 *  placed": a promo that is not available by phone (Promotion.phoneOrders =
 *  false — the owner's per-promo "Available by phone (Nabil AI)" switch) never
 *  reaches a phone order. Same helper the engine's isEligible() applies, so
 *  the pool and the engine cannot disagree; the pool filter additionally keeps
 *  such promos out of everything derived from the pool (the "new customers
 *  only" note, lifetime scans). Replaced the hardcoded Kickstarter/Autopilot
 *  campaignRef rule of 2026-08-16 (Luigi A64(a), 2026-08-17). */
export function promoSourceOk(promo: { phoneOrders?: boolean | null }, orderSource: PromoOrderSource): boolean {
  return phoneOrdersOk(promo, orderSource);
}

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
  /** First order ever at this restaurant (this channel), counting EVERY
   *  order — phone orders included. What the engine uses for a promo that is
   *  available by phone. */
  isNewCustomer: boolean;
  /** First order judged on NON-PHONE orders only (Order.channel ≠ "voice").
   *  What the engine uses for a promo that is NOT available by phone
   *  (phoneOrders=false): such a promo counts "prior orders" among the
   *  channels it applies to. Equals isNewCustomer whenever the split can't
   *  matter (no phone-excluded promo at this store, a voice order, or an
   *  unidentified / genuinely new customer). MUST be threaded into the
   *  engine ctx by both routes — preview == charge. */
  isNewCustomerExcludingPhoneOrders: boolean;
  /** HOW this order is placed, normalised — MUST be threaded into the engine
   *  ctx (`ApplyContext.orderSource`) by both routes so the shared
   *  isEligible() gate sees it (the pool filter above is the belt, the engine
   *  gate the braces). */
  orderSource: PromoOrderSource;
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
  /** The Customer row a Gift Wallet Pass cookie authorizes spending FROM —
   *  null unless there is no session AND a live pass cookie's stored email
   *  matches the typed checkout email. NEVER used for isMember,
   *  resolveGrantById/?grant=, or anything beyond wallet spend — see
   *  src/lib/gift-wallet-pass.ts's module doc. */
  giftPassCustomerId: string | null;
  /** The customer id whose Reward-Dollars wallet this order may spend from —
   *  the session's own row if signed in (a typed address is NEVER a wallet
   *  key), else the gift-pass holder's guest-twin row, else null. THE thing
   *  apply-promos and orders/route.ts must both gate reward-spend on. */
  walletCustomerId: string | null;
  /** Who walletCustomerId came from — drives the "gift" label on the credit
   *  row and the gift-pass-only guards (tip excluded from the redeemable
   *  base) in orders/route.ts. */
  walletSource: "session" | "gift_pass" | null;
  /** The contact address typed at checkout when it differs from the signed-in
   *  account's own — otherwise null.
   *
   *  INFORMATIONAL ONLY. It gates nothing. A signed-in customer now owns their
   *  orders (the Order's Customer row is the session row, see /api/orders), so
   *  the payer, the order and the earn are the same person by construction and
   *  the wallet is always safe to spend while signed in. What remains is a
   *  transparency duty: the customer should be told that this order will be
   *  recorded to their account while the confirmation goes somewhere else.
   *  Luigi 2026-07-31, from his own checkout screenshots. */
  contactEmailDiffersFromAccount: string | null;
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
  /** HOW the order is placed. "voice" (Nabil phone orders) drops every promo
   *  that is not available by phone (Promotion.phoneOrders=false) from the
   *  pool — at the public pool, the granted add-backs AND the member-only
   *  add-backs — so a phone caller is never quoted, charged or told about a
   *  discount the owner kept online-only; the engine's isEligible() refuses
   *  the same promos again from ctx.orderSource. Default "web" = every
   *  existing caller's behavior, byte for byte. */
  orderSource?: PromoOrderSource;
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
  const orderSource: PromoOrderSource = args.orderSource === "voice" ? "voice" : "web";

  const activePromosAll = await getActivePromotionsForOrder(restaurant);

  // Drop promos the customer chose to remove from the cart, so a different
  // (otherwise-blocked) deal can take over.
  const suppressed = new Set(
    Array.isArray(args.suppressedPromoIds) ? args.suppressedPromoIds.map((x: unknown) => String(x)) : [],
  );
  // Member-only (VIP) promos are linked to ≥1 target — keep them OUT of the
  // public pool; they're added back below only for identified members.
  const { general: publicPromos, memberOnly: memberOnlyPromos } = partitionMemberOnly(activePromosAll as any[]);
  const activePromos: any[] = publicPromos.filter(
    (p: any) => !suppressed.has(p.id) && promoChannelOk(p, channel) && promoSourceOk(p, orderSource),
  );

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
  // ── Then the PHONE, as an indexed key ─────────────────────────────────────
  //
  // Without this, "who is this?" was answered by email alone, and the
  // new-vs-returning count below fell back to matching `Order.customerPhone` as
  // an exact string — against a column holding whatever anyone typed. Prod has
  // "(416) 833-8405", "4168338405" and "(647) 669-0808" side by side, and
  // Twilio delivers E.164, so the same person routinely failed to match their
  // own order history. On 2026-08-13 that priced Roya Safi's quote as a
  // first-time customer (+1 prefix, matched nothing) and her charge as the
  // three-order regular she is (bare digits, matched everything): $23.37
  // agreed, $25.97 billed.
  //
  // Resolving to a customerId here fixes it for EVERY channel and is cheaper
  // than the string match it replaces — a point lookup on
  // @@index([restaurantId, phoneDigits]) instead of a predicate on an
  // unindexed text column of the Order table.
  if (!customerId && phone) {
    const digits = phoneDigitsKey(phone);
    if (digits) {
      const byPhone = await prisma.customer.findMany({
        where: { restaurantId: restaurant.id, phoneDigits: digits },
        orderBy: CUSTOMER_ROW_ORDER as any,
        take: 2,
        select: { id: true },
      });
      // Exactly one, or none. A number shared by several customers (a household
      // line, a shared work phone) identifies nobody, and picking one of them
      // would hand this order somebody else's promo history — including their
      // once-per-lifetime burn. Ambiguity falls back to the previous behaviour
      // rather than guessing.
      customerId = byPhone.length === 1 ? byPhone[0].id : null;
    }
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
  // The same verdict judged on NON-PHONE orders only — what a promo that is
  // not available by phone (phoneOrders=false) uses for "first order", so a
  // customer whose only earlier order was a Nabil phone order is still a
  // first-timer for an online-only first-buy (Luigi A64(a), 2026-08-17).
  let isNewCustomerExcludingPhoneOrders = isNewCustomer;
  if (identified) {
    const priorWhere = {
      restaurantId: restaurant.id,
      status: { notIn: ["cancelled", "rejected"] }, // "missed" == auto-rejected
      viaMarketplace: channel === "marketplace",
      OR: [
        ...(customerId ? [{ customerId }] : []),
        ...(email ? [{ customerEmail: email }] : []),
        ...(phone ? [{ customerPhone: phone }] : []),
      ],
    };
    const priorFulfilled = await prisma.order.count({ where: priorWhere });
    isNewCustomer = priorFulfilled === 0;
    isNewCustomerExcludingPhoneOrders = isNewCustomer;
    // Second count ONLY when it can change a verdict: the customer is
    // returning, this is not itself a phone order (phone-excluded promos are
    // never in play there), and some promo at this store is phone-excluded
    // (checked on the UNFILTERED pool so a member-only / granted add-back
    // counts too). Same per-restaurant seek as the count above with one more
    // predicate — Prisma's `not` excludes NULLs, hence the explicit OR.
    if (
      priorFulfilled > 0 &&
      orderSource !== "voice" &&
      (activePromosAll as any[]).some((p) => p.phoneOrders === false)
    ) {
      const priorNonPhone = await prisma.order.count({
        where: {
          ...priorWhere,
          AND: [{ OR: [{ channel: null }, { channel: { not: PHONE_ORDER_CHANNEL } }] }],
        },
      });
      isNewCustomerExcludingPhoneOrders = priorNonPhone === 0;
    }
  }
  // "New customers only" note for the cart: the Kickstarter first-buy is in
  // play for this order (pool-filtered above) and the customer is returning AS
  // THAT PROMO COUNTS IT — a phone-excluded first-buy ignores phone orders.
  const newCustomerOfferUnavailable =
    identified &&
    activePromos.some(
      (p: any) =>
        p.campaignRef === KICKSTARTER_FIRST_BUY_REF &&
        p.isActive &&
        !(p.phoneOrders === false ? isNewCustomerExcludingPhoneOrders : isNewCustomer),
    );

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
      // A phone order never adds a phone-excluded grant back (a WIN3 email
      // recipient calling in still gets no WIN3 while WIN3 is phoneOrders=false):
      // the promo rows the grants point at are re-checked with promoSourceOk
      // below, at both add-back sites, so the ids collected here can't smuggle
      // one past the pool gate.
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
          // granted BRAND promo resolves in preview exactly as at charge. Full
          // rows (no select) — phoneOrders must come along for the gate below
          // and for the engine.
          const extra = await prisma.promotion.findMany({
            where: { ...promotionPoolWhere(restaurant), id: { in: [...autoIds] } },
          });
          for (const p of extra) {
            // promoSourceOk here is load-bearing: on a voice order a
            // phone-excluded promo was dropped from the pool above, so the
            // granted id is still in autoIds and would re-enter through this
            // fetch without it.
            if (!suppressed.has(p.id) && promoSourceOk(p, orderSource)) {
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
        if (!suppressed.has(p.id) && promoChannelOk(p, channel) && promoSourceOk(p, orderSource)) activePromos.push({ ...(p as any), autoApply: true });
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

  // ── Serve-time lineage resolution (Fabrizio cmr80t9rk) ───────────────────
  // A promo built against an INACTIVE menu version references item/category
  // ids the displayed menu doesn't have (menu duplicated → copy set live →
  // promo created later against the original). Translate stale refs through
  // MenuItem.lineageId / category name to the live menu — additive + fail-open,
  // and here in the SHARED context so preview and charge stay identical.
  const activePromosResolved = await resolvePromoMenuRefsForServing(restaurant.id, activePromos);

  // ── Contact address vs account address (transparency only) ───────────────
  // Compared on the NORMALIZED values both sides already carry: typedEmail is
  // lowercased+trimmed above, sessionEmail likewise when the session was read.
  const contactEmailDiffersFromAccount =
    !!sessionCustomerId && !!typedEmail && typedEmail !== sessionEmail ? typedEmail : null;

  // ── Wallet spender (Reward-Dollars spend authority) ──────────────────────
  // The server-verified signed-in customer, full stop — this codebase has no
  // "sessionWalletSpendable" conjunct (a typed email is never a wallet key;
  // apply-promos/route.ts and orders/route.ts both say so in their own
  // comments). A Gift Wallet Pass is consulted ONLY when there is no session
  // at all, so a signed-in customer's own wallet always wins over a stray
  // gift-pass cookie sitting in the same browser, and ~99.9% of hot-path
  // requests (every signed-in or fully-guest order) skip the lookup entirely.
  const sessionSpender = sessionCustomerId;
  let giftPassCustomerId: string | null = null;
  if (!sessionCustomerId) {
    try {
      const { resolveGiftPassSpender } = await import("@/lib/gift-wallet-pass");
      giftPassCustomerId = await resolveGiftPassSpender({
        expectedRestaurantId: restaurant.id,
        // The gift email-match guard lives HERE — inside the one context
        // both apply-promos (preview) and orders (charge) read — so the two
        // routes cannot structurally disagree about whether the pass applies.
        typedEmail,
      });
    } catch (e) {
      console.error("[promo-order-context giftPass]", e);
      giftPassCustomerId = null;
    }
  }
  const walletCustomerId = sessionSpender ?? giftPassCustomerId;
  const walletSource: "session" | "gift_pass" | null = sessionSpender ? "session" : giftPassCustomerId ? "gift_pass" : null;

  return {
    activePromos: activePromosResolved,
    isNewCustomer,
    isNewCustomerExcludingPhoneOrders,
    orderSource,
    isMember,
    hasUsedLifetime,
    customerId,
    email,
    phone,
    sessionCustomerId,
    sessionEmail,
    sessionPhone,
    giftPassCustomerId,
    walletCustomerId,
    walletSource,
    contactEmailDiffersFromAccount,
    identified,
    grantForcedIds,
    newCustomerOfferUnavailable,
  };
}
