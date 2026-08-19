"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import { Plus, Trash2, Zap, Loader2 } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type Pairing = {
  id: string;
  dealItemId: string;
  dealItemName: string;
  dealFulfilDays: number[];
  standardItemId: string;
  standardItemName: string;
  standardPrice: number;
  dealPrice: number;
  saving: number;
  active: boolean;
};

type DealItem = {
  menuItemId: string;
  name: string;
  price: number;
  fulfilDays: number[];
};

type Candidate = {
  menuItemId: string;
  name: string;
  price: number;
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function DayDealsManager({ currency }: { currency: string }) {
  const t = useTranslations("admin.phoneOrderingPage.dayDeals");
  const [pairings, setPairings] = useState<Pairing[]>([]);
  const [dealItems, setDealItems] = useState<DealItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Auto-detect state
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [detecting, setDetecting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/phone-ordering/day-deals");
      if (!res.ok) return;
      const data = await res.json();
      setPairings(data.pairings ?? []);
      setDealItems(data.dealItems ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, { deal: DealItem; rows: Pairing[] }>();
    for (const p of pairings) {
      const key = p.dealItemId;
      if (!map.has(key)) {
        const deal = dealItems.find((d) => d.menuItemId === key);
        map.set(key, { deal: deal ?? { menuItemId: key, name: p.dealItemName, price: p.dealPrice, fulfilDays: p.dealFulfilDays }, rows: [] });
      }
      map.get(key)!.rows.push(p);
    }
    return [...map.values()];
  }, [pairings, dealItems]);

  const call = async (input: RequestInfo, init: RequestInit): Promise<Response | null> => {
    setBusy(true);
    try {
      return await fetch(input, init);
    } catch {
      return null;
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (p: Pairing) => {
    const next = !p.active;
    setPairings((list) => list.map((x) => (x.id === p.id ? { ...x, active: next } : x)));
    const res = await call(`/api/admin/phone-ordering/day-deals/${p.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: next }),
    });
    if (!res?.ok) {
      setPairings((list) => list.map((x) => (x.id === p.id ? { ...x, active: !next } : x)));
      toast.error(t("updateError"));
    }
  };

  const remove = async (p: Pairing) => {
    const res = await call(`/api/admin/phone-ordering/day-deals/${p.id}`, { method: "DELETE" });
    if (!res?.ok) {
      toast.error(t("updateError"));
      return;
    }
    setPairings((list) => list.filter((x) => x.id !== p.id));
    toast.success(t("removedToast"));
  };

  const autoDetect = async (dealItemId: string) => {
    setSelectedDealId(dealItemId);
    setDetecting(true);
    setSelectedCandidates(new Set());
    setCandidates([]);
    try {
      const res = await fetch("/api/admin/phone-ordering/day-deals/auto-detect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ dealItemId }),
      });
      if (!res.ok) {
        toast.error(t("updateError"));
        return;
      }
      const data = await res.json();
      setCandidates(data.candidates ?? []);
      setSelectedCandidates(new Set((data.candidates ?? []).map((c: Candidate) => c.menuItemId)));
    } finally {
      setDetecting(false);
    }
  };

  const addSelected = async () => {
    if (!selectedDealId || selectedCandidates.size === 0) return;
    setBusy(true);
    let added = 0;
    for (const standardItemId of selectedCandidates) {
      try {
        const res = await fetch("/api/admin/phone-ordering/day-deals", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ dealItemId: selectedDealId, standardItemId }),
        });
        if (res?.ok) added++;
      } catch { /* skip failed ones */ }
    }
    setBusy(false);
    if (added > 0) {
      toast.success(t("addedCount", { count: added }));
      setSelectedDealId(null);
      setCandidates([]);
      setSelectedCandidates(new Set());
      void load();
    } else {
      toast.error(t("updateError"));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (dealItems.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
        {t("noDealItems")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Existing pairings grouped by deal item. */}
      {grouped.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
          {t("empty")}
        </div>
      ) : (
        grouped.map(({ deal, rows }) => (
          <div key={deal.menuItemId} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-gray-900">{deal.name}</div>
                <div className="text-xs text-gray-500">
                  {formatCurrency(deal.price, currency)}
                  {deal.fulfilDays.length > 0 && (
                    <> · {deal.fulfilDays.map((d) => DAY_NAMES[d]).join(", ")}</>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => autoDetect(deal.menuItemId)}
                disabled={busy || detecting}
                className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:text-sky-800 transition"
              >
                <Zap className="w-3.5 h-3.5" />
                {t("autoDetect")}
              </button>
            </div>
            <div className="divide-y divide-gray-100">
              {rows.map((p) => (
                <div key={p.id} className={`flex items-center justify-between gap-3 py-2 ${p.active ? "" : "opacity-60"}`}>
                  <div className="min-w-0">
                    <span className="text-sm text-gray-800">{p.standardItemName}</span>
                    <span className="text-xs text-gray-500 ml-2">{formatCurrency(p.standardPrice, currency)}</span>
                    <span className="text-xs text-emerald-600 ml-2">{t("saves", { amount: formatCurrency(p.saving, currency) })}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => toggleActive(p)}
                      disabled={busy}
                      className={`relative w-9 h-5 rounded-full transition ${p.active ? "bg-emerald-600" : "bg-gray-300"}`}
                      aria-pressed={p.active}
                    >
                      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition ${p.active ? "translate-x-4" : ""}`} />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(p)}
                      disabled={busy}
                      className="text-red-400 hover:text-red-600 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      {/* Auto-detect candidates panel. */}
      {selectedDealId && (
        <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-4 space-y-3">
          <h4 className="font-semibold text-gray-900 flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-sky-600" />
            {t("addPairings")}
          </h4>
          {detecting ? (
            <div className="flex items-center gap-2 py-4 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t("scanning")}
            </div>
          ) : candidates.length === 0 ? (
            <p className="text-sm text-gray-500 py-2">{t("noCandidates")}</p>
          ) : (
            <>
              <p className="text-xs text-gray-500">{t("candidatesHint")}</p>
              <div className="max-h-56 overflow-y-auto divide-y divide-gray-100">
                {candidates.map((c) => {
                  const checked = selectedCandidates.has(c.menuItemId);
                  return (
                    <label key={c.menuItemId} className="flex items-center gap-3 py-2 px-1 cursor-pointer hover:bg-sky-50 rounded">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedCandidates((prev) => {
                            const next = new Set(prev);
                            if (checked) next.delete(c.menuItemId);
                            else next.add(c.menuItemId);
                            return next;
                          });
                        }}
                        className="rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                      />
                      <span className="text-sm text-gray-800 truncate flex-1">{c.name}</span>
                      <span className="text-sm text-gray-500 flex-shrink-0">{formatCurrency(c.price, currency)}</span>
                    </label>
                  );
                })}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={addSelected}
                  disabled={busy || selectedCandidates.size === 0}
                  className="px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 disabled:opacity-60 transition"
                >
                  {t("addSelected", { count: selectedCandidates.size })}
                </button>
                <button
                  type="button"
                  onClick={() => { setSelectedDealId(null); setCandidates([]); setSelectedCandidates(new Set()); }}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  {t("cancel")}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Quick-add for deal items without pairings yet. */}
      {dealItems.filter((d) => !grouped.some((g) => g.deal.menuItemId === d.menuItemId)).length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <h4 className="font-semibold text-gray-900 flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-emerald-600" />
            {t("setupDeals")}
          </h4>
          <p className="text-xs text-gray-500">{t("setupHint")}</p>
          <div className="divide-y divide-gray-50">
            {dealItems
              .filter((d) => !grouped.some((g) => g.deal.menuItemId === d.menuItemId))
              .map((d) => (
                <button
                  key={d.menuItemId}
                  type="button"
                  onClick={() => autoDetect(d.menuItemId)}
                  disabled={busy || detecting}
                  className="w-full flex items-center justify-between gap-3 py-2 px-1 text-left hover:bg-gray-50 rounded transition disabled:opacity-60"
                >
                  <div>
                    <span className="text-sm text-gray-800">{d.name}</span>
                    <span className="text-xs text-gray-500 ml-2">{formatCurrency(d.price, currency)}</span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {d.fulfilDays.map((day) => DAY_NAMES[day]).join(", ")}
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
