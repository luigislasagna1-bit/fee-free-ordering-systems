/**
 * /order/[slug]/account
 *
 * Per-restaurant customer dashboard. Visible only to logged-in
 * customers; logged-out visitors get redirected to /login.
 *
 * Shows:
 *   - Profile (name, email, phone)
 *   - Coupons assigned to this customer (active + redeemable)
 *   - Recent order history at this restaurant
 *   - Sign-out button
 */

import prisma from "@/lib/db";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Tag, ShoppingBag, LogOut } from "lucide-react";
import { getCurrentRestaurantCustomer } from "@/lib/restaurant-customer-session";
import { formatCurrency } from "@/lib/utils";
import { LogoutButton } from "./LogoutButton";

export const dynamic = "force-dynamic";

export default async function RestaurantAccountDashboard({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, name: true, slug: true, isActive: true },
  });
  if (!restaurant || !restaurant.isActive) notFound();

  const me = await getCurrentRestaurantCustomer({ expectedRestaurantId: restaurant.id });
  if (!me) redirect(`/order/${slug}/account/login`);

  const now = new Date();
  const [coupons, orders] = await Promise.all([
    prisma.coupon.findMany({
      where: {
        restaurantId: restaurant.id,
        customerId: me.id,
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true, code: true, description: true, discountType: true,
        discountValue: true, minimumOrder: true, maxUses: true, usedCount: true,
        expiresAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.order.findMany({
      where: { customerId: me.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true, orderNumber: true, total: true, status: true,
        createdAt: true, type: true,
      },
    }),
  ]);

  const usableCoupons = coupons.filter((c) => c.maxUses === null || c.usedCount < c.maxUses);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
        <Link
          href={`/order/${slug}`}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to {restaurant.name}
        </Link>

        <div className="mt-4 bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Hi, {me.name}</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {me.email ?? "No email on file"}
                {me.phone && <> · {me.phone}</>}
              </p>
            </div>
            <LogoutButton slug={slug} />
          </div>
        </div>

        {/* Coupons */}
        <div className="mt-6">
          <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Tag className="w-4 h-4 text-emerald-500" />
            Your coupons ({usableCoupons.length})
          </h2>
          {usableCoupons.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-500">
              No coupons right now. {restaurant.name} can send you personalised codes —
              they&apos;ll show up here.
            </div>
          ) : (
            <ul className="space-y-2">
              {usableCoupons.map((c) => {
                const remaining = c.maxUses === null ? "Unlimited uses" :
                  `${Math.max(0, c.maxUses - c.usedCount)} use${(c.maxUses - c.usedCount) === 1 ? "" : "s"} left`;
                const discount = c.discountType === "percentage"
                  ? `${c.discountValue}% off`
                  : `${formatCurrency(c.discountValue)} off`;
                return (
                  <li key={c.id} className="bg-white rounded-xl border border-emerald-200 p-4 flex items-center justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="font-bold text-emerald-700">{discount}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {c.description ?? "Personal coupon"}
                      </div>
                      <div className="text-[11px] text-gray-400 mt-1">
                        {remaining}
                        {c.minimumOrder > 0 && <> · Min. order {formatCurrency(c.minimumOrder)}</>}
                        {c.expiresAt && <> · Expires {new Date(c.expiresAt).toLocaleDateString()}</>}
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <code className="bg-emerald-50 text-emerald-800 font-mono font-bold text-sm px-3 py-1.5 rounded border border-emerald-200">
                        {c.code}
                      </code>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Order history */}
        <div className="mt-6">
          <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-emerald-500" />
            Recent orders ({orders.length})
          </h2>
          {orders.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-500">
              You haven&apos;t placed any orders here yet.{" "}
              <Link href={`/order/${slug}`} className="text-emerald-600 font-semibold hover:underline">
                Order now →
              </Link>
            </div>
          ) : (
            <ul className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
              {orders.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/order/${slug}/status/${o.id}`}
                    className="flex items-center justify-between gap-3 p-4 hover:bg-gray-50 transition"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-gray-900">#{o.orderNumber}</div>
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        {new Date(o.createdAt).toLocaleString(undefined, {
                          month: "short", day: "numeric", year: "numeric",
                          hour: "numeric", minute: "2-digit",
                        })}
                        {" · "}{o.type}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-bold text-gray-900">{formatCurrency(o.total)}</div>
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
    </div>
  );
}
