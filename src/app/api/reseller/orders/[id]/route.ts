import { NextRequest, NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView } from "@/lib/session";
import { formatCurrency } from "@/lib/utils";
import { paymentMethodLabelKey } from "@/lib/payment-label";
import { scopeRestaurantFilter, type OrdersScope } from "@/lib/reseller/scope";
import { deriveStatus, orderType } from "@/lib/reseller/order-feed";

export const runtime = "nodejs";

/**
 * GET /api/reseller/orders/[id]?kind=order|reservation
 *
 * Lazy detail for an expanded row in the Orders List — the "Order detail" /
 * "Order items" tabs. Kept off the list query so the table stays lean.
 *
 * OWNERSHIP: the lookup itself is constrained by the caller's scope
 * (`restaurant.resellerProfileId` for a partner), so a row that isn't theirs
 * simply doesn't match. We return **404, not 403**, matching the portal's
 * existing "never leak existence across resellers" convention.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let scope: OrdersScope;
  if (user.role === "superadmin" || user.role === "platform_support") {
    scope = { kind: "platform" };
  } else if (isResellerView(user) && user.resellerProfileId) {
    scope = { kind: "reseller", resellerProfileId: user.resellerProfileId };
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const kind = req.nextUrl.searchParams.get("kind") === "reservation" ? "reservation" : "order";
  const restaurantFilter = scopeRestaurantFilter(scope);
  const t = await getTranslations("reseller.ordersList");
  const tRoot = await getTranslations();

  if (kind === "reservation") {
    const r = await prisma.reservation.findFirst({
      where: { id, restaurant: restaurantFilter },
      select: {
        status: true, cancelledBy: true, rejectionReason: true, orderId: true, createdAt: true,
        partySize: true, adultsCount: true, childrenCount: true, date: true, time: true,
        confirmationCode: true, depositAmount: true, preOrderTotal: true, notes: true,
        restaurant: { select: { currency: true, timezone: true } },
      },
    });
    if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const cur = r.restaurant.currency;
    const tz = r.restaurant.timezone ?? undefined;
    const money = (n: number) => formatCurrency(n, cur);
    const totals: { label: string; amount: string; bold?: boolean }[] = [];
    if ((r.depositAmount ?? 0) > 0) totals.push({ label: t("lblDeposit"), amount: money(r.depositAmount) });
    if ((r.preOrderTotal ?? 0) > 0) totals.push({ label: t("lblPreOrder"), amount: money(r.preOrderTotal) });

    const meta = [
      { label: t("lblGuests"), value: String(r.partySize) },
      { label: t("lblCode"), value: r.confirmationCode },
      ...(r.notes ? [{ label: tRoot("common.notes"), value: r.notes }] : []),
    ];

    return NextResponse.json({
      kind: "reservation",
      status: deriveStatus(r.status, r.cancelledBy, r.rejectionReason, "reservation"),
      placedAt: r.createdAt.toLocaleString("en-US", tz ? { timeZone: tz } : {}),
      confirmedAt: null,
      fulfilledAt: `${r.date} ${r.time}`,
      typeLabel: t(r.orderId ? "type_reservation_preorder" : "type_table_reservation"),
      paymentLabel: null,
      totalLabel: null,
      lines: [],
      totals,
      meta,
    });
  }

  const o = await prisma.order.findFirst({
    where: { id, restaurant: restaurantFilter },
    select: {
      status: true, cancelledBy: true, rejectionReason: true, type: true, paymentMethod: true,
      createdAt: true, acceptedAt: true, completedAt: true,
      subtotal: true, taxAmount: true, deliveryFee: true, tip: true, total: true,
      couponDiscount: true, promoDiscount: true, creditApplied: true, notes: true,
      restaurant: { select: { currency: true, timezone: true } },
      items: {
        select: {
          name: true, variantName: true, quantity: true, subtotal: true, notes: true,
          modifiers: { select: { name: true, priceAdjustment: true } },
        },
      },
    },
  });
  if (!o) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cur = o.restaurant.currency;
  const tz = o.restaurant.timezone ?? undefined;
  const money = (n: number) => formatCurrency(n, cur);
  const when = (d: Date | null) => (d ? d.toLocaleString("en-US", tz ? { timeZone: tz } : {}) : null);

  const lines = o.items.map((it) => ({
    qty: it.quantity,
    name: it.name,
    modifiers: [
      ...(it.variantName ? [it.variantName] : []),
      ...it.modifiers.map((m) =>
        m.priceAdjustment ? `${m.name} (+${money(m.priceAdjustment)})` : m.name,
      ),
      ...(it.notes ? [it.notes] : []),
    ],
    amount: money(it.subtotal),
  }));

  const discount = (o.couponDiscount ?? 0) + (o.promoDiscount ?? 0);
  // Money labels reuse the already-translated ordering.* strings (×38).
  const totals: { label: string; amount: string; bold?: boolean }[] = [
    { label: tRoot("ordering.subtotal"), amount: money(o.subtotal) },
  ];
  if (discount > 0) totals.push({ label: tRoot("ordering.discount"), amount: `-${money(discount)}` });
  if ((o.deliveryFee ?? 0) > 0) totals.push({ label: tRoot("ordering.deliveryFee"), amount: money(o.deliveryFee) });
  if ((o.taxAmount ?? 0) > 0) totals.push({ label: tRoot("ordering.tax"), amount: money(o.taxAmount) });
  if ((o.tip ?? 0) > 0) totals.push({ label: tRoot("ordering.tip"), amount: money(o.tip) });
  if ((o.creditApplied ?? 0) > 0) totals.push({ label: t("lblCredit"), amount: `-${money(o.creditApplied)}` });
  totals.push({ label: tRoot("admin.reportOrdersList.colTotal"), amount: money(o.total), bold: true });

  const payKey = paymentMethodLabelKey(o.paymentMethod, o.type);

  return NextResponse.json({
    kind: "order",
    status: deriveStatus(o.status, o.cancelledBy, o.rejectionReason, "order"),
    placedAt: when(o.createdAt),
    confirmedAt: when(o.acceptedAt),
    fulfilledAt: when(o.completedAt),
    typeLabel: t(`type_${orderType(o.type)}`),
    paymentLabel: payKey ? tRoot(payKey) : (o.paymentMethod ?? "").replace(/_/g, " ") || null,
    totalLabel: money(o.total),
    lines,
    totals,
    meta: o.notes ? [{ label: tRoot("common.notes"), value: o.notes }] : [],
  });
}
