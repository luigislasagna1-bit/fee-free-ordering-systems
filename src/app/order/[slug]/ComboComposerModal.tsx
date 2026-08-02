"use client";
import { useMemo, useRef, useState } from "react";
import { X, Check, Plus, Minus, Trash2, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { PizzaBuilder, parsePizzaConfig, pizzaCustomizationToModifiers, type PizzaCustomization } from "./PizzaBuilder";
import { parseComboConfig, comboAllowedVariantIds, comboUpchargeFor } from "@/lib/combo";
import { priceComboPizzaChildren } from "@/lib/combo-child-pricing";

// The two surfaces (this file + OrderingPageClient + PizzaBuilder) each have
// their own MenuItem shape; combos pass items between them, so we stay loose.
type AnyItem = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type ComboCartChild = {
  menuItemId: string;
  name: string;
  variantId?: string;
  variantName?: string;
  /** Flattened modifier selections (also used for the kitchen ticket). */
  modifiers?: Array<{ modifierOptionId?: string; name: string; priceAdjustment?: number }>;
  pizzaCustomization?: PizzaCustomization;
  /** Owner's per-item/size premium (always added). */
  upcharge?: number;
  /** Add-on/extra surcharge — already gated by the combo's extrasCharge flag
   *  (0 when the combo includes extras for free). */
  extrasFee?: number;
  /** Which combo slot this pick fills — emitted so cart re-edit can reseed the
   *  composer EXACTLY (no greedy slot-matching). Luigi 2026-07-09. */
  slotId?: string;
};
export type ComboCartResult = { comboItem: AnyItem; lineTotal: number; children: ComboCartChild[]; notes?: string };

type Pick = ComboCartChild & { key: string; upcharge: number };

interface Props {
  comboItem: AnyItem;
  allItems: AnyItem[];
  primaryColor: string;
  fmt: (n: number) => string;
  onAddCombo: (result: ComboCartResult) => void;
  onClose: () => void;
  /** Owner's per-item-note setting — when true, the combo shows one Special-
   *  instructions box (matching every other item type). Default true. */
  allowItemNotes?: boolean;
  /** Re-edit seed: the cart line's current children + note. The composer opens
   *  with these picks already filled; the customer edits from there. Children
   *  with a slotId land in that exact slot; legacy children (no slotId) are
   *  greedily matched to the first eligible slot. Luigi 2026-07-09. */
  initial?: { children: ComboCartChild[]; notes?: string };
}

/** True when a non-pizza item needs the customizer (a size choice to make OR
 *  any visible modifier group to walk through). */
function needsCustomizer(item: AnyItem, allowedVariants: AnyItem[]): boolean {
  const groups: AnyItem[] = Array.isArray(item.modifierGroups) ? item.modifierGroups : [];
  const hasVisibleGroups = groups.some((g) => !g.isHidden);
  return allowedVariants.length > 1 || hasVisibleGroups;
}

/**
 * Customer-facing combo composer. Walks a combo item's slots; the customer
 * picks from each slot's eligible pool. Each pick is treated EXACTLY like
 * ordering that item à la carte: pizzas open the pizza builder, items with
 * sizes/modifiers open a full customizer. The combo is a fixed price + the
 * owner's per-item/size upcharges; add-ons are free or charged per the combo's
 * extrasCharge setting. Luigi 2026-06-06.
 */
export function ComboComposerModal({ comboItem, allItems, primaryColor, fmt, onAddCombo, onClose, allowItemNotes = true, initial }: Props) {
  const t = useTranslations("customer.combo");
  // Reused strings from the ordering namespace: "Sold out" for disabled picks,
  // and specialInstructions/notesPlaceholder for the combo-level note box.
  const tOrder = useTranslations("ordering");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const config = useMemo(() => parseComboConfig(comboItem.comboConfig), [comboItem.comboConfig]);

  const slotPools = useMemo(() => {
    if (!config) return [];
    return config.slots.map((s) => {
      const ids = new Set(s.itemIds);
      return allItems.filter((i) => ids.has(i.id) || (i.categoryId && s.categoryIds.includes(i.categoryId)));
    });
  }, [config, allItems]);

  // Re-edit: seed the picks from the cart line's children. Exact slot via the
  // stored slotId; legacy children (pre-slotId lines) fall back to the first
  // eligible slot with room. Each child already carries its own upcharge /
  // extrasFee / modifiers / pizzaCustomization, so submit() re-emits them
  // verbatim and lineTotal recomputes identically. Luigi 2026-07-09.
  const [picks, setPicks] = useState<Record<string, Pick[]>>(() => {
    const seeded: Record<string, Pick[]> = Object.fromEntries((config?.slots ?? []).map((s) => [s.id, []]));
    if (!initial?.children?.length || !config) return seeded;
    // Seed keys must be GLOBALLY unique — the old per-slot-index format
    // collided for identical pizzas in different slots, and poolDerived keys
    // fees by pick key, so the second pizza's money overwrote the first's.
    // (Adversarial review 2026-08-02.)
    let seedSeq = 0;
    for (const c of initial.children) {
      let slotIdx = -1;
      // Exact slot via the stored slotId — but ONLY if the item is still in
      // that slot's eligible pool (an owner edit may have removed it; stale
      // picks drop, same as the greedy path below).
      if (c.slotId && seeded[c.slotId] && seeded[c.slotId].length < (config.slots.find((s) => s.id === c.slotId)?.max ?? 0)) {
        const exact = config.slots.findIndex((s) => s.id === c.slotId);
        if (exact !== -1 && (slotPools[exact]?.some((p: AnyItem) => p.id === c.menuItemId) ?? false)) {
          slotIdx = exact;
        }
      }
      if (slotIdx === -1) {
        slotIdx = config.slots.findIndex((s, si) => {
          if ((seeded[s.id]?.length ?? 0) >= s.max) return false;
          return slotPools[si]?.some((p: AnyItem) => p.id === c.menuItemId) ?? false;
        });
      }
      if (slotIdx === -1) continue; // stale pick (combo config changed) → drop
      const slot = config.slots[slotIdx];
      seeded[slot.id].push({
        key: `${c.menuItemId}-s${seedSeq++}`,
        menuItemId: c.menuItemId, name: c.name, variantId: c.variantId, variantName: c.variantName,
        modifiers: c.modifiers, pizzaCustomization: c.pizzaCustomization,
        upcharge: c.upcharge ?? 0, extrasFee: c.extrasFee,
      });
    }
    return seeded;
  });
  const [pizzaFor, setPizzaFor] = useState<{
    slotId: string; item: AnyItem; upcharge: number;
    /** In-place pick edit (Luigi 2026-07-09): the key of the pick being edited
     *  (save REPLACES it) + the build to seed the pizza builder with. */
    editKey?: string; initial?: { variantId: string | null; customization: PizzaCustomization };
  } | null>(null);
  // Full customizer (size + modifiers) for a non-pizza item.
  const [customizeFor, setCustomizeFor] = useState<{
    slotId: string; item: AnyItem; allowedVariants: AnyItem[];
    editKey?: string; initial?: { variantId?: string; modifiers?: ComboCartChild["modifiers"] };
  } | null>(null);
  // Monotonic pick-key counter. Keys used to be `${itemId}-${picks.length}-…`,
  // which COLLIDES after a remove + re-add of the same item/size (two picks
  // share a key → removePick strips both, React keys clash). One counter per
  // composer instance keeps every key unique for good. Luigi 2026-08-02.
  const keyCounter = useRef(0);
  const nextKey = (itemId: string) => `${itemId}-k${keyCounter.current++}`;

  if (!config) return null;

  const extrasCharge = config.extrasCharge;
  const slotById = (slotId: string) => config.slots.find((s) => s.id === slotId)!;

  // The sizes (variants) a slot offers for an item: the owner-restricted subset
  // when set, otherwise all of the item's variants. Non-sized items ⇒ [].
  const allowedVariantsFor = (slotId: string, item: AnyItem): AnyItem[] => {
    const variants: AnyItem[] = Array.isArray(item.variants) ? item.variants : [];
    if (variants.length === 0 || parsePizzaConfig(item.pizzaConfig)) return [];
    const allowedIds = comboAllowedVariantIds(slotById(slotId), item.id);
    return allowedIds ? variants.filter((v) => allowedIds.includes(v.id)) : variants;
  };

  // Add `count` copies of a pick in ONE state update (the customize-once
  // "apply ×N" path). Each copy gets its own unique key; capacity-clamped.
  const addPickN = (slotId: string, pick: Omit<Pick, "key">, count = 1) =>
    setPicks((p) => {
      const slot = config.slots.find((s) => s.id === slotId)!;
      const cur = p[slotId] ?? [];
      // allowDuplicates=false is enforced HERE (the state layer), not just in
      // the row UI — the customizer/builder confirm path lands here too, and a
      // duplicate-free slot must reject a second unit of the same item no
      // matter which door it came through. (Adversarial review 2026-08-02.)
      const dupBlocked = slot.allowDuplicates === false && cur.some((x) => x.menuItemId === pick.menuItemId);
      if (dupBlocked) return p;
      const room = Math.max(0, slot.max - cur.length);
      const cap = slot.allowDuplicates === false ? Math.min(1, room) : room;
      const n = Math.min(Math.max(1, Math.floor(count)), cap);
      if (n <= 0) return p; // at max — ignore (UI also disables)
      const copies: Pick[] = Array.from({ length: n }, () => ({ ...pick, key: nextKey(pick.menuItemId) }));
      return { ...p, [slotId]: [...cur, ...copies] };
    });
  const addPick = (slotId: string, pick: Pick) => addPickN(slotId, pick, 1);
  const removePick = (slotId: string, key: string) =>
    setPicks((p) => ({ ...p, [slotId]: (p[slotId] ?? []).filter((x) => x.key !== key) }));
  // In-place edit: swap the pick at `key` for the adjusted one, keeping its
  // position (and key — uniqueness is all that matters). Luigi 2026-07-09.
  const replacePick = (slotId: string, key: string, next: Omit<Pick, "key">) =>
    setPicks((p) => ({ ...p, [slotId]: (p[slotId] ?? []).map((x) => (x.key === key ? { ...next, key } : x)) }));

  // Tap a picked chip → reopen its builder/customizer seeded with the current
  // build; saving replaces the pick in place. Plain items (no sizes, no
  // modifiers) have nothing to adjust → no-op. Luigi 2026-07-09.
  const editPick = (slotId: string, p: Pick) => {
    const si = config.slots.findIndex((s) => s.id === slotId);
    const item =
      (slotPools[si] ?? []).find((i: AnyItem) => i.id === p.menuItemId) ??
      allItems.find((i) => i.id === p.menuItemId);
    if (!item) return;
    const slot = slotById(slotId);
    if (parsePizzaConfig(item.pizzaConfig)) {
      setPizzaFor({
        slotId, item,
        upcharge: p.upcharge ?? comboUpchargeFor(slot, item.id),
        editKey: p.key,
        initial: p.pizzaCustomization ? { variantId: p.variantId ?? null, customization: p.pizzaCustomization } : undefined,
      });
      return;
    }
    const allowed = allowedVariantsFor(slotId, item);
    if (needsCustomizer(item, allowed)) {
      setCustomizeFor({ slotId, item, allowedVariants: allowed, editKey: p.key, initial: { variantId: p.variantId, modifiers: p.modifiers } });
    }
  };

  const choose = (slotId: string, item: AnyItem) => {
    // Sold-out items are display-disabled; never open the builder / add a pick
    // through one (the orders route would reject it anyway).
    if (item.isSoldOut) return;
    const slot = slotById(slotId);
    // Duplicate-free slot + item already picked → nothing to open (addPickN
    // would reject the confirm anyway; don't send the customer into a
    // customizer whose Add can't land).
    if (slot.allowDuplicates === false && (picks[slotId] ?? []).some((p) => p.menuItemId === item.id)) return;
    if (parsePizzaConfig(item.pizzaConfig)) {
      setPizzaFor({ slotId, item, upcharge: comboUpchargeFor(slot, item.id) }); // pizza → builder
      return;
    }
    const allowed = allowedVariantsFor(slotId, item);
    if (needsCustomizer(item, allowed)) {
      setCustomizeFor({ slotId, item, allowedVariants: allowed }); // size and/or modifiers
      return;
    }
    // Nothing to choose — add straight away (single/no size, no modifiers).
    const v = allowed.length === 1 ? allowed[0] : null;
    addPickN(slotId, {
      menuItemId: item.id, name: item.name, variantId: v?.id, variantName: v?.name,
      upcharge: comboUpchargeFor(slot, item.id, v?.id),
    });
  };

  // Collapse identical picks for the chips row: same item + size + modifier
  // lines + fees ⇒ one chip with every member's key (trash pops the last).
  // A pizza build never groups — each is its own physical build.
  const groupPicks = (list: Pick[]): Array<{ rep: Pick; keys: string[] }> => {
    const out: Array<{ rep: Pick; keys: string[] }> = [];
    const bySig = new Map<string, { rep: Pick; keys: string[] }>();
    for (const p of list) {
      if (p.pizzaCustomization) { out.push({ rep: p, keys: [p.key] }); continue; }
      const sig = JSON.stringify([
        p.menuItemId, p.variantId ?? "", (p.modifiers ?? []).map((m) => [m.name, m.priceAdjustment ?? 0]),
        p.upcharge ?? 0, p.extrasFee ?? 0,
      ]);
      const existing = bySig.get(sig);
      if (existing) { existing.keys.push(p.key); continue; }
      const entry = { rep: p, keys: [p.key] };
      bySig.set(sig, entry);
      out.push(entry);
    }
    return out;
  };

  // ── One-pass multi-select (Luigi 2026-08-02, the GloriaFood pattern) ──────
  // A selected pool row grows −/+ steppers: [+] repeats the LAST pick of that
  // item verbatim (identical size/mods — the customize-once promise), [−]
  // removes the last one. Gated by the slot's allowDuplicates (default true).
  const countOfItem = (slotId: string, itemId: string) =>
    (picks[slotId] ?? []).filter((p) => p.menuItemId === itemId).length;
  const addOneMore = (slotId: string, itemId: string) =>
    setPicks((p) => {
      const slot = config.slots.find((s) => s.id === slotId)!;
      const cur = p[slotId] ?? [];
      if (cur.length >= slot.max) return p;
      if (slot.allowDuplicates === false) return p; // duplicating is the whole point of this helper
      const last = [...cur].reverse().find((x) => x.menuItemId === itemId);
      if (!last) return p;
      const { key: _oldKey, ...rest } = last;
      return { ...p, [slotId]: [...cur, { ...rest, key: nextKey(itemId) }] };
    });
  const removeLastOf = (slotId: string, itemId: string) =>
    setPicks((p) => {
      const cur = p[slotId] ?? [];
      const idx = [...cur].map((x) => x.menuItemId).lastIndexOf(itemId);
      if (idx < 0) return p;
      return { ...p, [slotId]: cur.filter((_, i) => i !== idx) };
    });

  // ── Shared topping pool: the COMPOSER owns the money (Luigi 2026-08-02) ──
  // Every pizza pick's fee is re-derived HERE from its stored customization on
  // ANY change, via the same pure lib the orders route charges with — so
  // editing pizza #1 re-prices pizza #2 (the old save-time deltas could not),
  // and preview == charge by construction. Per-pizza mode (no pool) keeps the
  // save-time fees, which the same lib reproduces server-side.
  const poolDerived = useMemo(() => {
    const shared = config?.sharedToppings ?? 0;
    if (!config || shared < 1) return null;
    const itemById = new Map<string, AnyItem>(allItems.map((i: AnyItem) => [i.id, i]));
    // Only picks whose item we can still resolve join the pool walk — pricing a
    // vanished item with empty modifier groups would drop every line and show
    // $0. Unresolvable picks keep their STORED fee via the effectiveExtras
    // fallback; the server stays the authority. (Adversarial review 2026-08-02.)
    const ordered = config.slots.flatMap((s) =>
      (picks[s.id] ?? []).filter((p) => p.pizzaCustomization && itemById.has(p.menuItemId)));
    const priced = priceComboPizzaChildren({
      children: ordered.map((p) => {
        const item = itemById.get(p.menuItemId);
        return {
          pizzaConfigRaw: item?.pizzaConfig,
          variantName: p.variantName ?? null,
          rawModifiers: p.modifiers ?? [],
          candidateGroups: item?.modifierGroups ?? [],
        };
      }),
      extrasCharge,
      sharedToppings: shared,
    });
    const byKey = new Map<string, { extrasFee: number; modifiers: ComboCartChild["modifiers"]; halfUnitsUsed: number }>();
    let usedHalfUnits = 0;
    priced.forEach((res, i) => {
      byKey.set(ordered[i].key, {
        extrasFee: res.extrasFee,
        modifiers: res.validatedMods.length ? res.validatedMods : ordered[i].modifiers,
        halfUnitsUsed: res.toppingHalfUnitsUsed,
      });
      usedHalfUnits += res.toppingHalfUnitsUsed;
    });
    return { byKey, usedHalfUnits, totalHalfUnits: shared * 2 };
  }, [config, picks, allItems, extrasCharge]);
  const effectiveExtras = (p: Pick): number =>
    poolDerived?.byKey.get(p.key)?.extrasFee ?? p.extrasFee ?? 0;

  const base = comboItem.price || 0;
  const addonTotal = Object.values(picks).flat().reduce((s, p) => s + (p.upcharge || 0) + effectiveExtras(p), 0);
  const lineTotal = Math.round((base + addonTotal) * 100) / 100;
  const slotsSatisfied = config.slots.every((s) => (picks[s.id]?.length ?? 0) >= s.min);

  const submit = () => {
    if (!slotsSatisfied) return;
    const children: ComboCartChild[] = config.slots.flatMap((s) =>
      (picks[s.id] ?? []).map((p) => {
        const derived = poolDerived?.byKey.get(p.key);
        return {
          menuItemId: p.menuItemId, name: p.name, variantId: p.variantId, variantName: p.variantName,
          // Pool mode: derived modifiers carry the pool-walk DISPLAY charges
          // ($0 = covered), matching what the server will persist.
          modifiers: derived?.modifiers ?? p.modifiers,
          pizzaCustomization: p.pizzaCustomization,
          upcharge: p.upcharge, extrasFee: derived?.extrasFee ?? p.extrasFee,
          slotId: s.id,
        };
      }),
    );
    onAddCombo({ comboItem, lineTotal, children, notes: notes.trim() || undefined });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-lg modal-vh flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold text-gray-900">{comboItem.name}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        {/* Shared-pool meter — pinned below the header so it stays visible
            while the customer scrolls between pizzas. Every customer's prior
            is per-pizza allowances (no platform ships pooling), so the budget
            must stay ON SCREEN or the math reads as a bug. Luigi 2026-08-02. */}
        {poolDerived && (() => {
          const total = poolDerived.totalHalfUnits / 2;
          const used = poolDerived.usedHalfUnits / 2;
          const left = Math.max(0, total - used);
          const fmtN = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
          return (
            <div className={`px-4 py-2.5 border-b ${left <= 0 ? "bg-amber-50" : "bg-gray-50"}`}>
              <div className="flex items-center justify-between text-xs font-semibold text-gray-700">
                <span>{t("poolMeter", { used: fmtN(used), total: fmtN(total) })}</span>
                <span style={left > 0 ? { color: primaryColor } : { color: "#b45309" }}>
                  {left > 0 ? t("poolLeft", { left: fmtN(left) }) : t("poolEmpty")}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(100, (used / Math.max(1, total)) * 100)}%`, backgroundColor: left > 0 ? primaryColor : "#f59e0b" }}
                />
              </div>
            </div>
          );
        })()}

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {config.slots.map((slot, si) => {
            const cur = picks[slot.id] ?? [];
            const done = cur.length >= slot.min;
            const atMax = cur.length >= slot.max;
            return (
              <div key={slot.id}>
                <div className="flex items-center gap-2 mb-2">
                  {done && <Check className="w-4 h-4" style={{ color: primaryColor }} />}
                  <h3 className="font-semibold text-gray-800">{
                    // Treat a blank OR a legacy auto-default ("Slot 1") as unnamed
                    // so older combos fall back to a friendly label too.
                    (slot.label && !/^slot\s*\d+$/i.test(slot.label.trim()))
                      ? slot.label
                      : t("slotFallback", { n: si + 1 })
                  }</h3>
                  <span className="text-xs text-gray-400">{t("pickRange", { min: slot.min, max: slot.max })}</span>
                </div>
                {cur.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {/* Identical picks collapse into ONE chip with ×N (the
                        GloriaFood "3x Suicide" pattern) — trash removes one
                        unit, edit adjusts one unit (splitting it off its
                        group). Pizzas never collapse. Luigi 2026-08-02. */}
                    {groupPicks(cur).map(({ rep: p, keys }) => {
                      const extra = (p.upcharge ?? 0) + effectiveExtras(p);
                      const qty = keys.length;
                      return (
                        <span key={p.key} className="inline-flex items-center gap-1.5 bg-gray-100 rounded-full pl-1.5 pr-1.5 py-1 text-sm">
                          {/* Tap the pick to adjust it in place (reopens its
                              builder/customizer pre-filled). Luigi 2026-07-09. */}
                          <button
                            onClick={() => editPick(slot.id, p)}
                            className="inline-flex items-center gap-1 pl-1.5 rounded-full hover:bg-gray-200 text-left"
                            title={t("customizable")}
                          >
                            <Pencil className="w-3 h-3 text-gray-400 flex-shrink-0" />
                            <span>
                              {qty > 1 ? <strong className="mr-0.5">{t("timesCount", { count: qty })}</strong> : null}
                              {p.name}{p.variantName ? ` (${p.variantName})` : ""}{p.pizzaCustomization || (p.modifiers && p.modifiers.length) ? " ⭐" : ""}{extra > 0 ? ` (+${fmt(extra * qty)})` : ""}
                            </span>
                          </button>
                          <button
                            onClick={() => removePick(slot.id, keys[keys.length - 1])}
                            aria-label={t("removeOne", { name: p.name })}
                            className="p-0.5 text-gray-400 hover:text-red-500"
                          ><Trash2 className="w-3.5 h-3.5" /></button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-1.5">
                  {slotPools[si].map((it: AnyItem) => {
                    const isPizza = !!parsePizzaConfig(it.pizzaConfig);
                    const sizes = allowedVariantsFor(slot.id, it);
                    const up = sizes.length > 0
                      ? Math.min(...sizes.map((v) => comboUpchargeFor(slot, it.id, v.id)))
                      : comboUpchargeFor(slot, it.id);
                    const fromPrice = sizes.length > 1;
                    const customizable = isPizza || needsCustomizer(it, sizes);
                    const isSold = !!it.isSoldOut;
                    // One-pass multi-select: a picked row shows −/+ steppers so
                    // "Choose 4 Pop" fills in one pass (Luigi 2026-08-02, the
                    // GloriaFood/Uber pattern). [+] repeats the last pick of
                    // this item verbatim; the row body still opens the
                    // customizer/builder for a DIFFERENT configuration.
                    const count = countOfItem(slot.id, it.id);
                    const dupesAllowed = slot.allowDuplicates !== false;
                    // Steppers only where a quantity makes sense: multi-pick
                    // slots. Classic 1-pick slots keep their original look.
                    const showStepper = count > 0 && !isSold && !isPizza && slot.max > 1;
                    const canAddMore = !atMax && (dupesAllowed || count === 0);
                    return (
                      <div key={it.id}
                        className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-sm ${count > 0 ? "" : "border-gray-200"} ${isSold ? "opacity-60" : ""}`}
                        style={count > 0 ? { borderColor: primaryColor, backgroundColor: `${primaryColor}0d` } : undefined}>
                        <button
                          disabled={isSold || atMax || (count > 0 && !dupesAllowed)}
                          onClick={() => { if (count > 0 && !customizable) { if (canAddMore) addOneMore(slot.id, it.id); } else choose(slot.id, it); }}
                          className="flex items-center gap-2 min-w-0 flex-1 text-left disabled:cursor-not-allowed"
                        >
                          <span className="min-w-0 truncate">
                            <span className="font-medium text-gray-800">{it.name}</span>
                            {!isSold && customizable && <span className="ml-1.5 text-[10px] font-bold" style={{ color: primaryColor }}>{t("customizable")}</span>}
                            {!isSold && fromPrice && <span className="ml-1.5 text-[10px] text-gray-400">{t("chooseSize")}</span>}
                          </span>
                        </button>
                        <span className="flex items-center gap-2 flex-shrink-0">
                          {isSold ? (
                            <span className="inline-block bg-gray-200 text-gray-700 text-[10px] font-bold px-2 py-0.5 rounded-full">{tOrder("soldOut")}</span>
                          ) : showStepper ? (
                            <span className="flex items-center gap-1">
                              <button
                                onClick={() => removeLastOf(slot.id, it.id)}
                                aria-label={t("removeOne", { name: it.name })}
                                className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100"
                              ><Minus className="w-3.5 h-3.5" /></button>
                              <span className="w-7 text-center text-sm font-bold" style={{ color: primaryColor }}>{count}</span>
                              <button
                                onClick={() => addOneMore(slot.id, it.id)}
                                disabled={atMax || !dupesAllowed}
                                aria-label={t("addAnother", { name: it.name })}
                                className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
                              ><Plus className="w-3.5 h-3.5" /></button>
                            </span>
                          ) : (
                            <>
                              {up > 0 && <span className="text-xs text-gray-500">{fromPrice ? t("fromUpcharge", { price: fmt(up) }) : `+${fmt(up)}`}</span>}
                              {count > 1 && isPizza && <span className="text-sm font-bold" style={{ color: primaryColor }}>{t("timesCount", { count })}</span>}
                              {!(atMax && count === 0) && <Plus className="w-4 h-4 text-gray-400" />}
                            </>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* One Special-instructions note for the whole combo — gated on the
              owner's per-item-note toggle so combos match every other item type
              (Luigi 2026-07-08). Reuses the ordering-namespace note strings. */}
          {allowItemNotes !== false && (
            <div className="px-4 pb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">{tOrder("specialInstructions")}</label>
              <textarea
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 text-gray-900 placeholder:text-gray-400"
                style={{ "--tw-ring-color": primaryColor } as React.CSSProperties}
                rows={2}
                placeholder={tOrder("notesPlaceholder")}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          )}
        </div>

        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t bg-gray-50 rounded-b-2xl">
          {/* Inline unmet-minimums summary (GloriaFood's red box, Luigi
              2026-08-02) — names exactly what's missing instead of a silently
              disabled button. */}
          {!slotsSatisfied && (
            <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg space-y-0.5" role="alert">
              {config.slots
                .filter((s) => (picks[s.id]?.length ?? 0) < s.min)
                .map((s, i) => {
                  const label = (s.label && !/^slot\s*\d+$/i.test(s.label.trim()))
                    ? s.label
                    : t("slotFallback", { n: config.slots.indexOf(s) + 1 });
                  return (
                    <div key={s.id ?? i} className="text-xs font-medium text-red-600">
                      {t("slotNeedsMore", { slot: label, count: s.min - (picks[s.id]?.length ?? 0) })}
                    </div>
                  );
                })}
            </div>
          )}
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
            /* One note per combo (added below), not per pizza slot. */
            allowItemNotes={false}
            /* Shared pool: this builder sees what the OTHER pizzas left over.
               (When editing a pick, its own usage is excluded.) The composer
               memo + server stay the money authority in slot order; this view
               drives the live header/pills. Luigi 2026-08-02. */
            comboPool={poolDerived ? {
              totalHalfUnits: poolDerived.totalHalfUnits,
              usedElsewhereHalfUnits: Math.max(0, poolDerived.usedHalfUnits -
                (pizzaFor.editKey ? (poolDerived.byKey.get(pizzaFor.editKey)?.halfUnitsUsed ?? 0) : 0)),
            } : undefined}
            /* Slot room caps the builder's own qty stepper — no silent clamp. */
            maxQuantity={pizzaFor.editKey ? 1 : Math.max(1, slotById(pizzaFor.slotId).max - (picks[pizzaFor.slotId]?.length ?? 0))}
            /* Editing an existing pick → open pre-filled with its build. */
            initial={pizzaFor.initial
              ? { variantId: pizzaFor.initial.variantId, customization: pizzaFor.initial.customization, quantity: 1, notes: "" }
              : undefined}
            onClose={() => setPizzaFor(null)}
            onAdd={(result) => {
              // Pizza extra toppings are an "extra": charged only when the combo
              // is set to charge for extras. Base (variant) price never applies —
              // the combo's own price covers the pizza.
              const basePrice = result.variant?.price ?? pizzaFor.item.price ?? 0;
              const qty = result.quantity || 1;
              const extrasUnit = Math.max(0, Math.round(((result.lineTotal / qty) - basePrice) * 100) / 100);
              const next = {
                menuItemId: pizzaFor.item.id, name: pizzaFor.item.name,
                variantId: result.variant?.id, variantName: result.variant?.name,
                modifiers: pizzaCustomizationToModifiers(result.customization, pizzaFor.item.modifierGroups ?? []),
                pizzaCustomization: result.customization,
                upcharge: pizzaFor.upcharge,
                extrasFee: extrasCharge ? extrasUnit : 0,
              };
              if (pizzaFor.editKey) {
                replacePick(pizzaFor.slotId, pizzaFor.editKey, next); // in-place edit
              } else {
                // Honor the builder's own quantity stepper: qty 2 = two pizza
                // picks (capacity-clamped). Was silently dropped to ONE pick —
                // a customer who set ×2 got one pizza. Luigi 2026-08-02.
                addPickN(pizzaFor.slotId, next, qty);
              }
              setPizzaFor(null);
            }}
          />
        );
      })()}

      {customizeFor && (() => {
        const cSlot = slotById(customizeFor.slotId);
        const curCount = (picks[customizeFor.slotId] ?? []).length;
        const room = Math.max(1, cSlot.max - curCount);
        // Customize ONCE, apply ×N (Luigi 2026-08-02): the quantity stepper in
        // the customizer emits N identical picks in one pass. Hidden for
        // in-place edits and when the slot forbids duplicates.
        const maxQty = customizeFor.editKey || cSlot.allowDuplicates === false ? 1 : room;
        const defaultQty = Math.min(maxQty, Math.max(1, cSlot.min - curCount));
        return (
        <ChildCustomizer
          item={customizeFor.item}
          allowedVariants={customizeFor.allowedVariants}
          primaryColor={primaryColor}
          fmt={fmt}
          extrasCharge={extrasCharge}
          upchargeFor={(variantId) => comboUpchargeFor(cSlot, customizeFor.item.id, variantId)}
          initial={customizeFor.initial}
          maxQty={maxQty}
          defaultQty={defaultQty}
          onClose={() => setCustomizeFor(null)}
          onConfirm={(pick, qty) => {
            if (customizeFor.editKey) {
              // In-place edit — swap the pick, keep its position.
              replacePick(customizeFor.slotId, customizeFor.editKey, {
                menuItemId: customizeFor.item.id, name: customizeFor.item.name,
                ...pick,
                upcharge: pick.upcharge ?? 0,
              });
              setCustomizeFor(null);
              return;
            }
            addPickN(customizeFor.slotId, {
              menuItemId: customizeFor.item.id, name: customizeFor.item.name,
              ...pick,
              upcharge: pick.upcharge ?? 0,
            }, qty);
            setCustomizeFor(null);
          }}
        />
        );
      })()}
    </div>
  );
}

