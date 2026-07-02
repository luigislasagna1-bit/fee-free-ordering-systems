"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  CreditCard, AlertTriangle, CheckCircle2, Clock, ExternalLink, Loader2,
  ShoppingBag, Plus, XCircle,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { FiscalDataCard } from "./FiscalDataCard";

type Invoice = {
  id: string;
  stripeInvoiceId: string;
  amountPaid: number;
  currency: string;
  status: string;
  paidAt: string | null;
  hostedInvoiceUrl: string | null;
  createdAt: string;
};

type Restaurant = {
  id: string;
  name: string;
  subscriptionStatus: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

type AddOnRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  monthlyPriceCents: number;
  comingSoon: boolean;
};

type RestaurantAddOnRow = {
  addOnId: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  activatedAt: string | null;
  stripeSubscriptionId: string | null;
};

type MarketplaceListing = {
  billingMode: string; // "payg" | "monthly"
  currentMonthOrders: number;
  currentMonthRevenue: number;
  currentMonthStartedAt: string;
  isListed: boolean;
  switchToPaygOnCancel: boolean;
};

const PAYG_PER_ORDER_CENTS = 300;
const PAYG_MONTHLY_CAP_CENTS = 24999;

export function BillingClient({
  restaurant,
  addOnCatalog,
  restaurantAddOns,
  marketplaceListing,
  invoices,
  billingConfigured,
  savedCard,
  orderCapUsage,
}: {
  restaurant: Restaurant;
  addOnCatalog: AddOnRow[];
  restaurantAddOns: RestaurantAddOnRow[];
  marketplaceListing: MarketplaceListing | null;
  invoices: Invoice[];
  billingConfigured: boolean;
  savedCard: { brand: string; last4: string; expMonth: number; expYear: number } | null;
  orderCapUsage: {
    count: number;
    cap: number;
    exempt: boolean;
    resetAt: string | null;
    level: "ok" | "warning" | "cap_reached";
  };
}) {
  const t = useTranslations("admin.billing");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cardSaved, setCardSaved] = useState(false);

  // Show a one-time success note after returning from the Stripe card-setup
  // Checkout (?card_saved=1), then strip the param so a refresh doesn't repeat it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("card_saved") === "1") {
      setCardSaved(true);
      params.delete("card_saved");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  // Save (or change) the card used for future paid-service invoices — WITHOUT
  // enabling any paid service. Reuses the Stripe setup-mode Checkout; 3D Secure
  // is completed now so a later upgrade charges instantly. Fabrizio cmr1u3qxm.
  async function saveCard() {
    setBusy("saveCard");
    setError(null);
    try {
      const res = await fetch("/api/admin/billing/setup-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnPath: "/admin/billing" }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || t("saveCardError"));
        return;
      }
      window.location.href = data.url;
    } catch {
      setError(t("saveCardError"));
    } finally {
      setBusy(null);
    }
  }

  // Legacy "trialing" rows are treated as "free" — the trial concept was
  // removed; every restaurant is on the FREE plan by default. Normalize
  // at the top so the rest of the component only cares about:
  // free | active | past_due | cancelled.
  const rawStatus = restaurant.subscriptionStatus;
  const status = rawStatus === "trialing" ? "free" : rawStatus;
  const periodEnd = restaurant.currentPeriodEnd ? new Date(restaurant.currentPeriodEnd) : null;

  // Join the catalog with this restaurant's subscription rows. Every add-on
  // in the catalog gets a row in the displayed list — subscribed or not —
  // so the owner can see at a glance what's available + what they have.
  const addOnsByMyId = new Map(restaurantAddOns.map((r) => [r.addOnId, r]));
  // Cap-exempt detection: any active paid add-on EXCEPT unlimited_orders
  // itself bundles unlimited orders. Used to dim the "FREE Unlimited
  // Orders" subscribe CTA when subscribing would buy nothing — the
  // restaurant is already exempt from the 100/mo cap. Logic mirrors
  // src/lib/order-cap.ts hasAnyPaidAddOn.
  const hasOtherPaidAddOn = restaurantAddOns.some((r) => {
    const isLive = r.status === "active" || r.status === "trialing";
    if (!isLive) return false;
    const cat = addOnCatalog.find((c) => c.id === r.addOnId);
    return cat && cat.slug !== "unlimited_orders";
  });
  // Marketplace Monthly bundles driver_pool (see prisma/seed-addons.ts
  // marketplace.enabledFeatures = ["marketplace_listing", "driver_pool"]).
  // PAYG does NOT bundle it — PAYG users don't have a RestaurantAddOn row
  // for marketplace, so this check naturally excludes them. We use this
  // flag to render driver_pool as "Already included via Marketplace"
  // instead of offering a $19.99/mo subscribe link that would be a
  // duplicate purchase.
  const hasMarketplaceMonthly = restaurantAddOns.some((r) => {
    const isLive = r.status === "active" || r.status === "trialing";
    if (!isLive) return false;
    const cat = addOnCatalog.find((c) => c.id === r.addOnId);
    return cat?.slug === "marketplace";
  });
  const mergedAddOns = addOnCatalog.map((cat) => ({
    catalog: cat,
    mine: addOnsByMyId.get(cat.id) ?? null,
  }));

  async function openPortal() {
    setBusy("portal");
    setError(null);
    try {
      const res = await fetch("/api/admin/billing/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || t("portalError"));
        return;
      }
      window.location.href = data.url;
    } catch {
      setError(t("portalError"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t("billingTitle")}</h1>

      {!billingConfigured && (
        <div className="mb-6 rounded-xl bg-yellow-50 border border-yellow-200 p-4 text-sm text-yellow-800">
          {t("billingNotConfigured")}
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <StatusCard status={status} periodEnd={periodEnd} cancelAtPeriodEnd={restaurant.cancelAtPeriodEnd} />

      {/* Monthly order usage. Always visible (not just when the
          warning level fires) so owners can self-monitor. When exempt
          via a paid add-on, we surface that explicitly instead of a
          progress bar — there's no cap to track. */}
      <OrderCapUsageCard usage={orderCapUsage} />

      <div className="mt-6 flex flex-wrap gap-3">
        {status === "past_due" && (
          <button
            onClick={openPortal}
            disabled={busy !== null || !billingConfigured}
            className="inline-flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-5 py-2.5 rounded-lg font-semibold text-sm transition disabled:opacity-50"
          >
            {busy === "portal" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
            {t("updatePaymentMethod")}
          </button>
        )}
        {restaurant.stripeCustomerId && (status === "active" || status === "past_due") && (
          <button
            onClick={openPortal}
            disabled={busy !== null || !billingConfigured}
            className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-800 border border-gray-200 px-5 py-2.5 rounded-lg font-semibold text-sm transition disabled:opacity-50"
          >
            {busy === "portal" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
            {t("manageSubscriptionInStripe")}
          </button>
        )}
      </div>

      {/* ── Payment method ─────────────────────────────────────────────
          Save a card (+ complete 3D Secure) WITHOUT enabling any paid
          service, so a later upgrade charges instantly. Fabrizio cmr1u3qxm. */}
      <div className="mt-8 rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-emerald-500" /> {t("paymentMethodTitle")}
            </h2>
            {savedCard ? (
              <p className="mt-1 text-sm text-gray-700">
                <span className="font-semibold capitalize">{savedCard.brand}</span>
                {" •••• "}{savedCard.last4}
                {savedCard.expMonth ? (
                  <span className="text-gray-500"> · {t("cardExpires", { month: String(savedCard.expMonth).padStart(2, "0"), year: savedCard.expYear })}</span>
                ) : null}
              </p>
            ) : (
              <p className="mt-1 text-sm text-gray-500 max-w-lg">{t("paymentMethodEmptyDesc")}</p>
            )}
            {cardSaved && (
              <p className="mt-2 text-sm text-green-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {t("cardSavedSuccess")}
              </p>
            )}
          </div>
          <button
            onClick={saveCard}
            disabled={busy !== null || !billingConfigured}
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-lg font-semibold text-sm transition disabled:opacity-50 flex-shrink-0"
          >
            {busy === "saveCard" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
            {savedCard ? t("changeCard") : t("savePaymentMethod")}
          </button>
        </div>
      </div>

      {/* ── Add-Ons overview ───────────────────────────────────────────
          Every add-on the platform offers, with this restaurant's status
          per add-on. Replaces the legacy "Available plans" picker — there
          are no plans to switch between under the FREE-by-default model,
          only add-ons to subscribe to (or unsubscribe from). */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{t("addOnsTitle")}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {t("addOnsSubtitle")}
            </p>
          </div>
          <Link
            href="/admin/billing/add-ons"
            className="inline-flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 text-white px-3.5 py-2 rounded-lg font-semibold text-xs transition"
          >
            <Plus className="w-3.5 h-3.5" />
            {t("browseAddOns")}
          </Link>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <ul className="divide-y divide-gray-100">
            {mergedAddOns.map(({ catalog, mine }) =>
              catalog.slug === "marketplace" ? (
                <MarketplaceAddOnRow
                  key={catalog.id}
                  catalog={catalog}
                  mine={mine}
                  listing={marketplaceListing}
                />
              ) : (
                <AddOnRowItem
                  key={catalog.id}
                  catalog={catalog}
                  mine={mine}
                  hasOtherPaidAddOn={hasOtherPaidAddOn}
                  hasMarketplaceMonthly={hasMarketplaceMonthly}
                />
              ),
            )}
            {mergedAddOns.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-gray-500">
                {t("noAddOns")}
              </li>
            )}
          </ul>
        </div>
      </div>

      <FiscalDataCard />

      {invoices.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-bold text-gray-900 mb-4">{t("recentInvoices")}</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Mobile: card layout */}
            <ul className="divide-y divide-gray-100 sm:hidden">
              {invoices.map((inv) => (
                <li key={inv.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        {new Date(inv.paidAt || inv.createdAt).toLocaleDateString()}
                      </div>
                      <div className="mt-1">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            inv.status === "paid"
                              ? "bg-green-100 text-green-700"
                              : inv.status === "open"
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {inv.status}
                        </span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-bold text-gray-900">
                        {formatCurrency(inv.amountPaid / 100)}
                      </div>
                      <a
                        href={`/billing-invoice/${inv.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-700 text-xs font-semibold inline-flex items-center gap-1 mt-1"
                      >
                        {t("invoiceView")} <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop: table */}
            <table className="w-full text-sm hidden sm:table">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">{t("invoiceDate")}</th>
                  <th className="px-4 py-3 text-left">{t("invoiceAmount")}</th>
                  <th className="px-4 py-3 text-left">{t("invoiceStatus")}</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 text-gray-700">
                      {new Date(inv.paidAt || inv.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {formatCurrency(inv.amountPaid / 100)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          inv.status === "paid"
                            ? "bg-green-100 text-green-700"
                            : inv.status === "open"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={`/billing-invoice/${inv.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-700 text-xs font-medium inline-flex items-center gap-1"
                      >
                        {t("invoiceView")} <ExternalLink className="w-3 h-3" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderCapUsageCard({
  usage,
}: {
  usage: {
    count: number;
    cap: number;
    exempt: boolean;
    resetAt: string | null;
    level: "ok" | "warning" | "cap_reached";
  };
}) {
  const t = useTranslations("admin.billing");
  const resetDate = usage.resetAt
    ? new Date(usage.resetAt).toLocaleDateString(undefined, { month: "long", day: "numeric" })
    : null;

  if (usage.exempt) {
    return (
      <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-100 p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-emerald-900 text-sm mb-1">{t("unlimitedOrdersTitle")}</h3>
            <p className="text-xs text-emerald-800">
              {t("unlimitedOrdersDesc", { count: usage.count })}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // FREE plan, no exemption — show the progress bar.
  const pct = Math.min(100, Math.round((usage.count / Math.max(1, usage.cap)) * 100));
  const barColor =
    usage.level === "cap_reached" ? "bg-rose-500" :
    usage.level === "warning" ? "bg-amber-500" :
    "bg-emerald-500";
  const cardClass =
    usage.level === "cap_reached" ? "bg-rose-50 border-rose-200" :
    usage.level === "warning" ? "bg-amber-50 border-amber-200" :
    "bg-white border-gray-200";

  return (
    <div className={`mt-4 rounded-xl border p-4 ${cardClass}`}>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="font-bold text-gray-900 text-sm">{t("thisMonthsOrders")}</h3>
        <div className="text-xs text-gray-600">
          <span className="font-bold text-gray-900">{usage.count}</span>
          <span className="text-gray-500"> / {usage.cap} {t("included")}</span>
        </div>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[11px] text-gray-600">
          {usage.level === "cap_reached"
            ? t("capReached", { resetDate: resetDate ?? t("nextMonth") })
            : usage.level === "warning"
              ? t("capWarning", { resetDate: resetDate ?? t("nextMonth") })
              : t("capOk", { resetDate: resetDate ?? t("nextMonth") })}
        </p>
        {usage.level !== "ok" && (
          <Link
            href="/admin/billing/add-ons?addon=unlimited_orders"
            className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap"
          >
            {t("upgrade")}
          </Link>
        )}
      </div>
    </div>
  );
}

function StatusCard({
  status,
  periodEnd,
  cancelAtPeriodEnd,
}: {
  status: string;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}) {
  const t = useTranslations("admin.billing");
  if (status === "free") {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="font-bold text-emerald-900 mb-1">{t("freePlanTitle")}</h2>
            <p className="text-sm text-emerald-800">
              {t("freePlanDesc")}
            </p>
          </div>
        </div>
      </div>
    );
  }
  if (status === "past_due") {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="font-bold text-red-900 mb-1">{t("pastDueTitle")}</h2>
            <p className="text-sm text-red-800">
              {t("pastDueDesc")}
            </p>
          </div>
        </div>
      </div>
    );
  }
  if (status === "cancelled") {
    return (
      <div className="rounded-xl bg-gray-50 border border-gray-200 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="font-bold text-gray-900 mb-1">{t("cancelledTitle")}</h2>
            <p className="text-sm text-gray-700">
              {t("cancelledDesc")}
            </p>
          </div>
        </div>
      </div>
    );
  }
  if (status === "active") {
    return (
      <div className="rounded-xl bg-green-50 border border-green-200 p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="font-bold text-green-900 mb-1">
              {t("activeTitle")}
            </h2>
            <p className="text-sm text-green-800">
              {cancelAtPeriodEnd
                ? t("activeCancelsAtPeriodEnd", { date: periodEnd ? ` (${periodEnd.toLocaleDateString()})` : "" })
                : periodEnd
                  ? t("activeNextBillingDate", { date: periodEnd.toLocaleDateString() })
                  : t("activeManageAddOns")}
            </p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-gray-50 border border-gray-200 p-5">
      <h2 className="font-bold text-gray-900 mb-1">{t("subscriptionStatus", { status })}</h2>
    </div>
  );
}

/**
 * One row in the add-ons overview list. Shows:
 *   - Add-on name + price + description
 *   - Subscription state (Active / Cancels at period end / Past due /
 *     Not subscribed / Coming Soon)
 *   - For active subs: activated date + next renewal date
 *   - Quick action: "Subscribe" (not subscribed) or "Manage" (active)
 */
function AddOnRowItem({
  catalog,
  mine,
  hasOtherPaidAddOn,
  hasMarketplaceMonthly,
}: {
  catalog: AddOnRow;
  mine: RestaurantAddOnRow | null;
  /** True iff the restaurant has any other paid add-on active. Used
   *  by the unlimited_orders row to mark itself "Already included"
   *  instead of offering a redundant subscribe CTA. */
  hasOtherPaidAddOn: boolean;
  /** True iff Marketplace Monthly is active. Drives the "Already
   *  included via Marketplace" state for the driver_pool row. */
  hasMarketplaceMonthly: boolean;
}) {
  const t = useTranslations("admin.billing");
  // Normalize legacy "trialing" status to "active" — trial concept is dead.
  const status = mine && mine.status === "trialing" ? "active" : mine?.status ?? null;
  const isActive = status === "active";
  const isPastDue = status === "past_due";
  const isCancelled = status === "cancelled";
  const cancelsAtPeriodEnd = !!mine?.cancelAtPeriodEnd;
  const renewDate = mine?.currentPeriodEnd ? new Date(mine.currentPeriodEnd) : null;
  const activatedDate = mine?.activatedAt ? new Date(mine.activatedAt) : null;
  const unlimitedRedundant =
    catalog.slug === "unlimited_orders" && !isActive && hasOtherPaidAddOn;
  const driverPoolRedundant =
    catalog.slug === "driver_pool" && !isActive && hasMarketplaceMonthly;
  const includedNote = unlimitedRedundant
    ? t("unlimitedRedundantNote")
    : driverPoolRedundant
      ? t("driverPoolRedundantNote")
      : null;

  return (
    <li className="p-4 sm:p-5 flex items-start gap-4">
      {/* Left: icon column */}
      <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
        isActive ? "bg-emerald-100 text-emerald-700" :
        isPastDue ? "bg-rose-100 text-rose-700" :
        catalog.comingSoon ? "bg-amber-100 text-amber-700" :
        "bg-gray-100 text-gray-500"
      }`}>
        {isActive ? <CheckCircle2 className="w-5 h-5" /> :
         isPastDue ? <AlertTriangle className="w-5 h-5" /> :
         catalog.comingSoon ? <Clock className="w-5 h-5" /> :
         <ShoppingBag className="w-5 h-5" />}
      </div>

      {/* Middle: name + description + status pills */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="font-bold text-gray-900">{catalog.name}</div>
          <StatusPill
            status={status}
            comingSoon={catalog.comingSoon}
            cancelsAtPeriodEnd={cancelsAtPeriodEnd}
          />
        </div>
        {catalog.description && (
          <p className="text-xs text-gray-600 mt-1 leading-snug">{catalog.description}</p>
        )}

        {/* Activation + renewal dates — only render when there's a subscription */}
        {mine && (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
            {activatedDate && (
              <span>
                <strong className="text-gray-700 font-semibold">{t("activated")}:</strong>{" "}
                {activatedDate.toLocaleDateString()}
              </span>
            )}
            {renewDate && isActive && !cancelsAtPeriodEnd && (
              <span>
                <strong className="text-gray-700 font-semibold">{t("renews")}:</strong>{" "}
                {renewDate.toLocaleDateString()}
              </span>
            )}
            {renewDate && cancelsAtPeriodEnd && (
              <span className="text-amber-700">
                <strong className="font-semibold">{t("ends")}:</strong>{" "}
                {renewDate.toLocaleDateString()}
              </span>
            )}
            {renewDate && isPastDue && (
              <span className="text-rose-700">
                <strong className="font-semibold">{t("wasDue")}:</strong>{" "}
                {renewDate.toLocaleDateString()}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right: price + action */}
      <div className="flex-shrink-0 text-right">
        <div className="text-sm font-bold text-gray-900">
          {catalog.comingSoon ? (
            <span className="text-amber-700">{t("pricingTbd")}</span>
          ) : catalog.monthlyPriceCents === 0 ? (
            <span className="text-gray-500">{t("free")}</span>
          ) : (
            <>{formatCurrency(catalog.monthlyPriceCents / 100)}<span className="text-xs font-normal text-gray-500">/mo</span></>
          )}
        </div>
        {includedNote ? (
          <span
            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 mt-1"
            title={includedNote}
          >
            <CheckCircle2 className="w-3 h-3" />
            {t("alreadyIncluded")}
          </span>
        ) : (
          <Link
            href={`/admin/billing/add-ons${mine ? `?addon=${catalog.slug}` : ""}`}
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 mt-1"
          >
            {isActive || isPastDue ? t("manage") : isCancelled ? t("reSubscribe") : catalog.comingSoon ? t("learnMore") : t("subscribe")}
            <ExternalLink className="w-3 h-3" />
          </Link>
        )}
      </div>
    </li>
  );
}

/**
 * Marketplace add-on row — special-cased because Marketplace has TWO
 * billing modes (PAYG and Monthly) that need to be visible side-by-side
 * regardless of which one the restaurant is on. The generic AddOnRowItem
 * can't capture that — it assumes one price + one status per add-on.
 *
 * Layout: header (icon + name + active-plan pill) on top, then two
 * plan-card columns below — one for Monthly, one for PAYG. The active
 * plan is highlighted; the other shows as available with a switch link.
 *
 * Detection rules:
 *   - On Monthly:   has a RestaurantAddOn(slug=marketplace, status=active)
 *                   AND MarketplaceListing.billingMode = "monthly"
 *   - On PAYG:      NO RestaurantAddOn but MarketplaceListing exists
 *                   with billingMode = "payg" (typically when isListed=true)
 *   - Not on:       neither path active
 */
function MarketplaceAddOnRow({
  catalog,
  mine,
  listing,
}: {
  catalog: AddOnRow;
  mine: RestaurantAddOnRow | null;
  listing: MarketplaceListing | null;
}) {
  const t = useTranslations("admin.billing");
  const monthlyActive = !!mine && (mine.status === "active" || mine.status === "trialing");
  const paygActive = !monthlyActive && listing?.billingMode === "payg" && !!listing;
  const subscribedAnyMode = monthlyActive || paygActive;
  // Pending switch from Monthly to PAYG (set when the user clicks
  // "Switch to PAYG" on /admin/marketplace/payg-opt-in). Stripe sub
  // has cancel_at_period_end=true; the listing's flag mirrors that.
  // At period end the webhook flips billingMode to "payg" + clears
  // the flag. Surface "Switching to PAYG on <date>" in the meantime.
  const switchPending = monthlyActive && !!mine?.cancelAtPeriodEnd && !!listing?.switchToPaygOnCancel;

  const renewDate = mine?.currentPeriodEnd ? new Date(mine.currentPeriodEnd) : null;
  const activatedDate = mine?.activatedAt ? new Date(mine.activatedAt) : null;
  const monthStartDate = listing?.currentMonthStartedAt
    ? new Date(listing.currentMonthStartedAt)
    : null;

  // PAYG current-period spend: orders this period × $3, capped at $249.99.
  const paygOrdersThisPeriod = listing?.currentMonthOrders ?? 0;
  const paygChargeCents = Math.min(paygOrdersThisPeriod * PAYG_PER_ORDER_CENTS, PAYG_MONTHLY_CAP_CENTS);

  // Status pill at the header level. Surfaces which plan is active,
  // whether a switch is pending, or "Not subscribed — 2 plans available".
  const headerPillLabel = switchPending
    ? t("switchingToPayg")
    : monthlyActive
      ? t("activeMonthly")
      : paygActive
        ? t("activePayg")
        : t("notSubscribed");
  const headerPillClass = switchPending
    ? "bg-amber-100 text-amber-800"
    : subscribedAnyMode
      ? "bg-emerald-100 text-emerald-700"
      : "bg-gray-100 text-gray-500";

  return (
    <li className="p-4 sm:p-5">
      {/* Header */}
      <div className="flex items-start gap-4 mb-4">
        <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
          subscribedAnyMode ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
        }`}>
          {subscribedAnyMode ? <CheckCircle2 className="w-5 h-5" /> : <ShoppingBag className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-bold text-gray-900">{catalog.name}</div>
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${headerPillClass}`}>
              {subscribedAnyMode && <CheckCircle2 className="w-2.5 h-2.5" />}
              {headerPillLabel}
            </span>
          </div>
          <p className="text-xs text-gray-600 mt-1 leading-snug">
            {t("marketplaceDesc")}
          </p>
        </div>
      </div>

      {/* Two plan cards side-by-side. */}
      <div className="grid sm:grid-cols-2 gap-3">
        {/* Monthly plan */}
        <div className={`rounded-lg border p-3 ${
          monthlyActive ? "border-emerald-300 bg-emerald-50/50" : "border-gray-200 bg-white"
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <div className="text-sm font-bold text-gray-900">{t("monthlyUnlimited")}</div>
            {monthlyActive && (
              <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-500 text-white px-1.5 py-0.5 rounded">
                {t("current")}
              </span>
            )}
          </div>
          <div className="text-lg font-bold text-gray-900">
            $199.99<span className="text-xs font-normal text-gray-500">/mo</span>
          </div>
          <p className="text-[11px] text-gray-600 mt-1 leading-snug">
            {t("monthlyUnlimitedDesc")}
          </p>
          {monthlyActive ? (
            <div className="mt-2 space-y-1 text-[11px] text-gray-600">
              {activatedDate && (
                <div>
                  <strong className="text-gray-700 font-semibold">{t("activated")}:</strong>{" "}
                  {activatedDate.toLocaleDateString()}
                </div>
              )}
              {renewDate && !mine?.cancelAtPeriodEnd && (
                <div>
                  <strong className="text-gray-700 font-semibold">{t("renews")}:</strong>{" "}
                  {renewDate.toLocaleDateString()}
                </div>
              )}
              {renewDate && mine?.cancelAtPeriodEnd && (
                <div className="text-amber-700">
                  <strong className="font-semibold">{t("ends")}:</strong>{" "}
                  {renewDate.toLocaleDateString()}
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/admin/billing/add-ons?addon=marketplace"
              className="inline-block mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              {paygActive ? t("switchToMonthly") : t("subscribe")}
            </Link>
          )}
        </div>

        {/* PAYG plan */}
        <div className={`rounded-lg border p-3 ${
          paygActive ? "border-emerald-300 bg-emerald-50/50" : "border-gray-200 bg-white"
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <div className="text-sm font-bold text-gray-900">{t("payAsYouGo")}</div>
            {paygActive && (
              <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-500 text-white px-1.5 py-0.5 rounded">
                {t("current")}
              </span>
            )}
          </div>
          <div className="text-lg font-bold text-gray-900">
            $3<span className="text-xs font-normal text-gray-500">/order</span>
          </div>
          <p className="text-[11px] text-gray-600 mt-1 leading-snug">
            {t("paygDesc")}
          </p>
          {paygActive ? (
            <div className="mt-2 space-y-1 text-[11px] text-gray-600">
              <div>
                <strong className="text-gray-700 font-semibold">{t("thisPeriod")}:</strong>{" "}
                {paygOrdersThisPeriod} order{paygOrdersThisPeriod === 1 ? "" : "s"}{" "}
                · <strong>{formatCurrency(paygChargeCents / 100)}</strong>
                {paygChargeCents >= PAYG_MONTHLY_CAP_CENTS && (
                  <span className="text-emerald-700 font-semibold"> {t("paygCapReached")}</span>
                )}
              </div>
              {monthStartDate && (
                <div>
                  <strong className="text-gray-700 font-semibold">{t("periodStarted")}:</strong>{" "}
                  {monthStartDate.toLocaleDateString()}
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/admin/marketplace/payg-opt-in"
              className="inline-block mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              {monthlyActive ? t("switchToPayg") : t("startPayg")}
            </Link>
          )}
        </div>
      </div>

      {/* Manage marketplace listing link when subscribed in any mode. */}
      {subscribedAnyMode && (
        <div className="mt-3 text-right">
          <Link
            href="/admin/marketplace"
            className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
          >
            {t("manageMarketplaceListing")}
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      )}
    </li>
  );
}

function StatusPill({
  status,
  comingSoon,
  cancelsAtPeriodEnd,
}: {
  status: string | null;
  comingSoon: boolean;
  cancelsAtPeriodEnd: boolean;
}) {
  const t = useTranslations("admin.billing");
  if (comingSoon) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
        <Clock className="w-2.5 h-2.5" /> {t("comingSoon")}
      </span>
    );
  }
  if (status === "active" && cancelsAtPeriodEnd) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
        <Clock className="w-2.5 h-2.5" /> {t("cancelsSoon")}
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
        <CheckCircle2 className="w-2.5 h-2.5" /> {t("active")}
      </span>
    );
  }
  if (status === "past_due") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">
        <AlertTriangle className="w-2.5 h-2.5" /> {t("paymentFailed")}
      </span>
    );
  }
  if (status === "cancelled") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
        <XCircle className="w-2.5 h-2.5" /> {t("cancelled")}
      </span>
    );
  }
  if (status === "incomplete") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
        <Clock className="w-2.5 h-2.5" /> {t("setupIncomplete")}
      </span>
    );
  }
  // No subscription row at all
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
      {t("notSubscribed")}
    </span>
  );
}
