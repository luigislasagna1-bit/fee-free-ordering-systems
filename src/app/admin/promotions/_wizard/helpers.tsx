"use client";
/**
 * Shared helpers + small UI primitives used by the 3-step promo wizard.
 * Copied/adapted from PromotionsClient.tsx so the wizard can evolve
 * independently without breaking the still-rendering list UI.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Edit2, Plus, X } from "lucide-react";

// ─── HH:MM ↔ minutes-since-midnight ──────────────────────────────────────────

export function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return Math.max(0, Math.min(1440, h * 60 + m));
}

export function minToHHMM(min: number | null | undefined): string {
  if (min == null || !Number.isFinite(min)) return "";
  const m = Math.max(0, Math.min(1440, Math.floor(min)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type IG = {
  id: string;
  label: string;
  categoryIds: string[];
  itemIds: string[];
  /** Specific size-variant IDs the promo targets. Empty/absent = no
   *  variant-level restriction. When a variant is listed (but its parent
   *  item is NOT in itemIds), only that size qualifies. Optional so legacy
   *  groups + inline constructions stay valid. Luigi 2026-06-07. */
  variantIds?: string[];
  role?: "paid" | "free" | "trigger" | "required";
  minCount?: number;
  maxCount?: number;
  extraFee?: number;
  /** meal_bundle_speciality (Luigi 2026-07-07): the specific size-variant IDs
   *  in this slot that carry `extraFee` (e.g. the Large size = +$5). Base sizes
   *  are free. Empty/absent = the fee applies to every pick (legacy). */
  specialityVariantIds?: string[];
  /** Same as specialityVariantIds but for whole ITEMS (non-sized premium picks). */
  specialityItemIds?: string[];
};

export type PromoRules = {
  discountPercent?: number;
  discountAmount?: number;
  /** reward_credit: store credit (Reward Dollars) granted on completion. */
  creditAmount?: number;
  bundlePrice?: number;
  /** payment_reward: LEGACY single accepted method ("online_card" | "cash" | …
   *  | "any"). Superseded by `paymentMethods` (multi-select) but still read for
   *  backward compat. */
  paymentMethod?: string;
  /** payment_reward: the set of accepted methods that earn the reward
   *  (multi-select checkboxes). Empty / absent = ANY method. Luigi 2026-07-07. */
  paymentMethods?: string[];
  triggerAmount?: number;
  discountStrategy?: "cheapest" | "most_expensive" | "fixed_percent";
  cheapestDiscount?: number;
  mostExpensiveDiscount?: number;
  /** BOGO / Buy-N-Get-Free free-item "extra charges" mode (GloriaFood parity,
   *  Luigi 2026-07-07): "none" frees the whole free item; "addons" still charges
   *  its toppings/choices; "addons_sizes" also charges the size upgrade. */
  freeItemExtraChargeMode?: "none" | "addons" | "addons_sizes";
  /** Cap a repeating deal (BOGO / buy-N-get-free) to one application per order. */
  oncePerOrder?: boolean;
  groups?: IG[];
};

export type CatEntry = {
  id: string;
  name: string;
  /** Which menu this category belongs to — drives the menu sub-headers in the
   *  picker for multi-menu stores (Fabrizio: categories from all menus were
   *  merged with no way to tell them apart). Luigi 2026-06-26. */
  menuId?: string | null;
  menuName?: string | null;
  items: {
    id: string;
    name: string;
    price: number;
    variants?: { id: string; name: string; price: number }[];
  }[];
};

// ─── Group factory + init per type ──────────────────────────────────────────

let _gc = 0;
export function newGroup(role?: IG["role"]): IG {
  return {
    id: `g${++_gc}_${Date.now()}`,
    label: "",
    categoryIds: [],
    itemIds: [],
    variantIds: [],
    role,
  };
}

