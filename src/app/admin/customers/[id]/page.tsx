/**
 * /admin/customers/[id]
 *
 * Restaurant-admin view of a single customer. Surfaces:
 *   - Profile (name, email, phone, signed-up-or-guest status)
 *   - Order history with totals
 *   - Coupons currently assigned to this customer
 *   - "Assign new coupon" form — creates a personal coupon redeemable
 *     ONLY by this customer (see POST /api/admin/customers/[id]/assign-coupon)
 *
 * Restaurant-scoped: enforces the [id] Customer belongs to the session's
 * restaurantId before rendering — a tampered URL pointing at someone
 * else's customer 404s.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Mail, Phone, KeyRound, ShoppingBag, Tag, Calendar, DollarSign } from "lucide-react";
import { getTranslations } from "next-intl/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { formatDate, formatCurrency as fmtCurrency } from "@/lib/utils";
import { getRestaurantCurrency } from "@/lib/restaurant-currency";
import { GiveVipSpecial } from "./GiveVipSpecial";
import { CustomerActionsCard } from "./CustomerActionsCard";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("admin.customerDetailPage");
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) notFound();
  const __currency = await getRestaurantCurrency(restaurantId);
  const formatCurrency = (n: number) => fmtCurrency(n, __currency);

  const { id } = await params;

  const customer = await prisma.customer.findUnique({
    where: { id },
    select: {
      id: true, restaurantId: true, name: true, email: true, phone: true,
      address: true, notes: true, totalOrders: true, totalSpent: true,
      createdAt: true, lastOrderAt: true, passwordHash: true,
      emailVerifiedAt: true, lastLoginAt: true, chainCustomerId: true,
    },
  });
  if (!customer || customer.restaurantId !== restaurantId) notFound();

  // Restaurant name — needed for the mailto template subject.
  const restaurantRow = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: { name: true },
  });

  const hasAccount = !!customer.passwordHash;
  const now = new Date();

  const [orders, grants] = await Promise.all([
    prisma.order.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true, orderNumber: true, total: true, status: true,
        createdAt: true, type: true,
      },
    }),
    // Promotions assigned to THIS customer (CustomerCoupon grants — the new
    // model that replaced standalone personal coupons). Matched by customerId
    // OR email so an email-keyed grant (created before they had an account)
    // still shows. Luigi 2026-06-26.
    prisma.customerCoupon.findMany({
      where: {
        restaurantId,
        status: { in: ["granted", "applied", "redeemed"] },
        OR: [
          { customerId: customer.id },
          ...(customer.email ? [{ email: { equals: customer.email.toLowerCase(), mode: "insensitive" as const } }] : []),
        ],
      },
      orderBy: { grantedAt: "desc" },
      select: {
        id: true, code: true, status: true,
        promotion: { select: { name: true, promotionType: true, ruleConfig: true, minimumOrder: true, isActive: true, endsAt: true } },
      },
    }),
  ]);

  return (
    <div className="max-w-4xl">
      <Link href="/admin/customers" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4">
        <ChevronLeft className="w-4 h-4" />
        {t("allCustomers")}
      </Link>

      {/* Profile header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
              {hasAccount ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                  <KeyRound className="w-3 h-3" />{t("badgeSignedUp")}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {t("badgeGuest")}
                </span>
              )}
              {customer.chainCustomerId && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  {t("badgeMultiLocation")}
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-col gap-1 text-sm text-gray-600">
              {customer.email && (
                <span className="inline-flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-400" />
                  <a href={`mailto:${customer.email}`} className="hover:text-emerald-700">{customer.email}</a>
                </span>
              )}
              {customer.phone && (
                <span className="inline-flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <a href={`tel:${customer.phone.replace(/[^0-9+]/g, "")}`} className="hover:text-emerald-700">{customer.phone}</a>
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 text-right">
            <div>
              <div className="text-2xl font-bold text-gray-900">{customer.totalOrders}</div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500">{t("statOrders")}</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{formatCurrency(customer.totalSpent)}</div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500">{t("statSpent")}</div>
            </div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-gray-600">
          <div>
            <Calendar className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
            {t.rich("firstSeen", { date: formatDate(customer.createdAt), strong: (chunks) => <strong>{chunks}</strong> })}
          </div>
          {customer.lastOrderAt && (
            <div>
              <ShoppingBag className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
              {t.rich("lastOrder", { date: formatDate(customer.lastOrderAt), strong: (chunks) => <strong>{chunks}</strong> })}
            </div>
          )}
          {hasAccount && customer.lastLoginAt && (
            <div>
              <KeyRound className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
              {t.rich("lastLogin", { date: formatDate(customer.lastLoginAt), strong: (chunks) => <strong>{chunks}</strong> })}
            </div>
          )}
        </div>
      </div>

      {/* Notes & quick actions (email button + private notes) */}
      <CustomerActionsCard
        customerId={customer.id}
        customerName={customer.name}
        customerEmail={customer.email}
        restaurantName={restaurantRow?.name ?? "us"}
        initialNotes={customer.notes ?? ""}
      />

      {/* Coupons this customer already has (code-based grants — historical +
          migrated). The old "assign a personal coupon" CREATE form was removed
          (Luigi 2026-06-27): give a customer a deal via "Give a VIP special"
          below instead. This card only shows when there's something to show. */}
      {grants.length > 0 && (
        <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-3">
            <Tag className="w-5 h-5 text-emerald-500" />
            {t("assignedCouponsHeading", { count: grants.length })}
          </h2>
          <div>
            <ul className="space-y-2">
              {grants.map((g) => {
                const rc = (g.promotion?.ruleConfig ?? {}) as { discountPercent?: number; discountAmount?: number };
                const pt = g.promotion?.promotionType;
                // Only %/fixed types have a meaningful $ figure here; every other
                // type (free_delivery, bogo, free_item, bundles…) showed a bogus
                // "$0.00 off" — fall back to the promo name instead (audit #20).
                const discount = pt === "percentage_off"
                  ? t("discountPercent", { value: rc.discountPercent ?? 0 })
                  : (pt === "fixed_cart" || pt === "fixed_combo")
                    ? t("discountFixed", { value: formatCurrency(rc.discountAmount ?? 0) })
                    : (g.promotion?.name ?? "");
                const expired = g.promotion?.endsAt && new Date(g.promotion.endsAt) < now;
                const status = g.status === "redeemed" ? t("statusUsedUp")
                  : g.promotion && !g.promotion.isActive ? t("statusDisabled")
                  : expired ? t("statusExpired")
                  : t("statusActive");
                const statusClass = status === t("statusActive")
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-gray-100 text-gray-600";
                return (
                  <li key={g.id} className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg border border-gray-100 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-gray-900">
                        <code className="font-mono">{g.code}</code> — {discount}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        {g.promotion?.name}
                        {(g.promotion?.minimumOrder ?? 0) > 0 && <> · {t("couponMin", { amount: formatCurrency(g.promotion!.minimumOrder) })}</>}
                        {expired && <> · {t("couponExpires", { date: new Date(g.promotion!.endsAt!).toLocaleDateString() })}</>}
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${statusClass}`}>
                      {status}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* Give a VIP special (member-only, no code, auto-applies) — also shows the
          specials this customer already has, including via group membership. */}
      <GiveVipSpecial customerId={customer.id} customerName={customer.name} currency={__currency} />

      {/* Order history */}
      <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-emerald-500" />
            {t("orderHistoryHeading")}
          </h2>
        </div>
        {orders.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">
            {t("noOrders")}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {orders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/admin/orders?id=${o.id}`}
                  className="flex items-center justify-between gap-3 px-6 py-3 hover:bg-gray-50 transition"
                >
                  <div>
                    <div className="text-sm font-bold text-gray-900">#{o.orderNumber}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {new Date(o.createdAt).toLocaleString(undefined, {
                        month: "short", day: "numeric", year: "numeric",
                        hour: "numeric", minute: "2-digit",
                      })}
                      {" · "}{o.type}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-gray-900 inline-flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5 text-gray-400" />
                      {formatCurrency(o.total)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mt-0.5">
                      {o.status}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
