"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CreditCard, AlertTriangle, CheckCircle2, Clock, ExternalLink, Loader2,
  ShoppingBag, Plus, XCircle,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

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
  orderCapUsage,
}: {
  restaurant: Restaurant;
  addOnCatalog: AddOnRow[];
  restaurantAddOns: RestaurantAddOnRow[];
  marketplaceListing: MarketplaceListing | null;
  invoices: Invoice[];
  billingConfigured: boolean;
  orderCapUsage: {
    count: number;
    cap: number;
    exempt: boolean;
    resetAt: string | null;
    level: "ok" | "warning" | "cap_reached";
  };
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        setError(data.error || "Could not open billing portal");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Could not open billing portal");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Billing</h1>

      {!billingConfigured && (
        <div className="mb-6 rounded-xl bg-yellow-50 border border-yellow-200 p-4 text-sm text-yellow-800">
          Billing is not configured on the platform yet. Contact support.
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
            Update payment method
          </button>
        )}
        {restaurant.stripeCustomerId && (status === "active" || status === "past_due") && (
          <button
            onClick={openPortal}
            disabled={busy !== null || !billingConfigured}
            className="inline-flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-800 border border-gray-200 px-5 py-2.5 rounded-lg font-semibold text-sm transition disabled:opacity-50"
          >
            {busy === "portal" ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
            Manage subscription &amp; invoices in Stripe
          </button>
        )}
      </div>

      {/* ── Add-Ons overview ───────────────────────────────────────────
          Every add-on the platform offers, with this restaurant's status
          per add-on. Replaces the legacy "Available plans" picker — there
          are no plans to switch between under the FREE-by-default model,
          only add-ons to subscribe to (or unsubscribe from). */}
      <div className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Add-ons</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Every paid feature you can add to your FREE plan.
              Browse the full catalog to subscribe.
            </p>
          </div>
          <Link
            href="/admin/billing/add-ons"
            className="inline-flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 text-white px-3.5 py-2 rounded-lg font-semibold text-xs transition"
          >
            <Plus className="w-3.5 h-3.5" />
            Browse add-ons
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
                />
              ),
            )}
            {mergedAddOns.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-gray-500">
                No add-ons configured on the platform yet.
              </li>
            )}
          </ul>
        </div>
      </div>

      {invoices.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Recent invoices</h2>
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
                      {inv.hostedInvoiceUrl && (
                        <a
                          href={inv.hostedInvoiceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-700 text-xs font-semibold inline-flex items-center gap-1 mt-1"
                        >
                          View <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Desktop: table */}
            <table className="w-full text-sm hidden sm:table">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Amount</th>
                  <th className="px-4 py-3 text-left">Status</th>
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
                      {inv.hostedInvoiceUrl && (
                        <a
                          href={inv.hostedInvoiceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-700 text-xs font-medium inline-flex items-center gap-1"
                        >
                          View <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
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
  const resetDate = usage.resetAt
    ? new Date(usage.resetAt).toLocaleDateString(undefined, { month: "long", day: "numeric" })
    : null;

  if (usage.exempt) {
    return (
      <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-100 p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-emerald-900 text-sm mb-1">Unlimited orders</h3>
            <p className="text-xs text-emerald-800">
              You have an active paid add-on, so the 100-orders/month FREE-plan cap doesn&apos;t
              apply. This month so far: <strong>{usage.count} orders</strong>.
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
        <h3 className="font-bold text-gray-900 text-sm">This month&apos;s orders</h3>
        <div className="text-xs text-gray-600">
          <span className="font-bold text-gray-900">{usage.count}</span>
          <span className="text-gray-500"> / {usage.cap} included</span>
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
            ? `Cap reached — new orders paused until ${resetDate ?? "next month"}.`
            : usage.level === "warning"
              ? `Heads up — you'll hit the cap soon. Resets ${resetDate ?? "next month"}.`
              : `Resets ${resetDate ?? "next month"}. Subscribe to any paid add-on for unlimited orders.`}
        </p>
        {usage.level !== "ok" && (
          <Link
            href="/admin/billing/add-ons?addon=unlimited_orders"
            className="text-[11px] font-semibold text-blue-600 hover:text-blue-700 whitespace-nowrap"
          >
            Upgrade →
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
  if (status === "free") {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="font-bold text-emerald-900 mb-1">FREE plan</h2>
            <p className="text-sm text-emerald-800">
              You&apos;re on the <strong>FREE plan</strong> — accept up to 100 orders/month at no cost,
              forever. Need more? Subscribe to any paid add-on, or upgrade to FREE Unlimited Orders
              for $14.99/month to take the cap off.
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
            <h2 className="font-bold text-red-900 mb-1">Your last payment failed</h2>
            <p className="text-sm text-red-800">
              Update your card via the billing portal to restore service. The FREE plan
              keeps working in the meantime, but any paid add-ons are paused until payment clears.
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
            <h2 className="font-bold text-gray-900 mb-1">Subscription cancelled</h2>
            <p className="text-sm text-gray-700">
              All paid add-ons are off. You&apos;re back on the FREE plan — 100 orders/month
              included. Re-subscribe to any add-on any time.
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
              Active — paid add-ons on file
            </h2>
            <p className="text-sm text-green-800">
              {cancelAtPeriodEnd
                ? `Subscription cancels at end of period${periodEnd ? ` (${periodEnd.toLocaleDateString()})` : ""}.`
                : periodEnd
                  ? `Next billing date: ${periodEnd.toLocaleDateString()}.`
                  : "Subscription active. Manage add-ons below."}
            </p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-gray-50 border border-gray-200 p-5">
      <h2 className="font-bold text-gray-900 mb-1">Subscription status: {status}</h2>
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
}: {
  catalog: AddOnRow;
  mine: RestaurantAddOnRow | null;
}) {
  // Normalize legacy "trialing" status to "active" — trial concept is dead.
  const status = mine && mine.status === "trialing" ? "active" : mine?.status ?? null;
  const isActive = status === "active";
  const isPastDue = status === "past_due";
  const isCancelled = status === "cancelled";
  const cancelsAtPeriodEnd = !!mine?.cancelAtPeriodEnd;
  const renewDate = mine?.currentPeriodEnd ? new Date(mine.currentPeriodEnd) : null;
  const activatedDate = mine?.activatedAt ? new Date(mine.activatedAt) : null;

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
                <strong className="text-gray-700 font-semibold">Activated:</strong>{" "}
                {activatedDate.toLocaleDateString()}
              </span>
            )}
            {renewDate && isActive && !cancelsAtPeriodEnd && (
              <span>
                <strong className="text-gray-700 font-semibold">Renews:</strong>{" "}
                {renewDate.toLocaleDateString()}
              </span>
            )}
            {renewDate && cancelsAtPeriodEnd && (
              <span className="text-amber-700">
                <strong className="font-semibold">Ends:</strong>{" "}
                {renewDate.toLocaleDateString()}
              </span>
            )}
            {renewDate && isPastDue && (
              <span className="text-rose-700">
                <strong className="font-semibold">Was due:</strong>{" "}
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
            <span className="text-amber-700">Pricing TBD</span>
          ) : catalog.monthlyPriceCents === 0 ? (
            <span className="text-gray-500">Free</span>
          ) : (
            <>{formatCurrency(catalog.monthlyPriceCents / 100)}<span className="text-xs font-normal text-gray-500">/mo</span></>
          )}
        </div>
        <Link
          href={`/admin/billing/add-ons${mine ? `?addon=${catalog.slug}` : ""}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 mt-1"
        >
          {isActive || isPastDue ? "Manage" : isCancelled ? "Re-subscribe" : catalog.comingSoon ? "Learn more" : "Subscribe"}
          <ExternalLink className="w-3 h-3" />
        </Link>
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
  const monthlyActive = !!mine && (mine.status === "active" || mine.status === "trialing");
  const paygActive = !monthlyActive && listing?.billingMode === "payg" && !!listing;
  const subscribedAnyMode = monthlyActive || paygActive;

  const renewDate = mine?.currentPeriodEnd ? new Date(mine.currentPeriodEnd) : null;
  const activatedDate = mine?.activatedAt ? new Date(mine.activatedAt) : null;
  const monthStartDate = listing?.currentMonthStartedAt
    ? new Date(listing.currentMonthStartedAt)
    : null;

  // PAYG current-period spend: orders this period × $3, capped at $249.99.
  const paygOrdersThisPeriod = listing?.currentMonthOrders ?? 0;
  const paygChargeCents = Math.min(paygOrdersThisPeriod * PAYG_PER_ORDER_CENTS, PAYG_MONTHLY_CAP_CENTS);

  // Status pill at the header level. Surfaces which plan is active OR
  // a "Not subscribed — 2 plans available" hint when neither is active.
  const headerPillLabel = monthlyActive
    ? "Active — Monthly"
    : paygActive
      ? "Active — Pay-As-You-Go"
      : "Not subscribed";
  const headerPillClass = subscribedAnyMode
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
            List your restaurant on the public Fee Free Marketplace.
            Choose the plan that fits your volume — switch any time.
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
            <div className="text-sm font-bold text-gray-900">Monthly Unlimited</div>
            {monthlyActive && (
              <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-500 text-white px-1.5 py-0.5 rounded">
                Current
              </span>
            )}
          </div>
          <div className="text-lg font-bold text-gray-900">
            $199.99<span className="text-xs font-normal text-gray-500">/mo</span>
          </div>
          <p className="text-[11px] text-gray-600 mt-1 leading-snug">
            Unlimited marketplace orders. ShipDay Driver Pool included. Predictable bill, no surprises.
          </p>
          {monthlyActive ? (
            <div className="mt-2 space-y-1 text-[11px] text-gray-600">
              {activatedDate && (
                <div>
                  <strong className="text-gray-700 font-semibold">Activated:</strong>{" "}
                  {activatedDate.toLocaleDateString()}
                </div>
              )}
              {renewDate && !mine?.cancelAtPeriodEnd && (
                <div>
                  <strong className="text-gray-700 font-semibold">Renews:</strong>{" "}
                  {renewDate.toLocaleDateString()}
                </div>
              )}
              {renewDate && mine?.cancelAtPeriodEnd && (
                <div className="text-amber-700">
                  <strong className="font-semibold">Ends:</strong>{" "}
                  {renewDate.toLocaleDateString()}
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/admin/billing/add-ons?addon=marketplace"
              className="inline-block mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              {paygActive ? "Switch to Monthly →" : "Subscribe →"}
            </Link>
          )}
        </div>

        {/* PAYG plan */}
        <div className={`rounded-lg border p-3 ${
          paygActive ? "border-emerald-300 bg-emerald-50/50" : "border-gray-200 bg-white"
        }`}>
          <div className="flex items-center gap-2 mb-1">
            <div className="text-sm font-bold text-gray-900">Pay-As-You-Go</div>
            {paygActive && (
              <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-500 text-white px-1.5 py-0.5 rounded">
                Current
              </span>
            )}
          </div>
          <div className="text-lg font-bold text-gray-900">
            $3<span className="text-xs font-normal text-gray-500">/order</span>
          </div>
          <p className="text-[11px] text-gray-600 mt-1 leading-snug">
            Pay only when you get a marketplace order. Capped at $249.99/month — past that, the rest is free. Driver Pool sold separately.
          </p>
          {paygActive ? (
            <div className="mt-2 space-y-1 text-[11px] text-gray-600">
              <div>
                <strong className="text-gray-700 font-semibold">This period:</strong>{" "}
                {paygOrdersThisPeriod} order{paygOrdersThisPeriod === 1 ? "" : "s"}{" "}
                · <strong>{formatCurrency(paygChargeCents / 100)}</strong>
                {paygChargeCents >= PAYG_MONTHLY_CAP_CENTS && (
                  <span className="text-emerald-700 font-semibold"> (cap reached — free from here)</span>
                )}
              </div>
              {monthStartDate && (
                <div>
                  <strong className="text-gray-700 font-semibold">Period started:</strong>{" "}
                  {monthStartDate.toLocaleDateString()}
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/admin/marketplace/payg-opt-in"
              className="inline-block mt-2 text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              {monthlyActive ? "Switch to Pay-As-You-Go →" : "Start Pay-As-You-Go →"}
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
            Manage marketplace listing
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
  if (comingSoon) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
        <Clock className="w-2.5 h-2.5" /> Coming Soon
      </span>
    );
  }
  if (status === "active" && cancelsAtPeriodEnd) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
        <Clock className="w-2.5 h-2.5" /> Cancels soon
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
        <CheckCircle2 className="w-2.5 h-2.5" /> Active
      </span>
    );
  }
  if (status === "past_due") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">
        <AlertTriangle className="w-2.5 h-2.5" /> Payment failed
      </span>
    );
  }
  if (status === "cancelled") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
        <XCircle className="w-2.5 h-2.5" /> Cancelled
      </span>
    );
  }
  if (status === "incomplete") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
        <Clock className="w-2.5 h-2.5" /> Setup incomplete
      </span>
    );
  }
  // No subscription row at all
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
      Not subscribed
    </span>
  );
}
