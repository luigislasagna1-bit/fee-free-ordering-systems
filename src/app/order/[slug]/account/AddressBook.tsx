"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
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

export function AddressBook({ country }: { country?: string }) {
  const t = useTranslations("addressBook");
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

  // ── Address autocomplete — reuses the same free OpenStreetMap proxy as
  //    checkout (/api/public/geocode/search). Typing in the street field
  //    suggests addresses; picking one fills street/city/zip. No schema/map —
  //    parity with the checkout typeahead. Luigi 2026-06-30. ───────────────
  type Suggestion = { label: string; lat: number; lng: number; line1: string; city: string; postcode: string };
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const justPickedRef = useRef(false);
  useEffect(() => {
    // Don't re-query the value we just filled from a chosen suggestion.
    if (justPickedRef.current) { justPickedRef.current = false; return; }
    const q = street.trim();
    if (q.length < 3) { setSuggestions([]); setSuggestOpen(false); return; }
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q });
        if (country) params.set("country", country);
        const res = await fetch(`/api/public/geocode/search?${params.toString()}`, { signal: ctrl.signal });
        const data = await res.json().catch(() => ({}));
        setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
        setSuggestOpen(true);
      } catch { /* aborted / network — leave list as-is */ }
    }, 400);
    return () => { clearTimeout(id); ctrl.abort(); };
  }, [street, country]);
  const pickSuggestion = (s: Suggestion) => {
    justPickedRef.current = true;
    setSuggestOpen(false);
    setSuggestions([]);
    setStreet(s.line1 || street);
    if (s.city) setCity(s.city);
    if (s.postcode) setZip(s.postcode);
  };

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
      setErr(t("streetCityRequired"));
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
    if (!confirm(t("confirmDelete"))) return;
    await fetch(`/api/public/restaurant-customer/addresses/${id}`, { method: "DELETE" });
    load();
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> {t("loading")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {list.length === 0 && !showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center text-sm text-gray-500">
          {t("empty")}
        </div>
      )}
      {list.map((a) => (
        <div
          key={a.id}
          className="bg-white rounded-xl border border-gray-200 p-3 flex items-start justify-between gap-3"
        >
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-gray-900">{a.label ?? t("addressFallback")}</span>
              {a.isDefault && (
                <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                  {t("defaultBadge")}
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
                title={t("makeDefault")}
              >
                <Check className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => remove(a.id)}
              className="text-gray-400 hover:text-red-600 px-2 py-1"
              title={t("delete")}
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
            placeholder={t("labelPlaceholder")}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={30}
          />
          <div className="relative">
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder={t("streetPlaceholder")}
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              onFocus={() => { if (suggestions.length) setSuggestOpen(true); }}
              onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
              maxLength={200}
              autoComplete="off"
            />
            {suggestOpen && suggestions.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pickSuggestion(s)}
                    className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-emerald-50 flex items-start gap-1.5 border-b border-gray-50 last:border-0"
                  >
                    <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                    <span className="truncate">{s.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder={t("cityPlaceholder")}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              maxLength={100}
            />
            <input
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder={t("postalPlaceholder")}
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
              <X className="w-3.5 h-3.5" /> {t("cancel")}
            </button>
            <button
              onClick={add}
              disabled={saving || !street.trim() || !city.trim()}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-emerald-500 rounded-lg hover:bg-emerald-600 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {saving ? t("saving") : t("save")}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="w-full bg-white border border-dashed border-gray-300 rounded-xl px-3 py-3 text-sm text-gray-600 hover:border-emerald-300 hover:text-emerald-700 transition flex items-center justify-center gap-1.5"
        >
          <Plus className="w-4 h-4" /> {t("addAddress")}
        </button>
      )}
    </div>
  );
}
