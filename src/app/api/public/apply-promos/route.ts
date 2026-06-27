import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { resolvePromotions, totalPromoDiscount, type ApplyContext } from "@/lib/promo-engine";
import { parseLocalDateTimeInTz } from "@/lib/restaurant-hours";
import { usedLifetimePromoIds, resolveAssignedPromoByCode, findActiveGrants } from "@/lib/coupon-ledger";
import { getCurrentRestaurantCustomer } from "@/lib/restaurant-customer-session";
import { partitionMemberOnly, qualifyingMemberOnlyPromos } from "@/lib/vip-membership";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    restaurantSlug, orderType, subtotal, items, couponCode, isNewCustomer, paymentMethod,
    // Checkout identity (optional) — once the customer types their email / phone
    // we re-derive new-vs-returning AUTHORITATIVELY (below) so the previewed
    // total matches the real charge. Empty until they reach the details step.
    email, phone,
    // Phase 2a restriction inputs from the client. The page already
    // resolves the customer's delivery zone via geocoding (for the in-
    // zone fee display) and the member flag from the per-restaurant
    // customer session — forwarding both lets the engine evaluate the
    // Delivery Area + Client Type ("member") restrictions correctly.
    deliveryZoneId, isMember,
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
  } = body;

  if (!restaurantSlug || subtotal === undefined) {
    return NextResponse.json({ error: "restaurantSlug and subtotal required" }, { status: 400 });
  }

  const restaurant = await prisma.restaurant.findUnique({ where: { slug: restaurantSlug } });
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  const activePromosAll = await prisma.promotion.findMany({
    where: { restaurantId: restaurant.id, isActive: true },
    include: { groupLinks: { select: { groupId: true } } },
  });
  // Drop promos the customer chose to remove from the cart, so a different
  // (otherwise-blocked) deal can take over.
  const suppressed = new Set(
    Array.isArray(suppressedPromoIds) ? suppressedPromoIds.map((x: unknown) => String(x)) : [],
  );
  const reqChannel = channel === "marketplace" ? "marketplace" : "website";
  const channelOk = (p: any) => p.channel === "both" || p.channel === reqChannel;
  // Member-only (VIP) promos are linked to ≥1 group — keep them OUT of the public
  // pool; they're added back below only for identified members. Luigi 2026-06-27.
  const { general: publicPromos, memberOnly: memberOnlyPromos } = partitionMemberOnly(activePromosAll as any[]);
  const activePromos = publicPromos.filter((p: any) => !suppressed.has(p.id) && channelOk(p));

  // ── First-buy eligibility for the cart preview (Luigi 2026-06-09) ─────────
  // The cart shows the first-buy / new-customer discount OPTIMISTICALLY for a
  // visitor we can't rule out as new (the client sends isNewCustomer using the
  // same logic that decides whether the hero banner shows). The moment they
  // enter an email / phone at checkout we re-derive it here AUTHORITATIVELY —
  // counting prior FULFILLED orders only (missed/rejected don't count, mirroring
  // order placement) — so the previewed total always matches what they'll be
  // charged. If they turn out returning, flag the dropped first-buy so the cart
  // can show a gentle "new customers only" note (only meaningful because the
  // banner was visible to them in the first place).
  const previewEmail = typeof email === "string" ? email.trim().toLowerCase() : null;
  const previewPhone = typeof phone === "string" ? phone.trim() : null;
  let effectiveIsNew = isNewCustomer ?? false;
  let newCustomerOfferUnavailable = false;
  if (previewEmail || previewPhone) {
    const priorFulfilled = await prisma.order.count({
      where: {
        restaurantId: restaurant.id,
        status: { notIn: ["cancelled", "rejected"] },
        // Per-channel new-customer (H2): judged within this channel, so the
        // preview matches the order route — a marketplace order is "new" for a
        // website regular. Luigi 2026-06-09.
        viaMarketplace: reqChannel === "marketplace",
        OR: [
          ...(previewEmail ? [{ customerEmail: previewEmail }] : []),
          ...(previewPhone ? [{ customerPhone: previewPhone }] : []),
        ],
      },
    });
    effectiveIsNew = priorFulfilled === 0;
    if (!effectiveIsNew && activePromos.some((p: any) => p.campaignRef === "kickstarter_first_buy" && p.isActive)) {
      newCustomerOfferUnavailable = true;
    }
  }

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
  if (lineItemIds.length) {
    const rows = await prisma.menuItem.findMany({
      where: { id: { in: lineItemIds }, restaurantId: restaurant.id },
      select: { id: true, categoryId: true, name: true },
    });
    categoryByItemId = new Map(rows.map((r) => [r.id, r.categoryId]));
    nameByItemId = new Map(rows.map((r) => [r.id, r.name]));
  }
  const ctxItems = rawItems.map((i) => ({
    ...i,
    categoryId: i?.categoryId ?? (i?.menuItemId ? categoryByItemId.get(i.menuItemId) ?? undefined : undefined),
  }));

  const promoEvalNow: Date | undefined = (() => {
    if (!scheduledFor) return undefined;
    const tz = restaurant.timezone ?? undefined;
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(String(scheduledFor));
    const d = m ? parseLocalDateTimeInTz(m[1], parseInt(m[2], 10), parseInt(m[3], 10), tz) : new Date(scheduledFor);
    return Number.isFinite(d.getTime()) ? d : undefined;
  })();

  // ── Once-per-lifetime enforcement in the preview (Luigi 2026-06-26) ──────
  // A promo flagged `onceLifetimePerClient` must STOP previewing as applied
  // once the customer has already redeemed it — otherwise the cart shows a
  // discount the order route then refuses, and the customer is charged MORE
  // than the previewed total (found on ORD-697157388: previewed $10.53,
  // charged $21.83). Mirror the order route exactly (orders/route.ts via
  // `usedPromoIds`) so preview == charge. Identity comes from the checkout
  // email/phone if present, else the logged-in restaurant-customer session
  // (so a signed-in customer like the one above gets the right preview even
  // before they re-type their details). Without an identity we can't know, so
  // we stay optimistic — the order route is the authoritative backstop.
  // Resolve the customer identity ONCE — checkout email/phone if present, else
  // the logged-in restaurant-customer session — for both the auto-apply-grant
  // inclusion and the lifetime check below. Luigi 2026-06-27.
  let idEmail = previewEmail;
  let idPhone = previewPhone;
  let idCustomerId: string | null = null;
  try {
    const me = await getCurrentRestaurantCustomer({ expectedRestaurantId: restaurant.id });
    if (me) {
      idCustomerId = me.id ?? null; // a signed-in member is a member regardless of typed email
      if (!idEmail && !idPhone) { idEmail = me.email?.trim().toLowerCase() ?? null; idPhone = me.phone?.trim() ?? null; }
    }
  } catch { /* not logged in — stay optimistic */ }

  // ── Auto-apply VIP-group / assigned grants (Program 3) ───────────────────
  // A member who is signed in (or typed a matching email) gets their granted
  // promo applied with NO code. The Promotion itself is autoApply:false (so it
  // never leaks to non-members via the general pool); the GRANT carries
  // autoApply:true. Surface only the grants for THIS identity, forcing
  // autoApply=true on an in-memory copy so the engine applies it (still
  // isEligible-gated). Code-only grants keep the existing code+email path.
  if (idEmail || idPhone) {
    try {
      const grants = await findActiveGrants({ restaurantId: restaurant.id, email: idEmail, phone: idPhone });
      const autoIds = new Set(grants.filter((g) => g.autoApply).map((g) => g.promotionId));
      if (autoIds.size > 0) {
        for (let i = 0; i < activePromos.length; i++) {
          if (autoIds.has(activePromos[i].id)) {
            activePromos[i] = { ...activePromos[i], autoApply: true } as any;
            autoIds.delete(activePromos[i].id);
          }
        }
        if (autoIds.size > 0) {
          const extra = await prisma.promotion.findMany({
            where: { id: { in: [...autoIds] }, restaurantId: restaurant.id, isActive: true },
          });
          for (const p of extra) if (!suppressed.has(p.id)) activePromos.push({ ...(p as any), autoApply: true });
        }
      }
    } catch (e) { console.error("[apply-promos findActiveGrants]", e); }
  }

  // ── Member-only VIP specials (Phase 1, 2026-06-27) ───────────────────────
  // A promo attached to a VIP group is hidden from the public pool and applies
  // ONLY for members — signed in (idCustomerId) OR typing a group email/phone at
  // checkout. Force autoApply so it applies with no code; the engine still gates
  // eligibility, and onceLifetimePerClient (checked below) limits repeat use.
  if (memberOnlyPromos.length && (idCustomerId || idEmail || idPhone)) {
    try {
      const mine = await qualifyingMemberOnlyPromos(
        restaurant.id,
        { customerId: idCustomerId, email: idEmail, phone: idPhone },
        memberOnlyPromos as any[],
      );
      for (const p of mine) {
        if (!suppressed.has(p.id) && channelOk(p)) activePromos.push({ ...(p as any), autoApply: true });
      }
    } catch (e) { console.error("[apply-promos memberOnly]", e); }
  }

  const hasUsedLifetime: Record<string, boolean> = {};
  {
    const lifetimeIds = activePromos.filter((p) => (p as any).onceLifetimePerClient).map((p) => p.id);
    if (lifetimeIds.length > 0 && (idEmail || idPhone)) {
      // Same per-promo source of truth the order route uses, so preview == charge.
      const used = await usedLifetimePromoIds({
        restaurantId: restaurant.id,
        promotionIds: lifetimeIds,
        email: idEmail,
        phone: idPhone,
      });
      for (const id of used) hasUsedLifetime[id] = true;
    }
  }

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
    isNewCustomer: effectiveIsNew,
    isMember: isMember ?? false,
    subtotal: parseFloat(subtotal),
    items: ctxItems,
    couponCode: effectiveCouponCode,
    paymentMethod,
    hasUsedLifetime,
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
  const totalDiscount = totalPromoDiscount(results, ctx.subtotal);
  const hasFreeDelivery = results.some(r => r.type === "free_delivery");

  // Enrich each result's per-item breakdown with the item NAME (the engine only
  // knows ids) so the cart can list "BOGO · Margherita −$12.24" for a deal that
  // applied more than once. Luigi 2026-06-07.
  const applied = results.map((r) =>
    r.breakdown && r.breakdown.length
      ? { ...r, breakdown: r.breakdown.map((b) => ({ ...b, name: nameByItemId.get(b.menuItemId) ?? "" })) }
      : r,
  );

  // Surface promos that qualified but were blocked by the winning exclusive, so
  // the cart can explain "can't combine" and offer "remove this to use that
  // instead". Luigi 2026-06-07.
  return NextResponse.json({ applied, totalDiscount, hasFreeDelivery, blockedPromos, newCustomerOfferUnavailable, promoCodeEmailMismatch });
}
