"use client";
import { useMemo, useState } from "react";
import { X, Check, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { PizzaBuilder, parsePizzaConfig, type PizzaCustomization } from "./PizzaBuilder";
import { parseComboConfig } from "@/lib/combo";

// The two surfaces (this file + OrderingPageClient + PizzaBuilder) each have
// their own MenuItem shape; combos pass items between them, so we stay loose.
type AnyItem = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type ComboCartChild = {
  menuItemId: string;
  name: string;
  variantId?: string;
  variantName?: string;
  pizzaCustomization?: PizzaCustomization;
  upcharge?: number;
};
export type ComboCartResult = { comboItem: AnyItem; lineTotal: number; children: ComboCartChild[] };

type Pick = ComboCartChild & { key: string; upcharge: number };

interface Props {
  comboItem: AnyItem;
  allItems: AnyItem[];
  primaryColor: string;
  fmt: (n: number) => string;
  onAddCombo: (result: ComboCartResult) => void;
  onClose: () => void;
}

/**
 * Customer-facing combo composer. Walks a combo item's slots; the customer
 * picks from each slot's eligible pool. Pizza-builder items open the FULL pizza
 * builder so each pizza is customizable. Adds to the cart as ONE line at the
 * combo's price + owner-defined per-item upcharges. Multi-pizza combos as a
 * first-class menu item. Luigi 2026-06-05.
 */
export function ComboComposerModal({ comboItem, allItems, primaryColor, fmt, onAddCombo, onClose }: Props) {
  const t = useTranslations("customer.combo");
  const config = useMemo(() => parseComboConfig(comboItem.comboConfig), [comboItem.comboConfig]);

  const slotPools = useMemo(() => {
    if (!config) return [];
    return config.slots.map((s) => {
      const ids = new Set(s.itemIds);
      return allItems.filter((i) => ids.has(i.id) || (i.categoryId && s.categoryIds.includes(i.categoryId)));
    });
  }, [config, allItems]);

  const [picks, setPicks] = useState<Record<string, Pick[]>>(() =>
    Object.fromEntries((config?.slots ?? []).map((s) => [s.id, []])),
  );
  const [pizzaFor, setPizzaFor] = useState<{ slotId: string; item: AnyItem; upcharge: number } | null>(null);

  if (!config) return null;

  const upchargeFor = (slotId: string, itemId: string) =>
    config.slots.find((s) => s.id === slotId)?.upcharges?.[itemId] ?? 0;

  const addPick = (slotId: string, pick: Pick) =>
    setPicks((p) => {
      const slot = config.slots.find((s) => s.id === slotId)!;
      const cur = p[slotId] ?? [];
      if (cur.length >= slot.max) return p; // at max — ignore (UI also disables)
      return { ...p, [slotId]: [...cur, pick] };
    });
  const removePick = (slotId: string, key: string) =>
    setPicks((p) => ({ ...p, [slotId]: (p[slotId] ?? []).filter((x) => x.key !== key) }));

  const choose = (slotId: string, item: AnyItem) => {
    const upcharge = upchargeFor(slotId, item.id);
    if (parsePizzaConfig(item.pizzaConfig)) {
      setPizzaFor({ slotId, item, upcharge }); // pizza → open the builder
      return;
    }
    const dv = item.variants?.find((v: AnyItem) => v.isDefault) ?? item.variants?.[0] ?? null;
    addPick(slotId, {
      key: `${item.id}-${picks[slotId]?.length ?? 0}-${item.name}`,
      menuItemId: item.id, name: item.name, variantId: dv?.id, variantName: dv?.name, upcharge,
    });
  };

  const base = comboItem.price || 0;
  const upchargeTotal = Object.values(picks).flat().reduce((s, p) => s + (p.upcharge || 0), 0);
  const lineTotal = Math.round((base + upchargeTotal) * 100) / 100;
  const slotsSatisfied = config.slots.every((s) => (picks[s.id]?.length ?? 0) >= s.min);

  const submit = () => {
    if (!slotsSatisfied) return;
    const children: ComboCartChild[] = config.slots.flatMap((s) =>
      (picks[s.id] ?? []).map((p) => ({
        menuItemId: p.menuItemId, name: p.name, variantId: p.variantId, variantName: p.variantName,
        pizzaCustomization: p.pizzaCustomization, upcharge: p.upcharge,
      })),
    );
    onAddCombo({ comboItem, lineTotal, children });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold text-gray-900">{comboItem.name}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {config.slots.map((slot, si) => {
            const cur = picks[slot.id] ?? [];
            const done = cur.length >= slot.min;
            const atMax = cur.length >= slot.max;
            return (
              <div key={slot.id}>
                <div className="flex items-center gap-2 mb-2">
                  {done && <Check className="w-4 h-4" style={{ color: primaryColor }} />}
                  <h3 className="font-semibold text-gray-800">{slot.label || t("slotFallback", { n: si + 1 })}</h3>
                  <span className="text-xs text-gray-400">{t("pickRange", { min: slot.min, max: slot.max })}</span>
                </div>
                {cur.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {cur.map((p) => (
                      <span key={p.key} className="inline-flex items-center gap-1.5 bg-gray-100 rounded-full pl-3 pr-1.5 py-1 text-sm">
                        {p.name}{p.pizzaCustomization ? " ⭐" : ""}{(p.upcharge ?? 0) > 0 ? ` (+${fmt(p.upcharge!)})` : ""}
                        <button onClick={() => removePick(slot.id, p.key)} className="p-0.5 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-1.5">
                  {slotPools[si].map((it: AnyItem) => {
                    const up = upchargeFor(slot.id, it.id);
                    const isPizza = !!parsePizzaConfig(it.pizzaConfig);
                    return (
                      <button key={it.id} disabled={atMax} onClick={() => choose(slot.id, it)}
                        className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-left hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed">
                        <span className="min-w-0 truncate">
                          <span className="font-medium text-gray-800">{it.name}</span>
                          {isPizza && <span className="ml-1.5 text-[10px] font-bold" style={{ color: primaryColor }}>{t("customizable")}</span>}
                        </span>
                        <span className="flex items-center gap-2 flex-shrink-0">
                          {up > 0 && <span className="text-xs text-gray-500">+{fmt(up)}</span>}
                          <Plus className="w-4 h-4 text-gray-400" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-4 border-t bg-gray-50 rounded-b-2xl">
          <button onClick={submit} disabled={!slotsSatisfied}
            className="w-full py-3 rounded-xl text-white font-semibold disabled:opacity-50"
            style={{ backgroundColor: primaryColor }}>
            {slotsSatisfied ? t("addToCart", { price: fmt(lineTotal) }) : t("completeSlots")}
          </button>
        </div>
      </div>

      {pizzaFor && (() => {
        const pc = parsePizzaConfig(pizzaFor.item.pizzaConfig);
        if (!pc) return null;
        return (
          <PizzaBuilder
            item={pizzaFor.item}
            config={pc}
            primaryColor={primaryColor}
            onClose={() => setPizzaFor(null)}
            onAdd={(result) => {
              addPick(pizzaFor.slotId, {
                key: `${pizzaFor.item.id}-${Date.now()}`,
                menuItemId: pizzaFor.item.id, name: pizzaFor.item.name,
                variantId: result.variant?.id, variantName: result.variant?.name,
                pizzaCustomization: result.customization, upcharge: pizzaFor.upcharge,
              });
              setPizzaFor(null);
            }}
          />
        );
      })()}
    </div>
  );
}
