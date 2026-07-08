import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { resolvePromotions, totalPromoDiscount, discountableSubtotal, type ApplyContext } from "@/lib/promo-engine";
import { parseLocalDateTimeInTz } from "@/lib/restaurant-hours";
import { resolveAssignedPromoByCode } from "@/lib/coupon-ledger";
import { buildPromoOrderContext } from "@/lib/promo-order-context";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    restaurantSlug, orderType, subtotal, items, couponCode, isNewCustomer, paymentMethod,
    // Checkout identity (optional) — once the customer types their email / phone
    // we re-derive new-vs-returning AUTHORITATIVELY (below) so the previewed
    // total matches the real charge. Empty until they reach the details step.
    email, phone,
    // Phase 2a restriction input from the client: the page already resolves
    // the customer's delivery zone via geocoding (for the in-zone fee display)
    // so the engine can evaluate the Delivery Area restriction. The member
    // flag is NOT taken from the client anymore — buildPromoOrderContext
    // derives it server-side from the session, same as the charge.
    deliveryZoneId,
    // Acquisition channel ("website" | "marketplace") — gates which promos
    // apply: a marketplace-channel customer only gets "marketplace"/"both"
    // promos; a website customer only "website"/"both". Luigi 2026-06-09.
    channel,
    // Chosen fulfillment time for a scheduled ("order for later") cart, so the
    // Happy-Hour window is evaluated against WHEN the order is for — matching
    // what the order-placement route does. ASAP carts omit it. Fabrizio
    // cmpxejjev: a 20:15 pickup must qualify for an 18:00–21:00 promo.
    scheduledFor,
    // Promo IDs the customer has manually removed from the cart (so they can
    // choose a different non-stackable deal). Excluded from evaluation here AND
    // re-checked on order placement. Luigi 2026-06-07.
    suppressedPromoIds,
    // Code-less personal gift chosen from the account page ("Use this offer" →
    // ?grant=<id>). Resolved server-side against the SIGNED-IN identity only.
    // Luigi 2026-07-01.
    grantId,
  } = body;

  if (!restaurantSlug || subtotal === undefined) {
    return NextResponse.json({ error: "restaurantSlug and subtotal required" }, { status: 400 });
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { slug: restaurantSlug } });
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  const reqChannel = channel === "marketplace" ? "marketplace" : "website";
  const previewEmail = typeof email === "string" ? email.trim().toLowerCase() || null : null;
  const previewPhone = typeof phone === "string" ? phone.trim() || null : null;

  // ── Shared promo pool + customer identity (Blocker #7) ────────────────────
  // THE same context builder the order route uses — promo pool (incl. parent
  // brand-scope promos), canonical member signal, new-vs-returning, granted /
  // member-only add-backs, once-per-lifetime redemptions — so the previewed
  // discount equals the charged discount to the cent. The client's isMember
  // flag is ignored (the builder reads the session itself); its isNewCustomer
  // flag is only the pre-identity optimistic fallback (the banner's promise) —
  // the moment an email / phone is typed or a session exists, the builder
  // re-derives authoritatively.
  const promoCtx = await buildPromoOrderContext({
    restaurant,
    channel: reqChannel,
    email: previewEmail,
    phone: previewPhone,
    suppressedPromoIds,
    grantId: typeof grantId === "string" ? grantId : null,
    optimisticIsNewCustomer: isNewCustomer ?? false,
  });
  const activePromos = promoCtx.activePromos;
  const newCustomerOfferUnavailable = promoCtx.newCustomerOfferUnavailable;

  // Re-derive each line's categoryId server-side from its menuItemId, so
  // CATEGORY-targeted promos (BOGO / % off / combos by category) match in the
  // cart preview even when the client doesn't send categoryId. Mirrors the
  // order-placement route — which already does this — so the preview discount
  // agrees with the final charge. Root cause of "promos don't apply when
  // conditions are met" (Fabrizio cmpxejjev / cmpx8o23o). Luigi 2026-06-07.
  const rawItems: any[] = Array.isArray(items) ? items : [];
  const lineItemIds = [...new Set(rawItems.map((i) => i?.menuItemId).filter((x): x is string => typeof x === "string" && !!x))];
  let categoryByItemId = new Map<string, string | null>();
  let nameByItemId = new Map<string, string>();
  // Gift-card guards — two INDEPENDENT flags, resolved item||category exactly
  // like the charge route, so preview == charge (Luigi 2026-07-01/02):
  //   promoExcluded        → the line never receives a promo/coupon discount
  //   rewardRedeemExcluded → the line can't be PAID FOR with Reward Dollars
  const promoExcludedIds = new Set<string>();
  const redeemExcludedIds = new Set<string>();
  // menuItemId → per-unit refundable deposit (untaxed, never reward-redeemable).
  const depositById = new Map<string, number>();
  if (lineItemIds.length) {
    const rows = await prisma.menuItem.findMany({
      where: { id: { in: lineItemIds }, restaurantId: restaurant.id },
      select: {
        id: true, categoryId: true, name: true, promoExcluded: true, rewardRedeemExcluded: true,
        isRefundableDeposit: true, depositAmount: true,
        category: { select: { promoExcluded: true, rewardRedeemExcluded: true } },
      },
    });
    categoryByItemId = new Map(rows.map((r) => [r.id, r.categoryId]));
    nameByItemId = new Map(rows.map((r) => [r.id, r.name]));
    for (const r of rows) {
      if (r.promoExcluded || r.category?.promoExcluded) promoExcludedIds.add(r.id);
      if (r.rewardRedeemExcluded || r.category?.rewardRedeemExcluded) redeemExcludedIds.add(r.id);
      // Per-unit refundable deposit — excluded from the reward-redeemable base
      // (mirrors the charge path; a deposit is never paid with store credit).
      if (r.isRefundableDeposit && r.depositAmount != null && r.depositAmount > 0) {
        depositById.set(r.id, Math.max(0, Math.round(r.depositAmount * 100) / 100));
      }
    }
  }
  const ctxItems = rawItems.map((i) => ({
    ...i,
    categoryId: i?.categoryId ?? (i?.menuItemId ? categoryByItemId.get(i.menuItemId) ?? undefined : undefined),
    promoExcluded: typeof i?.menuItemId === "string" && promoExcludedIds.has(i.menuItemId),
  }));

  const promoEvalNow: Date | undefined = (() => {
    if (!scheduledFor) return undefined;
    const tz = restaurant.timezone ?? undefined;
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(String(scheduledFor));
    const d = m ? parseLocalDateTimeInTz(m[1], parseInt(m[2], 10), parseInt(m[3], 10), tz) : new Date(scheduledFor);
    return Number.isFinite(d.getTime()) ? d : undefined;
  })();

  // Customer-ASSIGNED code: if the entered identity doesn't match a grant for
  // this code, drop the code so the preview doesn't show a discount the charge
  // would refuse (preview == charge), and flag it so the cart shows a clear
  // "registered to a different email" note. Only checked once we HAVE an
  // identity (email/phone entered) — before that we stay optimistic, and the
  // order route is the authoritative gate. Luigi 2026-06-26.
  let effectiveCouponCode = couponCode;
  let promoCodeEmailMismatch = false;
  if (couponCode && (previewEmail || previewPhone)) {
    const assigned = await resolveAssignedPromoByCode({
      restaurantId: restaurant.id,
      code: String(couponCode),
      email: previewEmail,
      phone: previewPhone,
    });
    if (assigned.kind === "mismatch") {
      effectiveCouponCode = undefined;
      promoCodeEmailMismatch = true;
    }
  }

  const ctx: ApplyContext = {
    orderType: orderType ?? "pickup",
    now: promoEvalNow,
    isNewCustomer: promoCtx.isNewCustomer,
    isMember: promoCtx.isMember,
    subtotal: parseFloat(subtotal),
    items: ctxItems,
    couponCode: effectiveCouponCode,
    paymentMethod,
    hasUsedLifetime: promoCtx.hasUsedLifetime,
    deliveryZoneId: typeof deliveryZoneId === "string" && deliveryZoneId ? deliveryZoneId : undefined,
    // So a free_delivery EXCLUSIVE competes at its real fee value, not $0
    // (audit B10). Base fee is a fine estimate for the preview tie-break.
    deliveryFee: (orderType ?? "pickup") === "delivery" ? Math.max(0, restaurant.deliveryFee ?? 0) : 0,
    // Restaurant's IANA timezone — drives Happy Hour / day-of-week
    // evaluation in the owner's local time, not the Vercel UTC clock.
    // Without this the Italian "15:00–18:00" window was being matched
    // against UTC and silently failing for any customer whose local
    // hour differed from UTC (Luigi 2026-05-31, Italian beta tester).
    restaurantTimezone: restaurant.timezone,
  };

  const { results, blockedPromos } = resolvePromotions(activePromos as any, ctx);
  // Cap the summed discount at the DISCOUNTABLE subtotal (excludes gift-card
  // lines) so stacked promos can't bleed into a promo-excluded line either.
  const totalDiscount = totalPromoDiscount(results, discountableSubtotal(ctx));
  const hasFreeDelivery = results.some(r => r.type === "free_delivery");

  // Enrich each result's per-item breakdown with the item NAME (the engine only
  // knows ids) so the cart can list "BOGO · Margherita −$12.24" for a deal that
  // applied more than once. Luigi 2026-06-07.
  const applied = results.map((r) =>
    r.breakdown && r.breakdown.length
      ? { ...r, breakdown: r.breakdown.map((b) => ({ ...b, name: nameByItemId.get(b.menuItemId) ?? "" })) }
      : r,
  );

  // ── Reward Dollars (store credit) — surface a SIGNED-IN customer's spendable
  //    balance + the restaurant's redeem settings so the cart can offer the
  //    "use my {label}" control. Preview only — nothing is decremented here; the
  //    order route claims atomically. Strict: signed-in id only. Luigi 2026-06-27.
  let reward: {
    balance: number; redeemEnabled: boolean; minRedeemBalance: number;
    maxRedeemPercent: number; labelSingular: string | null; labelPlural: string | null;
    /** Sum of rewardRedeemExcluded line subtotals (gift cards) — the client
     *  subtracts this from the redeemable base so credit can't buy these
     *  lines; the order route enforces the same cap at charge. Independent
     *  of the promo-discount exclusion. Luigi 2026-07-02. */
    redeemExcludedTotal: number;
  } | null = null;
  try {
    const r = restaurant as any;
    // Opting into the program means customers can pay with their balance — gate
    // on rewardsEnabled alone (rewardRedeemEnabled is auto-coupled to it, but we
    // don't depend on a possibly-stale value). Luigi 2026-06-27.
    // STRICT: the server-verified signed-in customer only — never the typed
    // email's Customer row — so nobody surfaces someone else's balance.
    if (r.rewardsEnabled && promoCtx.sessionCustomerId) {
      const { getBalance } = await import("@/lib/reward-ledger");
      const balance = await getBalance({ restaurantId: restaurant.id, customerId: promoCtx.sessionCustomerId });
      if (balance > 0) {
        reward = {
          balance,
          redeemEnabled: true,
          minRedeemBalance: r.rewardMinRedeemBalance ?? 0,
          maxRedeemPercent: r.rewardMaxRedeemPercent ?? 100,
          labelSingular: r.rewardLabelSingular ?? null,
          labelPlural: r.rewardLabelPlural ?? null,
          // Keyed on rewardRedeemExcluded — its OWN flag, independent of the
          // promo-discount exclusion (Luigi 2026-07-02).
          redeemExcludedTotal: Math.round(
            rawItems.reduce(
              (s: number, i: any) => {
                if (typeof i?.menuItemId !== "string") return s;
                // Redeem-excluded item bases (gift cards) PLUS every refundable
                // deposit portion (base is in subtotal; the deposit rides on top,
                // untaxed and never store-credit-payable) — mirrors the charge path.
                const base = redeemExcludedIds.has(i.menuItemId) ? (Number(i.subtotal) || 0) : 0;
                const dep = (depositById.get(i.menuItemId) || 0) * (Number(i.quantity) || 1);
                return s + base + dep;
              },
              0,
            ) * 100,
          ) / 100,
        };
      }
    }
  } catch (e) { console.error("[apply-promos reward]", e); }

  // Surface promos that qualified but were blocked by the winning exclusive, so
  // the cart can explain "can't combine" and offer "remove this to use that
  // instead". Luigi 2026-06-07.
  return NextResponse.json({ applied, totalDiscount, hasFreeDelivery, blockedPromos, newCustomerOfferUnavailable, promoCodeEmailMismatch, reward });
}
