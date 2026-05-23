"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Store,
  ShoppingBag,
  DollarSign,
  Clock,
  Plus,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Copy,
  Check,
  X,
} from "lucide-react";
import type { BrandSummary } from "@/lib/brand";

/**
 * Brand-level admin dashboard. Renders when the owner is focused on the
 * parent of a multi-location chain (no active_location cookie drilling
 * into a specific child).
 *
 * What it shows:
 *   - Overview cards: aggregated stats across every location in the brand
 *   - Locations grid: each location as a tile with quick stats + Manage button
 *   - Invite-new-location button → opens a modal that generates an invite
 *     link (and optionally sends an email to a co-owner / manager)
 */
export function BrandDashboardClient({ summary }: { summary: BrandSummary }) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);

  // Aggregate the per-location stats into top-line cards
  const totalPending = summary.locations.reduce((s, l) => s + l.stats.pendingOrders, 0);
  const totalOrdersToday = summary.locations.reduce((s, l) => s + l.stats.totalOrdersToday, 0);
  const totalRevenueToday = summary.locations.reduce((s, l) => s + l.stats.revenueToday, 0);
  const publishedCount = summary.locations.filter((l) => l.isPublished).length;

  async function switchToLocation(locationId: string) {
    // Reuse the existing /api/restaurants/locations/switch route.
    // After the cookie is set, hard-reload to /admin so the page re-resolves
    // the active restaurantId and renders the per-location dashboard.
    await fetch("/api/restaurants/locations/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restaurantId: locationId }),
    });
    window.location.href = "/admin";
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold uppercase tracking-wide mb-2">
            <Building2 className="w-3.5 h-3.5" /> Brand dashboard
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{summary.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {summary.locations.length} location{summary.locations.length === 1 ? "" : "s"} ·{" "}
            {publishedCount} published
          </p>
        </div>
        <button
          onClick={() => setInviteOpen(true)}
          className="bg-emerald-500 hover:bg-emerald-600 text-white font-semibold px-5 py-2.5 rounded-xl shadow-sm hover:shadow-md transition flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Invite new location
        </button>
      </div>

      {/* ─── Top-line stats ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Pending orders"
          value={totalPending.toString()}
          icon={Clock}
          color="amber"
          subtext={totalPending > 0 ? "Needs attention" : "All clear"}
        />
        <StatCard
          label="Orders today"
          value={totalOrdersToday.toString()}
          icon={ShoppingBag}
          color="blue"
          subtext="Across all locations"
        />
        <StatCard
          label="Revenue today"
          value={`$${totalRevenueToday.toFixed(2)}`}
          icon={DollarSign}
          color="green"
          subtext="Across all locations"
        />
        <StatCard
          label="Locations"
          value={`${publishedCount}/${summary.locations.length}`}
          icon={Store}
          color="purple"
          subtext={`${publishedCount} live · ${summary.locations.length - publishedCount} setup`}
        />
      </div>

      {/* ─── Locations grid ─────────────────────────────────────── */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-3">Your locations</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {summary.locations.map((loc) => (
            <button
              key={loc.id}
              onClick={() => switchToLocation(loc.id)}
              className="text-left bg-white border border-gray-200 rounded-2xl p-5 hover:border-emerald-300 hover:shadow-md transition group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-gray-900 truncate">{loc.name}</h3>
                    {loc.isParent && (
                      <span className="text-[10px] uppercase tracking-wider text-emerald-600 font-bold bg-emerald-100 px-2 py-0.5 rounded">
                        Brand HQ
                      </span>
                    )}
                  </div>
                  {loc.city && (
                    <p className="text-xs text-gray-500 mt-0.5 truncate">{loc.city}</p>
                  )}
                </div>
                {loc.isPublished ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded whitespace-nowrap">
                    <CheckCircle2 className="w-3 h-3" /> Live
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded whitespace-nowrap">
                    <AlertCircle className="w-3 h-3" /> Setup
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-gray-100">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500">Pending</div>
                  <div className={`text-lg font-bold ${loc.stats.pendingOrders > 0 ? "text-amber-600" : "text-gray-400"}`}>
                    {loc.stats.pendingOrders}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500">Today</div>
                  <div className="text-lg font-bold text-gray-900">{loc.stats.totalOrdersToday}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500">Revenue</div>
                  <div className="text-lg font-bold text-gray-900">
                    ${loc.stats.revenueToday.toFixed(0)}
                  </div>
                </div>
              </div>

              <div className="mt-4 text-xs font-medium text-emerald-600 group-hover:underline flex items-center gap-1">
                Manage location <ExternalLink className="w-3 h-3" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ─── What's NEXT row (placeholder for Phase 2) ─────────── */}
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
        <h3 className="font-bold text-gray-900 mb-2">Coming next</h3>
        <ul className="text-sm text-gray-700 space-y-1">
          <li>📋 Master menu — edit once, push to selected locations (Phase 2)</li>
          <li>📊 Cross-location reports — which location is your top performer?</li>
          <li>📣 Chain-wide promos — run one campaign across every location</li>
        </ul>
      </div>

      {inviteOpen && (
        <InviteLocationModal
          brandId={summary.id}
          brandName={summary.name}
          onClose={() => setInviteOpen(false)}
          onSent={() => {
            setInviteOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ─── Stat card ─────────────────────────────────────────────────────────────

const COLOR_MAP = {
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  green: "bg-green-50 text-green-700 border-green-200",
  purple: "bg-purple-50 text-purple-700 border-purple-200",
} as const;

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  subtext,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  color: keyof typeof COLOR_MAP;
  subtext?: string;
}) {
  return (
    <div className={`border rounded-2xl p-4 ${COLOR_MAP[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider opacity-80">{label}</span>
        <Icon className="w-4 h-4 opacity-60" />
      </div>
      <div className="text-2xl font-bold">{value}</div>
      {subtext && <div className="text-[11px] opacity-70 mt-0.5">{subtext}</div>}
    </div>
  );
}

// ─── Invite location modal ────────────────────────────────────────────────

function InviteLocationModal({
  brandId,
  brandName,
  onClose,
  onSent,
}: {
  brandId: string;
  brandName: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [email, setEmail] = useState("");
  const [suggestedName, setSuggestedName] = useState("");
  const [sending, setSending] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/locations/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email || null, suggestedName: suggestedName || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Failed to create invite");
        return;
      }
      setGeneratedUrl(data.url);
    } catch (e: any) {
      setError(e?.message || "Failed to create invite");
    } finally {
      setSending(false);
    }
  }

  async function copyUrl() {
    if (!generatedUrl) return;
    try {
      await navigator.clipboard.writeText(generatedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Invite a new location</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          {!generatedUrl ? (
            <>
              <p className="text-sm text-gray-600">
                Generate a signup link for a new location under <strong>{brandName}</strong>.
                The recipient completes the standard signup flow with their own email + password;
                a new Restaurant gets created and linked to your brand automatically.
              </p>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Recipient email <span className="text-gray-400 font-normal">(optional — emails them the link)</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="manager@brooklyn.example.com"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Suggested location name <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={suggestedName}
                  onChange={(e) => setSuggestedName(e.target.value)}
                  placeholder="Brooklyn Branch"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />{error}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  Invite created.
                  {email
                    ? ` We emailed it to ${email}.`
                    : " Copy the link below and share it with the new location's owner."}
                </span>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Signup link</label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={generatedUrl}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs bg-gray-50 focus:outline-none"
                  />
                  <button
                    onClick={copyUrl}
                    className="px-3 py-2 text-xs font-semibold bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-1"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">
                  Link expires in 30 days. Single-use — once they complete signup it can't be reused.
                </p>
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          {!generatedUrl ? (
            <>
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
              <button
                onClick={generate}
                disabled={sending}
                className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50 flex items-center gap-2"
              >
                {sending && <Loader2 className="w-4 h-4 animate-spin" />}
                {sending ? "Creating…" : "Create invite"}
              </button>
            </>
          ) : (
            <button
              onClick={onSent}
              className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold rounded-lg"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