/** Size + modifier customizer for a non-pizza combo child — the same walk-through
 *  a regular item gets, scoped to the combo's pricing rules. */
function ChildCustomizer({
  item, allowedVariants, primaryColor, fmt, extrasCharge, upchargeFor, onConfirm, onClose, initial,
  maxQty = 1, defaultQty = 1,
}: {
  item: AnyItem;
  allowedVariants: AnyItem[];
  primaryColor: string;
  fmt: (n: number) => string;
  extrasCharge: boolean;
  upchargeFor: (variantId?: string | null) => number;
  onConfirm: (pick: Partial<ComboCartChild>, qty: number) => void;
  onClose: () => void;
  /** In-place pick edit: the pick's current size + flat modifier list to seed
   *  the customizer with (instead of the group defaults). Luigi 2026-07-09. */
  initial?: { variantId?: string; modifiers?: ComboCartChild["modifiers"] };
  /** Customize-once ×N (Luigi 2026-08-02): cap for the quantity stepper —
   *  1 hides it (edits, duplicate-free slots, full slots). */
  maxQty?: number;
  /** Pre-filled quantity: how many the slot still NEEDS (min − picked), so a
   *  "Choose 4" slot opens the first customizer already set to 4. */
  defaultQty?: number;
}) {
  const t = useTranslations("customer.combo");
  const tc = useTranslations("ordering");
  const groups: AnyItem[] = (Array.isArray(item.modifierGroups) ? item.modifierGroups : []).filter((g: AnyItem) => !g.isHidden);
  const hasSizeChoice = allowedVariants.length > 1;

  // Half/half detection is needed by the seed initializers below, so it's
  // declared first. Only single-select groups flagged "Can be Half/Half" qualify.
  const isHalfGroup = (g: AnyItem) => g.supportsHalfHalf === true && g.maxSelect === 1;
  // A half-line's name is "(<localized side>) <option>", built by buildMods below.
  const leftPrefix = `(${t("leftHalf")})`;
  const rightPrefix = `(${t("rightHalf")})`;

  const [variant, setVariant] = useState<AnyItem | null>(
    (initial?.variantId ? allowedVariants.find((v) => v.id === initial.variantId) : undefined) ??
      (allowedVariants.length >= 1 ? allowedVariants[0] : null),
  );
  const [mods, setMods] = useState<Record<string, string[]>>(() => {
    // Re-edit: seed from the pick's stored flat modifier list (by option id);
    // half-line entries are handled by the `half` state below, not here.
    if (initial?.modifiers?.length) {
      const seeded: Record<string, string[]> = {};
      for (const g of groups) {
        const ids = initial.modifiers
          .filter((m) => m.modifierOptionId && !m.name.startsWith("(") && g.options.some((o: AnyItem) => o.id === m.modifierOptionId))
          .map((m) => m.modifierOptionId as string);
        if (ids.length) seeded[g.id] = ids.slice(0, g.maxSelect || 99);
      }
      return seeded;
    }
    const def: Record<string, string[]> = {};
    for (const g of groups) {
      // Capped at maxSelect — over-starred groups must not seed an over-limit
      // selection (mirrors the item modal + pizza builder). Luigi 2026-07-09.
      const defs = g.options.filter((o: AnyItem) => o.isDefault && o.isAvailable).map((o: AnyItem) => o.id)
        .slice(0, Math.max(1, g.maxSelect || 1));
      if (defs.length) def[g.id] = defs;
    }
    return def;
  });

  // Half/half state per eligible group: pick a different option for each half
  // (e.g. half BBQ wings, half Hot). Seeded from the pick's "(Left/Right half)"
  // lines on re-edit (labels are locale-local; a locale switch since the pick
  // was made simply drops the half seed — the customer re-picks).
  const [half, setHalf] = useState<Record<string, { on: boolean; left?: string; right?: string }>>(() => {
    const seeded: Record<string, { on: boolean; left?: string; right?: string }> = {};
    if (initial?.modifiers?.length) {
      for (const g of groups) {
        if (!isHalfGroup(g)) continue;
        const inGroup = initial.modifiers.filter((m) => m.modifierOptionId && g.options.some((o: AnyItem) => o.id === m.modifierOptionId));
        const left = inGroup.find((m) => m.name.startsWith(leftPrefix))?.modifierOptionId;
        const right = inGroup.find((m) => m.name.startsWith(rightPrefix))?.modifierOptionId;
        if (left || right) seeded[g.id] = { on: true, left, right };
      }
    }
    return seeded;
  });

  const toggleMod = (g: AnyItem, optId: string) => {
    setMods((prev) => {
      const cur = prev[g.id] || [];
      const has = cur.includes(optId);
      if (g.maxSelect === 1) return { ...prev, [g.id]: has ? [] : [optId] };
      if (has) return { ...prev, [g.id]: cur.filter((x) => x !== optId) };
      if (cur.length >= (g.maxSelect || 99)) return prev; // at max
      return { ...prev, [g.id]: [...cur, optId] };
    });
  };
  const setHalfSide = (gId: string, side: "left" | "right", optId: string) =>
    setHalf((prev) => ({ ...prev, [gId]: { ...(prev[gId] ?? { on: true }), on: true, [side]: optId } }));
  const toggleHalf = (gId: string) =>
    setHalf((prev) => ({ ...prev, [gId]: { ...(prev[gId] ?? {}), on: !prev[gId]?.on } }));

  // Build the flat modifier list, honoring half/half groups (two labelled
  // entries — one per half — instead of a single whole selection).
  const buildMods = (): Array<{ modifierOptionId?: string; name: string; priceAdjustment?: number }> => {
    const out: Array<{ modifierOptionId?: string; name: string; priceAdjustment?: number }> = [];
    for (const g of groups) {
      if (isHalfGroup(g) && half[g.id]?.on) {
        for (const [side, label] of [["left", t("leftHalf")], ["right", t("rightHalf")]] as const) {
          const optId = half[g.id]?.[side as "left" | "right"];
          const o = optId ? g.options.find((x: AnyItem) => x.id === optId) : null;
          if (o) out.push({ modifierOptionId: o.id, name: `(${label}) ${o.name}`, priceAdjustment: o.priceAdjustment ?? 0 });
        }
      } else {
        for (const optId of mods[g.id] || []) {
          const o = g.options.find((x: AnyItem) => x.id === optId);
          if (o) out.push({ modifierOptionId: o.id, name: o.name, priceAdjustment: o.priceAdjustment ?? 0 });
        }
      }
    }
    return out;
  };
  const builtMods = buildMods();

  const extrasFee = extrasCharge
    ? Math.round(builtMods.reduce((s, m) => s + (m.priceAdjustment || 0), 0) * 100) / 100
    : 0;
  const upcharge = upchargeFor(variant?.id);
  const [qty, setQty] = useState(() => Math.min(Math.max(1, defaultQty), Math.max(1, maxQty)));
  const addExtra = (upcharge + extrasFee) * qty;

  // Required groups must be satisfied (mirrors the regular item modal).
  const unmet = groups.filter((g) => {
    if (isHalfGroup(g) && half[g.id]?.on) {
      return g.required ? !(half[g.id]?.left && half[g.id]?.right) : false;
    }
    const need = g.required ? Math.max(1, g.minSelect || 0) : (g.minSelect || 0);
    return (mods[g.id]?.length ?? 0) < need;
  });
  const canAdd = unmet.length === 0;

  const confirm = () => {
    if (!canAdd) return;
    onConfirm({
      variantId: variant?.id, variantName: variant?.name,
      modifiers: builtMods,
      upcharge, extrasFee,
    }, qty);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md modal-vh flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-bold text-gray-900">{item.name}</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Size selector */}
          {hasSizeChoice && (
            <div>
              <div className="text-sm font-semibold text-gray-800 mb-1.5">{t("sizeLabel")}</div>
              <div className="space-y-1.5">
                {allowedVariants.map((v: AnyItem) => {
                  const vUp = upchargeFor(v.id);
                  const on = variant?.id === v.id;
                  return (
                    <label key={v.id} className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border cursor-pointer"
                      style={on ? { borderColor: primaryColor, backgroundColor: `${primaryColor}11` } : { borderColor: "#e5e7eb" }}>
                      <span className="flex items-center gap-2">
                        <input type="radio" checked={on} onChange={() => setVariant(v)} className="w-4 h-4" style={{ accentColor: primaryColor }} />
                        <span className="text-sm font-medium text-gray-800">{v.name}</span>
                      </span>
                      {vUp > 0 && <span className="text-xs text-gray-500">+{fmt(vUp)}</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Modifier groups — radio (maxSelect 1) or checkbox (maxSelect >1),
              plus an optional Half & Half mode for eligible groups. */}
          {groups.map((g: AnyItem) => {
            const sel = mods[g.id] || [];
            const single = g.maxSelect === 1;
            const atMax = !single && sel.length >= (g.maxSelect || 99);
            const canHalf = isHalfGroup(g);
            const halfOn = canHalf && !!half[g.id]?.on;
            const opts = g.options.filter((o: AnyItem) => o.isAvailable !== false);
            // Toggle on label CLICK, not input onChange — an already-checked
            // RADIO never fires change, which trapped optional single-selects
            // at their first pick (same fix as the item modal; Luigi
            // 2026-07-10). preventDefault keeps one path for click/tap/Space;
            // the callback (toggleMod / setHalfSide) owns the semantics.
            const optRow = (o: AnyItem, checked: boolean, onPick: () => void, type: "radio" | "checkbox", disabled = false) => (
              <label key={o.id + (type === "radio" ? "r" : "c")} className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border cursor-pointer ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                style={checked ? { borderColor: primaryColor, backgroundColor: `${primaryColor}11` } : { borderColor: "#e5e7eb" }}
                onClick={(e) => { e.preventDefault(); if (!disabled) onPick(); }}>
                <span className="flex items-center gap-2 min-w-0">
                  <input type={type} checked={checked} disabled={disabled} readOnly onChange={() => {}} className="w-4 h-4 flex-shrink-0" style={{ accentColor: primaryColor, pointerEvents: "none" }} />
                  <span className="text-sm text-gray-800 truncate">{o.name}</span>
                </span>
                {extrasCharge && o.priceAdjustment > 0 && <span className="text-xs text-gray-500 flex-shrink-0">+{fmt(o.priceAdjustment)}</span>}
              </label>
            );
            return (
              <div key={g.id}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm font-semibold text-gray-800">{g.name}</span>
                  {g.required && <span className="text-[10px] font-bold uppercase text-red-500">{tc("required")}</span>}
                  {!single && (g.maxSelect || 0) > 0 && <span className="text-[11px] text-gray-400">{t("upToCount", { count: g.maxSelect })}</span>}
                  {canHalf && (
                    <button type="button" onClick={() => toggleHalf(g.id)}
                      className="ml-auto text-[11px] font-semibold px-2 py-0.5 rounded-full border"
                      style={halfOn ? { borderColor: primaryColor, color: primaryColor, backgroundColor: `${primaryColor}11` } : { borderColor: "#e5e7eb", color: "#6b7280" }}>
                      {t("halfHalfToggle")}
                    </button>
                  )}
                </div>
                {halfOn ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-[11px] font-medium text-gray-500 mb-1">{t("leftHalf")}</div>
                      <div className="space-y-1.5">
                        {opts.map((o: AnyItem) => optRow(o, half[g.id]?.left === o.id, () => setHalfSide(g.id, "left", o.id), "radio"))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-medium text-gray-500 mb-1">{t("rightHalf")}</div>
                      <div className="space-y-1.5">
                        {opts.map((o: AnyItem) => optRow(o, half[g.id]?.right === o.id, () => setHalfSide(g.id, "right", o.id), "radio"))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {opts.map((o: AnyItem) => optRow(o, sel.includes(o.id), () => toggleMod(g, o.id), single ? "radio" : "checkbox", !sel.includes(o.id) && atMax))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] border-t bg-gray-50 rounded-b-2xl">
          {/* Customize-once ×N: pick the quantity here and N identical copies
              land at once — no more one-modal-per-drink (Luigi 2026-08-02). */}
          {maxQty > 1 && (
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-800">{t("howMany")}</span>
              <span className="flex items-center gap-2">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1}
                  aria-label={t("removeOne", { name: item.name })}
                  className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 disabled:opacity-40">
                  <Minus className="w-3.5 h-3.5" /></button>
                <span className="w-8 text-center text-sm font-bold">{qty}</span>
                <button onClick={() => setQty((q) => Math.min(maxQty, q + 1))} disabled={qty >= maxQty}
                  aria-label={t("addAnother", { name: item.name })}
                  className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 disabled:opacity-40">
                  <Plus className="w-3.5 h-3.5" /></button>
              </span>
            </div>
          )}
          <button onClick={confirm} disabled={!canAdd}
            className="w-full py-3 rounded-xl text-white font-semibold disabled:opacity-50"
            style={{ backgroundColor: primaryColor }}>
            {canAdd
              ? (maxQty > 1 && qty > 1
                  ? t("addChoiceQty", { count: qty, price: addExtra > 0 ? ` · +${fmt(addExtra)}` : "" })
                  : t("addChoice", { price: addExtra > 0 ? ` · +${fmt(addExtra)}` : "" }))
              : t("completeRequired")}
          </button>
        </div>
      </div>
    </div>
  );
}
