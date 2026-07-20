"use client";
import { useMemo, useState } from "react";
import { X, Check, Plus, Trash2, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { PizzaBuilder, parsePizzaConfig, pizzaCustomizationToModifiers, type PizzaCustomization } from "./PizzaBuilder";
import { parseComboConfig, comboAllowedVariantIds, comboUpchargeFor } from "@/lib/combo";

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
    for (const c of initial.children) {
      let slotIdx = -1;
      if (c.slotId && seeded[c.slotId] && seeded[c.slotId].length < (config.slots.find((s) => s.id === c.slotId)?.max ?? 0)) {
        slotIdx = config.slots.findIndex((s) => s.id === c.slotId);
      } else {
        slotIdx = config.slots.findIndex((s, si) => {
          if ((seeded[s.id]?.length ?? 0) >= s.max) return false;
          return slotPools[si]?.some((p: AnyItem) => p.id === c.menuItemId) ?? false;
        });
      }
      if (slotIdx === -1) continue; // stale pick (combo config changed) → drop
      const slot = config.slots[slotIdx];
      seeded[slot.id].push({
        key: `${c.menuItemId}-${seeded[slot.id].length}-${c.variantId ?? c.name}`,
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

  const addPick = (slotId: string, pick: Pick) =>
    setPicks((p) => {
      const slot = config.slots.find((s) => s.id === slotId)!;
      const cur = p[slotId] ?? [];
      if (cur.length >= slot.max) return p; // at max — ignore (UI also disables)
      return { ...p, [slotId]: [...cur, pick] };
    });
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
    addPick(slotId, {
      key: `${item.id}-${picks[slotId]?.length ?? 0}-${v?.id ?? item.name}`,
      menuItemId: item.id, name: item.name, variantId: v?.id, variantName: v?.name,
      upcharge: comboUpchargeFor(slot, item.id, v?.id),
    });
  };

  const base = comboItem.price || 0;
  const addonTotal = Object.values(picks).flat().reduce((s, p) => s + (p.upcharge || 0) + (p.extrasFee || 0), 0);
  const lineTotal = Math.round((base + addonTotal) * 100) / 100;
  const slotsSatisfied = config.slots.every((s) => (picks[s.id]?.length ?? 0) >= s.min);

  const submit = () => {
    if (!slotsSatisfied) return;
    const children: ComboCartChild[] = config.slots.flatMap((s) =>
      (picks[s.id] ?? []).map((p) => ({
        menuItemId: p.menuItemId, name: p.name, variantId: p.variantId, variantName: p.variantName,
        modifiers: p.modifiers, pizzaCustomization: p.pizzaCustomization,
        upcharge: p.upcharge, extrasFee: p.extrasFee,
        slotId: s.id,
      })),
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
                    {cur.map((p) => {
                      const extra = (p.upcharge ?? 0) + (p.extrasFee ?? 0);
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
                            <span>{p.name}{p.variantName ? ` (${p.variantName})` : ""}{p.pizzaCustomization || (p.modifiers && p.modifiers.length) ? " ⭐" : ""}{extra > 0 ? ` (+${fmt(extra)})` : ""}</span>
                          </button>
                          <button onClick={() => removePick(slot.id, p.key)} className="p-0.5 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
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
                    return (
                      <button key={it.id} disabled={atMax || isSold} onClick={() => choose(slot.id, it)}
                        className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-left hover:border-gray-300 disabled:opacity-40 disabled:cursor-not-allowed ${isSold ? "opacity-60 cursor-not-allowed" : ""}`}>
                        <span className="min-w-0 truncate">
                          <span className="font-medium text-gray-800">{it.name}</span>
                          {!isSold && customizable && <span className="ml-1.5 text-[10px] font-bold" style={{ color: primaryColor }}>{t("customizable")}</span>}
                          {!isSold && fromPrice && <span className="ml-1.5 text-[10px] text-gray-400">{t("chooseSize")}</span>}
                        </span>
                        <span className="flex items-center gap-2 flex-shrink-0">
                          {isSold ? (
                            <span className="inline-block bg-gray-200 text-gray-700 text-[10px] font-bold px-2 py-0.5 rounded-full">{tOrder("soldOut")}</span>
                          ) : (
                            <>
                              {up > 0 && <span className="text-xs text-gray-500">{fromPrice ? t("fromUpcharge", { price: fmt(up) }) : `+${fmt(up)}`}</span>}
                              <Plus className="w-4 h-4 text-gray-400" />
                            </>
                          )}
                        </span>
                      </button>
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
                addPick(pizzaFor.slotId, { key: `${pizzaFor.item.id}-${result.variant?.id ?? ""}-${(picks[pizzaFor.slotId]?.length ?? 0)}`, ...next });
              }
              setPizzaFor(null);
            }}
          />
        );
      })()}

      {customizeFor && (
        <ChildCustomizer
          item={customizeFor.item}
          allowedVariants={customizeFor.allowedVariants}
          primaryColor={primaryColor}
          fmt={fmt}
          extrasCharge={extrasCharge}
          upchargeFor={(variantId) => comboUpchargeFor(slotById(customizeFor.slotId), customizeFor.item.id, variantId)}
          initial={customizeFor.initial}
          onClose={() => setCustomizeFor(null)}
          onConfirm={(pick) => {
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
            addPick(customizeFor.slotId, {
              key: `${customizeFor.item.id}-${pick.variantId ?? ""}-${(picks[customizeFor.slotId]?.length ?? 0)}`,
              menuItemId: customizeFor.item.id, name: customizeFor.item.name,
              ...pick,
              upcharge: pick.upcharge ?? 0,
            });
            setCustomizeFor(null);
          }}
        />
      )}
    </div>
  );
}

/** Size + modifier customizer for a non-pizza combo child — the same walk-through
 *  a regular item gets, scoped to the combo's pricing rules. */
function ChildCustomizer({
  item, allowedVariants, primaryColor, fmt, extrasCharge, upchargeFor, onConfirm, onClose, initial,
}: {
  item: AnyItem;
  allowedVariants: AnyItem[];
  primaryColor: string;
  fmt: (n: number) => string;
  extrasCharge: boolean;
  upchargeFor: (variantId?: string | null) => number;
  onConfirm: (pick: Partial<ComboCartChild>) => void;
  onClose: () => void;
  /** In-place pick edit: the pick's current size + flat modifier list to seed
   *  the customizer with (instead of the group defaults). Luigi 2026-07-09. */
  initial?: { variantId?: string; modifiers?: ComboCartChild["modifiers"] };
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
  const addExtra = upcharge + extrasFee;

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
    });
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
          <button onClick={confirm} disabled={!canAdd}
            className="w-full py-3 rounded-xl text-white font-semibold disabled:opacity-50"
            style={{ backgroundColor: primaryColor }}>
            {canAdd ? t("addChoice", { price: addExtra > 0 ? ` · +${fmt(addExtra)}` : "" }) : t("completeRequired")}
          </button>
        </div>
      </div>
    </div>
  );
}
