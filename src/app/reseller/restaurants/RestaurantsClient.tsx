"use client";

import { useState } from "react";
import { Plus, ExternalLink, Loader2, Eye, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type Restaurant = {
  id: string;
  name: string;
  slug: string;
  email: string | null;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  createdAt: string;
  subscriptionPlan: { name: string; price: number } | null;
};

export function RestaurantsClient({ initial }: { initial: Restaurant[] }) {
  const [restaurants, setRestaurants] = useState(initial);
  const [showInvite, setShowInvite] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteForm, setInviteForm] = useState({
    restaurantName: "",
    ownerName: "",
    ownerEmail: "",
    phone: "",
  });

  async function submitInvite() {
    setBusy("invite");
    setError(null);
    try {
      const res = await fetch("/api/reseller/restaurants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inviteForm),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not send invite");
        return;
      }
      // Refetch list
      const list = await fetch("/api/reseller/restaurants").then((r) => r.json());
      setRestaurants(list.restaurants ?? []);
      setShowInvite(false);
      setInviteForm({ restaurantName: "", ownerName: "", ownerEmail: "", phone: "" });
    } catch {
      setError("Could not send invite");
    } finally {
      setBusy(null);
    }
  }

  async function impersonate(restaurantId: string) {
    setBusy(`imp-${restaurantId}`);
    setError(null);
    try {
      const res = await fetch("/api/reseller/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId }),
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
      setBusy(null);
    }
  }

  return (
    <div className="max-w-6xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Restaurants</h1>
          <p className="text-sm text-gray-500">All restaurants you've signed up.</p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          <Plus className="w-4 h-4" /> Invite restaurant
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">Restaurant</th>
              <th className="px-4 py-3 text-left">Plan</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Next bill</th>
              <th className="px-4 py-3 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {restaurants.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">
                  No restaurants yet. Click "Invite restaurant" to add your first one — or share your referral
                  link from the dashboard.
                </td>
              </tr>
            )}
            {restaurants.map((r) => {
              const billingDate = r.currentPeriodEnd
                ? new Date(r.currentPeriodEnd)
                : r.trialEndsAt
                ? new Date(r.trialEndsAt)
                : null;
              return (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900">{r.name}</div>
                    <div className="text-xs text-gray-500">{r.email ?? "—"}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-gray-700">{r.subscriptionPlan?.name ?? "—"}</div>
                    {r.subscriptionPlan && (
                      <div className="text-xs text-gray-500">
                        {formatCurrency(r.subscriptionPlan.price)}/month
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.subscriptionStatus} />
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    {billingDate ? billingDate.toLocaleDateString() : "—"}
                    {r.subscriptionStatus === "trialing" && (
                      <div className="text-xs text-gray-500">trial ends</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => impersonate(r.id)}
                        disabled={busy !== null}
                        className="inline-flex items-center gap-1 text-xs bg-gray-900 hover:bg-gray-800 text-white px-2.5 py-1.5 rounded-md font-semibold transition disabled:opacity-50"
                        title="Open this restaurant's admin dashboard"
                      >
                        {busy === `imp-${r.id}` ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Eye className="w-3 h-3" />
                        )}
                        View as
                      </button>
                      <a
                        href={`/order/${r.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 px-2 py-1.5"
                        title="Open public ordering page"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showInvite && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Invite a restaurant</h2>
              <button onClick={() => setShowInvite(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              We'll create the account and email the owner a link to set their password.
            </p>
            <div className="space-y-3">
              <Field label="Restaurant name">
                <input
                  type="text"
                  value={inviteForm.restaurantName}
                  onChange={(e) => setInviteForm({ ...inviteForm, restaurantName: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </Field>
              <Field label="Owner name">
                <input
                  type="text"
                  value={inviteForm.ownerName}
                  onChange={(e) => setInviteForm({ ...inviteForm, ownerName: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </Field>
              <Field label="Owner email">
                <input
                  type="email"
                  value={inviteForm.ownerEmail}
                  onChange={(e) => setInviteForm({ ...inviteForm, ownerEmail: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </Field>
              <Field label="Phone (optional)">
                <input
                  type="text"
                  value={inviteForm.phone}
                  onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </Field>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={submitInvite}
                disabled={busy !== null || !inviteForm.restaurantName || !inviteForm.ownerEmail}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm px-4 py-2.5 rounded-lg transition disabled:opacity-50"
              >
                {busy === "invite" && <Loader2 className="w-4 h-4 animate-spin" />}
                Send invite
              </button>
              <button
                onClick={() => setShowInvite(false)}
                className="px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    trialing: "bg-yellow-100 text-yellow-700",
    past_due: "bg-red-100 text-red-700",
    cancelled: "bg-gray-100 text-gray-600",
    incomplete: "bg-gray-100 text-gray-600",
    paused: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}
