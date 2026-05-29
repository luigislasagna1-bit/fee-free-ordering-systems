"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Plus, MapPin, X, ExternalLink, ArrowRight } from "lucide-react";

type Location = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
  subscriptionStatus: string;
  createdAt: string;
};

export function LocationsClient({
  parent,
  children,
  activeId,
}: {
  parent: Location;
  children: Location[];
  activeId: string;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
  });

  async function submitAdd() {
    setBusy("add");
    setError(null);
    try {
      const res = await fetch("/api/restaurants/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not create location");
        return;
      }
      window.location.reload();
    } catch {
      setError("Could not create location");
    } finally {
      setBusy(null);
    }
  }

  async function switchTo(id: string) {
    if (id === activeId) return;
    setBusy(`switch-${id}`);
    setError(null);
    try {
      const res = await fetch("/api/restaurants/locations/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantId: id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not switch");
        return;
      }
      window.location.reload();
    } finally {
      setBusy(null);
    }
  }

  const allLocations = [{ ...parent, isParent: true }, ...children.map((c) => ({ ...c, isParent: false }))];

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Locations</h1>
          <p className="text-sm text-gray-500">
            Add and switch between the locations of your restaurant brand.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
        >
          <Plus className="w-4 h-4" /> Add another location
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6 text-sm text-blue-800">
        <strong>Heads up:</strong> each location is its own FREE plan (100 orders/month). Each location has its
        own menu, hours, payment provider, and Stripe Connect account — they don't share data. Paid add-ons
        (Unlimited Orders, Marketplace, etc.) are subscribed per location.
      </div>

      <div className="space-y-3">
        {allLocations.map((loc) => {
          const isActive = loc.id === activeId;
          return (
            <div
              key={loc.id}
              className={`rounded-xl border p-4 transition ${
                isActive ? "border-emerald-300 bg-emerald-50" : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className="flex items-center gap-4 flex-wrap">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-gray-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-gray-900 truncate">{loc.name}</div>
                    {loc.isParent && (
                      <span className="text-[10px] uppercase tracking-wider text-emerald-700 font-bold bg-emerald-100 px-1.5 py-0.5 rounded">
                        Brand parent
                      </span>
                    )}
                    {isActive && (
                      <span className="text-[10px] uppercase tracking-wider text-green-700 font-bold bg-green-100 px-1.5 py-0.5 rounded">
                        Currently viewing
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {[loc.city, loc.state].filter(Boolean).join(", ") || "No address yet"}
                    {" · "}status: {loc.subscriptionStatus}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {!isActive && (
                    <button
                      onClick={() => switchTo(loc.id)}
                      disabled={busy !== null}
                      className="inline-flex items-center gap-1 bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold px-3 py-1.5 rounded-md transition disabled:opacity-50"
                    >
                      {busy === `switch-${loc.id}` ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <ArrowRight className="w-3 h-3" />
                      )}
                      Switch to
                    </button>
                  )}
                  <a
                    href={`/order/${loc.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 px-2 py-1.5"
                    title="Open public ordering page"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Add a new location</h2>
              <button onClick={() => setShowAdd(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              The new location starts on the FREE plan (100 orders/month, no card required) and gets its own
              admin panel. You can switch into it from the header dropdown after creating.
            </p>
            <div className="space-y-3">
              <Field label="Location name">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Luigi's — Mississauga"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </Field>
              <Field label="Phone (optional)">
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </Field>
              <Field label="Address (optional)">
                <input
                  type="text"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field label="City">
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </Field>
                <Field label="State">
                  <input
                    type="text"
                    value={form.state}
                    onChange={(e) => setForm({ ...form, state: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </Field>
                <Field label="ZIP">
                  <input
                    type="text"
                    value={form.zip}
                    onChange={(e) => setForm({ ...form, zip: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </Field>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={submitAdd}
                disabled={busy !== null || !form.name.trim()}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-sm px-4 py-2.5 rounded-lg transition disabled:opacity-50"
              >
                {busy === "add" && <Loader2 className="w-4 h-4 animate-spin" />}
                Create location
              </button>
              <button
                onClick={() => setShowAdd(false)}
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
