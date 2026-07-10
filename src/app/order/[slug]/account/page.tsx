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
import { ChevronLeft, Tag, ShoppingBag, LogOut, Repeat, MapPin, Gift } from "lucide-react";
import { getCurrentRestaurantCustomer } from "@/lib/restaurant-customer-session";
import { formatCurrency as fmtCurrency } from "@/lib/utils";
import { LogoutButton } from "./LogoutButton";
import { ProfileEditor } from "./ProfileEditor";
import { OrderAgainButton } from "./OrderAgainButton";
import { AddressBook } from "./AddressBook";
import { getTranslations } from "next-intl/server";
import { HelpTip } from "@/components/HelpTip";
import { qualifyingMemberOnlyPromos } from "@/lib/vip-membership";
import { usedLifetimePromoIds } from "@/lib/coupon-ledger";

export const dynamic = "force-dynamic";

export default async function RestaurantAccountDashboard({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const t = await getTranslations("customer.accountPage");
  const { slug } = await params;
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: {
      id: true, name: true, slug: true, isActive: true, currency: true, timezone: true, country: true,
      rewardsEnabled: true, rewardLabelSingular: true, rewardLabelPlural: true,
    },
  });
  if (!restaurant || !restaurant.isActive) notFound();

  // Money on this dashboard renders in the restaurant's chosen currency.
  const formatCurrency = (amount: number) => fmtCurrency(amount, restaurant.currency);
  // Dates render in the RESTAURANT's timezone — this page is a server component
  // (force-dynamic) so a naked toLocaleDateString() uses the server's UTC clock,
  // showing e.g. "6/30" for a 9pm-June-29 order in Toronto. Luigi 2026-06-29.
  const tzOpts = restaurant.timezone ? { timeZone: restaurant.timezone } : {};
  const fmtDate = (d: Date | string) => new Date(d).toLocaleDateString(undefined, tzOpts);

  const me = await getCurrentRestaurantCustomer({ expectedRestaurantId: restaurant.id });
  if (!me) redirect(`/order/${slug}/account/login`);

  // Reward Dollars wallet (balance + last 20 ledger rows), only when the
  // restaurant has the feature on. Best-effort. Luigi 2026-06-27.
  const rewardLabelPlural = restaurant.rewardLabelPlural?.trim() || t("reward.defaultPlural");
  let rewardWallet: { balance: number; ledger: Array<{ id: string; amount: number; reason: string; createdAt: Date; orderId: string | null }> } | null = null;
  // Map a ledger row's orderId → its order number, so each order-tied activity
  // row can link to that order's receipt (where the full breakdown + payment
  // method + reward used/earned live). Synthetic ids ("signup:…", "sched:…")
  // aren't real orders and are skipped. Luigi 2026-06-29.
  let rewardOrderNumbers: Record<string, string> = {};
  if (restaurant.rewardsEnabled) {
    const acct = await prisma.rewardAccount.findUnique({
      where: { restaurantId_customerId: { restaurantId: restaurant.id, customerId: me.id } },
      select: {
        balance: true,
        ledger: { orderBy: { createdAt: "desc" }, take: 20, select: { id: true, amount: true, reason: true, createdAt: true, orderId: true } },
      },
    }).catch(() => null);
    if (acct) {
      rewardWallet = { balance: acct.balance, ledger: acct.ledger };
      const realOrderIds = [...new Set(acct.ledger.map((l) => l.orderId).filter((o): o is string => !!o && !o.includes(":")))];
      if (realOrderIds.length) {
        const ords = await prisma.order.findMany({
          where: { id: { in: realOrderIds } },
          select: { id: true, orderNumber: true },
        }).catch(() => []);
        rewardOrderNumbers = Object.fromEntries(ords.map((o) => [o.id, o.orderNumber]));
      }
    }
  }
  // Does this store exclude any items/categories from EARNING? If so we tell the
  // customer (e.g. "Gift cards don't earn Pizza Bucks"). Cheap count. Luigi 2026-06-30.
  let rewardHasExclusions = false;
  if (restaurant.rewardsEnabled) {
    const [exCat, exItem] = await Promise.all([
      prisma.menuCategory.count({ where: { restaurantId: restaurant.id, rewardEarnExcluded: true } }).catch(() => 0),
      prisma.menuItem.count({ where: { restaurantId: restaurant.id, rewardEarnExcluded: true } }).catch(() => 0),
    ]);
    rewardHasExclusions = exCat + exItem > 0;
  }

  const now = new Date();
  const [offers, orders] = await Promise.all([
    // Promotions assigned to this customer (CustomerCoupon grants — the model
    // that replaced personal coupons). Available = not yet redeemed, on an active
    // non-expired promotion, matched by customerId OR email. Luigi 2026-06-26.
    prisma.customerCoupon.findMany({
      where: {
        restaurantId: restaurant.id,
        status: { in: ["granted", "released"] },
        OR: [
          { customerId: me.id },
          ...(me.email ? [{ email: { equals: me.email.toLowerCase(), mode: "insensitive" as const } }] : []),
        ],
        promotion: { is: { isActive: true, OR: [{ endsAt: null }, { endsAt: { gt: now } }] } },
      },
      orderBy: { grantedAt: "desc" },
      select: {
        id: true, code: true,
        promotion: { select: { name: true, promotionType: true, ruleConfig: true, minimumOrder: true, endsAt: true } },
      },
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

  // "Order again" rail data — the 3 most recent SUCCESSFUL orders
  // (status NOT IN cancelled/rejected) with their items so we can
  // preview the basket. One-click reorders use the existing
  // ?reorder=<id> handshake (see OrderingPageClient).
  const orderAgainBaskets = await prisma.order.findMany({
    where: {
      customerId: me.id,
      status: { notIn: ["cancelled", "rejected"] },
    },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: {
      id: true,
      orderNumber: true,
      total: true,
      createdAt: true,
      items: {
        select: { name: true, quantity: true },
        take: 4, // preview chip count cap
      },
    },
  });

  // VIP specials this customer is entitled to (member-only promos attached to a
  // group they're in OR to them as an individual). These AUTO-APPLY — no code —
  // so we surface them here with their terms + used state. Luigi 2026-06-27.
  const memberOnlyPromos = await prisma.promotion.findMany({
    where: {
      restaurantId: restaurant.id,
      isActive: true,
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      groupLinks: { some: {} },
    },
    select: {
      id: true, name: true, promotionType: true, ruleConfig: true, minimumOrder: true, endsAt: true, onceLifetimePerClient: true,
      groupLinks: { select: { groupId: true, customerId: true, email: true, phone: true } },
    },
  });
  const myVip = await qualifyingMemberOnlyPromos(
    restaurant.id,
    { customerId: me.id, email: me.email, phone: me.phone },
    memberOnlyPromos,
  );
  // Which once-per-customer specials have already been redeemed (so we can mark
  // them "Used"). Reuses the same per-promo ledger the checkout enforces.
  const onceIds = myVip.filter((p) => p.onceLifetimePerClient).map((p) => p.id);
  const usedSet = new Set<string>(
    onceIds.length
      ? await usedLifetimePromoIds({ restaurantId: restaurant.id, promotionIds: onceIds, customerId: me.id, email: me.email, phone: me.phone })
      : [],
  );

  function discountLabelFor(promotionType: string | undefined, rc: { discountPercent?: number; discountAmount?: number }, fallbackName: string): string {
    if (promotionType === "percentage_off" || promotionType === "percentage_combo") return t("percentOff", { value: rc.discountPercent ?? 0 });
    if (promotionType === "fixed_cart" || promotionType === "fixed_combo") return t("fixedOff", { amount: formatCurrency(rc.discountAmount ?? 0) });
    return fallbackName;
  }

  type UiOffer = {
    key: string; discountLabel: string; name: string; minOrder: number; endsAt: Date | null;
    code: string | null; grantId: string | null; auto: boolean; once: boolean; used: boolean;
  };
  const vipOffers: UiOffer[] = myVip.map((p) => ({
    key: `vip-${p.id}`,
    discountLabel: discountLabelFor(p.promotionType, (p.ruleConfig ?? {}) as any, p.name),
    name: p.name,
    minOrder: p.minimumOrder ?? 0,
    endsAt: p.endsAt ?? null,
    code: null,
    grantId: null,
    auto: true,
    once: !!p.onceLifetimePerClient,
    used: usedSet.has(p.id),
  }));
  const couponOffers: UiOffer[] = offers.map((g) => {
    const rc = (g.promotion?.ruleConfig ?? {}) as { discountPercent?: number; discountAmount?: number };
    return {
      key: `coupon-${g.id}`,
      discountLabel: discountLabelFor(g.promotion?.promotionType, rc, g.promotion?.name ?? t("personalCoupon")),
      name: g.promotion?.name ?? t("personalCoupon"),
      minOrder: g.promotion?.minimumOrder ?? 0,
      endsAt: g.promotion?.endsAt ?? null,
      code: g.code,
      grantId: g.id,
      auto: false,
      once: true,
      used: false,
    };
  });
  // Available offers first, used ones last.
  const usableOffers = [...vipOffers, ...couponOffers].sort((a, b) => Number(a.used) - Number(b.used));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
        <Link
          href={`/order/${slug}`}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ChevronLeft className="w-4 h-4" />
          {t("backTo", { name: restaurant.name })}
        </Link>

        <div className="mt-4 bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-bold text-gray-900">{t("greeting", { name: me.name })}</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                {me.email ?? t("noEmailOnFile")}
                {me.phone && <> · {me.phone}</>}
              </p>
              <div className="mt-2">
                <ProfileEditor
                  initialName={me.name}
                  initialEmail={me.email ?? null}
                  initialPhone={me.phone ?? null}
                  initialMarketingConsent={me.marketingConsent ?? false}
                />
              </div>
            </div>
            <LogoutButton slug={slug} />
          </div>
        </div>

        {/* Reward Dollars wallet — balance + recent activity. Only when the
            restaurant has the feature on. Luigi 2026-06-27. */}
        {rewardWallet && (
          <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-emerald-50 px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-emerald-600" />
                <span className="font-semibold text-emerald-900">{rewardLabelPlural}</span>
                <HelpTip text={t("reward.help", { label: rewardLabelPlural })} />
              </div>
              <span className="text-2xl font-extrabold text-emerald-700">{formatCurrency(rewardWallet.balance)}</span>
            </div>
            {rewardWallet.ledger.length > 0 && (
              <ul className="divide-y divide-gray-100 px-6 py-2">
                {rewardWallet.ledger.map((l) => {
                  // Normalise reason keys like "earn:first_order:<ruleId>" to a
                  // display label. "earn:signup:<ruleId>" is a sign-up campaign
                  // grant — it must read "Sign-up bonus", not "Earned on an
                  // order" (there is no order; Luigi 2026-07-09). "promo:<id>"
                  // maps to its own label so the raw promo id never leaks.
                  const baseReason = l.reason.startsWith("earn:signup:") ? "signup_bonus"
                    : l.reason.startsWith("promo:") ? "promo"
                    : l.reason.split(":")[0];
                  const reasonLabel = ["earn", "grant", "spend", "release", "adjust", "signup_bonus", "expire", "refund", "reverse", "promo"].includes(baseReason)
                    ? t(`reward.reason.${baseReason}`)
                    : l.reason;
                  const orderNumber = l.orderId ? rewardOrderNumbers[l.orderId] : undefined;
                  return (
                    <li key={l.id} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-gray-600">
                        {reasonLabel}
                        {orderNumber && l.orderId && (
                          <>
                            {" "}
                            <Link
                              href={`/order/${slug}/status/${l.orderId}`}
                              className="text-emerald-600 hover:underline font-medium"
                            >
                              {t("reward.orderRef", { number: orderNumber })}
                            </Link>
                          </>
                        )}
                        <span className="text-gray-400"> · {fmtDate(l.createdAt)}</span>
                      </span>
                      <span className={l.amount >= 0 ? "text-emerald-600 font-medium" : "text-gray-700 font-medium"}>
                        {l.amount >= 0 ? "+" : "−"} {formatCurrency(Math.abs(l.amount))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {rewardHasExclusions && (
              <p className="px-6 pb-4 pt-1 text-xs text-gray-400">{t("reward.someExcluded", { label: rewardLabelPlural })}</p>
            )}
          </div>
        )}

        {/* Coupons */}
        <div className="mt-6">
          <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Tag className="w-4 h-4 text-emerald-500" />
            {t("yourCoupons", { count: usableOffers.length })}
            <HelpTip text={t("helpOffers")} />
          </h2>
          {usableOffers.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-500">
              {t("noCoupons", { name: restaurant.name })}
            </div>
          ) : (
            <ul className="space-y-2">
              {usableOffers.map((o) => (
                <li key={o.key} className={`bg-white rounded-xl border p-4 flex items-center justify-between gap-3 flex-wrap ${o.used ? "border-gray-200 opacity-60" : "border-emerald-200"}`}>
                  <div className="min-w-0">
                    <div className={`font-bold ${o.used ? "text-gray-500" : "text-emerald-700"}`}>{o.discountLabel}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{o.name}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      {/* redeemability + used/expiry chips so the customer knows the terms */}
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {o.once ? t("offerOnce") : t("offerReusable")}
                      </span>
                      {o.used && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600">{t("offerUsed")}</span>
                      )}
                      {o.auto && !o.used && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700">{t("offerAutoApplies")}</span>
                      )}
                      {o.minOrder > 0 && (
                        <span className="text-[10px] text-gray-400">{t("minOrder", { amount: formatCurrency(o.minOrder) })}</span>
                      )}
                      {o.endsAt && (
                        <span className="text-[10px] text-gray-400">{t("expires", { date: fmtDate(o.endsAt) })}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
                    {o.code ? (
                      <>
                        <code className="bg-emerald-50 text-emerald-800 font-mono font-bold text-sm px-3 py-1.5 rounded border border-emerald-200">
                          {o.code}
                        </code>
                        <Link
                          href={`/order/${slug}?coupon=${encodeURIComponent(o.code)}`}
                          className="text-xs font-semibold text-emerald-600 hover:text-emerald-800"
                        >
                          {t("useOffer")} →
                        </Link>
                      </>
                    ) : !o.used ? (
                      <Link
                        href={o.grantId ? `/order/${slug}?grant=${encodeURIComponent(o.grantId)}` : `/order/${slug}`}
                        className="text-xs font-semibold text-emerald-600 hover:text-emerald-800"
                      >
                        {t("useOffer")} →
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Saved delivery addresses (Luigi audit 2026-05-30). */}
        <div className="mt-6">
          <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-500" />
            {t("savedAddresses")}
          </h2>
          <AddressBook country={restaurant.country} />
        </div>

        {/* Order again rail — top 3 successful past baskets with a
            one-click reorder. Toast/Skip/Grubhub/DoorDash all promote
            this above the order history list because repeat customers
            account for most volume. */}
        {orderAgainBaskets.length > 0 && (
          <div className="mt-6">
            <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Repeat className="w-4 h-4 text-emerald-500" />
              {t("orderAgain")}
            </h2>
            <div className="grid sm:grid-cols-3 gap-3">
              {orderAgainBaskets.map((o) => {
                const itemNames = o.items.map((i) => `${i.quantity}× ${i.name}`).join(" · ");
                return (
                  <div
                    key={o.id}
                    className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-2"
                  >
                    <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold">
                      {new Date(o.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", ...tzOpts })}
                    </div>
                    <div className="text-xs text-gray-700 line-clamp-2 min-h-[2.5em]">
                      {itemNames || t("orderFallback")}
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <div className="text-sm font-semibold text-gray-900">
                        {formatCurrency(o.total)}
                      </div>
                      <OrderAgainButton
                        slug={slug}
                        orderId={o.id}
                        className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Order history */}
        <div className="mt-6">
          <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
            <ShoppingBag className="w-4 h-4 text-emerald-500" />
            {t("recentOrders", { count: orders.length })}
          </h2>
          {orders.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-500">
              {t("noOrdersYet")}{" "}
              <Link href={`/order/${slug}`} className="text-emerald-600 font-semibold hover:underline">
                {t("orderNow")}
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
                          hour: "numeric", minute: "2-digit", ...tzOpts,
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
