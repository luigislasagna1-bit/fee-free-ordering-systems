"use client";

import { useState } from "react";
import {
  Eye, ExternalLink, Loader2,
  CreditCard, Globe, Link2, Megaphone, Smartphone, Store,
  Calendar, Building2, MapPin, Mail, Phone,
} from "lucide-react";
import { formatCurrency , PLATFORM_CURRENCY } from "@/lib/utils";

type AddOnRow = {
  id: string;
  status: string;
  activatedAt: string;
  currentPeriodEnd: string | null;
  addOn: { slug: string; name: string; description: string | null; monthlyPriceCents: number };
};

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  subscriptionPlan: { name: string; price: number } | null;
  addOns: AddOnRow[];
};

type Commission = {
  id: string;
  createdAt: string;
  commissionCents: number;
  netRevenueCents: number;
  ratePercent: number;
  status: string;
  subscriptionInvoice: { paidAt: string | null };
};

const ADDON_ICON_MAP: Record<string, { Icon: React.ComponentType<{ className?: string }>; color: string }> = {
  online_payments:      { Icon: CreditCard, color: "#10b981" },
  hosted_website:       { Icon: Globe,      color: "#3b82f6" },
  custom_domain:        { Icon: Link2,      color: "#8b5cf6" },
  advanced_promos:      { Icon: Megaphone,  color: "#ec4899" },
  branded_mobile_app:   { Icon: Smartphone, color: "#f59e0b" },
  pos_module:           { Icon: Store,      color: "#06b6d4" },
  reservation_deposits: { Icon: Calendar,   color: "#ef4444" },
  multi_location:       { Icon: Building2,  color: "#0ea5e9" },
};

