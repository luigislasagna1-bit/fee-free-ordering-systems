"use client";

import { useState } from "react";
import { CreditCard, AlertTriangle, CheckCircle2, Clock, ExternalLink, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type Plan = {
  id: string;
  name: string;
  slug: string;
  price: number;
  interval: string;
  description: string | null;
  features: string | null;
  stripePriceId: string | null;
  syncStatus: string;
};

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
  subscriptionPlanId: string | null;
  subscriptionPlan: Plan | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
};

export function BillingClient({
  restaurant,
  plans,
  invoices,
  billingConfigured,
}: {
  restaurant: Restaurant;
  plans: Plan[];
  invoices: Invoice[];
  billingConfigured: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Legacy "trialing" rows are treated as "free" — we no longer offer
  // a trial concept. Normalize at the top so all the branches below
  // only have to think about: free | active | past_due | cancelled.
  const rawStatus = restaurant.subscriptionStatus;
  const status = rawStatus === "trialing" ? "free" : rawStatus;
  const periodEnd = restaurant.currentPeriodEnd ? new Date(restaurant.currentPeriodEnd) : null;

  async function startCheckout(planId?: string) {
    setBusy("checkout");
    setError(null);
    try {
      const res = await fetch("/api/admin/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || "Could not start checkout");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Could not start checkout");
    } finally {
      setBusy(null);
    }
  }

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

  async function changePlan(planId: string) {
    if (planId === restaurant.subscriptionPlanId) return;
    if (!confirm("Switch to this plan? Proration will be applied on your next invoice.")) return;
    setBusy(`plan-${planId}`);
    setError(null);
    try {
      const res = await fetch("/api/admin/billing/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not change plan");
        return;
      }
      window.location.reload();
    } catch {
      setError("Could not change plan");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Billing & Plan</h1>

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

      <StatusCard
        status={status}
        periodEnd={periodEnd}
        cancelAtPeriodEnd={restaurant.cancelAtPeriodEnd}
        planName={restaurant.subscriptionPlan?.name}
        planPrice={restaurant.subscriptionPlan?.price}
      />

      <div className="mt-6 flex flex-wrap gap-3">
        {(status === "free" || status === "cancelled") && (
          <button
            onClick={() => startCheckout()}
            disabled={busy !== null || !billingConfigured}
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-2.5 rounded-lg font-semibold text-sm transition disabled:opacity-50"
          >
            {busy === "checkout" ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
            {status === "cancelled" ? "Reactivate subscription" : "Upgrade to a paid plan"}
          </button>
        )}
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
            Manage subscription
          </button>
        )}
      </div>

      <div className="mt-10">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Available plans</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => {
            const features: string[] = (() => {
              try {
                return plan.features ? JSON.parse(plan.features) : [];
              } catch {
                return [];
              }
            })();
            const current = plan.id === restaurant.subscriptionPlanId;
            return (
              <div
                key={plan.id}
                className={`rounded-xl border p-5 bg-white transition ${
                  current ? "border-emerald-500 ring-2 ring-emerald-200" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-bold text-gray-900">{plan.name}</h3>
                  {current && (
                    <span className="text-[10px] font-bold uppercase tracking-wide bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                      Current
                    </span>
                  )}
                </div>
                <div className="text-2xl font-bold text-gray-900 mb-1">
                  {formatCurrency(plan.price)}
                  <span className="text-sm font-normal text-gray-500">/{plan.interval}</span>
                </div>
                {plan.description && (
                  <p className="text-sm text-gray-600 mb-3">{plan.description}</p>
                )}
                {features.length > 0 && (
                  <ul className="space-y-1.5 mb-4">
                    {features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {!current && status === "active" && (
                  <button
                    onClick={() => changePlan(plan.id)}
                    disabled={busy !== null || !plan.stripePriceId}
                    className="w-full bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50"
                    title={plan.stripePriceId ? undefined : "Plan not synced to Stripe yet"}
                  >
                    {busy === `plan-${plan.id}` ? "Switching..." : "Switch to this plan"}
                  </button>
                )}
                {!current && status !== "active" && (
                  <button
                    onClick={() => startCheckout(plan.id)}
                    disabled={busy !== null || !plan.stripePriceId}
                    className="w-full bg-gray-900 hover:bg-gray-800 text-white text-sm font-semibold px-4 py-2 rounded-lg transition disabled:opacity-50"
                  >
                    {status === "free" ? "Upgrade" : "Subscribe"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {invoices.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Recent invoices</h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Mobile: card layout — invoice table has 4 columns including
                a tiny action button; way easier to read as stacked cards
                on a phone. */}
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

            {/* Desktop: traditional table */}
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

function StatusCard({
  status,
  periodEnd,
  cancelAtPeriodEnd,
  planName,
  planPrice,
}: {
  status: string;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  planName: string | undefined;
  planPrice: number | undefined;
}) {
  if (status === "free") {
    return (
      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="font-bold text-emerald-900 mb-1">FREE plan</h2>
            <p className="text-sm text-emerald-800">
              You&apos;re on the <strong>FREE plan</strong> — accept up to 100 orders/month at no cost.
              Need more? Subscribe to any paid add-on, or upgrade to FREE Unlimited Orders
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
              Update your card via the billing portal to restore service.
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
              Reactivate any time to pick up where you left off.
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
              {planName || "Active"} plan
              {planPrice ? ` — ${formatCurrency(planPrice)}/month` : ""}
            </h2>
            <p className="text-sm text-green-800">
              {cancelAtPeriodEnd
                ? `Cancels at end of period${periodEnd ? ` (${periodEnd.toLocaleDateString()})` : ""}.`
                : periodEnd
                  ? `Next billing date: ${periodEnd.toLocaleDateString()}.`
                  : "Subscription active."}
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
