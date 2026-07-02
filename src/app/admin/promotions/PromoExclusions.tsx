"use client";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Ban } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { HelpTip } from "@/components/HelpTip";

/**
 * "No discounts on…" — lets the owner exclude whole CATEGORIES (e.g. Gift
 * Cards) or specific ITEMS from EVERY promo/coupon discount and from paying
 * with reward credit, so a $10 coupon can't buy a $10 gift card for free
 * (store-credit minting — Luigi 2026-07-01). Sibling of the Reward Dollars
 * EarnExclusions editor (admin/rewards) — same interaction, different flag.
 * Each toggle PATCHes the category/item directly (promoExcluded). Enforced by
 * the promo engine in BOTH the cart preview and the charge.
 */
type Item = { id: string; name: string; promoExcluded?: boolean };
type Cat = { id: string; name: string; promoExcluded?: boolean; menuItems?: Item[] };

export function PromoExclusions() {
  const t = useTranslations("admin.promotionsPage");
  const [cats, setCats] = useState<Cat[] | null>(null);
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

  const patch = async (kind: "categories" | "items", id: string, excluded: boolean) => {
    setBusy((b) => ({ ...b, [id]: true }));
    try {
      const res = await fetch(`/api/menu/${kind}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promoExcluded: excluded }),
      });
      if (!res.ok) throw new Error();
      setCats((prev) => prev?.map((c) => {
        if (kind === "categories" && c.id === id) return { ...c, promoExcluded: excluded };
        if (kind === "items") return { ...c, menuItems: c.menuItems?.map((it) => (it.id === id ? { ...it, promoExcluded: excluded } : it)) };
        return c;
      }) ?? null);
    } catch {
      toast.error(t("excludeFailed"));
    } finally {
      setBusy((b) => ({ ...b, [id]: false }));
    }
  };

  const Pill = ({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) => (
    <button
      type="button" onClick={onClick} disabled={disabled}
      className={`flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-50 ${on ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
    >
      {disabled ? "…" : on ? t("excludeOff") : t("excludeOn")}
    </button>
  );

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 mt-6">
      <div className="flex items-center gap-1.5">
        <Ban className="w-5 h-5 text-gray-400" />
        <h2 className="font-semibold text-gray-900">{t("excludeTitle")}</h2>
        <HelpTip text={t("excludeHelp")} />
      </div>
      <p className="mt-1 text-sm text-gray-500">{t("excludeDesc")}</p>

      {cats === null ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-gray-400"><Loader2 className="w-4 h-4 animate-spin" /> {t("excludeLoading")}</div>
      ) : cats.length === 0 ? (
        <p className="mt-3 text-sm text-gray-400">{t("excludeNone")}</p>
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
                  <Pill on={!!c.promoExcluded} disabled={!!busy[c.id]} onClick={() => patch("categories", c.id, !c.promoExcluded)} />
                </div>
                {isOpen && items.length > 0 && (
                  <ul className="mt-1 ml-6 space-y-1">
                    {items.map((it) => {
                      const itExcluded = !!it.promoExcluded || !!c.promoExcluded;
                      return (
                        <li key={it.id} className="flex items-center justify-between gap-3">
                          <span className={`text-sm truncate ${c.promoExcluded ? "text-gray-400" : "text-gray-700"}`}>{it.name}</span>
                          {c.promoExcluded
                            ? <span className="text-[11px] text-gray-400">{t("excludeViaCategory")}</span>
                            : <Pill on={itExcluded} disabled={!!busy[it.id]} onClick={() => patch("items", it.id, !it.promoExcluded)} />}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
