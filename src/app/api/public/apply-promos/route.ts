import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { resolvePromotions, totalPromoDiscount, type ApplyContext } from "@/lib/promo-engine";
import { parseLocalDateTimeInTz } from "@/lib/restaurant-hours";

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
  });
  // Drop promos the customer chose to remove from the cart, so a different
  // (otherwise-blocked) deal can take over.
  const suppressed = new Set(
    Array.isArray(suppressedPromoIds) ? suppressedPromoIds.map((x: unknown) => String(x)) : [],
  );
  const reqChannel = channel === "marketplace" ? "marketplace" : "website";
  const activePromos = activePromosAll.filter(
    (p) => !suppressed.has(p.id) && ((p as any).channel === "both" || (p as any).channel === reqChannel),
  );

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

  const ctx: ApplyContext = {
    orderType: orderType ?? "pickup",
    now: promoEvalNow,
    isNewCustomer: effectiveIsNew,
    isMember: isMember ?? false,
    subtotal: parseFloat(subtotal),
    items: ctxItems,
    couponCode,
    paymentMethod,
    deliveryZoneId: typeof deliveryZoneId === "string" && deliveryZoneId ? deliveryZoneId : undefined,
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
  return NextResponse.json({ applied, totalDiscount, hasFreeDelivery, blockedPromos, newCustomerOfferUnavailable });
}