export function initRulesForType(type: string): PromoRules {
  switch (type) {
    case "bogo":
      return {
        groups: [newGroup("paid"), newGroup("free")],
        discountStrategy: "cheapest",
        cheapestDiscount: 100,
      };
    case "buy_n_get_free":
      return {
        // Seed the paid group's "buy N" count so it's explicit + editable.
        groups: [{ ...newGroup("paid"), minCount: 1 }, newGroup("free")],
        discountStrategy: "cheapest",
        cheapestDiscount: 100,
      };
    case "fixed_combo":
      return { groups: [newGroup(), newGroup()] };
    case "percentage_combo":
      return { groups: [newGroup(), newGroup()] };
    case "meal_bundle":
      return { groups: [newGroup()] };
    case "meal_bundle_speciality":
      return { groups: [newGroup()] };
    case "free_dish_meal":
      return { groups: [newGroup("trigger"), newGroup("free")] };
    case "free_item":
      return { groups: [newGroup("free")], triggerAmount: 0 };
    default:
      return {};
  }
}

export function groupSummary(g: IG, cats: CatEntry[]): string {
  const cc = g.categoryIds.length;
  const ic = g.itemIds.length;
  const vc = (g.variantIds ?? []).length;
  if (!cc && !ic && !vc) return "No items selected — click to edit";
  const parts: string[] = [];
  if (cc) {
    const names = g.categoryIds
      .slice(0, 2)
      .map((id) => cats.find((c) => c.id === id)?.name ?? id)
      .join(", ");
    parts.push(`${names}${cc > 2 ? ` +${cc - 2} more` : ""}`);
  }
  if (ic) parts.push(`${ic} specific item${ic > 1 ? "s" : ""}`);
  if (vc) parts.push(`${vc} size${vc > 1 ? "s" : ""}`);
  return parts.join(" + ");
}

// ─── ItemGroupPicker ────────────────────────────────────────────────────────

