import { redirect } from "next/navigation";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronLeft, ShoppingBag, ChevronRight, Store, Repeat } from "lucide-react";
import { MarketplaceReorderCard } from "./MarketplaceReorderCard";
import prisma from "@/lib/db";
import { getCurrentCustomer } from "@/lib/customer-session";
import { formatCurrency } from "@/lib/utils";

// metadata stays English — static-metadata i18n deferred (same as /marketplace)
export const metadata = {
  title: "Your orders — Fee Free Marketplace",
  description: "Your order history across every restaurant on the marketplace.",
};

/**
 * /account/orders — cross-restaurant order history for a signed-in
 * CustomerAccount.
 *
 * The Customer row → CustomerAccount relation lets us pull orders from
 * any restaurant the customer has ordered from. Each row links through
 * to the per-restaurant order-status page (which already exists and is
 * the source of truth for "what's happening with this order").
 *
 * Pagination capped at 50 orders for now — sufficient for almost every
 * customer; if anyone ever has more, we'll add a "Load older" button.
 */
export default async function CustomerOrdersPage() {
  const account = await getCurrentCustomer();
  if (!account) redirect("/account/login?next=/account/orders");

  const [t, tSt, tAcc, tCommon, locale] = await Promise.all([
    getTranslations("marketplaceAccount.orders"),
    getTranslations("customer.accountPage.status"),
    getTranslations("customer.accountPage"),
    getTranslations("common"),
    getLocale(),
  ]);

  const [orders, orderAgainBaskets] = await Promise.all([
    prisma.order.findMany({
      where: { customer: { customerAccountId: account.id } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        type: true,
        total: true,
        createdAt: true,
        restaurant: { select: { name: true, slug: true, currency: true, timezone: true } },
      },
    }),
    // "Order again" rail data — marketplace parity with the per-
    // restaurant /account page (Luigi 2026-05-30). 3 most recent
    // successful baskets, with item preview chips.
    prisma.order.findMany({
      where: {
        customer: { customerAccountId: account.id },
        status: { notIn: ["cancelled", "rejected"] },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: {
        id: true,
        total: true,
        createdAt: true,
        restaurant: { select: { name: true, slug: true, currency: true, timezone: true } },
        items: { select: { name: true, quantity: true }, take: 4 },
      },
    }),
  ]);

  // Status labels are reused from the per-restaurant account page catalog;
  // unknown values fall back to the raw status (same as before i18n).
  const statusLabel = (status: string) =>
    STATUS_KEYS.includes(status) ? tSt(status) : status;
  const typeLabel = (type: string) => {
    const key = TYPE_KEYS[type];
    return key ? t(key) : type.replace("_", " ");
  };
  const dateLabels = {
    yesterday: tCommon("yesterday"),
    daysAgo: (days: number) => t("daysAgo", { days }),
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/account"
          className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 mb-3"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          {t("backToAccount")}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ShoppingBag className="w-6 h-6 text-emerald-600" />
          {t("title")}
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          {t("subtitle")}
        </p>
      </div>

      {orderAgainBaskets.length > 0 && (
        <div>
          <h2 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Repeat className="w-4 h-4 text-emerald-600" />
            {tAcc("orderAgain")}
          </h2>
          <div className="grid sm:grid-cols-3 gap-3">
            {orderAgainBaskets.map((o) => (
              <MarketplaceReorderCard
                key={o.id}
                restaurantName={o.restaurant.name}
                restaurantSlug={o.restaurant.slug}
                orderId={o.id}
                itemSummary={o.items.map((i) => `${i.quantity}× ${i.name}`).join(" · ")}
                formattedTotal={formatCurrency(Number(o.total), o.restaurant.currency)}
              />
            ))}
          </div>
        </div>
      )}

      {orders.length === 0 ? (
        <div className="text-center py-16 bg-white border border-gray-100 rounded-2xl">
          <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-700 font-semibold">{t("emptyTitle")}</p>
          <p className="text-xs text-gray-500 mt-1 mb-5">
            {t("emptyBody")}
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition"
          >
            {t("browseMarketplace")}
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <Link
              key={o.id}
              href={`/order/${o.restaurant.slug}/status/${o.id}`}
              className="block bg-white rounded-xl border border-gray-100 hover:border-emerald-200 hover:shadow-sm transition p-4"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                  <Store className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold text-gray-900 truncate">
                      {o.restaurant.name}
                    </h3>
                    <span className="text-sm font-bold text-gray-900 flex-shrink-0">
                      {formatCurrency(Number(o.total), o.restaurant.currency)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 flex-wrap">
                    <span>#{o.orderNumber}</span>
                    <span>·</span>
                    <span className={TYPE_KEYS[o.type] ? undefined : "capitalize"}>
                      {typeLabel(o.type)}
                    </span>
                    <span>·</span>
                    <StatusPill status={o.status} label={statusLabel(o.status)} />
                    <span>·</span>
                    <span>{formatDate(o.createdAt, o.restaurant.timezone, locale, dateLabels)}</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0 mt-2" />
              </div>
            </Link>
          ))}
          {orders.length === 50 && (
            <p className="text-xs text-gray-500 text-center pt-4">
              {t("showingRecent", { count: orders.length })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// Statuses with a translated label in customer.accountPage.status —
// anything else renders raw (same fallback as before i18n).
const STATUS_KEYS = ["pending", "accepted", "preparing", "ready", "completed", "cancelled", "rejected"];

// Order.type → marketplaceAccount.orders key. Unknown types fall back to
// the old replace("_", " ") + CSS-capitalize rendering.
const TYPE_KEYS: Record<string, string> = {
  pickup: "typePickup",
  delivery: "typeDelivery",
  dine_in: "typeDineIn",
  take_out: "typeTakeOut",
  catering: "typeCatering",
};

function formatDate(
  d: Date,
  timeZone: string | null | undefined,
  locale: string,
  labels: { yesterday: string; daysAgo: (days: number) => string },
): string {
  // Absolute timestamps render in the order's RESTAURANT tz — server component,
  // so a naked toLocale* uses the server's UTC clock and a late-night order shows
  // the wrong time/day. The relative buckets ("X days ago") compare absolute
  // instants, so they're tz-independent. Luigi 2026-07-01.
  const tzOpts = timeZone ? { timeZone } : {};
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60_000));
  if (diffDays === 0) return d.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", ...tzOpts });
  if (diffDays === 1) return labels.yesterday;
  if (diffDays < 7) return labels.daysAgo(diffDays);
  return d.toLocaleDateString(locale, { month: "short", day: "numeric", year: diffDays > 365 ? "numeric" : undefined, ...tzOpts });
}

function StatusPill({ status, label }: { status: string; label: string }) {
  const toneMap: Record<string, string> = {
    pending:    "bg-amber-100 text-amber-800",
    accepted:   "bg-emerald-100 text-emerald-800",
    preparing:  "bg-emerald-100 text-emerald-800",
    ready:      "bg-sky-100 text-sky-800",
    completed:  "bg-slate-200 text-slate-800",
    rejected:   "bg-rose-100 text-rose-800",
    cancelled:  "bg-rose-100 text-rose-800",
  };
  const tone = toneMap[status] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${tone}`}>
      {label}
    </span>
  );
}
