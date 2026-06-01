"use client";
import { useState, useCallback, createContext, useContext, useEffect, useRef } from "react";
import {
  Plus, GripVertical, ChevronDown, ChevronRight, Eye, EyeOff,
  Edit2, Trash2, Copy, X, Check, AlertCircle, Tag, Layers,
  Image as ImageIcon, Clock, Truck, ShoppingBag, UtensilsCrossed,
  Settings, ChevronUp, MoreVertical, Upload, FileText, Loader2,
  PartyPopper, Download, Search,
} from "lucide-react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, rectSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { formatCurrency } from "@/lib/utils";
import { ImageUpload } from "@/components/admin/ImageUpload";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type ModifierOption = {
  id?: string; name: string; priceAdjustment: number;
  isDefault: boolean; isAvailable: boolean;
};
type ModifierGroup = {
  id: string; name: string; description?: string; required: boolean;
  minSelect: number; maxSelect: number; maxPerOption: number;
  isHidden: boolean; sortOrder: number; menuItemId?: string;
  categoryId?: string; restaurantId?: string; libraryGroupId?: string;
  supportsHalfHalf?: boolean;
  options: ModifierOption[];
};
type ItemVariant = { id?: string; name: string; price: number; sortOrder: number; isDefault: boolean };
type MenuItem = {
  id: string; name: string; description?: string; price: number;
  imageUrl?: string; isAvailable: boolean; isFeatured: boolean;
  isSoldOut: boolean; isHidden: boolean; hasVariants: boolean;
  forPickup: boolean; forDelivery: boolean;
  availableDays?: number[]; availableFrom?: string; availableTo?: string;
  sortOrder: number; variants: ItemVariant[];
  modifierGroups: ModifierGroup[];
  pizzaConfig?: string;
};
type Category = {
  id: string; name: string; description?: string; imageUrl?: string;
  isActive: boolean; isHidden: boolean; sortOrder: number;
  modifierGroups: ModifierGroup[];
  menuItems: MenuItem[];
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Hover-link context ──────────────────────────────────────────────────────
// Powers the "hover a chip on an item, see the matching row in the library
// panel light up + scroll into view" UX, mirrored from GloriaFood. We track
// the library-group id (not the attached-instance id) so chips that point
// to the same library row all highlight together regardless of which item
// the cursor is on. setHovered is debounced via simple state — React
// batches mouse events fast enough that we don't need explicit throttling
// for the chip volumes we have (hundreds, not thousands).
type HoverState = {
  hoveredLibId: string | null;
  setHovered: (libId: string | null) => void;
};
const MenuHoverContext = createContext<HoverState>({
  hoveredLibId: null,
  setHovered: () => {},
});

// ─── Item Edit Modal ──────────────────────────────────────────────────────────

type PizzaFormState = {
  isPizza: boolean;
  allowHalfHalf: boolean;
  crustGroupId: string;
  sauceGroupId: string;
  cheeseGroupId: string;
  toppingGroupIds: string[];
  includedToppings: number;
  extraToppingPrice: string;
  variantToppingPrices: Record<string, string>;
  halfToppingMultiplier: string;
  extraQuantityMultiplier: string;
  /** Display order of customer-side sections (size, half/half toggle,
   *  modifier groups). Each entry is "section:size",
   *  "section:halfHalfToggle", "section:toppings", or a library-group
   *  id. Empty array = legacy hardcoded order. */
  sectionOrder: string[];
  /** Pizza roles that expose the customer-side Whole/Split toggle.
   *  Defaults to all three when undefined (legacy behaviour). */
  halfHalfRoles: Array<"sauce" | "cheese" | "toppings">;
};

function parsePizzaForm(json?: string): PizzaFormState {
  let p: any = null;
  if (json) { try { p = JSON.parse(json); } catch { /* ignore */ } }
  return {
    isPizza: p?.isPizza ?? false,
    allowHalfHalf: p?.allowHalfHalf ?? true,
    crustGroupId: p?.crustGroupId ?? "",
    sauceGroupId: p?.sauceGroupId ?? "",
    cheeseGroupId: p?.cheeseGroupId ?? "",
    toppingGroupIds: Array.isArray(p?.toppingGroupIds) ? p.toppingGroupIds : [],
    includedToppings: p?.includedToppings ?? 0,
    extraToppingPrice: String(p?.extraToppingPrice ?? "0"),
    variantToppingPrices: p?.variantToppingPrices && typeof p.variantToppingPrices === "object"
      ? Object.fromEntries(Object.entries(p.variantToppingPrices).map(([k, v]) => [k, String(v)]))
      : {},
    halfToppingMultiplier: String(p?.halfToppingMultiplier ?? "0.5"),
    extraQuantityMultiplier: String(p?.extraQuantityMultiplier ?? "0"),
    sectionOrder: Array.isArray(p?.sectionOrder)
      ? p.sectionOrder.filter((x: unknown): x is string => typeof x === "string")
      : [],
    halfHalfRoles: Array.isArray(p?.halfHalfRoles)
      ? p.halfHalfRoles.filter((r: unknown): r is "sauce" | "cheese" | "toppings" =>
          r === "sauce" || r === "cheese" || r === "toppings",
        )
      : ["sauce", "cheese", "toppings"],
  };
}

// ─── Pizza Section Order Editor ───────────────────────────────────────────────
// Compact controls that let owners reorder Pizza Builder sections and flip
// per-role half/half. Sits inside the Pizza tab of the item modal. Uses
// up/down arrows rather than drag-and-drop because the ItemModal is already
// inside a flexbox column and stacking another DndContext inside it would
// fight with the parent menu's scroll/drag handling.
const SECTION_SIZE = "section:size";
const SECTION_HALF_HALF = "section:halfHalfToggle";
const SECTION_TOPPINGS = "section:toppings";

function PizzaSectionOrderEditor({
  item, pizza, setPizza, libraryGroups, hasVariants, categoryModGroups,
}: {
  item?: MenuItem;
  pizza: PizzaFormState;
  setPizza: React.Dispatch<React.SetStateAction<PizzaFormState>>;
  libraryGroups: ModifierGroup[];
  hasVariants: boolean;
  /** Modifier groups attached to the item's parent category. These are
   *  "inherited" by every item in the category (Pizza 1 Crust, How Well
   *  Cooked? etc shared across PIZZAS). The customer-side Pizza Builder
   *  renders them as their own sections too, so the owner must be able
   *  to reorder them from here. */
  categoryModGroups: ModifierGroup[];
}) {
  // The set of section IDs the customer-side will render for this item,
  // in the legacy default order. Same logic as the customer-side
  // computation but driven from form state + libraryGroups.
  const defaultOrder: string[] = (() => {
    const def: string[] = [];
    if (hasVariants) def.push(SECTION_SIZE);
    if (pizza.crustGroupId) def.push(pizza.crustGroupId);
    // "Other" groups are modifier groups that aren't playing a pizza
    // role. They come from two sources:
    //   (a) attached directly to the item — item.modifierGroups
    //   (b) inherited from the parent category — categoryModGroups
    // Both render as their own sections in the customer-side Pizza
    // Builder, so the owner needs to be able to reorder them from
    // here. We dedupe by canonical library id (or instance id when no
    // library id) so the same group isn't listed twice when it's both
    // attached AND inherited (rare but possible after the Pizza
    // Builder dropdowns auto-attach a category-shared group).
    const roleIds = new Set<string>([
      pizza.crustGroupId,
      pizza.sauceGroupId,
      pizza.cheeseGroupId,
      ...pizza.toppingGroupIds,
    ].filter(Boolean));
    const seenOther = new Set<string>();
    const pushOtherGroup = (g: ModifierGroup) => {
      const libId = g.libraryGroupId ?? g.id;
      if (roleIds.has(libId) || seenOther.has(libId)) return;
      seenOther.add(libId);
      def.push(libId);
    };
    // Category-level shared groups first — they're the source-of-truth
    // for inherited chips and we want them to default-order BEFORE the
    // item-specific ones (matches how they render today).
    for (const g of categoryModGroups) pushOtherGroup(g);
    if (item) {
      for (const g of item.modifierGroups) pushOtherGroup(g);
    }
    // SECTION_HALF_HALF intentionally not pushed — the master toggle
    // was removed (per-group flag replaces it).
    if (pizza.sauceGroupId) def.push(pizza.sauceGroupId);
    if (pizza.cheeseGroupId) def.push(pizza.cheeseGroupId);
    if (pizza.toppingGroupIds.length > 0) def.push(SECTION_TOPPINGS);
    return def;
  })();

  const effectiveOrder: string[] = pizza.sectionOrder.length > 0
    ? (() => {
        const inUser = new Set(pizza.sectionOrder);
        const tail = defaultOrder.filter(id => !inUser.has(id));
        return [...pizza.sectionOrder.filter(id => defaultOrder.includes(id)), ...tail];
      })()
    : defaultOrder;

  const labelFor = (id: string): string => {
    if (id === SECTION_SIZE) return "Size selection";
    if (id === SECTION_HALF_HALF) return "Half & Half toggle";
    if (id === SECTION_TOPPINGS) return "Toppings";
    // Look up across library, category, and item-level groups since
    // section ids resolve to whatever canonical id the chip uses:
    //   - libraryGroupId for groups created via the importer/library
    //   - the instance id for ad-hoc attachments that have no library
    // Walking all three covers every shape.
    const lib = libraryGroups.find(g => g.id === id);
    if (lib) return lib.name;
    const cat = categoryModGroups.find(g => g.id === id || g.libraryGroupId === id);
    if (cat) return cat.name;
    const it = item?.modifierGroups.find(g => g.id === id || g.libraryGroupId === id);
    if (it) return it.name;
    return "(Unknown section)";
  };

  // Resolve whether a section's underlying group has supportsHalfHalf
  // set on its library entry — used for the small "✂️" indicator next
  // to each row so owners can see at a glance which groups will respect
  // the customer-side Half/Half toggle. Editing the flag happens in
  // the group library (right panel → edit pencil), not here.
  const groupForSectionId = (id: string): ModifierGroup | undefined => {
    if (id === SECTION_SIZE || id === SECTION_HALF_HALF || id === SECTION_TOPPINGS) return undefined;
    return (
      libraryGroups.find(g => g.id === id) ??
      categoryModGroups.find(g => g.id === id || g.libraryGroupId === id) ??
      item?.modifierGroups.find(g => g.id === id || g.libraryGroupId === id)
    );
  };
  const toppingsAreEligible = () =>
    pizza.toppingGroupIds.some(tid =>
      libraryGroups.find(g => g.id === tid)?.supportsHalfHalf
    );

  const move = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= effectiveOrder.length) return;
    const next = [...effectiveOrder];
    [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
    setPizza(p => ({ ...p, sectionOrder: next }));
  };

  const resetOrder = () => setPizza(p => ({ ...p, sectionOrder: [] }));

  return (
    <div className="border-t pt-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Customer Display Order</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Reorder how sections appear in the Pizza Builder. The ✂️ icon shows which groups
            are flagged Half/Half-capable in the library (edit in Choices & Add-ons).
          </p>
        </div>
        {pizza.sectionOrder.length > 0 && (
          <button type="button" onClick={resetOrder}
            className="text-xs text-gray-500 hover:text-gray-700 underline">
            Reset to default
          </button>
        )}
      </div>
      <div className="space-y-1.5 border border-gray-200 rounded-lg p-2 bg-gray-50">
        {effectiveOrder.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-3">
            Pick role groups above (Crust / Sauce / Cheese / Toppings) — sections will show up here once selected.
          </p>
        )}
        {effectiveOrder.map((id, i) => {
          // Toppings is a synthetic section that aggregates multiple
          // topping groups — show ✂️ when ANY of them is flagged.
          const groupEligible = id === SECTION_TOPPINGS
            ? toppingsAreEligible()
            : groupForSectionId(id)?.supportsHalfHalf ?? false;
          return (
            <div key={id} className="flex items-center gap-2 bg-white border border-gray-100 rounded-md px-2 py-1.5">
              <div className="flex flex-col gap-0.5">
                <button type="button" onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move up">
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => move(i, 1)}
                  disabled={i === effectiveOrder.length - 1}
                  className="text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Move down">
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <span className="text-xs font-mono text-gray-300 w-5">{i + 1}.</span>
              <span className="text-sm text-gray-800 flex-1 truncate">{labelFor(id)}</span>
              {groupEligible && (
                <span
                  className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                  title="This group is flagged Half/Half-capable in the library. When the customer toggles Half/Half ON, this section will render with Whole/Split UI."
                >
                  ✂️ Half/Half
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Extra-Quantity Upcharge Field ──────────────────────────────────────────
// Replaces the bare number input that read "0 = no extra charge for Extra
// quantity" with a yes/no toggle owners can actually reason about. ON stores
// "1" (full per-size topping price added when the customer picks "Extra"),
// OFF stores "0" (free). The customer-side PizzaBuilder pricing engine
// already multiplied the per-size topping price by this value, so the
// behaviour map is:
//   • OFF (0)  → Extra costs nothing
//   • ON (1)   → Extra costs the per-size topping price (Small +$2.25,
//                Medium +$2.50, Large +$2.75, X Large +$3.01, etc.)
// An Advanced expander lets the rare restaurant set a custom fractional
// multiplier (e.g. 0.5 = half-price upcharge). Existing items whose value
// is neither 0 nor 1 open with Advanced auto-expanded so nothing silently
// changes their behaviour.
function ExtraQtyUpchargeField({
  value, onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const numeric = parseFloat(value);
  const isOff = !Number.isFinite(numeric) || numeric === 0;
  const isOn = numeric === 1;
  const isAdvanced = !isOff && !isOn;
  const [advancedOpen, setAdvancedOpen] = useState(isAdvanced);
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Charge for &quot;Extra&quot; quantity?
      </label>
      <div className="flex items-center gap-3">
        <Toggle
          on={!isOff}
          onToggle={() => onChange(isOff ? "1" : "0")}
        />
        <span className="text-sm text-gray-600">
          {isOff
            ? "Free — Extra doesn't change the price"
            : isOn
              ? "Full per-size topping price"
              : `Custom: ${numeric}× per-size topping price`}
        </span>
      </div>
      <p className="text-xs text-gray-400 mt-1">
        When ON, picking &quot;Extra&quot; on a topping adds the per-size topping price
        for the chosen size (Small adds Small&apos;s price, Large adds Large&apos;s, etc.).
      </p>
      <button
        type="button"
        onClick={() => setAdvancedOpen(o => !o)}
        className="text-xs text-gray-500 hover:text-gray-700 underline mt-1.5"
      >
        {advancedOpen ? "Hide advanced" : "Advanced: custom multiplier"}
      </button>
      {advancedOpen && (
        <div className="mt-2">
          <input
            type="number"
            step="0.05"
            min="0"
            placeholder="0"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            value={value}
            onChange={e => onChange(e.target.value)}
          />
          <p className="text-xs text-gray-400 mt-0.5">
            0 = free, 1 = full per-size topping price, 0.5 = half charge,
            2 = double charge.
          </p>
        </div>
      )}
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel = "Delete", onConfirm, onCancel }: {
  title: string; message: string; confirmLabel?: string;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="text-base font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-600 leading-relaxed">{message}</p>
        <div className="flex gap-3 mt-5 justify-end">
          <button onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${on ? "bg-emerald-500" : "bg-gray-300"}`}>
      <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

function ItemModal({
  item, categoryId, categories, libraryGroups, onClose, onSaved,
}: {
  item?: MenuItem; categoryId: string; categories: Category[];
  libraryGroups: ModifierGroup[];
  onClose: () => void; onSaved: () => void;
}) {
  const isNew = !item;
  const [form, setForm] = useState({
    name: item?.name ?? "",
    description: item?.description ?? "",
    price: item?.price?.toString() ?? "",
    categoryId: item ? (categories.find(c => c.menuItems.some(i => i.id === item.id))?.id ?? categoryId) : categoryId,
    imageUrl: item?.imageUrl ?? "",
    isHidden: item?.isHidden ?? false,
    isSoldOut: item?.isSoldOut ?? false,
    forPickup: item?.forPickup ?? true,
    forDelivery: item?.forDelivery ?? true,
    /** Per-item catering tag. Opts THIS item into the catering advance-
     *  notice rule (Restaurant.cateringNoticeHours). Cart that contains
     *  any catering-tagged item — or any item in a catering category —
     *  forces schedule-for-later mode at checkout. */
    isCatering: (item as any)?.isCatering ?? false,
    hasVariants: item?.hasVariants ?? false,
    availableFrom: item?.availableFrom ?? "",
    availableTo: item?.availableTo ?? "",
    availableDays: item?.availableDays ?? [0, 1, 2, 3, 4, 5, 6],
  });
  const [variants, setVariants] = useState<ItemVariant[]>(
    item?.variants?.length ? item.variants : [{ name: "", price: 0, sortOrder: 0, isDefault: true }]
  );
  const [pizza, setPizza] = useState<PizzaFormState>(() => parsePizzaForm(item?.pizzaConfig));
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"basic" | "availability" | "variants" | "pizza">("basic");

  const toggle = (field: keyof typeof form) => setForm(f => ({ ...f, [field]: !f[field as keyof typeof form] }));
  const toggleDay = (d: number) => {
    const days = form.availableDays.includes(d)
      ? form.availableDays.filter(x => x !== d)
      : [...form.availableDays, d].sort();
    setForm(f => ({ ...f, availableDays: days }));
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Item name is required"); return;
    }
    if (!form.hasVariants && !form.price) {
      toast.error("Set a base price, or enable sizes/variants in the Variants tab"); return;
    }
    if (form.hasVariants && variants.filter(v => v.name.trim()).length === 0) {
      toast.error("Add at least one size in the Variants tab, or disable sizes/variants"); return;
    }
    setSaving(true);
    const pizzaConfig = pizza.isPizza
      ? JSON.stringify({
          isPizza: true,
          allowHalfHalf: pizza.allowHalfHalf,
          crustGroupId: pizza.crustGroupId || undefined,
          sauceGroupId: pizza.sauceGroupId || undefined,
          cheeseGroupId: pizza.cheeseGroupId || undefined,
          toppingGroupIds: pizza.toppingGroupIds,
          includedToppings: Math.max(0, parseInt(String(pizza.includedToppings)) || 0),
          extraToppingPrice: parseFloat(pizza.extraToppingPrice) || 0,
          variantToppingPrices: form.hasVariants && variants.filter(v => v.name.trim()).length > 0
            ? Object.fromEntries(
                variants
                  .filter(v => v.name.trim())
                  .map(v => [v.name.trim(), parseFloat(pizza.variantToppingPrices[v.name.trim()] || "0") || 0])
              )
            : undefined,
          halfToppingMultiplier: parseFloat(pizza.halfToppingMultiplier) || 0.5,
          extraQuantityMultiplier: parseFloat(pizza.extraQuantityMultiplier) || 0,
          // Persist only when non-empty / non-default so older items
          // without these fields stay clean.
          sectionOrder: pizza.sectionOrder.length > 0 ? pizza.sectionOrder : undefined,
          halfHalfRoles: (() => {
            const all = ["sauce", "cheese", "toppings"] as const;
            // Match the legacy default → omit the field so customer-side
            // falls back to the "every role supports half/half" branch.
            const isDefault = all.every(r => pizza.halfHalfRoles.includes(r))
              && pizza.halfHalfRoles.length === all.length;
            return isDefault ? undefined : pizza.halfHalfRoles;
          })(),
        })
      : null;
    const payload = {
      ...form,
      price: parseFloat(form.price) || 0,
      variants: form.hasVariants ? variants.filter(v => v.name) : undefined,
      pizzaConfig,
    };
    try {
      const url = isNew ? "/api/menu/items" : `/api/menu/items/${item!.id}`;
      const method = isNew ? "POST" : "PATCH";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Server error ${res.status}`);
      }
      toast.success(isNew ? "Item added" : "Item updated");
      onSaved();
    } catch (e: any) { toast.error(e.message || "Failed to save item"); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold text-gray-900">{isNew ? "Add Menu Item" : "Edit Item"}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        {/* Tabs — each gets its own accent color so the modal sections
            are scannable at a glance (per Luigi's UAT feedback that all
            same-color tabs look confusing). */}
        <div className="flex border-b px-5 overflow-x-auto">
          {([
            ["basic",        "Basic",                                       "border-emerald-500", "text-emerald-700", "bg-emerald-50", "text-emerald-500"],
            ["availability", "Availability",                                 "border-sky-500",     "text-sky-700",     "bg-sky-50",     "text-sky-500"    ],
            ["variants",     "Sizes",                                        "border-amber-500",   "text-amber-700",   "bg-amber-50",   "text-amber-500"  ],
            ["pizza",        pizza.isPizza ? "🍕 Pizza" : "Pizza Setup",     "border-slate-900",   "text-slate-900",   "bg-slate-100",  "text-slate-600"  ],
          ] as const).map(([t, label, activeBorder, activeText, activeBg]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap flex-shrink-0 ${
                tab === t
                  ? `${activeBorder} ${activeText} ${activeBg}`
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {tab === "basic" && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Item Name *</label>
                  <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Margherita Pizza" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none" rows={2}
                    value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe this item..." />
                </div>
                {form.hasVariants ? (
                  <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 text-sm text-blue-700 col-span-1">
                    <Layers className="w-4 h-4 flex-shrink-0" />
                    Pricing is set per size in the <button type="button" className="font-semibold underline" onClick={() => setTab("variants")}>Sizes tab</button>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Base Price *</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-gray-400 text-sm">$</span>
                      <input type="number" step="0.01" min="0" className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" />
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))}>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <ImageUpload
                    label="Item Image"
                    value={form.imageUrl}
                    onChange={url => setForm(f => ({ ...f, imageUrl: url }))}
                    aspectRatio="wide"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                {([
                  ["isHidden", "Hidden from menu", EyeOff],
                  ["isSoldOut", "Sold out", AlertCircle],
                  ["forPickup", "Available for pickup", ShoppingBag],
                  ["forDelivery", "Available for delivery", Truck],
                  ["isCatering", "Catering item (requires advance notice)", PartyPopper],
                ] as [keyof typeof form, string, any][]).map(([field, label, Icon]) => (
                  <button key={field} onClick={() => toggle(field)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition ${form[field] ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                    <Icon className="w-4 h-4" />
                    {label}
                    {form[field] ? <Check className="w-3.5 h-3.5" /> : null}
                  </button>
                ))}
              </div>
            </>
          )}

          {tab === "availability" && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Available Days</label>
                <div className="flex gap-2 flex-wrap">
                  {DAY_NAMES.map((d, i) => (
                    <button key={i} onClick={() => toggleDay(i)}
                      className={`w-12 h-10 rounded-lg border text-sm font-medium transition ${form.availableDays.includes(i) ? "bg-emerald-500 border-emerald-500 text-white" : "border-gray-200 text-gray-500 hover:border-gray-400"}`}>
                      {d}
                    </button>
                  ))}
                  <button onClick={() => setForm(f => ({ ...f, availableDays: [0,1,2,3,4,5,6] }))}
                    className="px-3 h-10 rounded-lg border border-gray-200 text-xs text-gray-500 hover:border-gray-400">All</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Available From</label>
                  <input type="time" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    value={form.availableFrom} onChange={e => setForm(f => ({ ...f, availableFrom: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Available Until</label>
                  <input type="time" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    value={form.availableTo} onChange={e => setForm(f => ({ ...f, availableTo: e.target.value }))} />
                </div>
              </div>
              <p className="text-xs text-gray-400">Leave time fields empty to be available all day.</p>
            </div>
          )}

          {tab === "variants" && (
            <div className="space-y-3">
              {/* Enable-variants toggle directly on this tab — eliminates the confusion */}
              <div className="flex items-center justify-between p-3 rounded-xl border-2 transition"
                style={form.hasVariants ? { borderColor: "#10b981", backgroundColor: "#ecfdf5" } : { borderColor: "#e5e7eb", backgroundColor: "#f9fafb" }}>
                <div>
                  <div className="text-sm font-semibold text-gray-800">Use sizes / variants for pricing</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {form.hasVariants
                      ? "Each size below has its own price. The single base price is ignored."
                      : "Off — a single base price is used. Enable to charge different prices per size."}
                  </div>
                </div>
                <Toggle on={form.hasVariants} onToggle={() => setForm(f => ({ ...f, hasVariants: !f.hasVariants }))} />
              </div>

              {!form.hasVariants && variants.filter(v => v.name).length > 0 && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  You have sizes configured but the toggle above is off — enable it so prices are taken from sizes, not the single base price.
                </div>
              )}

              <p className="text-sm text-gray-500">Each size or variation can have its own name and price (e.g. Small 10" / Large 14").</p>

              {variants.map((v, i) => (
                <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                  <div className="flex-1">
                    <input className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      placeholder={`Size name (e.g. Small 10")`}
                      value={v.name} onChange={e => setVariants(vs => vs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                  </div>
                  <div className="w-28 relative">
                    <span className="absolute left-2 top-2 text-gray-400 text-sm">$</span>
                    <input type="number" step="0.01" min="0" className="w-full border border-gray-300 rounded pl-6 pr-2 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      placeholder="0.00"
                      value={v.price || ""} onChange={e => setVariants(vs => vs.map((x, j) => j === i ? { ...x, price: parseFloat(e.target.value) || 0 } : x))} />
                  </div>
                  {variants.length > 1 && (
                    <button onClick={() => setVariants(vs => vs.filter((_, j) => j !== i))} className="p-1 text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                  )}
                </div>
              ))}
              <button
                onClick={() => {
                  setVariants(vs => [...vs, { name: "", price: 0, sortOrder: vs.length, isDefault: false }]);
                  // Auto-enable hasVariants when user adds their first custom variant
                  if (!form.hasVariants) setForm(f => ({ ...f, hasVariants: true }));
                }}
                className="flex items-center gap-2 text-sm text-emerald-600 hover:text-emerald-700 font-medium">
                <Plus className="w-4 h-4" /> Add Variant
              </button>
            </div>
          )}

          {tab === "pizza" && (
            <div className="space-y-5">
              {/* Master toggle */}
              <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                <div>
                  <div className="font-semibold text-gray-900 flex items-center gap-2">
                    <span>🍕</span> Pizza Builder
                  </div>
                  <div className="text-sm text-gray-500 mt-0.5">Enable the advanced pizza customisation interface for this item</div>
                </div>
                <Toggle on={pizza.isPizza} onToggle={() => setPizza(p => ({ ...p, isPizza: !p.isPizza }))} />
              </div>

              {pizza.isPizza && (
                <>
                  {/* Item-level "Allow Half & Half" toggle removed
                      2026-05-31 — half/half capability is now a per-
                      group flag set in Choices & Add-ons. The customer
                      sees a Whole/Split picker on each section whose
                      group is flagged supportsHalfHalf. Existing items
                      with allowHalfHalf saved in pizzaConfig still
                      preserve the value (parsePizzaForm reads it) so
                      reverting is a one-line change if needed. */}

                  {/* Group assignments */}
                  <div className="border-t pt-4 space-y-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Modifier Group Assignments</p>
                    {libraryGroups.length === 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                        No modifier groups in the library yet. Create some in the Choices &amp; Add-ons panel first.
                      </div>
                    )}
                    {(
                      [
                        ["crustGroupId", "Crust Group", "Customer selects one crust type"],
                        ["sauceGroupId", "Sauce Group", "Customer selects sauce (one per half when half & half)"],
                        ["cheeseGroupId", "Cheese Group", "Customer selects cheese type"],
                      ] as const
                    ).map(([key, label, desc]) => (
                      <div key={key}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                        <select
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          value={pizza[key]}
                          onChange={e => setPizza(p => ({ ...p, [key]: e.target.value }))}
                        >
                          <option value="">— None —</option>
                          {libraryGroups.map(g => (
                            <option key={g.id} value={g.id}>{g.name} ({g.options.length} options)</option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                      </div>
                    ))}

                    {/* Topping groups multi-select */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Topping Groups</label>
                      <p className="text-xs text-gray-400 mb-2">Select the modifier group(s) that contain available pizza toppings</p>
                      <div className="space-y-1.5 border border-gray-200 rounded-lg p-3 max-h-44 overflow-y-auto bg-gray-50">
                        {libraryGroups.length === 0 ? (
                          <p className="text-xs text-gray-400">No groups available.</p>
                        ) : libraryGroups.map(g => (
                          <label key={g.id} className="flex items-center gap-2.5 cursor-pointer hover:bg-white rounded p-1 transition">
                            <input
                              type="checkbox"
                              className="w-4 h-4 accent-emerald-500 flex-shrink-0"
                              checked={pizza.toppingGroupIds.includes(g.id)}
                              onChange={e => setPizza(p => ({
                                ...p,
                                toppingGroupIds: e.target.checked
                                  ? [...p.toppingGroupIds, g.id]
                                  : p.toppingGroupIds.filter(id => id !== g.id),
                              }))}
                            />
                            <span className="text-sm text-gray-700">{g.name}</span>
                            <span className="text-xs text-gray-400 ml-auto">{g.options.length} options</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Section Order & Half/Half — customer-side layout
                      controls. Owner reorders how sections appear in the
                      Pizza Builder modal and flips half/half capability
                      per role. Saves to pizzaConfig.sectionOrder and
                      pizzaConfig.halfHalfRoles. */}
                  <PizzaSectionOrderEditor
                    item={item}
                    pizza={pizza}
                    setPizza={setPizza}
                    libraryGroups={libraryGroups}
                    hasVariants={form.hasVariants}
                    categoryModGroups={categories.find(c => c.id === categoryId)?.modifierGroups ?? []}
                  />

                  {/* Pricing engine */}
                  <div className="border-t pt-4 space-y-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pricing Engine</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className={form.hasVariants ? "col-span-2" : ""}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Included Toppings</label>
                        <input type="number" min="0" placeholder="0"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          value={pizza.includedToppings}
                          onChange={e => setPizza(p => ({ ...p, includedToppings: parseInt(e.target.value) || 0 }))} />
                        <p className="text-xs text-gray-400 mt-0.5">Free toppings in base price (0 = use each option&apos;s price)</p>
                      </div>
                      {form.hasVariants ? (
                        <div className="col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-2">Price per Extra Topping — by Size</label>
                          {variants.filter(v => v.name.trim()).length === 0 ? (
                            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                              Add sizes in the Variants tab first, then set a topping price for each.
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {variants.filter(v => v.name.trim()).map(v => (
                                <div key={v.name} className="flex items-center gap-3">
                                  <span className="text-sm text-gray-700 w-24 flex-shrink-0 truncate">{v.name}</span>
                                  <div className="relative flex-1">
                                    <span className="absolute left-3 top-2.5 text-gray-400 text-sm">$</span>
                                    <input type="number" step="0.01" min="0" placeholder="0.00"
                                      className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                                      value={pizza.variantToppingPrices[v.name.trim()] ?? ""}
                                      onChange={e => setPizza(p => ({
                                        ...p,
                                        variantToppingPrices: { ...p.variantToppingPrices, [v.name.trim()]: e.target.value },
                                      }))} />
                                  </div>
                                </div>
                              ))}
                              <p className="text-xs text-gray-400">Topping price charged per each additional topping for that size</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Price per Extra Topping</label>
                          <div className="relative">
                            <span className="absolute left-3 top-2.5 text-gray-400 text-sm">$</span>
                            <input type="number" step="0.01" min="0" placeholder="0.00"
                              className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                              value={pizza.extraToppingPrice}
                              onChange={e => setPizza(p => ({ ...p, extraToppingPrice: e.target.value }))} />
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">Charged per topping beyond the included count</p>
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Half-Topping Multiplier</label>
                        <input type="number" step="0.1" min="0" max="1" placeholder="0.5"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          value={pizza.halfToppingMultiplier}
                          onChange={e => setPizza(p => ({ ...p, halfToppingMultiplier: e.target.value }))} />
                        <p className="text-xs text-gray-400 mt-0.5">0.5 = 50% price for a half-pizza topping</p>
                      </div>
                      <ExtraQtyUpchargeField
                        value={pizza.extraQuantityMultiplier}
                        onChange={(v) => setPizza(p => ({ ...p, extraQuantityMultiplier: v }))}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-6 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 transition disabled:opacity-50">
            {saving ? "Saving..." : isNew ? "Add Item" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modifier Group Modal ─────────────────────────────────────────────────────

function ModifierModal({
  group, menuItemId, onClose, onSaved,
}: {
  group?: ModifierGroup; menuItemId?: string;
  onClose: () => void; onSaved: () => void;
}) {
  const isNew = !group;
  const [form, setForm] = useState({
    name: group?.name ?? "",
    description: group?.description ?? "",
    required: group?.required ?? false,
    minSelect: group?.minSelect ?? 0,
    maxSelect: group?.maxSelect ?? 1,
    maxPerOption: group?.maxPerOption ?? 1,
    isHidden: group?.isHidden ?? false,
    supportsHalfHalf: group?.supportsHalfHalf ?? false,
  });
  const [options, setOptions] = useState<ModifierOption[]>(
    group?.options?.length
      ? group.options
      : [{ name: "", priceAdjustment: 0, isDefault: false, isAvailable: true }]
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) { toast.error("Group name required"); return; }
    setSaving(true);
    const payload = { ...form, menuItemId: menuItemId || undefined, options: options.filter(o => o.name.trim()) };
    try {
      const url = isNew ? "/api/menu/modifiers" : `/api/menu/modifiers/${group!.id}`;
      const method = isNew ? "POST" : "PATCH";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error("Failed");
      toast.success(isNew ? "Modifier group added" : "Modifier group updated");
      onSaved();
    } catch { toast.error("Failed to save modifier group"); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold">{isNew ? "Add Modifier Group" : "Edit Modifier Group"}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Group Name *</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Size, Crust, Extra Toppings" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Instructions shown to customer" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Select</label>
              <input type="number" min="0" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={form.minSelect} onChange={e => setForm(f => ({ ...f, minSelect: parseInt(e.target.value) || 0 }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Select</label>
              <input type="number" min="1" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={form.maxSelect} onChange={e => setForm(f => ({ ...f, maxSelect: parseInt(e.target.value) || 1 }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max per Option</label>
              <input type="number" min="1" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={form.maxPerOption} onChange={e => setForm(f => ({ ...f, maxPerOption: parseInt(e.target.value) || 1 }))} />
            </div>
          </div>
          <div className="flex gap-3 flex-wrap">
            <button onClick={() => setForm(f => ({ ...f, required: !f.required }))}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition ${form.required ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-600"}`}>
              <Check className="w-4 h-4" /> Required {form.required && "✓"}
            </button>
            <button onClick={() => setForm(f => ({ ...f, isHidden: !f.isHidden }))}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition ${form.isHidden ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-600"}`}>
              <EyeOff className="w-4 h-4" /> Hidden {form.isHidden && "✓"}
            </button>
            <button
              onClick={() => setForm(f => ({ ...f, supportsHalfHalf: !f.supportsHalfHalf }))}
              title="When ON, this group can be split half/half on a pizza item (customer sees Whole/Split UI). Leave OFF for crust, cook level, side drinks, etc."
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition ${form.supportsHalfHalf ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600"}`}>
              ✂️ Can be Half/Half {form.supportsHalfHalf && "✓"}
            </button>
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-gray-700">Options / Choices</label>
              <button onClick={() => setOptions(o => [...o, { name: "", priceAdjustment: 0, isDefault: false, isAvailable: true }])}
                className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add option
              </button>
            </div>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                  <input className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-emerald-400 focus:outline-none bg-white"
                    placeholder="Option name" value={opt.name}
                    onChange={e => setOptions(os => os.map((o, j) => j === i ? { ...o, name: e.target.value } : o))} />
                  <div className="relative w-24">
                    <span className="absolute left-2 top-1.5 text-gray-400 text-xs">+$</span>
                    <input type="number" step="0.01" min="0" className="w-full border border-gray-200 rounded pl-7 pr-2 py-1.5 text-sm focus:ring-1 focus:ring-emerald-400 focus:outline-none bg-white"
                      placeholder="0.00" value={opt.priceAdjustment || ""}
                      onChange={e => setOptions(os => os.map((o, j) => j === i ? { ...o, priceAdjustment: parseFloat(e.target.value) || 0 } : o))} />
                  </div>
                  <button
                    onClick={() => setOptions(os => os.map((o, j) => j === i ? { ...o, isDefault: !o.isDefault } : o))}
                    title="Set as default"
                    className={`p-1.5 rounded text-xs transition ${opt.isDefault ? "bg-emerald-100 text-emerald-600" : "text-gray-400 hover:text-gray-600"}`}>
                    ★
                  </button>
                  {options.length > 1 && (
                    <button onClick={() => setOptions(os => os.filter((_, j) => j !== i))} className="p-1.5 text-gray-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-6 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 disabled:opacity-50">
            {saving ? "Saving..." : isNew ? "Add Group" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modifier Chip ────────────────────────────────────────────────────────────

function ModifierChip({ group, inherited, categoryLevel, onRemove, sortable }: {
  group: ModifierGroup;
  /** Render in "inherited" style: blue chip with a ↑ arrow. Used on
   *  ITEM rows for chips that come from the parent category's shared
   *  attachments — the arrow communicates "this isn't attached to
   *  this item directly; manage it on the category." */
  inherited?: boolean;
  /** Render in "category-shared" style: blue chip with NO arrow. Used
   *  on the CATEGORY row itself when displaying a shared modifier
   *  group — same colour as the inherited chips so a quick scan
   *  signals "this group is category-shared" everywhere it appears,
   *  but without the ↑ since you're already at the source row.
   *  Picked over the older green-on-source-blue-on-inheritors logic
   *  per Luigi 2026-05-31 for visual consistency. */
  categoryLevel?: boolean;
  onRemove?: () => void;
  /** When true, the chip is wired up as a sortable element in its parent
   *  SortableContext so the owner can drag-and-drop to reorder the
   *  modifier groups attached to an item or category. Inherited chips
   *  intentionally never opt in — they're reordered on the parent
   *  category, not here. */
  sortable?: boolean;
}) {
  const isBlue = inherited || categoryLevel;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.id,
    disabled: !sortable,
  });
  const style = sortable
    ? { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }
    : undefined;
  // Hover-link: announce the underlying library group id so the right-
  // side library panel can light up the matching row. Falls back to the
  // chip's own id when the chip has no libraryGroupId (e.g. an ad-hoc
  // item-scoped group never imported from the library) — in that case
  // the library panel just won't have a match, which is fine.
  const { hoveredLibId, setHovered } = useContext(MenuHoverContext);
  const linkKey = group.libraryGroupId ?? group.id;
  const isHovered = hoveredLibId === linkKey;
  return (
    <span
      ref={sortable ? setNodeRef : undefined}
      style={style}
      {...(sortable ? attributes : {})}
      {...(sortable ? listeners : {})}
      onMouseEnter={() => setHovered(linkKey)}
      onMouseLeave={() => setHovered(null)}
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium transition ${
        sortable ? "cursor-grab active:cursor-grabbing select-none" : ""
      } ${
        isBlue
          ? `bg-blue-50 border-blue-200 text-blue-700 ${isHovered ? "ring-2 ring-blue-400 ring-offset-1" : ""}`
          : `bg-emerald-50 border-emerald-200 text-emerald-700 ${isHovered ? "ring-2 ring-emerald-400 ring-offset-1" : ""}`
      }`}
    >
      {inherited && <span className="opacity-60 text-[10px]" title="Inherited from category">↑</span>}
      {group.name}
      {group.required && <span className="text-[10px] opacity-70">*</span>}
      {onRemove && (
        <button
          // onPointerDown stops dnd-kit from claiming this as the start
          // of a drag — without it, clicking the X to detach also
          // briefly registers as a drag and the visual jitter looks
          // broken.
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="ml-0.5 hover:text-red-600 transition rounded-full"
          title={inherited ? "Manage on category" : "Remove modifier group"}
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </span>
  );
}

// ─── Sortable Item Row ────────────────────────────────────────────────────────

function SortableItemRow({
  item, categoryModGroups, onEdit, onDelete, onToggle, onAttach, onDetach, onReorderGroups,
}: {
  item: MenuItem;
  categoryModGroups: ModifierGroup[];
  onEdit: () => void;
  onDelete: () => void;
  onToggle: (field: "isAvailable" | "isSoldOut" | "isHidden", val: boolean) => void;
  onAttach: (libraryGroupId: string, menuItemId: string) => void;
  onDetach: (groupId: string) => void;
  onReorderGroups: (itemId: string, orderedIds: string[]) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [dragOver, setDragOver] = useState(false);
  // Nested DnD context for the modifier-group chip strip. Uses its own
  // sensor with a slightly larger activation distance than the parent
  // item-row sensor (5px) so a quick click on a chip's X button never
  // accidentally starts a drag.
  const chipSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const handleChipDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = item.modifierGroups.map(g => g.id);
    const oldIdx = ids.indexOf(active.id as string);
    const newIdx = ids.indexOf(over.id as string);
    if (oldIdx < 0 || newIdx < 0) return;
    onReorderGroups(item.id, arrayMove(ids, oldIdx, newIdx));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("librarygroupid")) { e.dataTransfer.dropEffect = "copy"; setDragOver(true); }
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const gid = e.dataTransfer.getData("libraryGroupId");
    if (gid) onAttach(gid, item.id);
  };

  const ownGroups = item.modifierGroups;
  const inheritedGroupIds = new Set(ownGroups.map(g => g.libraryGroupId).filter(Boolean));
  const inheritedGroups = categoryModGroups.filter(g => !inheritedGroupIds.has(g.libraryGroupId ?? g.id));

  return (
    <div ref={setNodeRef} style={style}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 group transition ${item.isHidden ? "opacity-50" : ""} ${dragOver ? "bg-emerald-50 outline outline-2 outline-emerald-400 outline-dashed" : ""}`}>
      <button {...attributes} {...listeners} suppressHydrationWarning className="cursor-grab text-gray-300 hover:text-gray-400 touch-none mt-1">
        <GripVertical className="w-4 h-4" />
      </button>
      {item.imageUrl ? (
        <img src={item.imageUrl} alt={item.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
          <ImageIcon className="w-4 h-4 text-gray-300" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-gray-900 text-sm truncate">{item.name}</span>
          {item.isSoldOut && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">Sold Out</span>}
          {item.isHidden && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Hidden</span>}
          {item.hasVariants && <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded" title="This item has multiple sizes (Small / Medium / Large …)">Multiple Sizes</span>}
          {item.pizzaConfig && (() => { try { return JSON.parse(item.pizzaConfig!)?.isPizza; } catch { return false; } })() && (
            <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">🍕 Pizza</span>
          )}
        </div>
        {item.description && <div className="text-xs text-gray-400 truncate mt-0.5">{item.description}</div>}
        {(ownGroups.length > 0 || inheritedGroups.length > 0) && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {inheritedGroups.map(g => (
              // Inherited from category — no remove button; manage via the category header
              <ModifierChip key={g.id} group={g} inherited />
            ))}
            {ownGroups.length > 0 && (
              <DndContext sensors={chipSensors} collisionDetection={closestCenter} onDragEnd={handleChipDragEnd}>
                <SortableContext items={ownGroups.map(g => g.id)} strategy={rectSortingStrategy}>
                  {ownGroups.map(g => (
                    <ModifierChip key={g.id} group={g} sortable onRemove={() => onDetach(g.id)} />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>
        )}
        {dragOver && <div className="text-xs text-emerald-500 mt-1">Drop to attach modifier group</div>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {item.hasVariants
          ? <span className="text-xs text-gray-400">from {formatCurrency(Math.min(...item.variants.map(v => v.price)))}</span>
          : <span className="font-semibold text-gray-700 text-sm">{formatCurrency(item.price)}</span>
        }
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
          <button onClick={() => onToggle("isSoldOut", !item.isSoldOut)} title={item.isSoldOut ? "Mark available" : "Mark sold out"}
            className={`p-1.5 rounded transition text-sm ${item.isSoldOut ? "text-red-400 hover:text-red-600" : "text-gray-400 hover:text-gray-600"}`}>
            <AlertCircle className="w-4 h-4" />
          </button>
          <button onClick={() => onToggle("isHidden", !item.isHidden)} title={item.isHidden ? "Show" : "Hide"}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition">
            {item.isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-blue-500 rounded transition">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500 rounded transition">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sortable Category ────────────────────────────────────────────────────────

function SortableCategoryBlock({
  cat, expanded, onToggleExpand, onAddItem, onEditItem, onDeleteItem,
  onToggleItem, onEditCategory, onDeleteCategory, onItemsReordered, categories,
  onAttach, onDetach, onReorderGroups,
  selectMode, isSelected, onToggleSelect,
}: {
  cat: Category; expanded: boolean;
  onToggleExpand: () => void; onAddItem: () => void;
  onEditItem: (item: MenuItem) => void; onDeleteItem: (id: string) => void;
  onToggleItem: (id: string, field: "isAvailable" | "isSoldOut" | "isHidden", val: boolean) => void;
  onEditCategory: () => void; onDeleteCategory: () => void;
  onItemsReordered: (catId: string, ids: string[]) => void;
  categories: Category[];
  onAttach: (libraryGroupId: string, menuItemId?: string, categoryId?: string) => void;
  onDetach: (groupId: string) => void;
  onReorderGroups: (scope: { itemId?: string; categoryId?: string }, orderedIds: string[]) => void;
  /** Bulk-select mode: when true, swap the drag handle for a checkbox
   *  and short-circuit the row click to toggle selection rather than
   *  expand the category. Lets owners blast through pre-reimport
   *  cleanup with Select all → Delete instead of one-at-a-time. */
  selectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: cat.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  // Slightly bigger activation for chip drags so X-button clicks register
  // as clicks, not drags.
  const chipSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  const [catDragOver, setCatDragOver] = useState(false);

  const handleItemDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const items = [...cat.menuItems];
    const oldIdx = items.findIndex(i => i.id === active.id);
    const newIdx = items.findIndex(i => i.id === over.id);
    const reordered = arrayMove(items, oldIdx, newIdx);
    onItemsReordered(cat.id, reordered.map(i => i.id));
  };

  const handleCatChipDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = cat.modifierGroups.map(g => g.id);
    const oldIdx = ids.indexOf(active.id as string);
    const newIdx = ids.indexOf(over.id as string);
    if (oldIdx < 0 || newIdx < 0) return;
    onReorderGroups({ categoryId: cat.id }, arrayMove(ids, oldIdx, newIdx));
  };

  return (
    <div ref={setNodeRef} style={style} className={`bg-white rounded-xl shadow-sm border overflow-hidden transition ${
      selectMode && isSelected ? "border-emerald-400 ring-2 ring-emerald-200" : "border-gray-100"
    }`}>
      <div
        className={`flex items-start gap-2 p-4 cursor-pointer hover:bg-gray-50 select-none group transition ${catDragOver ? "bg-emerald-50 outline outline-2 outline-emerald-400 outline-dashed" : ""}`}
        onClick={selectMode ? onToggleSelect : onToggleExpand}
        onDragOver={e => { e.preventDefault(); if (e.dataTransfer.types.includes("librarygroupid")) { e.dataTransfer.dropEffect = "copy"; setCatDragOver(true); } }}
        onDragLeave={() => setCatDragOver(false)}
        onDrop={e => {
          e.preventDefault(); e.stopPropagation(); setCatDragOver(false);
          const gid = e.dataTransfer.getData("libraryGroupId");
          if (gid) onAttach(gid, undefined, cat.id);
        }}
      >
        {selectMode ? (
          <input
            type="checkbox"
            checked={!!isSelected}
            onChange={e => { e.stopPropagation(); onToggleSelect?.(); }}
            onClick={e => e.stopPropagation()}
            className="w-4 h-4 accent-emerald-500 flex-shrink-0 mt-1"
          />
        ) : (
          <button {...attributes} {...listeners} suppressHydrationWarning className="cursor-grab text-gray-300 hover:text-gray-400 touch-none mt-1" onClick={e => e.stopPropagation()}>
            <GripVertical className="w-4 h-4" />
          </button>
        )}
        {cat.imageUrl ? (
          <img src={cat.imageUrl} alt={cat.name} className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <UtensilsCrossed className="w-4 h-4 text-emerald-400" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-bold text-gray-900">{cat.name}</h2>
            {cat.isHidden && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Hidden</span>}
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{cat.menuItems.length}</span>
          </div>
          {cat.description && <div className="text-xs text-gray-400 truncate">{cat.description}</div>}
          {cat.modifierGroups.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5" onClick={e => e.stopPropagation()}>
              <DndContext sensors={chipSensors} collisionDetection={closestCenter} onDragEnd={handleCatChipDragEnd}>
                <SortableContext items={cat.modifierGroups.map(g => g.id)} strategy={rectSortingStrategy}>
                  {cat.modifierGroups.map(g => (
                    // categoryLevel → blue chip without ↑. These ARE the
                    // shared category attachments, so we render them blue
                    // (matching how they appear when inherited on items
                    // below) but skip the arrow since you're at the
                    // source row.
                    <ModifierChip key={g.id} group={g} categoryLevel sortable onRemove={() => onDetach(g.id)} />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          )}
          {catDragOver && <div className="text-xs text-emerald-500 mt-1">Drop to apply to all items in this category</div>}
        </div>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={onAddItem} className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium px-2 py-1 rounded hover:bg-emerald-50">
            <Plus className="w-3.5 h-3.5" /> Add Item
          </button>
          <button onClick={onEditCategory} className="p-1.5 text-gray-400 hover:text-blue-500 rounded"><Edit2 className="w-3.5 h-3.5" /></button>
          <button onClick={onDeleteCategory} className="p-1.5 text-gray-400 hover:text-red-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />}
      </div>

      {expanded && (
        <div className="border-t border-gray-100">
          {cat.menuItems.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">
              <UtensilsCrossed className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No items yet. Click "Add Item" to get started.
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleItemDragEnd}>
              <SortableContext items={cat.menuItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                {cat.menuItems.map(item => (
                  <SortableItemRow key={item.id} item={item}
                    categoryModGroups={cat.modifierGroups}
                    onEdit={() => onEditItem(item)}
                    onDelete={() => onDeleteItem(item.id)}
                    onToggle={(field, val) => onToggleItem(item.id, field, val)}
                    onAttach={(libId, itemId) => onAttach(libId, itemId)}
                    onDetach={onDetach}
                    onReorderGroups={(itemId, orderedIds) => onReorderGroups({ itemId }, orderedIds)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Right Panel: Modifier Library ───────────────────────────────────────────

function ModifierLibraryPanel({
  groups, onAddGroup, onEditGroup, onDeleteGroup,
  selectMode, selectedIds, onToggleSelect, onSetSelectMode, onSetSelectedIds, onBulkDelete,
}: {
  groups: ModifierGroup[];
  onAddGroup: () => void;
  onEditGroup: (g: ModifierGroup) => void;
  onDeleteGroup: (id: string) => void;
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSetSelectMode: (v: boolean) => void;
  onSetSelectedIds: (s: Set<string>) => void;
  onBulkDelete: (ids: string[]) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setExpanded(e => ({ ...e, [id]: !e[id] }));
  const { hoveredLibId, setHovered } = useContext(MenuHoverContext);
  // Scroll the matching row into view when an external hover (e.g. a
  // chip on an item) targets a library group that's offscreen. Uses
  // block: "nearest" so already-visible rows don't jump unnecessarily.
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  useEffect(() => {
    if (!hoveredLibId) return;
    const el = rowRefs.current[hoveredLibId];
    if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [hoveredLibId]);

  return (
    <div className="w-80 flex-shrink-0 border-l border-gray-100 bg-gray-50 flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-white">
        <div>
          <h3 className="font-bold text-gray-900 text-sm">Choices & Add-ons</h3>
          <p className="text-xs text-gray-400 mt-0.5">Modifier groups library</p>
        </div>
        <button onClick={onAddGroup}
          className="flex items-center gap-1 bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-emerald-600">
          <Plus className="w-3.5 h-3.5" /> Add Group
        </button>
      </div>

      <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-100">
        <p className="text-xs text-emerald-700">
          <GripVertical className="w-3 h-3 inline mr-1 opacity-60" />
          Drag modifier groups onto items or categories to attach them.
        </p>
      </div>

      {/* Bulk-select toolbar — visible whenever there's at least one
          group. Mirrors the categories toolbar on the left side. */}
      {groups.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-100">
          {!selectMode ? (
            <>
              <span className="text-xs text-gray-500">{groups.length} group{groups.length === 1 ? "" : "s"}</span>
              <button
                onClick={() => onSetSelectMode(true)}
                className="text-xs font-semibold text-gray-600 hover:text-gray-900 px-2 py-0.5 rounded hover:bg-gray-50 transition"
              >
                Select
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onSetSelectedIds(selectedIds.size === groups.length ? new Set() : new Set(groups.map(g => g.id)))}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline"
              >
                {selectedIds.size === groups.length ? "Deselect all" : "Select all"}
              </button>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onBulkDelete([...selectedIds])}
                  disabled={selectedIds.size === 0}
                  className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 disabled:bg-red-200 disabled:cursor-not-allowed px-2.5 py-1 rounded transition"
                >
                  Delete {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
                </button>
                <button
                  onClick={() => { onSetSelectMode(false); onSetSelectedIds(new Set()); }}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {groups.length === 0 && (
          <div className="py-10 text-center text-gray-400 text-sm">
            <Settings className="w-8 h-8 mx-auto mb-2 opacity-30" />
            No modifier groups yet.
          </div>
        )}
        {groups.map(g => {
          const isHovered = hoveredLibId === g.id;
          const isChecked = selectedIds.has(g.id);
          return (
          <div
            key={g.id}
            ref={el => { rowRefs.current[g.id] = el; }}
            draggable={!selectMode}
            onDragStart={e => {
              if (selectMode) return;
              e.dataTransfer.setData("libraryGroupId", g.id);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onMouseEnter={() => setHovered(g.id)}
            onMouseLeave={() => setHovered(null)}
            className={`bg-white rounded-xl border overflow-hidden transition ${
              selectMode ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
            } ${
              selectMode && isChecked
                ? "border-emerald-400 ring-2 ring-emerald-300"
                : isHovered
                  ? "border-emerald-400 ring-2 ring-emerald-300 shadow-md"
                  : "border-gray-100 hover:border-emerald-200 hover:shadow-sm"
            }`}
          >
            <div className="flex items-start gap-2 p-3 hover:bg-gray-50" onClick={() => selectMode ? onToggleSelect(g.id) : toggle(g.id)}>
              {selectMode ? (
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={e => { e.stopPropagation(); onToggleSelect(g.id); }}
                  onClick={e => e.stopPropagation()}
                  className="w-3.5 h-3.5 accent-emerald-500 flex-shrink-0 mt-0.5"
                />
              ) : (
                <GripVertical className="w-3.5 h-3.5 text-gray-300 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-1.5 flex-wrap">
                  {/* Two-line clamp instead of single-line truncate — long
                      names like "WHOLE PIZZA - Extra Toppings (X Large)"
                      no longer get cut to "WHOLE PIZ..." Title attr is
                      a hover-tooltip fallback for the very long ones. */}
                  <span
                    className="text-sm font-semibold text-gray-800 leading-tight break-words"
                    title={g.name}
                  >
                    {g.name}
                  </span>
                  {g.required && <span className="text-xs bg-emerald-50 text-emerald-600 px-1 rounded flex-shrink-0">Required</span>}
                  {g.isHidden && <span className="text-xs bg-gray-100 text-gray-500 px-1 rounded flex-shrink-0">Hidden</span>}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {g.options.length} options · min {g.minSelect} / max {g.maxSelect}
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={e => { e.stopPropagation(); onEditGroup(g); }} className="p-1 text-gray-400 hover:text-blue-500 rounded">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button onClick={e => { e.stopPropagation(); onDeleteGroup(g.id); }} className="p-1 text-gray-400 hover:text-red-500 rounded">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                {expanded[g.id] ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
              </div>
            </div>
            {expanded[g.id] && g.options.length > 0 && (
              <div className="border-t border-gray-50 p-2 space-y-1">
                {g.options.map(opt => (
                  <div key={opt.id ?? opt.name} className="flex items-center justify-between px-2 py-1 rounded text-xs">
                    <span className="text-gray-700">{opt.isDefault ? "★ " : ""}{opt.name}</span>
                    <span className="text-gray-500">{opt.priceAdjustment ? `+${formatCurrency(opt.priceAdjustment)}` : "free"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Category Edit Modal ──────────────────────────────────────────────────────

function CategoryModal({ cat, onClose, onSaved }: { cat?: Category; onClose: () => void; onSaved: () => void }) {
  const isNew = !cat;
  const [form, setForm] = useState({
    name: cat?.name ?? "",
    description: cat?.description ?? "",
    imageUrl: cat?.imageUrl ?? "",
    isHidden: cat?.isHidden ?? false,
    // Catering-category flag — every item in this category is treated
    // as catering for the advance-notice rule, regardless of the per-
    // item isCatering flag. Owners with a dedicated catering menu just
    // tag the whole category instead of every item one by one.
    isCatering: (cat as any)?.isCatering ?? false,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      const url = isNew ? "/api/menu/categories" : `/api/menu/categories/${cat!.id}`;
      const method = isNew ? "POST" : "PATCH";
      await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      toast.success(isNew ? "Category added" : "Category updated");
      onSaved();
    } catch { toast.error("Failed"); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold">{isNew ? "Add Category" : "Edit Category"}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category Name *</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Pizzas" autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
          </div>
          <div>
            <ImageUpload
              label="Category Image"
              value={form.imageUrl}
              onChange={url => setForm(f => ({ ...f, imageUrl: url }))}
              aspectRatio="wide"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setForm(f => ({ ...f, isHidden: !f.isHidden }))}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition ${form.isHidden ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-600"}`}>
              <EyeOff className="w-4 h-4" /> Hidden from customer menu {form.isHidden && "✓"}
            </button>
            <button onClick={() => setForm(f => ({ ...f, isCatering: !f.isCatering }))}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition ${form.isCatering ? "border-amber-500 bg-amber-50 text-amber-700" : "border-gray-200 text-gray-600"}`}
              title="Every item in this category becomes a catering item (advance notice required)"
            >
              <PartyPopper className="w-4 h-4" /> Catering category {form.isCatering && "✓"}
            </button>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancel</button>
          <button onClick={save} disabled={saving} className="px-6 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 disabled:opacity-50">
            {saving ? "Saving..." : isNew ? "Add Category" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PDF Import Modal (category-aware menu reader) ─────────────────────────
//
// Internally this uses Anthropic Claude for the heavy lifting. We DO NOT
// surface that to users — the UI just says "reading your menu". Keeps our
// option to swap providers later without breaking expectations.

type PdfItem = { name: string; description: string; price: number };
type PdfImportCategory = {
  /** Original name from extraction. */
  name: string;
  /** When user picks "merge into existing", this is the existing MenuCategory id. */
  existingCategoryId: string | null;
  items: PdfItem[];
  /** Per-item selection state. */
  selected: boolean[];
};

function PdfImportModal({ categories, onClose, onImported }: {
  categories: Category[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importCats, setImportCats] = useState<PdfImportCategory[]>([]);
  const [extractionMethod, setExtractionMethod] = useState<"claude" | "regex_fallback">("claude");
  const [extractionNote, setExtractionNote] = useState<string>("");
  const [error, setError] = useState("");
  const inputRef = { current: null as HTMLInputElement | null };

  const totalSelected = importCats.reduce(
    (sum, c) => sum + c.selected.filter(Boolean).length,
    0
  );
  const totalItems = importCats.reduce((sum, c) => sum + c.items.length, 0);

  const handleFile = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      // Step 1: client-direct upload to Vercel Blob.
      // Real-world menu PDFs are 5-15MB — well over Vercel's 4.5MB
      // serverless function body limit. We use the @vercel/blob/client
      // upload() pattern, which gets a pre-signed token from our
      // /api/menu/import-pdf/upload-url endpoint and then POSTs the file
      // bytes directly to Vercel Blob storage. Our serverless function
      // only ever sees the blob URL string (tiny).
      const { upload } = await import("@vercel/blob/client");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      // The pathname must start with menu-imports/<restaurantId>/ — the
      // upload-url handler enforces this. We don't have the restaurantId
      // on the client directly here, but we can pass a generic prefix
      // and the server-side handler will validate.
      const pathname = `menu-imports/${Date.now()}-${safeName}`;
      let blob;
      try {
        blob = await upload(pathname, file, {
          access: "public",
          handleUploadUrl: "/api/menu/import-pdf/upload-url",
          contentType: "application/pdf",
        });
      } catch (err: any) {
        setError(`Upload to storage failed: ${err?.message || "Unknown error"}`);
        setUploading(false);
        return;
      }

      // Step 2: tell the server to process the uploaded blob.
      const res = await fetch("/api/menu/import-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blobUrl: blob.url }),
      });

      // Vercel can return a non-JSON body (HTML error page, "504 Gateway
      // Timeout", etc.) when the function dies. Try JSON first, fall back
      // to text so the user sees the real reason instead of "Please try
      // again."
      let data: any = null;
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text().catch(() => "");
        data = { error: text.slice(0, 400) || `HTTP ${res.status}` };
      }

      if (!res.ok) {
        // Map common Vercel/server failure modes to actionable messages
        let msg = data?.error || `Upload failed (HTTP ${res.status})`;
        if (res.status === 504 || /timed out/i.test(msg)) {
          msg = "Reading this menu took longer than allowed. Try a smaller or simpler PDF, or contact support.";
        } else if (/ANTHROPIC_API_KEY/i.test(msg)) {
          msg = "Menu reader is not configured. Contact the platform admin.";
        } else if (/credit balance/i.test(msg)) {
          msg = "Menu reader quota exhausted. Contact the platform admin.";
        }
        setError(msg);
        setUploading(false);
        return;
      }
      // Hydrate state
      const cats = (data.categories as Array<{ name: string; items: PdfItem[] }>).map((c) => {
        // Try to auto-match against an existing category with the same (case-insensitive) name
        const match = categories.find(
          (existing) => existing.name.trim().toLowerCase() === c.name.trim().toLowerCase()
        );
        return {
          name: c.name,
          existingCategoryId: match?.id ?? null,
          items: c.items,
          selected: c.items.map(() => true),
        };
      });
      setImportCats(cats);
      setExtractionMethod(data.method || "claude");
      setExtractionNote(data.note || "");
      setStep("review");
    } catch (err: any) {
      // Network-level failure (no response at all). Most common cause:
      // Vercel killed the function and the connection dropped. Show that.
      const reason = err?.name === "TypeError" ? "Network or timeout error" : err?.message || "Unknown error";
      setError(`Upload failed: ${reason}. If this menu is large, reading it may have taken too long — try a shorter PDF or contact support.`);
    }
    setUploading(false);
  };

  const confirmImport = async () => {
    if (totalSelected === 0) {
      toast.error("Select at least one item");
      return;
    }
    setImporting(true);
    try {
      // Build the payload, only including selected items per category
      const payload = {
        categories: importCats
          .map((c) => ({
            name: c.name,
            existingCategoryId: c.existingCategoryId,
            items: c.items.filter((_, i) => c.selected[i]),
          }))
          .filter((c) => c.items.length > 0),
      };
      const res = await fetch("/api/menu/import-pdf", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      const catMsg = data.categoriesCreated > 0
        ? `${data.categoriesCreated} new categor${data.categoriesCreated === 1 ? "y" : "ies"} + `
        : "";
      const dupMsg = data.itemsSkippedDuplicate > 0
        ? ` (${data.itemsSkippedDuplicate} duplicate${data.itemsSkippedDuplicate === 1 ? "" : "s"} skipped)`
        : "";
      toast.success(`${catMsg}${data.itemsCreated} item${data.itemsCreated !== 1 ? "s" : ""} imported!${dupMsg}`);
      onImported();
    } catch (e: any) {
      toast.error(e.message || "Import failed");
    }
    setImporting(false);
  };

  const updateItem = (catIdx: number, itemIdx: number, field: keyof PdfItem, value: string | number) => {
    setImportCats((cats) =>
      cats.map((c, ci) =>
        ci !== catIdx ? c : {
          ...c,
          items: c.items.map((it, ii) => ii !== itemIdx ? it : { ...it, [field]: value }),
        }
      )
    );
  };

  const toggleItem = (catIdx: number, itemIdx: number) => {
    setImportCats((cats) =>
      cats.map((c, ci) => ci !== catIdx ? c : {
        ...c,
        selected: c.selected.map((s, si) => si === itemIdx ? !s : s),
      })
    );
  };

  const toggleAllInCat = (catIdx: number) => {
    setImportCats((cats) => cats.map((c, ci) => {
      if (ci !== catIdx) return c;
      const allOn = c.selected.every(Boolean);
      return { ...c, selected: c.selected.map(() => !allOn) };
    }));
  };

  const updateCatName = (catIdx: number, name: string) => {
    setImportCats((cats) => cats.map((c, ci) => ci === catIdx ? { ...c, name } : c));
  };

  const updateCatMerge = (catIdx: number, existingCategoryId: string | null) => {
    setImportCats((cats) => cats.map((c, ci) => ci === catIdx ? { ...c, existingCategoryId } : c));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-500" />
            <h2 className="text-lg font-bold text-gray-900">Import Menu from PDF</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {step === "upload" && (
          <div className="flex-1 flex flex-col items-center justify-center p-10 gap-5">
            <div
              className="w-full border-2 border-dashed border-gray-300 rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            >
              <Upload className="w-10 h-10 text-emerald-400" />
              <div className="text-center">
                <div className="font-semibold text-gray-800">Drop your menu PDF here</div>
                <div className="text-sm text-gray-500 mt-1">or click to browse — max 25 MB</div>
              </div>
              {uploading && <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />}
            </div>
            <input ref={(el) => { inputRef.current = el; }} type="file" accept=".pdf,application/pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            {error && (
              <div className="w-full bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
                <AlertCircle className="w-4 h-4 inline mr-1.5" />{error}
              </div>
            )}
            <p className="text-xs text-gray-400 text-center max-w-sm">
              We read your PDF automatically — including categories, prices, and descriptions. Works on print-designed menus with multi-column layouts and decorative typography.
            </p>
          </div>
        )}

        {step === "review" && (
          <>
            <div className="p-4 border-b bg-gray-50 flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium text-gray-600">
                {importCats.length} categor{importCats.length === 1 ? "y" : "ies"} · {totalItems} items detected
              </span>
              {extractionMethod === "regex_fallback" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800" title={extractionNote}>
                  Basic mode
                </span>
              )}
              {extractionMethod === "claude" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                  Auto-detected
                </span>
              )}
              <span className="ml-auto text-xs text-gray-500">
                {totalSelected} of {totalItems} selected
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {importCats.map((cat, ci) => {
                const allOn = cat.selected.every(Boolean);
                const someOn = cat.selected.some(Boolean);
                return (
                  <div key={ci} className="border-b border-gray-100">
                    {/* Category header */}
                    <div className="px-4 py-3 bg-gray-50 flex items-center gap-3 flex-wrap sticky top-0 z-10">
                      <button
                        onClick={() => toggleAllInCat(ci)}
                        className="text-xs text-emerald-600 hover:underline whitespace-nowrap"
                      >
                        {allOn ? "Deselect all" : someOn ? "Select all" : "Select all"}
                      </button>
                      <input
                        className="flex-1 min-w-[180px] text-sm font-semibold text-gray-900 border-b border-transparent hover:border-gray-300 focus:border-emerald-400 focus:outline-none px-0 py-0.5 bg-transparent"
                        value={cat.name}
                        onChange={(e) => updateCatName(ci, e.target.value)}
                        disabled={!!cat.existingCategoryId}
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">into:</span>
                        <select
                          className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          value={cat.existingCategoryId ?? ""}
                          onChange={(e) => updateCatMerge(ci, e.target.value || null)}
                        >
                          <option value="">+ New: &quot;{cat.name}&quot;</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>Merge into: {c.name}</option>
                          ))}
                        </select>
                      </div>
                      <span className="text-xs text-gray-500">
                        {cat.selected.filter(Boolean).length}/{cat.items.length}
                      </span>
                    </div>
                    {/* Items in this category */}
                    <div className="divide-y divide-gray-100">
                      {cat.items.map((item, ii) => (
                        <div key={ii} className={`flex items-start gap-3 px-4 py-3 ${!cat.selected[ii] ? "opacity-40" : ""}`}>
                          <input
                            type="checkbox"
                            checked={cat.selected[ii]}
                            onChange={() => toggleItem(ci, ii)}
                            className="mt-1 w-4 h-4 rounded accent-emerald-500 flex-shrink-0"
                          />
                          <div className="flex-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
                            <input
                              className="text-sm font-medium border-b border-transparent hover:border-gray-300 focus:border-emerald-400 focus:outline-none px-0 py-0.5"
                              value={item.name}
                              onChange={(e) => updateItem(ci, ii, "name", e.target.value)}
                            />
                            <input
                              type="number" step="0.01" min="0"
                              className="w-24 text-sm text-right border border-gray-200 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                              value={item.price}
                              onChange={(e) => updateItem(ci, ii, "price", parseFloat(e.target.value) || 0)}
                            />
                            <input
                              placeholder="Description (optional)"
                              className="col-span-2 text-xs text-gray-500 border-b border-transparent hover:border-gray-300 focus:border-emerald-400 focus:outline-none px-0 py-0.5"
                              value={item.description}
                              onChange={(e) => updateItem(ci, ii, "description", e.target.value)}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between items-center p-5 border-t bg-gray-50 rounded-b-2xl gap-3">
              <button onClick={() => { setStep("upload"); setError(""); setImportCats([]); }} className="text-sm text-gray-500 hover:text-gray-800">
                ← Upload another
              </button>
              <div className="flex gap-3">
                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button
                  onClick={confirmImport}
                  disabled={importing || totalSelected === 0}
                  className="px-6 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-2"
                >
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Import {totalSelected} Item{totalSelected === 1 ? "" : "s"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main MenuClient ──────────────────────────────────────────────────────────

interface Props { categories: Category[]; libraryGroups: ModifierGroup[]; restaurantId: string }

export function MenuClient({ categories: initial, libraryGroups: initialGroups }: Props) {
  const [categories, setCategories] = useState(initial);
  const [libraryGroups, setLibraryGroups] = useState(initialGroups);
  // Menu search query for the admin menu builder. Filters the visible
  // categories list (left rail) to those that contain at least one
  // matching item or whose name itself matches. Item-level filtering
  // is rendered inside each SortableCategoryBlock via the same query.
  // Luigi 2026-05-31 (GloriaFood parity).
  const [menuSearchQuery, setMenuSearchQuery] = useState("");
  const [expandedCats, setExpandedCats] = useState<Record<string, boolean>>(
    Object.fromEntries(initial.map(c => [c.id, true]))
  );
  const [itemModal, setItemModal] = useState<{ catId: string; item?: MenuItem } | null>(null);
  const [modModal, setModModal] = useState<{ group?: ModifierGroup; menuItemId?: string } | null>(null);
  const [catModal, setCatModal] = useState<{ cat?: Category } | null>(null);
  const [pdfImportOpen, setPdfImportOpen] = useState(false);
  // Bulk-select state for the category list and the modifier-library
  // panel. selectMode flips on the checkboxes + bulk action bar; the
  // Set tracks which ids are picked. Wiping the menu before a re-
  // import goes from 30+ clicks to 3 (Select mode → Select all →
  // Delete) — surfaced by Luigi 2026-05-31.
  const [categorySelectMode, setCategorySelectMode] = useState(false);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set());
  const [modGroupSelectMode, setModGroupSelectMode] = useState(false);
  const [selectedModGroupIds, setSelectedModGroupIds] = useState<Set<string>>(new Set());
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string; message: string; confirmLabel?: string; onConfirm: () => void;
  } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const reload = useCallback(async () => {
    const [catRes, modRes] = await Promise.all([
      fetch("/api/menu/categories"),
      fetch("/api/menu/modifiers"),
    ]);
    if (catRes.ok) setCategories(await catRes.json());
    if (modRes.ok) setLibraryGroups(await modRes.json());
  }, []);

  const handleCatDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = categories.findIndex(c => c.id === active.id);
    const newIdx = categories.findIndex(c => c.id === over.id);
    const reordered = arrayMove(categories, oldIdx, newIdx);
    setCategories(reordered);
    await fetch("/api/menu/reorder", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "categories", ids: reordered.map(c => c.id) }) });
  };

  const handleItemsReordered = async (catId: string, ids: string[]) => {
    setCategories(cats => cats.map(c => c.id === catId
      ? { ...c, menuItems: ids.map(id => c.menuItems.find(i => i.id === id)!).filter(Boolean) }
      : c
    ));
    await fetch("/api/menu/reorder", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "items", ids }) });
  };

  /**
   * Owner dragged the modifier-group chips on an item or a category to
   * a new order. Update local state optimistically (the chips visually
   * land in the new order without waiting for a round-trip) then POST
   * to /api/menu/reorder. On API failure we don't roll back — the user
   * will see a toast and a reload() reverts to truth. Same pattern as
   * handleItemsReordered above.
   */
  const handleReorderGroups = async (
    scope: { itemId?: string; categoryId?: string },
    orderedIds: string[],
  ) => {
    setCategories(cats => cats.map(c => {
      if (scope.categoryId && c.id === scope.categoryId) {
        return {
          ...c,
          modifierGroups: orderedIds
            .map(id => c.modifierGroups.find(g => g.id === id)!)
            .filter(Boolean),
        };
      }
      if (scope.itemId) {
        return {
          ...c,
          menuItems: c.menuItems.map(it => it.id === scope.itemId
            ? {
                ...it,
                modifierGroups: orderedIds
                  .map(id => it.modifierGroups.find(g => g.id === id)!)
                  .filter(Boolean),
              }
            : it,
          ),
        };
      }
      return c;
    }));
    const res = await fetch("/api/menu/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "modifiers", ids: orderedIds }),
    });
    if (!res.ok) {
      toast.error("Failed to save new order — refreshing.");
      await reload();
    }
  };

  const deleteItem = (id: string) => {
    setConfirmDialog({
      title: "Delete item?",
      message: "This cannot be undone. Items with order history will be hidden from the menu rather than permanently deleted.",
      confirmLabel: "Delete",
      onConfirm: async () => {
        setConfirmDialog(null);
        const res = await fetch(`/api/menu/items/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          toast.error(body.error || "Failed to delete item");
          return;
        }
        toast.success("Item deleted");
        await reload();
      },
    });
  };

  const toggleItem = async (id: string, field: "isAvailable" | "isSoldOut" | "isHidden", val: boolean) => {
    await fetch(`/api/menu/items/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: val }) });
    await reload();
  };

  const deleteCategory = (id: string) => {
    setConfirmDialog({
      title: "Delete category?",
      message: "This will permanently delete the category and all its items. This cannot be undone.",
      confirmLabel: "Delete Category",
      onConfirm: async () => {
        setConfirmDialog(null);
        const res = await fetch(`/api/menu/categories/${id}`, { method: "DELETE" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(body.error || "Failed to delete category");
          return;
        }
        toast.success("Category deleted");
        await reload();
      },
    });
  };

  /**
   * Bulk delete N items by issuing parallel DELETE requests (concurrency
   * 5 so we don't blast Vercel with 30+ in-flight). Returns once every
   * delete has settled so a single reload() refreshes the UI.
   */
  const bulkDelete = async (ids: string[], urlFor: (id: string) => string): Promise<{ ok: number; failed: number }> => {
    let ok = 0, failed = 0;
    const CONC = 5;
    const queue = [...ids];
    const worker = async () => {
      while (queue.length) {
        const id = queue.shift()!;
        try {
          const res = await fetch(urlFor(id), { method: "DELETE" });
          if (res.ok) ok++; else failed++;
        } catch { failed++; }
      }
    };
    await Promise.all(Array.from({ length: CONC }, worker));
    return { ok, failed };
  };

  const bulkDeleteCategories = (ids: string[]) => {
    if (ids.length === 0) return;
    setConfirmDialog({
      title: `Delete ${ids.length} categor${ids.length === 1 ? "y" : "ies"}?`,
      message: `This will permanently delete ${ids.length === 1 ? "this category and its items" : `these ${ids.length} categories and all their items`}. This cannot be undone.`,
      confirmLabel: `Delete ${ids.length}`,
      onConfirm: async () => {
        setConfirmDialog(null);
        const { ok, failed } = await bulkDelete(ids, id => `/api/menu/categories/${id}`);
        if (failed > 0) toast.error(`Deleted ${ok}, ${failed} failed`);
        else toast.success(`Deleted ${ok} categor${ok === 1 ? "y" : "ies"}`);
        setSelectedCategoryIds(new Set());
        setCategorySelectMode(false);
        await reload();
      },
    });
  };

  const deleteModGroup = (id: string) => {
    setConfirmDialog({
      title: "Delete modifier group?",
      message: "This will permanently delete this modifier group and all its options.",
      confirmLabel: "Delete",
      onConfirm: async () => {
        setConfirmDialog(null);
        const res = await fetch(`/api/menu/modifiers/${id}`, { method: "DELETE" });
        if (!res.ok) {
          toast.error("Failed to delete modifier group");
          return;
        }
        toast.success("Modifier group deleted");
        await reload();
      },
    });
  };

  const bulkDeleteModGroups = (ids: string[]) => {
    if (ids.length === 0) return;
    setConfirmDialog({
      title: `Delete ${ids.length} modifier group${ids.length === 1 ? "" : "s"}?`,
      message: `This will permanently delete ${ids.length === 1 ? "this modifier group and its options" : `these ${ids.length} modifier groups and all their options`}. Items that referenced them will lose those attachments. This cannot be undone.`,
      confirmLabel: `Delete ${ids.length}`,
      onConfirm: async () => {
        setConfirmDialog(null);
        const { ok, failed } = await bulkDelete(ids, id => `/api/menu/modifiers/${id}`);
        if (failed > 0) toast.error(`Deleted ${ok}, ${failed} failed`);
        else toast.success(`Deleted ${ok} group${ok === 1 ? "" : "s"}`);
        setSelectedModGroupIds(new Set());
        setModGroupSelectMode(false);
        await reload();
      },
    });
  };

  const attachModifier = async (libraryGroupId: string, menuItemId?: string, categoryId?: string) => {
    const res = await fetch("/api/menu/modifiers/attach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ libraryGroupId, menuItemId, categoryId }),
    });
    if (res.status === 409) { toast.error("Already attached"); return; }
    if (!res.ok) { toast.error("Failed to attach"); return; }
    toast.success(categoryId ? "Attached to category" : "Attached to item");
    await reload();
  };

  const detachModifier = async (groupId: string) => {
    const res = await fetch("/api/menu/modifiers/attach", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId }),
    });
    if (!res.ok) { toast.error("Failed to detach"); return; }
    toast.success("Removed");
    await reload();
  };

  // Hover-link wiring — shared between every ModifierChip and the
  // right-side ModifierLibraryPanel. See MenuHoverContext docs.
  const [hoveredLibId, setHoveredLibId] = useState<string | null>(null);
  const hoverValue: HoverState = { hoveredLibId, setHovered: setHoveredLibId };

  return (
    <MenuHoverContext.Provider value={hoverValue}>
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Menu Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Drag to reorder categories and items</p>
        </div>
        <div className="flex items-center gap-2">
          {/* GloriaFood/FoodBooking direct importer — restaurants migrating
              off Sams Restaurant Systems (sunsetting April 2027) or any
              GloriaFood-powered platform paste their embed snippet and
              their entire menu (incl. modifiers) lands in seconds. */}
          <a href="/admin/menu/import-gloriafood"
            className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 font-semibold px-4 py-2.5 rounded-xl hover:bg-gray-50 transition text-sm shadow-sm">
            <Download className="w-4 h-4" /> Import from GloriaFood
          </a>
          <button onClick={() => setPdfImportOpen(true)}
            className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 font-semibold px-4 py-2.5 rounded-xl hover:bg-gray-50 transition text-sm shadow-sm">
            <Upload className="w-4 h-4" /> Import PDF
          </button>
          <button onClick={() => setCatModal({})}
            className="flex items-center gap-2 bg-emerald-500 text-white font-semibold px-4 py-2.5 rounded-xl hover:bg-emerald-600 transition text-sm shadow-sm">
            <Plus className="w-4 h-4" /> Add Category
          </button>
        </div>
      </div>

      {/* Split layout */}
      <div className="flex flex-1 gap-0 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden min-h-0" style={{ height: "calc(100vh - 220px)" }}>
        {/* Left: Categories & Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Menu search bar (Luigi 2026-05-31, GloriaFood parity). Filters
              categories + items by name and description. Items that don't
              match disappear; categories that have NO matching items
              collapse to a single "no items match" row. Owners can find
              the dish they need to price-edit without scrolling. */}
          {categories.length > 0 && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={menuSearchQuery}
                onChange={(e) => setMenuSearchQuery(e.target.value)}
                placeholder="Search categories and items…"
                className="w-full pl-8 pr-8 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              {menuSearchQuery && (
                <button
                  type="button"
                  onClick={() => setMenuSearchQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-400"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
          {categories.length > 0 && (
            <div className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 sticky top-0 z-10">
              {!categorySelectMode ? (
                <>
                  <span className="text-xs text-gray-500">{categories.length} categor{categories.length === 1 ? "y" : "ies"}</span>
                  <button
                    onClick={() => setCategorySelectMode(true)}
                    className="text-xs font-semibold text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-white transition"
                  >
                    Select
                  </button>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        setSelectedCategoryIds(prev =>
                          prev.size === categories.length ? new Set() : new Set(categories.map(c => c.id))
                        );
                      }}
                      className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline"
                    >
                      {selectedCategoryIds.size === categories.length ? "Deselect all" : "Select all"}
                    </button>
                    <span className="text-xs text-gray-500">
                      {selectedCategoryIds.size} of {categories.length} selected
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => bulkDeleteCategories([...selectedCategoryIds])}
                      disabled={selectedCategoryIds.size === 0}
                      className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 disabled:bg-red-200 disabled:cursor-not-allowed px-3 py-1.5 rounded transition"
                    >
                      Delete {selectedCategoryIds.size > 0 ? `(${selectedCategoryIds.size})` : ""}
                    </button>
                    <button
                      onClick={() => { setCategorySelectMode(false); setSelectedCategoryIds(new Set()); }}
                      className="text-xs text-gray-500 hover:text-gray-700 px-2"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {categories.length === 0 ? (
            <div className="py-20 text-center text-gray-400">
              <UtensilsCrossed className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No categories yet</p>
              <p className="text-sm mt-1">Click "Add Category" to get started</p>
            </div>
          ) : (() => {
            // Filter visible categories by search query. We compute
            // here (not via useMemo above the JSX) so the search field
            // stays accurate even mid-drag without re-arranging hooks.
            const q = menuSearchQuery.trim().toLowerCase();
            const filteredCategories = !q ? categories : categories.filter((c: any) => {
              if (c.name.toLowerCase().includes(q)) return true;
              return (c.menuItems ?? []).some((i: any) => {
                const hay = `${i.name ?? ""} ${i.description ?? ""}`.toLowerCase();
                return hay.includes(q);
              });
            });
            if (filteredCategories.length === 0) {
              return (
                <div className="py-12 text-center text-gray-400">
                  <Search className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="font-medium">No matches for &ldquo;{menuSearchQuery}&rdquo;</p>
                  <button
                    type="button"
                    onClick={() => setMenuSearchQuery("")}
                    className="mt-2 text-sm text-emerald-600 hover:underline"
                  >Clear search</button>
                </div>
              );
            }
            return (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCatDragEnd}>
              <SortableContext items={filteredCategories.map((c: any) => c.id)} strategy={verticalListSortingStrategy}>
                {filteredCategories.map((cat: any) => (
                  <SortableCategoryBlock key={cat.id} cat={cat}
                    expanded={expandedCats[cat.id] ?? true}
                    onToggleExpand={() => setExpandedCats(e => ({ ...e, [cat.id]: !e[cat.id] }))}
                    onAddItem={() => setItemModal({ catId: cat.id })}
                    onEditItem={item => setItemModal({ catId: cat.id, item })}
                    onDeleteItem={deleteItem}
                    onToggleItem={toggleItem}
                    onEditCategory={() => setCatModal({ cat })}
                    onDeleteCategory={() => deleteCategory(cat.id)}
                    onItemsReordered={handleItemsReordered}
                    categories={categories}
                    onAttach={attachModifier}
                    onDetach={detachModifier}
                    onReorderGroups={handleReorderGroups}
                    selectMode={categorySelectMode}
                    isSelected={selectedCategoryIds.has(cat.id)}
                    onToggleSelect={() => {
                      setSelectedCategoryIds(prev => {
                        const next = new Set(prev);
                        if (next.has(cat.id)) next.delete(cat.id); else next.add(cat.id);
                        return next;
                      });
                    }}
                  />
                ))}
              </SortableContext>
            </DndContext>
            );
          })()}
        </div>

        {/* Right: Modifier Library */}
        <ModifierLibraryPanel
          groups={libraryGroups}
          onAddGroup={() => setModModal({})}
          onEditGroup={g => setModModal({ group: g })}
          onDeleteGroup={deleteModGroup}
          selectMode={modGroupSelectMode}
          selectedIds={selectedModGroupIds}
          onToggleSelect={id => {
            setSelectedModGroupIds(prev => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id); else next.add(id);
              return next;
            });
          }}
          onSetSelectMode={setModGroupSelectMode}
          onSetSelectedIds={setSelectedModGroupIds}
          onBulkDelete={bulkDeleteModGroups}
        />
      </div>

      {/* Modals */}
      {catModal !== null && (
        <CategoryModal cat={catModal.cat} onClose={() => setCatModal(null)} onSaved={() => { setCatModal(null); reload(); }} />
      )}
      {itemModal !== null && (
        <ItemModal item={itemModal.item} categoryId={itemModal.catId} categories={categories}
          libraryGroups={libraryGroups}
          onClose={() => setItemModal(null)} onSaved={() => { setItemModal(null); reload(); }} />
      )}
      {modModal !== null && (
        <ModifierModal group={modModal.group} menuItemId={modModal.menuItemId}
          onClose={() => setModModal(null)} onSaved={() => { setModModal(null); reload(); }} />
      )}
      {pdfImportOpen && (
        <PdfImportModal
          categories={categories}
          onClose={() => setPdfImportOpen(false)}
          onImported={() => { setPdfImportOpen(false); reload(); }}
        />
      )}
      {confirmDialog && (
        <ConfirmModal
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
    </MenuHoverContext.Provider>
  );
}