export function ItemGroupPicker({
  group,
  cats,
  onApply,
  onCancel,
  currencySymbol = "$",
}: {
  group: IG;
  cats: CatEntry[];
  onApply: (g: IG) => void;
  onCancel: () => void;
  currencySymbol?: string;
}) {
  const [draft, setDraft] = useState<IG>(() => ({
    ...group,
    categoryIds: [...group.categoryIds],
    itemIds: [...group.itemIds],
    variantIds: [...(group.variantIds ?? [])],
  }));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleVariant = (variantId: string) =>
    setDraft((d) => ({
      ...d,
      variantIds: (d.variantIds ?? []).includes(variantId)
        ? (d.variantIds ?? []).filter((v) => v !== variantId)
        : [...(d.variantIds ?? []), variantId],
    }));

  const toggleCat = (catId: string) => {
    setDraft((d) => {
      if (d.categoryIds.includes(catId)) {
        return { ...d, categoryIds: d.categoryIds.filter((c) => c !== catId) };
      }
      const catItemIds = cats.find((c) => c.id === catId)?.items.map((i) => i.id) ?? [];
      return {
        ...d,
        categoryIds: [...d.categoryIds, catId],
        itemIds: d.itemIds.filter((id) => !catItemIds.includes(id)),
      };
    });
  };

  const toggleItem = (itemId: string) =>
    setDraft((d) => ({
      ...d,
      itemIds: d.itemIds.includes(itemId)
        ? d.itemIds.filter((i) => i !== itemId)
        : [...d.itemIds, itemId],
    }));

  const toggleExpand = (catId: string) =>
    setExpanded((prev) => {
      const s = new Set(prev);
      if (s.has(catId)) s.delete(catId);
      else s.add(catId);
      return s;
    });

  // Show a menu sub-header before each category when the store has MORE THAN
  // ONE menu (otherwise the flat list is fine). `cats` is sorted by menu by the
  // caller, so same-menu categories are contiguous. Luigi 2026-06-26.
  const showMenuHeaders = new Set(cats.map((c) => c.menuName).filter(Boolean)).size > 1;

  return (
    // Centered modal overlay (Luigi 2026-06-01). The picker used to be
    // absolutely positioned below its trigger button — when the trigger
    // sat near the bottom of the wizard form, the picker spilled past
    // the visible area and Apply/Cancel buttons got cut off. Promoting
    // to a fixed modal sidesteps every parent-clipping concern and is
    // mobile-friendly out of the box.
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md max-h-[85vh] bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
      <div className="px-3 py-2 bg-gray-50 border-b flex items-center justify-between flex-shrink-0">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Select categories or items
        </span>
        {/* Explicit close button — easier to dismiss than relying on the
            invisible-outside-click behavior, especially on mobile where
            the user might struggle to find a "safe" tap area. */}
        <button
          type="button"
          onClick={onCancel}
          className="p-1 -mr-1 text-gray-400 hover:text-gray-600 transition rounded"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div
        className="flex-1 overflow-y-auto"
        onScroll={(e) => e.stopPropagation()}
      >
        {cats.length === 0 ? (
          <div className="px-3 py-4 text-sm text-gray-400 text-center">No categories found</div>
        ) : (
          cats.map((cat, _i) => {
            const catChecked = draft.categoryIds.includes(cat.id);
            const isExpanded = expanded.has(cat.id);
            const catItemIds = cat.items.map((i) => i.id);
            const selectedInCat = catItemIds.filter((id) => draft.itemIds.includes(id)).length;
            // Menu sub-header when this category starts a new menu group.
            const menuHeader = showMenuHeaders && (_i === 0 || cats[_i - 1].menuName !== cat.menuName)
              ? (cat.menuName || "—")
              : null;

            return (
              <div key={cat.id}>
                {menuHeader && (
                  <div className="px-3 py-1.5 bg-gray-100 text-[11px] font-bold uppercase tracking-wide text-gray-500 sticky top-0 z-10">
                    {menuHeader}
                  </div>
                )}
                <div className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={catChecked}
                    onChange={() => toggleCat(cat.id)}
                    className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500 flex-shrink-0"
                  />
                  <span
                    className="flex-1 text-sm text-gray-800 cursor-pointer select-none"
                    onClick={() => toggleCat(cat.id)}
                  >
                    {cat.name}
                  </span>
                  {!catChecked && selectedInCat > 0 && (
                    <span className="text-xs bg-emerald-100 text-emerald-600 px-1.5 rounded-full">
                      {selectedInCat}
                    </span>
                  )}
                  {cat.items.length > 0 && (
                    <button
                      onClick={() => toggleExpand(cat.id)}
                      className="p-0.5 text-gray-400 hover:text-gray-600 flex-shrink-0"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
                {isExpanded && (
                  <div className="pl-8 pr-3 pb-1 space-y-0.5">
                    {cat.items.map((item) => {
                      const itemChecked = catChecked || draft.itemIds.includes(item.id);
                      const variants = item.variants ?? [];
                      const hasVariants = variants.length > 0;
                      return (
                        <div key={item.id}>
                          <label
                            className={`flex items-center gap-2 py-1 text-sm cursor-pointer ${
                              catChecked ? "opacity-50" : ""
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={itemChecked}
                              disabled={catChecked}
                              onChange={() => !catChecked && toggleItem(item.id)}
                              className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500"
                            />
                            <span className="flex-1 text-gray-700">
                              {item.name}
                              {hasVariants && <span className="text-gray-400"> · all sizes</span>}
                            </span>
                            <span className="text-xs text-gray-400">
                              {currencySymbol}{item.price.toFixed(2)}
                            </span>
                          </label>
                          {/* Per-size variant checkboxes — target a specific size
                              instead of the whole item. Disabled (implied) when the
                              whole item or its category is selected. */}
                          {hasVariants && (
                            <div className="pl-7 pb-0.5 space-y-0.5">
                              {variants.map((v) => {
                                const vChecked = itemChecked || (draft.variantIds ?? []).includes(v.id);
                                const vDisabled = itemChecked;
                                return (
                                  <label
                                    key={v.id}
                                    className={`flex items-center gap-2 py-0.5 text-xs cursor-pointer ${
                                      vDisabled ? "opacity-50" : ""
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={vChecked}
                                      disabled={vDisabled}
                                      onChange={() => !vDisabled && toggleVariant(v.id)}
                                      className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500"
                                    />
                                    <span className="flex-1 text-gray-500">{v.name}</span>
                                    <span className="text-gray-400">{currencySymbol}{v.price.toFixed(2)}</span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      <div className="flex gap-2 px-3 py-2 border-t bg-gray-50 flex-shrink-0">
        <button
          onClick={() => onApply(draft)}
          className="flex-1 bg-emerald-500 text-white text-sm font-semibold py-2 rounded-lg hover:bg-emerald-600 transition"
        >
          Apply
        </button>
        <button
          onClick={onCancel}
          className="px-4 text-sm text-gray-600 rounded-lg border border-gray-200 hover:bg-gray-100 transition"
        >
          Cancel
        </button>
      </div>
      </div>
    </div>
  );
}

// ─── SpecialityFeePicker ────────────────────────────────────────────────────
// meal_bundle_speciality (Luigi 2026-07-07): choose WHICH sizes/items in a slot
// carry the speciality fee (e.g. only "Large"), so base sizes stay free —
// matching GloriaFood. Writes group.specialityVariantIds / specialityItemIds.
// Only offers the slot's already-eligible items.
function SpecialityFeePicker({
  group, cats, currencySymbol = "$", onApply, onCancel,
}: {
  group: IG;
  cats: CatEntry[];
  currencySymbol?: string;
  onApply: (partial: { specialityVariantIds: string[]; specialityItemIds: string[] }) => void;
  onCancel: () => void;
}) {
  const [vIds, setVIds] = useState<string[]>([...(group.specialityVariantIds ?? [])]);
  const [iIds, setIIds] = useState<string[]>([...(group.specialityItemIds ?? [])]);
  const toggleV = (id: string) => setVIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleI = (id: string) => setIIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  // Items eligible in this slot: explicitly picked, or in a picked category.
  const eligible: CatEntry["items"] = [];
  const seen = new Set<string>();
  for (const c of cats) {
    const catSel = group.categoryIds.includes(c.id);
    for (const it of c.items) {
      if ((catSel || group.itemIds.includes(it.id)) && !seen.has(it.id)) {
        seen.add(it.id);
        eligible.push(it);
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onCancel}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] flex flex-col" onMouseDown={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b">
          <div className="text-sm font-semibold text-gray-800">Charge the fee only for these sizes</div>
          <div className="text-xs text-gray-500 mt-0.5">
            Tick the premium sizes that add the fee — base sizes stay free. Leave all unticked to charge the fee on every pick.
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1" onScroll={(e) => e.stopPropagation()}>
          {eligible.length === 0 ? (
            <div className="text-xs text-gray-400 py-6 text-center">Pick this slot&apos;s items first, then choose which sizes cost extra.</div>
          ) : (
            eligible.map((item) => {
              const variants = item.variants ?? [];
              // Whole-item premium (e.g. a premium steak): ticking the item adds
              // the fee to EVERY size. Ticking specific sizes below scopes it to
              // just those. Luigi 2026-07-07.
              const itemChecked = iIds.includes(item.id);
              if (variants.length > 0) {
                return (
                  <div key={item.id}>
                    <label className="flex items-center gap-2 py-1 text-sm cursor-pointer">
                      <input type="checkbox" checked={itemChecked} onChange={() => toggleI(item.id)}
                        className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500" />
                      <span className="flex-1 font-medium text-gray-700">
                        {item.name}<span className="text-xs text-gray-400 font-normal"> · whole item (all sizes)</span>
                      </span>
                    </label>
                    <div className="pl-6 space-y-0.5">
                      {variants.map((v) => {
                        const vChecked = itemChecked || vIds.includes(v.id);
                        return (
                          <label key={v.id} className={`flex items-center gap-2 py-0.5 text-sm cursor-pointer ${itemChecked ? "opacity-50" : ""}`}>
                            <input type="checkbox" checked={vChecked} disabled={itemChecked}
                              onChange={() => !itemChecked && toggleV(v.id)}
                              className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500" />
                            <span className="flex-1 text-gray-600">{v.name}</span>
                            <span className="text-xs text-gray-400">{currencySymbol}{v.price.toFixed(2)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              }
              return (
                <label key={item.id} className="flex items-center gap-2 py-1 text-sm cursor-pointer">
                  <input type="checkbox" checked={itemChecked} onChange={() => toggleI(item.id)}
                    className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500" />
                  <span className="flex-1 text-gray-700">{item.name}</span>
                  <span className="text-xs text-gray-400">{currencySymbol}{item.price.toFixed(2)}</span>
                </label>
              );
            })
          )}
        </div>
        <div className="flex gap-2 px-3 py-2 border-t bg-gray-50">
          <button onClick={() => onApply({ specialityVariantIds: vIds, specialityItemIds: iIds })}
            className="flex-1 bg-emerald-500 text-white text-sm font-semibold py-2 rounded-lg hover:bg-emerald-600 transition">Apply</button>
          <button onClick={onCancel}
            className="px-4 text-sm text-gray-600 rounded-lg border border-gray-200 hover:bg-gray-100 transition">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ─── ItemGroupRow ───────────────────────────────────────────────────────────

function ItemGroupRow({
  group,
  index,
  cats,
  onChange,
  onRemove,
  canRemove = true,
  showSlotConfig = false,
  showSpecialityFee = false,
  currencySymbol = "$",
}: {
  group: IG;
  index: number;
  cats: CatEntry[];
  onChange: (g: IG) => void;
  onRemove: () => void;
  canRemove?: boolean;
  currencySymbol?: string;
  /** Show inline min/max-per-slot inputs. Used by meal-bundle types
   *  (catalog #8, #13) so the owner can configure "1 pizza + 2 sides
   *  + 1 drink" instead of the v1 hardcoded 1-per-group. */
  showSlotConfig?: boolean;
  /** Show inline speciality-fee input (catalog #13 only). Lets a slot
   *  carry a per-item upcharge ("lobster +$5") on top of the bundle
   *  base price. */
  showSpecialityFee?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [feeOpen, setFeeOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Click / tap outside the row closes the picker. mousedown for desktop
    // + touchstart for mobile, since touchstart fires earlier than the
    // synthesized mousedown on most mobile browsers (~300ms faster).
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    // Also close on window scroll — when the picker is open over a long
    // form, the user trying to reach controls below can't scroll past
    // the dropdown. Auto-closing on scroll removes the obstacle and
    // makes their gesture do what they intended (scroll the page).
    // We ignore scrolls INSIDE the picker via stopPropagation in the
    // picker's own scroll container below.
    const handleScroll = () => setOpen(false);
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [open]);

  const roleLabel: Record<string, string> = {
    paid: " (Paid)",
    free: " (Free)",
    trigger: " (Trigger)",
    required: " (Required)",
  };

  return (
    <div className="py-1.5 space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="flex-1 relative" ref={ref}>
          <button
            onClick={() => setOpen(!open)}
            className="w-full flex items-center gap-3 border border-gray-200 rounded-lg px-3 py-2 bg-white text-left hover:border-emerald-300 transition"
          >
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-gray-400 mb-0.5">
                Items Group {index + 1}
                {group.role ? roleLabel[group.role] ?? "" : ""}
              </div>
              <div className="text-sm text-gray-700 truncate">
                {groupSummary(group, cats)}
              </div>
            </div>
            <Edit2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          </button>
          {open && (
            <ItemGroupPicker
              group={group}
              cats={cats}
              currencySymbol={currencySymbol}
              onApply={(g) => {
                onChange(g);
                setOpen(false);
              }}
              onCancel={() => setOpen(false)}
            />
          )}
        </div>
        {canRemove && (
          <button
            onClick={onRemove}
            className="p-1.5 text-gray-300 hover:text-red-500 transition"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {(showSlotConfig || showSpecialityFee) && (
        <div className="flex items-center gap-3 pl-1 pr-9 flex-wrap">
          {showSlotConfig && (
            <>
              <label className="flex items-center gap-1.5 text-xs text-gray-500">
                <span>Pick at least</span>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={group.minCount ?? 1}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(20, parseInt(e.target.value || "1", 10) || 1));
                    onChange({ ...group, minCount: v });
                  }}
                  className="w-14 border border-gray-200 rounded px-2 py-1 text-xs text-gray-700"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-500">
                <span>up to</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={group.maxCount ?? group.minCount ?? 1}
                  onChange={(e) => {
                    const v = Math.max(1, Math.min(20, parseInt(e.target.value || "1", 10) || 1));
                    onChange({ ...group, maxCount: v });
                  }}
                  className="w-14 border border-gray-200 rounded px-2 py-1 text-xs text-gray-700"
                />
                <span>items</span>
              </label>
            </>
          )}
          {showSpecialityFee && (
            <div className="flex items-center gap-2 flex-wrap">
              <label className="flex items-center gap-1.5 text-xs text-gray-500">
                <span>Speciality fee +{currencySymbol}</span>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={group.extraFee ?? 0}
                  onChange={(e) => {
                    const v = Math.max(0, parseFloat(e.target.value) || 0);
                    onChange({ ...group, extraFee: v });
                  }}
                  className="w-20 border border-gray-200 rounded px-2 py-1 text-xs text-gray-700"
                  placeholder="0.00"
                />
              </label>
              {/* Scope the fee to the premium sizes only (e.g. Large = +$5), so
                  base sizes stay free — GloriaFood parity. Luigi 2026-07-07. */}
              {(group.extraFee ?? 0) > 0 && (() => {
                const nSel = (group.specialityVariantIds?.length ?? 0) + (group.specialityItemIds?.length ?? 0);
                return (
                  <button
                    type="button"
                    onClick={() => setFeeOpen(true)}
                    className="text-xs text-emerald-600 hover:text-emerald-700 font-medium underline decoration-dotted"
                  >
                    {nSel > 0 ? `for ${nSel} size${nSel === 1 ? "" : "s"}` : "for all sizes — pick which cost extra"}
                  </button>
                );
              })()}
              {feeOpen && (
                <SpecialityFeePicker
                  group={group}
                  cats={cats}
                  currencySymbol={currencySymbol}
                  onApply={(partial) => {
                    onChange({ ...group, ...partial });
                    setFeeOpen(false);
                  }}
                  onCancel={() => setFeeOpen(false)}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── GroupsEditor ───────────────────────────────────────────────────────────

export function GroupsEditor({
  groups,
  onChange,
  cats,
  defaultRole,
  addLabel = "Add Group",
  minGroups = 0,
  showSlotConfig = false,
  showSpecialityFee = false,
  currencySymbol = "$",
}: {
  groups: IG[];
  onChange: (groups: IG[]) => void;
  cats: CatEntry[];
  defaultRole?: IG["role"];
  addLabel?: string;
  minGroups?: number;
  /** Forwarded to ItemGroupRow — see ItemGroupRow's docstring. */
  showSlotConfig?: boolean;
  showSpecialityFee?: boolean;
  currencySymbol?: string;
}) {
  return (
    <div>
      {groups.map((g, i) => (
        <ItemGroupRow
          key={g.id}
          group={g}
          index={i}
          cats={cats}
          onChange={(updated) =>
            onChange(groups.map((x, j) => (j === i ? updated : x)))
          }
          onRemove={() => onChange(groups.filter((_, j) => j !== i))}
          canRemove={groups.length > minGroups}
          showSlotConfig={showSlotConfig}
          showSpecialityFee={showSpecialityFee}
          currencySymbol={currencySymbol}
        />
      ))}
      <button
        onClick={() => onChange([...groups, newGroup(defaultRole)])}
        className="mt-1 flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
      >
        <Plus className="w-3.5 h-3.5" /> {addLabel}
      </button>
    </div>
  );
}

// ─── ExtraChargeModeSelect ──────────────────────────────────────────────────
// GloriaFood-parity "extra charges" dropdown for every free-item promo (BOGO,
// Buy-N-Get-Free, Free Item, Free Dish with a Meal). Section is English-only
// like the rest of this wizard helper. Luigi 2026-07-07.

export function ExtraChargeModeSelect({
  rules,
  onChange,
}: {
  rules: PromoRules;
  onChange: (r: Partial<PromoRules>) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Charges on the free item</label>
      <select
        value={rules.freeItemExtraChargeMode ?? "none"}
        onChange={(e) => onChange({ freeItemExtraChargeMode: e.target.value as PromoRules["freeItemExtraChargeMode"] })}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
      >
        <option value="none">No extra charges (whole free item is free)</option>
        <option value="addons">Charge extra for Choices / Add-ons (toppings still billed)</option>
        <option value="addons_sizes">Charge extra for Choices / Add-ons &amp; Sizes (toppings + size upgrade billed)</option>
      </select>
      <p className="text-[11px] text-gray-400 mt-1">
        Whether the freed item&rsquo;s toppings and size upgrade are still charged — matches GloriaFood.
      </p>
    </div>
  );
}

// ─── DiscountStrategySection ────────────────────────────────────────────────

export function DiscountStrategySection({
  rules,
  onChange,
  promotionType = "bogo",
}: {
  rules: PromoRules;
  onChange: (r: Partial<PromoRules>) => void;
  /** Drives the explanatory note (BOGO discounts by price; Buy-N-Get-Free
   *  discounts the free-group item). Luigi 2026-06-26. */
  promotionType?: string;
}) {
  const strategy = rules.discountStrategy ?? "cheapest";
  // Plain-language note so the owner knows WHICH item gets discounted — Luigi's
  // ask after "buy pizza get pasta" surprised him by discounting the pizza.
  // NOTE: this whole section is still English-only (pre-existing) — i18n TODO.
  const note =
    promotionType === "buy_n_get_free"
      ? "The item from the “free” group is the one discounted — regardless of price. The % above is how much off it gets (100% = free)."
      : strategy === "most_expensive"
        ? "BOGO discounts the MORE EXPENSIVE of the two qualifying items. To always discount one specific item instead, use the “Buy N, Get Free” deal."
        : strategy === "fixed_percent"
          ? "Each discounted item gets this % off — the cheaper item when a pair qualifies. To always discount one specific item, use the “Buy N, Get Free” deal."
          : "BOGO discounts the CHEAPER of the two qualifying items — so if the “free” item costs more, the cheaper one is discounted instead (a customer can’t get the pricier item cheap). To always discount one specific item (e.g. a pasta), use the “Buy N, Get Free” deal.";
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">Discount Strategy</label>
      <select
        value={strategy}
        onChange={(e) =>
          onChange({
            discountStrategy: e.target.value as PromoRules["discountStrategy"],
          })
        }
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
      >
        <option value="cheapest">Automatically set discounts (cheapest item free)</option>
        <option value="most_expensive">Automatically set discounts (most expensive item free)</option>
        <option value="fixed_percent">Fixed discount percentage</option>
      </select>
      {strategy === "cheapest" && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 flex-1">% off cheapest item</span>
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            value={rules.cheapestDiscount ?? 100}
            onChange={(e) =>
              onChange({ cheapestDiscount: parseFloat(e.target.value) || 100 })
            }
            className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
          <span className="text-xs text-gray-400">%</span>
        </div>
      )}
      {strategy === "most_expensive" && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 flex-1">% off most expensive item</span>
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            value={rules.mostExpensiveDiscount ?? 100}
            onChange={(e) =>
              onChange({ mostExpensiveDiscount: parseFloat(e.target.value) || 100 })
            }
            className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
          <span className="text-xs text-gray-400">%</span>
        </div>
      )}
      {strategy === "fixed_percent" && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 flex-1">Discount %</span>
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            value={rules.discountPercent ?? 0}
            onChange={(e) =>
              onChange({ discountPercent: parseFloat(e.target.value) || 0 })
            }
            className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          />
          <span className="text-xs text-gray-400">%</span>
        </div>
      )}
      <ExtraChargeModeSelect rules={rules} onChange={onChange} />
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 leading-snug">
        💡 {note}
      </p>
    </div>
  );
}

// ─── Small input primitives ────────────────────────────────────────────────

export function PctInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative w-44">
        <input
          type="number"
          min="0"
          max="100"
          step="1"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-8 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        />
        <span className="absolute right-3 top-2 text-gray-400 text-sm">%</span>
      </div>
    </div>
  );
}

export function AmtInput({
  label,
  value,
  onChange,
  currencySymbol = "$",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  currencySymbol?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex items-center w-48 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-emerald-500">
        <span className="pl-3 pr-1 text-gray-400 text-sm flex-shrink-0">{currencySymbol}</span>
        <input
          type="number"
          min="0"
          step="0.01"
          className="flex-1 min-w-0 border-none bg-transparent pr-3 py-2 text-sm focus:outline-none focus:ring-0"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        />
      </div>
    </div>
  );
}

export function SL({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="mt-3 mb-2">
      <div className="text-sm font-semibold text-gray-700">{label}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

// Re-export ItemGroupRow for component-level use when GroupsEditor's
// minGroups model doesn't fit (e.g. role-locked rows in BOGO / free_item).
export { ItemGroupRow };
