"use client";
import { useEffect, useState } from "react";
import { Loader2, MapPin, Plus, Trash2, Check, X } from "lucide-react";

type Address = {
  id: string;
  label: string | null;
  street: string;
  city: string;
  state: string | null;
  zip: string | null;
  country: string;
  isDefault: boolean;
};

export function AddressBook() {
  const [list, setList] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [label, setLabel] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setStateVal] = useState("");
  const [zip, setZip] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/public/restaurant-customer/addresses");
      const d = r.ok ? await r.json() : { addresses: [] };
      setList(d.addresses ?? []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!street.trim() || !city.trim()) {
      setErr("Street and city are required.");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch("/api/public/restaurant-customer/addresses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || undefined, street, city, state, zip }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.error || `Failed (${r.status})`);
      }
      setLabel(""); setStreet(""); setCity(""); setStateVal(""); setZip("");
      setShowForm(false);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const setDefault = async (id: string) => {
    await fetch(`/api/public/restaurant-customer/addresses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this address?")) return;
    await fetch(`/api/public/restaurant-customer/addresses/${id}`, { method: "DELETE" });
    load();
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading addresses…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {list.length === 0 && !showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center text-sm text-gray-500">
          No saved addresses yet. Add one to skip retyping at checkout.
        </div>
      )}
      {list.map((a) => (
        <div
          key={a.id}
          className="bg-white rounded-xl border border-gray-200 p-3 flex items-start justify-between gap-3"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-900">{a.label ?? "Address"}</span>
              {a.isDefault && (
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                  Default
                </span>
              )}
            </div>
            <div className="text-xs text-gray-600 mt-0.5 truncate">
              {a.street}
              {a.city ? `, ${a.city}` : ""}
              {a.state ? ` ${a.state}` : ""}
              {a.zip ? ` ${a.zip}` : ""}
            </div>
          </div>
          <div className="flex-shrink-0 flex items-center gap-1">
            {!a.isDefault && (
              <button
                onClick={() => setDefault(a.id)}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold px-2 py-1"
                title="Make default"
              >
                <Check className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => remove(a.id)}
              className="text-gray-400 hover:text-red-600 px-2 py-1"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}

      {showForm ? (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-3 space-y-2">
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            placeholder="Label (e.g. Home, Work)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={30}
          />
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            placeholder="Street address"
            value={street}
            onChange={(e) => setStreet(e.target.value)}
            maxLength={200}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder="City"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              maxLength={100}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder="Postal code"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              maxLength={20}
            />
          </div>
          {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">{err}</div>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => { setShowForm(false); setErr(null); }}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
            <button
              onClick={add}
              disabled={saving || !street.trim() || !city.trim()}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {saving ? "Saving…" : "Save address"}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full bg-white border border-dashed border-gray-300 rounded-xl px-3 py-3 text-sm text-gray-600 hover:border-emerald-300 hover:text-emerald-700 transition flex items-center justify-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> Add an address
        </button>
      )}
    </div>
  );
}
