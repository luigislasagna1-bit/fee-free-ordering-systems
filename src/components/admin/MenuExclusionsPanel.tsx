"use client";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Ban } from "lucide-react";
import toast from "react-hot-toast";

/**
 * Generic category/item exclusion picker — ONE component behind all three
 * menu-exclusion editors (Luigi 2026-07-02, "same UI, separate switches"):
 *
 *   field "rewardEarnExcluded"   → items that don't EARN Reward Dollars
 *                                  (admin/rewards, EarnExclusions wrapper)
 *   field "promoExcluded"        → items no promo/coupon may DISCOUNT
 *                                  (admin/promotions, PromoExclusions wrapper)
 *   field "rewardRedeemExcluded" → items that can't be PAID FOR with
 *                                  Reward Dollars (admin/rewards)
 *
 * Each toggle PATCHes /api/menu/{categories|items}/{id} with { [field]: v }.
 * The whole panel is COLLAPSIBLE (header click) so stacked editors don't eat
 * the page — collapsed by default, with an excluded-count badge so owners
 * can see at a glance that something is configured without expanding.
 * Strings come in resolved (each wrapper owns its i18n namespace).
 */
type Row = { id: string; name: string } & Record<string, unknown>;
type Cat = Row & { menuItems?: Row[] };

export type ExclusionStrings = {
  title: string;
  help: string;
  desc: string;
  /** Pill label when the item is NOT excluded (tap to exclude). */
  on: string;
  /** Pill label when the item IS excluded (tap to re-include). */
  off: string;
  viaCategory: string;
  failed: string;
  loading: string;
  none: string;
};

export function MenuExclusionsPanel({
  field,
  strings,
  helpTip,
  defaultOpen = false,
}: {
  field: "rewardEarnExcluded" | "promoExcluded" | "rewardRedeemExcluded";
  strings: ExclusionStrings;
  /** Optional pre-rendered HelpTip node (wrappers own the tooltip component). */
  helpTip?: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [cats, setCats] = useState<Cat[] | null>(null);
  const [panelOpen, setPanelOpen] = useState(defaultOpen);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    fetch("/api/menu/categories?minimal=1")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (!cancelled) setCats(Array.isArray(data) ? data : (data?.categories ?? [])); })
      .catch(() => { if (!cancelled) setCats([]); });
    return () => { cancelled = true; };
  }, []);

  const excluded = (row: Row | undefined) => !!row?.[field];
  const excludedCount = (cats ?? []).reduce(
    (n, c) => n + (excluded(c) ? 1 : 0) + (c.menuItems ?? []).filter((it) => excluded(it)).length,
    0,
  );

  const patch = async (kind: "categories" | "items", id: string, value: boolean) => {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      const res = await fetch(`/api/menu/${kind}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error();
      setCats((prev) => prev?.map((c) => {
        if (kind === "categories" && c.id === id) return { ...c, [field]: value };
        if (kind === "items") return { ...c, menuItems: c.menuItems?.map((it) => (it.id === id ? { ...it, [field]: value } : it)) };
        return c;
      }) ?? null);
    } catch {
      toast.error(strings.failed);
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };

  const Pill = ({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) => (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-50 ${on ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
    >
      {disabled ? "…" : on ? strings.off : strings.on}
    </button>
  );

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      {/* Collapsible header — the whole row is the toggle target. */}
      <button
        type="button"
        onClick={() => setPanelOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-left"
        aria-expanded={panelOpen}
      >
        {panelOpen ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
        <Ban className="w-5 h-5 text-gray-400 flex-shrink-0" />
        <h2 className="font-semibold text-gray-900">{strings.title}</h2>
        {excludedCount > 0 && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">{excludedCount}</span>
        )}
        {helpTip && <span onClick={(e) => e.stopPropagation()}>{helpTip}</span>}
      </button>
      <p className="mt-1 text-sm text-gray-500">{strings.desc}</p>

      {panelOpen && (
        cats === null ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> {strings.loading}</div>
        ) : cats.length === 0 ? (
          <p className="mt-3 text-sm text-gray-400">{strings.none}</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100">
            {cats.map((c) => {
              const items = c.menuItems ?? [];
              const isOpen = !!open[c.id];
              return (
                <li key={c.id} className="py-2">
                  <div className="flex items-center justify-between gap-3">
                    <button type="button" onClick={() => setOpen((o) => ({ ...o, [c.id]: !o[c.id] }))} className="flex items-center gap-1.5 text-left min-w-0">
                      {items.length > 0 ? (isOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />) : <span className="w-4" />}
                      <span className="font-medium text-gray-800 truncate">{c.name}</span>
                      {items.length > 0 && <span className="text-xs text-gray-400">({items.length})</span>}
                    </button>
                    <Pill on={excluded(c)} disabled={!!busy[c.id]} onClick={() => patch("categories", c.id, !excluded(c))} />
                  </div>
                  {isOpen && items.length > 0 && (
                    <ul className="mt-1 ml-6 space-y-1">
                      {items.map((it) => {
                        const itExcluded = excluded(it) || excluded(c);
                        return (
                          <li key={it.id} className="flex items-center justify-between gap-3">
                            <span className={`text-sm truncate ${excluded(c) ? "text-gray-400" : "text-gray-700"}`}>{it.name}</span>
                            {excluded(c)
                              ? <span className="text-[11px] text-gray-400">{strings.viaCategory}</span>
                              : <Pill on={itExcluded} disabled={!!busy[it.id]} onClick={() => patch("items", it.id, !excluded(it))} />}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )
      )}
    </div>
  );
}