export function RestaurantDetailClient({
  restaurant,
  commissions,
  sumByStatus,
}: {
  restaurant: Restaurant;
  commissions: Commission[];
  sumByStatus: Record<string, number>;
}) {
  const [impersonating, setImpersonating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function impersonate() {
    setImpersonating(true);
    setError(null);
    try {
      const res = await fetch("/api/reseller/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: restaurant.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not impersonate");
        return;
      }
      window.location.href = "/admin";
    } catch {
      setError("Could not impersonate");
    } finally {
      setImpersonating(false);
    }
  }

  const addressLine = [restaurant.address, restaurant.city, restaurant.state, restaurant.zip]
    .filter(Boolean)
    .join(", ");

  const lifetimeEarned =
    (sumByStatus.paid ?? 0) +
    (sumByStatus.available ?? 0) +
    (sumByStatus.pending ?? 0) -
    (sumByStatus.reversed ?? 0);
  const pendingHold = sumByStatus.pending ?? 0;
  const availableNow = sumByStatus.available ?? 0;
  const paidOut = sumByStatus.paid ?? 0;

  return (
    <div>
      {/* Header card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h1 className="text-2xl font-bold text-gray-900">{restaurant.name}</h1>
              <StatusBadge status={restaurant.subscriptionStatus} />
              <span className="inline-flex items-center text-[10px] uppercase tracking-wider font-bold bg-slate-900 text-white rounded-full px-2 py-0.5">
                Affiliate
              </span>
            </div>
            <div className="text-sm text-gray-500 space-y-0.5">
              {addressLine && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" />
                  {addressLine}
                </div>
              )}
              {restaurant.phone && (
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5" />
                  {restaurant.phone}
                </div>
              )}
              {restaurant.email && (
                <div className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5" />
                  {restaurant.email}
                </div>
              )}
              <div className="text-xs text-gray-400 mt-2">
                Signed up {new Date(restaurant.createdAt).toLocaleDateString()}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={impersonate}
              disabled={impersonating}
              className="inline-flex items-center gap-1.5 text-sm bg-gray-900 hover:bg-gray-800 text-white px-3 py-2 rounded-lg font-semibold transition disabled:opacity-50"
            >
              {impersonating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              View as
            </button>
            <a
              href={`/order/${restaurant.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-lg font-semibold transition"
            >
              <ExternalLink className="w-4 h-4" />
              Ordering page
            </a>
          </div>
        </div>
        {error && (
          <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-700">{error}</div>
        )}
      </div>

      {/* Commission summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <SummaryStat label="Lifetime earned" value={formatCurrency(lifetimeEarned / 100, PLATFORM_CURRENCY)} tone="emerald" />
        <SummaryStat label="On 7-day hold" value={formatCurrency(pendingHold / 100, PLATFORM_CURRENCY)} tone="amber" />
        <SummaryStat label="Available now" value={formatCurrency(availableNow / 100, PLATFORM_CURRENCY)} tone="blue" />
        <SummaryStat label="Already paid out" value={formatCurrency(paidOut / 100, PLATFORM_CURRENCY)} tone="slate" />
      </div>

      {/* Services / add-ons */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mb-4">
        <h2 className="text-sm font-bold text-gray-900 mb-3">Active services</h2>
        {restaurant.addOns.length === 0 ? (
          <div className="text-sm text-gray-500 py-4 text-center bg-gray-50 rounded-lg">
            No paid add-ons yet. Restaurants without add-ons don&apos;t count toward your commission tier — encourage them to activate at least one (Online Payments is usually the first step).
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {restaurant.addOns.map((row) => {
              const mapped = ADDON_ICON_MAP[row.addOn.slug];
              const Icon = mapped?.Icon ?? Store;
              const color = mapped?.color ?? "#6b7280";
              return (
                <div key={row.id} className="rounded-xl border border-gray-200 p-3 bg-gray-50/50">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0"
                      style={{ backgroundColor: `${color}22`, color }}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900 truncate">{row.addOn.name}</div>
                      <div className="text-[11px] text-gray-500">
                        {formatCurrency(row.addOn.monthlyPriceCents / 100, PLATFORM_CURRENCY)}/mo · {row.status}
                      </div>
                    </div>
                  </div>
                  {row.addOn.description && (
                    <div className="text-[11px] text-gray-500 leading-relaxed mt-1">
                      {row.addOn.description}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent commissions */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-sm font-bold text-gray-900">Recent commission events</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Latest 10 paid subscription invoices for this restaurant. Pending rows are still in the 7-day hold.
          </p>
        </div>
        {commissions.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-gray-500">
            No commission events yet. Once this restaurant pays an invoice — and you have 5+ active restaurants each with a paid add-on — commissions start showing up here.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-6 py-3 text-left">Date</th>
                <th className="px-6 py-3 text-right">Net revenue</th>
                <th className="px-6 py-3 text-right">Rate</th>
                <th className="px-6 py-3 text-right">Commission</th>
                <th className="px-6 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {commissions.map((c) => {
                const dt = c.subscriptionInvoice.paidAt
                  ? new Date(c.subscriptionInvoice.paidAt)
                  : new Date(c.createdAt);
                return (
                  <tr key={c.id} className="border-t border-gray-100">
                    <td className="px-6 py-3 text-gray-700">{dt.toLocaleDateString()}</td>
                    <td className="px-6 py-3 text-right text-gray-700">
                      {formatCurrency(c.netRevenueCents / 100, PLATFORM_CURRENCY)}
                    </td>
                    <td className="px-6 py-3 text-right text-gray-700">{c.ratePercent}%</td>
                    <td className="px-6 py-3 text-right font-bold text-emerald-700">
                      {formatCurrency(c.commissionCents / 100, PLATFORM_CURRENCY)}
                    </td>
                    <td className="px-6 py-3">
                      <CommissionStatusBadge status={c.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone: "emerald" | "amber" | "blue" | "slate" }) {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700",
    amber: "bg-amber-50 border-amber-200 text-amber-700",
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    slate: "bg-slate-50 border-slate-200 text-slate-700",
  };
  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <div className="text-[10px] uppercase tracking-wider font-bold opacity-70 mb-0.5">{label}</div>
      <div className="text-xl font-extrabold">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status === "trialing" ? "free" : status;
  const styles: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    free: "bg-amber-100 text-amber-800",
    past_due: "bg-red-100 text-red-700",
    cancelled: "bg-gray-100 text-gray-600",
    incomplete: "bg-gray-100 text-gray-600",
    paused: "bg-gray-100 text-gray-600",
  };
  const label = normalized === "free" ? "FREE plan" : normalized;
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[normalized] ?? "bg-gray-100 text-gray-600"}`}>
      {label}
    </span>
  );
}

function CommissionStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    available: "bg-blue-100 text-blue-700",
    paid: "bg-emerald-100 text-emerald-700",
    reversed: "bg-rose-100 text-rose-700",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}
