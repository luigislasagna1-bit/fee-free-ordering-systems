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
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { formatCurrency, formatDate } from "@/lib/utils";
import { AssignCouponForm } from "./AssignCouponForm";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) notFound();

  const { id } = await params;

  const customer = await prisma.customer.findUnique({
    where: { id },
    select: {
      id: true, restaurantId: true, name: true, email: true, phone: true,
      address: true, totalOrders: true, totalSpent: true, createdAt: true,
      lastOrderAt: true, passwordHash: true, emailVerifiedAt: true,
      lastLoginAt: true, chainCustomerId: true,
    },
  });
  if (!customer || customer.restaurantId !== restaurantId) notFound();

  const hasAccount = !!customer.passwordHash;
  const now = new Date();

  const [orders, coupons] = await Promise.all([
    prisma.order.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true, orderNumber: true, total: true, status: true,
        createdAt: true, type: true,
      },
    }),
    prisma.coupon.findMany({
      where: { restaurantId, customerId: customer.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, code: true, description: true, discountType: true,
        discountValue: true, minimumOrder: true, maxUses: true,
        usedCount: true, isActive: true, expiresAt: true, createdAt: true,
      },
    }),
  ]);

  return (
    <div className="max-w-4xl">
      <Link href="/admin/customers" className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4">
        <ChevronLeft className="w-4 h-4" />
        All customers
      </Link>

      {/* Profile header */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
              {hasAccount ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                  <KeyRound className="w-3 h-3" />Signed up
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  Guest customer
                </span>
              )}
              {customer.chainCustomerId && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  Multi-location
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
              <div className="text-[10px] uppercase tracking-wider text-gray-500">orders</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{formatCurrency(customer.totalSpent)}</div>
              <div className="text-[10px] uppercase tracking-wider text-gray-500">spent</div>
            </div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-gray-600">
          <div>
            <Calendar className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
            First seen <strong>{formatDate(customer.createdAt)}</strong>
          </div>
          {customer.lastOrderAt && (
            <div>
              <ShoppingBag className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
              Last order <strong>{formatDate(customer.lastOrderAt)}</strong>
            </div>
          )}
          {hasAccount && customer.lastLoginAt && (
            <div>
              <KeyRound className="w-3.5 h-3.5 inline mr-1 text-gray-400" />
              Last login <strong>{formatDate(customer.lastLoginAt)}</strong>
            </div>
          )}
        </div>
      </div>

      {/* Assign coupon */}
      <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Tag className="w-5 h-5 text-emerald-500" />
          Assign a personal coupon
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Creates a code only <strong>{customer.name}</strong> can redeem.
          {hasAccount
            ? " It'll show up in their account dashboard automatically."
            : " They'll need to sign up first to see it in their account — but you can also share the code directly."}
        </p>
        <AssignCouponForm customerId={customer.id} customerName={customer.name} />

        {/* Coupons assigned to this customer */}
        {coupons.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-100">
            <h3 className="text-sm font-bold text-gray-900 mb-3">
              Coupons assigned to this customer ({coupons.length})
            </h3>
            <ul className="space-y-2">
              {coupons.map((c) => {
                const discount = c.discountType === "percentage"
                  ? `${c.discountValue}% off`
                  : `${formatCurrency(c.discountValue)} off`;
                const status = !c.isActive ? "Disabled"
                  : c.expiresAt && new Date(c.expiresAt) < now ? "Expired"
                  : c.maxUses !== null && c.usedCount >= c.maxUses ? "Used up"
                  : "Active";
                const statusClass = status === "Active"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-gray-100 text-gray-600";
                return (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg border border-gray-100 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-gray-900">
                        <code className="font-mono">{c.code}</code> — {discount}
                      </div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        {c.description}
                        {c.minimumOrder > 0 && <> · Min {formatCurrency(c.minimumOrder)}</>}
                        {c.maxUses !== null && <> · {c.usedCount}/{c.maxUses} used</>}
                        {c.expiresAt && <> · Expires {new Date(c.expiresAt).toLocaleDateString()}</>}
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
        )}
      </div>

      {/* Order history */}
      <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-emerald-500" />
            Order history
          </h2>
        </div>
        {orders.length === 0 ? (
          <div className="p-10 text-center text-sm text-gray-500">
            No orders yet.
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
