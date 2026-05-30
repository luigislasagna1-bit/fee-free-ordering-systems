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
  role?: "paid" | "free" | "trigger" | "required";
  minCount?: number;
  maxCount?: number;
  extraFee?: number;
};

export type PromoRules = {
  discountPercent?: number;
  discountAmount?: number;
  bundlePrice?: number;
  paymentMethod?: string;
  triggerAmount?: number;
  discountStrategy?: "cheapest" | "most_expensive" | "fixed_percent";
  cheapestDiscount?: number;
  mostExpensiveDiscount?: number;
  groups?: IG[];
};

export type CatEntry = {
  id: string;
  name: string;
  items: { id: string; name: string; price: number }[];
};

// ─── Group factory + init per type ──────────────────────────────────────────

let _gc = 0;
export function newGroup(role?: IG["role"]): IG {
  return {
    id: `g${++_gc}_${Date.now()}`,
    label: "",
    categoryIds: [],
    itemIds: [],
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
        groups: [newGroup("paid"), newGroup("free")],
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
  if (!cc && !ic) return "No items selected — click to edit";
  const parts: string[] = [];
  if (cc) {
    const names = g.categoryIds
      .slice(0, 2)
      .map((id) => cats.find((c) => c.id === id)?.name ?? id)
      .join(", ");
    parts.push(`${names}${cc > 2 ? ` +${cc - 2} more` : ""}`);
  }
  if (ic) parts.push(`${ic} specific item${ic > 1 ? "s" : ""}`);
  return parts.join(" + ");
}

// ─── ItemGroupPicker ────────────────────────────────────────────────────────

export function ItemGroupPicker({
  group,
  cats,
  onApply,
  onCancel,
}: {
  group: IG;
  cats: CatEntry[];
  onApply: (g: IG) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<IG>(() => ({
    ...group,
    categoryIds: [...group.categoryIds],
    itemIds: [...group.itemIds],
  }));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  return (
    <div className="absolute left-0 top-full z-50 mt-1 w-80 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 border-b flex items-center justify-between">
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
        className="max-h-56 overflow-y-auto"
        onScroll={(e) => e.stopPropagation()}
      >
        {cats.length === 0 ? (
          <div className="px-3 py-4 text-sm text-gray-400 text-center">No categories found</div>
        ) : (
          cats.map((cat) => {
            const catChecked = draft.categoryIds.includes(cat.id);
            const isExpanded = expanded.has(cat.id);
            const catItemIds = cat.items.map((i) => i.id);
            const selectedInCat = catItemIds.filter((id) => draft.itemIds.includes(id)).length;

            return (
              <div key={cat.id}>
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
                      const checked = catChecked || draft.itemIds.includes(item.id);
                      return (
                        <label
                          key={item.id}
                          className={`flex items-center gap-2 py-1 text-sm cursor-pointer ${
                            catChecked ? "opacity-50" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={catChecked}
                            onChange={() => !catChecked && toggleItem(item.id)}
                            className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500"
                          />
                          <span className="flex-1 text-gray-700">{item.name}</span>
                          <span className="text-xs text-gray-400">
                            ${item.price.toFixed(2)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      <div className="flex gap-2 px-3 py-2 border-t bg-gray-50">
        <button
          onClick={() => onApply(draft)}
          className="flex-1 bg-emerald-500 text-white text-sm font-semibold py-1.5 rounded-lg hover:bg-emerald-600 transition"
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
}: {
  group: IG;
  index: number;
  cats: CatEntry[];
  onChange: (g: IG) => void;
  onRemove: () => void;
  canRemove?: boolean;
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
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              <span>Speciality fee per item +$</span>
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

// ─── DiscountStrategySection ────────────────────────────────────────────────

export function DiscountStrategySection({
  rules,
  onChange,
}: {
  rules: PromoRules;
  onChange: (r: Partial<PromoRules>) => void;
}) {
  const strategy = rules.discountStrategy ?? "cheapest";
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
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative w-48">
        <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
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
