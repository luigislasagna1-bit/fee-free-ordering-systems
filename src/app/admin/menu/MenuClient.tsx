"use client";
import { useTranslations } from "next-intl";
import { formatTime, type HoursFormat } from "@/lib/format-time";
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
import { useCurrencyFormat, useCurrencySymbol } from "@/lib/currency-context";
import { ImageUpload } from "@/components/admin/ImageUpload";
import { parseComboConfig } from "@/lib/combo";
import { VisibilityEditor, visibilityFromRow, type VisibilityValue } from "@/components/admin/VisibilityEditor";
import { HelpTip } from "@/components/HelpTip";
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
  pizzaRole?: string | null;
  options: ModifierOption[];
};
type ItemVariant = { id?: string; name: string; price: number; sortOrder: number; isDefault: boolean };
type MenuItem = {
  id: string; name: string; description?: string; price: number;
  imageUrl?: string; isAvailable: boolean; isFeatured: boolean;
  isSoldOut: boolean; isHidden: boolean; hasVariants: boolean;
  forPickup: boolean; forDelivery: boolean;
  availableDays?: number[]; availableFrom?: string; availableTo?: string;
  availabilityMode?: string | null;
  sortOrder: number; variants: ItemVariant[];
  modifierGroups: ModifierGroup[];
  pizzaConfig?: string;
  comboConfig?: string;
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
  /** When true, the customer may add ZERO toppings (e.g. plain cheese). When
   *  false (default), a topping selection is required if its group requires it. */
  toppingsOptional: boolean;
  extraToppingPrice: string;
  variantToppingPrices: Record<string, string>;
  halfToppingMultiplier: string;
  extraQuantityMultiplier: string;
  allowMultipleToppings: boolean;
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
    toppingsOptional: !!p?.toppingsOptional,
    extraToppingPrice: String(p?.extraToppingPrice ?? "0"),
    variantToppingPrices: p?.variantToppingPrices && typeof p.variantToppingPrices === "object"
      ? Object.fromEntries(Object.entries(p.variantToppingPrices).map(([k, v]) => [k, String(v)]))
      : {},
    halfToppingMultiplier: String(p?.halfToppingMultiplier ?? "0.5"),
    extraQuantityMultiplier: String(p?.extraQuantityMultiplier ?? "0"),
    allowMultipleToppings: p?.allowMultipleToppings !== false, // default ON
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
  // Set of canonical IDs that ARE currently attached (item-level OR
  // category-level inherited). Used to filter out stale role IDs
  // pointing at groups that were detached or deleted — without this,
  // "Choose Sauce" can linger in the display order after its
  // attachment was removed because pizza.sauceGroupId still holds
  // the library id. Luigi 2026-06-01 reported exactly this.
  const attachedIds = new Set<string>();
  for (const g of categoryModGroups) {
    attachedIds.add(g.libraryGroupId ?? g.id);
    if (g.libraryGroupId) attachedIds.add(g.id);
  }
  if (item) {
    for (const g of item.modifierGroups) {
      attachedIds.add(g.libraryGroupId ?? g.id);
      if (g.libraryGroupId) attachedIds.add(g.id);
    }
  }
  // Helper — given a role ID (may be a library id or instance id),
  // does it still match an attached group? Returns the canonical key
  // to push into the order, or null when stale.
  const resolveRoleId = (rawId: string | null | undefined): string | null => {
    if (!rawId) return null;
    if (attachedIds.has(rawId)) return rawId;
    return null;
  };

  // The set of section IDs the customer-side will render for this item,
  // in the legacy default order. Same logic as the customer-side
  // computation but driven from form state + libraryGroups. Stale role
  // ids (no longer attached) are filtered so they don't pollute the
  // display.
  const defaultOrder: string[] = (() => {
    const def: string[] = [];
    if (hasVariants) def.push(SECTION_SIZE);
    const liveCrustId = resolveRoleId(pizza.crustGroupId);
    if (liveCrustId) def.push(liveCrustId);
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
    const liveSauceId = resolveRoleId(pizza.sauceGroupId);
    const liveCheeseId = resolveRoleId(pizza.cheeseGroupId);
    const liveToppingIds = pizza.toppingGroupIds
      .map((id) => resolveRoleId(id))
      .filter((x): x is string => !!x);
    const roleIds = new Set<string>([
      liveCrustId, liveSauceId, liveCheeseId,
      ...liveToppingIds,
    ].filter(Boolean) as string[]);
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
    if (liveSauceId) def.push(liveSauceId);
    if (liveCheeseId) def.push(liveCheeseId);
    if (liveToppingIds.length > 0) def.push(SECTION_TOPPINGS);
    return def;
  })();

  const effectiveOrder: string[] = pizza.sectionOrder.length > 0
    ? (() => {
        const inUser = new Set(pizza.sectionOrder);
        const tail = defaultOrder.filter(id => !inUser.has(id));
        return [...pizza.sectionOrder.filter(id => defaultOrder.includes(id)), ...tail];
      })()
    : defaultOrder;

  const t = useTranslations("admin.menuEditor");
  const labelFor = (id: string): string => {
    if (id === SECTION_SIZE) return t("sectionSizeLabel");
    if (id === SECTION_HALF_HALF) return t("sectionHalfHalfLabel");
    if (id === SECTION_TOPPINGS) return t("sectionToppingsLabel");
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
    return t("sectionUnknown");
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
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("customerDisplayOrder")}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {t("customerDisplayOrderHint")}
          </p>
        </div>
        {pizza.sectionOrder.length > 0 && (
          <button type="button" onClick={resetOrder}
            className="text-xs text-gray-500 hover:text-gray-700 underline">
            {t("resetToDefault")}
          </button>
        )}
      </div>
      <div className="space-y-1.5 border border-gray-200 rounded-lg p-2 bg-gray-50">
        {effectiveOrder.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-3">
            {t("sectionOrderEmpty")}
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
                  title={t("moveUp")}>
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => move(i, 1)}
                  disabled={i === effectiveOrder.length - 1}
                  className="text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                  title={t("moveDown")}>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
              <span className="text-xs font-mono text-gray-300 w-5">{i + 1}.</span>
              <span className="text-sm text-gray-800 flex-1 truncate">{labelFor(id)}</span>
              {groupEligible && (
                <span
                  className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                  title={t("halfHalfCapableTitle")}
                >
                  {t("halfHalfBadge")}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel, onConfirm, onCancel }: {
  title: string; message: string; confirmLabel?: string;
  onConfirm: () => void; onCancel: () => void;
}) {
  const t = useTranslations("admin.menuEditor");
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 className="text-base font-bold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-600 leading-relaxed">{message}</p>
        <div className="flex gap-3 mt-5 justify-end">
          <button onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
            {t("cancel")}
          </button>
          <button onClick={onConfirm}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 rounded-lg transition">
            {confirmLabel ?? t("delete")}
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
  item, categoryId, categories, libraryGroups, onClose, onSaved, canUseCombos = false,
}: {
  item?: MenuItem; categoryId: string; categories: Category[];
  libraryGroups: ModifierGroup[];
  canUseCombos?: boolean;
  onClose: () => void; onSaved: () => void;
}) {
  const t = useTranslations("admin.menuEditor");
  const curSym = useCurrencySymbol();
  const isNew = !item;
  const [form, setForm] = useState({
    name: item?.name ?? "",
    description: item?.description ?? "",
    price: item?.price?.toString() ?? "",
    categoryId: item ? (categories.find(c => c.menuItems.some(i => i.id === item.id))?.id ?? categoryId) : categoryId,
    imageUrl: item?.imageUrl ?? "",
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
    // "hide" (legacy) = item disappears outside its window; "show" = stays
    // visible but can't be ordered (reseller report cmpxec829).
    availabilityMode: ((item as any)?.availabilityMode === "show" ? "show" : "hide") as "hide" | "show",
    // Phase 2 Fulfilment Time (Luigi 2026-06-12): the days/times this item can
    // be ORDERED FOR. It stays visible on the menu every day; outside the
    // window the customer is asked to schedule (like catering). Replaces the
    // legacy availableDays/availabilityMode "show" path.
    fulfilEnabled: (() => {
      const raw = (item as any)?.fulfilDays;
      let days: unknown = null;
      if (typeof raw === "string" && raw) { try { days = JSON.parse(raw); } catch { /* ignore */ } }
      const hasDays = Array.isArray(days) && days.length > 0 && days.length < 7;
      return hasDays || !!((item as any)?.fulfilFrom && (item as any)?.fulfilTo);
    })(),
    fulfilDays: (() => {
      const raw = (item as any)?.fulfilDays;
      if (typeof raw === "string" && raw) { try { const a = JSON.parse(raw); if (Array.isArray(a)) return a.map(Number); } catch { /* ignore */ } }
      return [] as number[];
    })(),
    fulfilFrom: (item as any)?.fulfilFrom ?? "",
    fulfilTo: (item as any)?.fulfilTo ?? "",
  });
  const [variants, setVariants] = useState<ItemVariant[]>(
    item?.variants?.length ? item.variants : [{ name: "", price: 0, sortOrder: 0, isDefault: true }]
  );
  const [pizza, setPizza] = useState<PizzaFormState>(() => parsePizzaForm(item?.pizzaConfig));
  // GloriaFood-style scheduled visibility (Phase 1) — replaces the old isHidden toggle.
  const [visibility, setVisibility] = useState<VisibilityValue>(() => visibilityFromRow(item));
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"basic" | "visibility" | "availability" | "variants" | "pizza" | "combo">("basic");

  // ── Combo builder state ──────────────────────────────────────────────────
  // A combo item is composed of "slots", each offering a pool of eligible items
  // (the customer picks 1 per slot by default; pizza items open the builder).
  type ComboSlotForm = {
    id: string; label: string; min: number; max: number; itemIds: string[];
    upcharges: Record<string, string>;
    // itemId → allowed variant ids (sizes) included in this combo.
    itemVariants: Record<string, string[]>;
    // `${itemId}::${variantId}` → per-size upcharge (string for the input).
    variantUpcharges: Record<string, string>;
  };
  const [isCombo, setIsCombo] = useState<boolean>(() => !!parseComboConfig((item as any)?.comboConfig));
  // When true, a child item's add-ons/modifiers (and pizza extra toppings) add
  // their normal price on top of the combo; when false, extras are free.
  const [comboExtrasCharge, setComboExtrasCharge] = useState<boolean>(
    () => parseComboConfig((item as any)?.comboConfig)?.extrasCharge ?? false,
  );
  const [comboSlots, setComboSlots] = useState<ComboSlotForm[]>(() => {
    const c = parseComboConfig((item as any)?.comboConfig);
    return c ? c.slots.map((s) => ({
      id: s.id, label: s.label, min: s.min, max: s.max, itemIds: s.itemIds,
      upcharges: Object.fromEntries(Object.entries(s.upcharges ?? {}).map(([k, v]) => [k, String(v)])),
      itemVariants: Object.fromEntries(Object.entries(s.itemVariants ?? {}).map(([k, v]) => [k, [...v]])),
      variantUpcharges: Object.fromEntries(Object.entries(s.variantUpcharges ?? {}).map(([k, v]) => [k, String(v)])),
    })) : [];
  });
  // Pool of items the owner can put in a slot — every menu item EXCEPT this one
  // and other combos (no self-reference, no nested combos). Carries variants so
  // the builder can offer per-size (variant) selection for items like Wings.
  const comboItemPool = categories.flatMap((c) =>
    c.menuItems
      .filter((i) => i.id !== item?.id && !parseComboConfig((i as any)?.comboConfig))
      .map((i) => ({
        id: i.id, name: i.name, catName: c.name, isPizza: !!(i as any)?.pizzaConfig,
        // Pizza sizes are chosen in the pizza builder, so only expose variant
        // selection for NON-pizza items here.
        variants: (i.hasVariants && !(i as any)?.pizzaConfig && Array.isArray(i.variants))
          ? i.variants.filter((v) => v.id).map((v) => ({ id: v.id as string, name: v.name }))
          : [],
      }))
  );
  const addComboSlot = () => setComboSlots((s) => [...s, { id: `slot-${Date.now()}`, label: "", min: 1, max: 1, itemIds: [], upcharges: {}, itemVariants: {}, variantUpcharges: {} }]);
  const updateComboSlot = (i: number, patch: Partial<ComboSlotForm>) => setComboSlots((s) => s.map((sl, idx) => idx === i ? { ...sl, ...patch } : sl));
  const removeComboSlot = (i: number) => setComboSlots((s) => s.filter((_, idx) => idx !== i));
  const toggleSlotItem = (i: number, itemId: string) => setComboSlots((s) => s.map((sl, idx) => {
    if (idx !== i) return sl;
    const has = sl.itemIds.includes(itemId);
    if (has) {
      // Unchecking — drop the item + any per-size selections/upcharges for it.
      const itemVariants = { ...sl.itemVariants }; delete itemVariants[itemId];
      const variantUpcharges = Object.fromEntries(
        Object.entries(sl.variantUpcharges).filter(([k]) => !k.startsWith(`${itemId}::`)),
      );
      return { ...sl, itemIds: sl.itemIds.filter((x) => x !== itemId), itemVariants, variantUpcharges };
    }
    // Checking — when the item has sizes, default to ALL sizes included so the
    // owner starts from "all offered" and can prune.
    const pool = comboItemPool.find((p) => p.id === itemId);
    const itemVariants = { ...sl.itemVariants };
    if (pool && pool.variants.length > 0) itemVariants[itemId] = pool.variants.map((v) => v.id);
    return { ...sl, itemIds: [...sl.itemIds, itemId], itemVariants };
  }));
  // Toggle a single size (variant) on/off for an item within a slot.
  const toggleSlotVariant = (i: number, itemId: string, variantId: string) => setComboSlots((s) => s.map((sl, idx) => {
    if (idx !== i) return sl;
    const cur = sl.itemVariants[itemId] ?? [];
    const has = cur.includes(variantId);
    const next = has ? cur.filter((x) => x !== variantId) : [...cur, variantId];
    const variantUpcharges = has
      ? Object.fromEntries(Object.entries(sl.variantUpcharges).filter(([k]) => k !== `${itemId}::${variantId}`))
      : sl.variantUpcharges;
    return { ...sl, itemVariants: { ...sl.itemVariants, [itemId]: next }, variantUpcharges };
  }));
  const updateVariantUpcharge = (i: number, itemId: string, variantId: string, value: string) => setComboSlots((s) => s.map((sl, idx) =>
    idx === i ? { ...sl, variantUpcharges: { ...sl.variantUpcharges, [`${itemId}::${variantId}`]: value } } : sl,
  ));

  const toggle = (field: keyof typeof form) => setForm(f => ({ ...f, [field]: !f[field as keyof typeof form] }));
  const toggleDay = (d: number) => {
    const days = form.availableDays.includes(d)
      ? form.availableDays.filter(x => x !== d)
      : [...form.availableDays, d].sort();
    setForm(f => ({ ...f, availableDays: days }));
  };
  const toggleFulfilDay = (d: number) => {
    setForm(f => ({
      ...f,
      fulfilDays: f.fulfilDays.includes(d)
        ? f.fulfilDays.filter(x => x !== d)
        : [...f.fulfilDays, d].sort((a, b) => a - b),
    }));
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error(t("itemNameRequired")); return;
    }
    if (!form.hasVariants && !form.price) {
      toast.error(t("itemPriceRequired")); return;
    }
    if (form.hasVariants && variants.filter(v => v.name.trim()).length === 0) {
      toast.error(t("itemVariantRequired")); return;
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
          toppingsOptional: pizza.toppingsOptional,
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
          allowMultipleToppings: pizza.allowMultipleToppings !== false,
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
    // Build comboConfig from the slot editor. Only slots with at least one
    // eligible item are kept; upcharges are coerced to positive numbers.
    const comboConfig = canUseCombos && isCombo
      ? (() => {
          const slots = comboSlots
            .filter((s) => s.itemIds.length > 0)
            .map((s) => ({
              id: s.id,
              // Blank stays blank — the customer page shows a friendly fallback
              // ("Choose an item") rather than a literal "Slot 1".
              label: s.label.trim(),
              min: Math.max(0, Math.floor(s.min) || 0),
              max: Math.max(1, Math.floor(s.max) || 1),
              itemIds: s.itemIds,
              upcharges: Object.fromEntries(
                Object.entries(s.upcharges)
                  .map(([k, v]) => [k, parseFloat(v) || 0])
                  .filter(([, v]) => (v as number) > 0)
              ),
              // Per-size selection: keep only entries for items still chosen.
              itemVariants: Object.fromEntries(
                Object.entries(s.itemVariants)
                  .filter(([k, v]) => s.itemIds.includes(k) && Array.isArray(v) && v.length > 0)
              ),
              variantUpcharges: Object.fromEntries(
                Object.entries(s.variantUpcharges)
                  .map(([k, v]) => [k, parseFloat(v) || 0])
                  .filter(([k, v]) => {
                    const [itemId, variantId] = (k as string).split("::");
                    return (v as number) > 0 && s.itemIds.includes(itemId)
                      && (s.itemVariants[itemId] ?? []).includes(variantId);
                  })
              ),
            }));
          return slots.length > 0 ? JSON.stringify({ slots, extrasCharge: comboExtrasCharge }) : null;
        })()
      : null;
    // Strip the legacy availability fields + the raw fulfil* form fields from
    // the payload — the order window now travels in the structured `fulfilment`
    // object below. Sending `fulfilment` makes the API clear the legacy columns,
    // so leaving them in here would clobber that (they're assigned afterwards).
    const {
      availableDays: _ad, availableFrom: _af, availableTo: _at, availabilityMode: _am,
      fulfilEnabled: _fe, fulfilDays: _fd, fulfilFrom: _ff, fulfilTo: _ft,
      ...formRest
    } = form;
    const payload = {
      ...formRest,
      price: parseFloat(form.price) || 0,
      variants: form.hasVariants ? variants.filter(v => v.name) : undefined,
      pizzaConfig,
      comboConfig,
      visibility,
      // Only send a real restriction when enabled; otherwise nulls clear it.
      fulfilment: form.fulfilEnabled
        ? { days: form.fulfilDays, from: form.fulfilFrom || null, to: form.fulfilTo || null }
        : { days: null, from: null, to: null },
    };
    try {
      const url = isNew ? "/api/menu/items" : `/api/menu/items/${item!.id}`;
      const method = isNew ? "POST" : "PATCH";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Server error ${res.status}`);
      }
      toast.success(isNew ? t("itemAdded") : t("itemUpdated"));
      onSaved();
    } catch (e: any) { toast.error(e.message || t("itemSaveFailed")); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900">{isNew ? t("addMenuItem") : t("editItem")}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        {/* Tabs — each gets its own accent color so the modal sections
            are scannable at a glance (per Luigi's UAT feedback that all
            same-color tabs look confusing). flex-shrink-0 is load-bearing:
            without it, a tall tab (Pizza/Combo) makes the flex column crush
            this row to zero height and the tab bar "disappears" (Luigi
            2026-07-04). */}
        <div className="flex border-b px-5 overflow-x-auto flex-shrink-0">
          {([
            ["basic",        t("tabBasic"),                                             "border-emerald-500", "text-emerald-700", "bg-emerald-50", "text-emerald-500"],
            ["visibility",   t("tabVisibility"),                                        "border-rose-500",    "text-rose-700",    "bg-rose-50",    "text-rose-500"   ],
            ["availability", t("tabAvailability"),                                      "border-sky-500",     "text-sky-700",     "bg-sky-50",     "text-sky-500"    ],
            ["variants",     t("tabSizes"),                                             "border-amber-500",   "text-amber-700",   "bg-amber-50",   "text-amber-500"  ],
            ["pizza",        pizza.isPizza ? t("tabPizzaActive") : t("tabPizzaSetup"),  "border-slate-900",   "text-slate-900",   "bg-slate-100",  "text-slate-600"  ],
            // Combo tab is gated behind the Advanced Promotions add-on.
            ...((canUseCombos
              ? [["combo", isCombo ? t("tabComboActive") : t("tabComboSetup"), "border-fuchsia-600", "text-fuchsia-700", "bg-fuchsia-50", "text-fuchsia-500"]]
              : []) as [string, string, string, string, string, string][]),
          ] as [string, string, string, string, string, string][]).map(([tabKey, label, activeBorder, activeText, activeBg]) => (
            <button key={tabKey} onClick={() => setTab(tabKey as "basic" | "visibility" | "availability" | "variants" | "pizza" | "combo")}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition whitespace-nowrap flex-shrink-0 ${
                tab === tabKey
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("itemNameLabel")}</label>
                  <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t("itemNamePlaceholder")} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("descriptionLabel")}</label>
                  <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none resize-none" rows={2}
                    value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t("itemDescriptionPlaceholder")} />
                </div>
                {form.hasVariants ? (
                  <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 text-sm text-blue-700 col-span-1">
                    <Layers className="w-4 h-4 flex-shrink-0" />
                    {t("pricingPerSize")} <button type="button" className="font-semibold underline" onClick={() => setTab("variants")}>{t("sizesTabLink")}</button>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{t("basePriceLabel")}</label>
                    <div className="flex items-center w-full border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-emerald-500">
                      <span className="pl-3 pr-1 text-gray-400 text-sm flex-shrink-0">{curSym}</span>
                      <input type="number" step="0.01" min="0" className="flex-1 min-w-0 border-none bg-transparent pr-3 py-2 text-sm focus:outline-none focus:ring-0"
                        value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" />
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t("categoryLabel")}</label>
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
                  ["isSoldOut", t("soldOut"), AlertCircle],
                  ["forPickup", t("availableForPickup"), ShoppingBag],
                  ["forDelivery", t("availableForDelivery"), Truck],
                  ["isCatering", t("cateringItem"), PartyPopper],
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

          {tab === "visibility" && (
            <VisibilityEditor value={visibility} onChange={setVisibility} />
          )}

          {tab === "availability" && (
            <div className="space-y-5">
              {/* Phase 2 Fulfilment Time (GloriaFood-style "Availability"). The
                  item ALWAYS shows on the menu (that's the Visibility tab); this
                  controls the days/times it can actually be ORDERED FOR. Outside
                  the window the customer keeps seeing it and is asked to schedule
                  for a valid slot — exactly like catering. */}
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <label className="block text-sm font-semibold text-gray-800">{t("fulfilTitle")}</label>
                  <HelpTip text={t("fulfilHelp")} />
                </div>
                <p className="text-xs text-gray-500">{t("fulfilIntro")}</p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setForm(f => ({ ...f, fulfilEnabled: false }))}
                  className={`flex-1 text-sm font-medium py-2 px-3 rounded-lg border transition ${!form.fulfilEnabled ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}
                >
                  {t("fulfilAlways")}
                </button>
                <button
                  onClick={() => setForm(f => ({ ...f, fulfilEnabled: true }))}
                  className={`flex-1 text-sm font-medium py-2 px-3 rounded-lg border transition ${form.fulfilEnabled ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600 hover:border-gray-400"}`}
                >
                  {t("fulfilRestricted")}
                </button>
              </div>

              {form.fulfilEnabled && (
                <div className="space-y-5 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t("fulfilDaysLabel")}</label>
                    <div className="flex gap-2 flex-wrap">
                      {DAY_NAMES.map((d, i) => (
                        <button key={i} onClick={() => toggleFulfilDay(i)}
                          className={`w-12 h-10 rounded-lg border text-sm font-medium transition ${form.fulfilDays.includes(i) ? "bg-indigo-500 border-indigo-500 text-white" : "border-gray-200 text-gray-500 hover:border-gray-400 bg-white"}`}>
                          {d}
                        </button>
                      ))}
                      <button onClick={() => setForm(f => ({ ...f, fulfilDays: [] }))}
                        className="px-3 h-10 rounded-lg border border-gray-200 bg-white text-xs text-gray-500 hover:border-gray-400">{t("fulfilAnyDay")}</button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">{t("fulfilDaysHint")}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t("availableFrom")}</label>
                      <input type="time" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        value={form.fulfilFrom} onChange={e => setForm(f => ({ ...f, fulfilFrom: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t("availableUntil")}</label>
                      <input type="time" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        value={form.fulfilTo} onChange={e => setForm(f => ({ ...f, fulfilTo: e.target.value }))} />
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">{t("fulfilTimeHint")}</p>
                  <div className="rounded-lg bg-white border border-indigo-200 px-3 py-2 text-xs text-indigo-700 font-medium">
                    {t("fulfilPreview")}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "variants" && (
            <div className="space-y-3">
              {/* Enable-variants toggle directly on this tab — eliminates the confusion */}
              <div className="flex items-center justify-between p-3 rounded-xl border-2 transition"
                style={form.hasVariants ? { borderColor: "#10b981", backgroundColor: "#ecfdf5" } : { borderColor: "#e5e7eb", backgroundColor: "#f9fafb" }}>
                <div>
                  <div className="text-sm font-semibold text-gray-800">{t("useSizesVariants")}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {form.hasVariants
                      ? t("variantsOnHint")
                      : t("variantsOffHint")}
                  </div>
                </div>
                <Toggle on={form.hasVariants} onToggle={() => setForm(f => ({ ...f, hasVariants: !f.hasVariants }))} />
              </div>

              {!form.hasVariants && variants.filter(v => v.name).length > 0 && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {t("variantsConfiguredButOff")}
                </div>
              )}

              <p className="text-sm text-gray-500">{t("variantsHint")}</p>

              {variants.map((v, i) => (
                <div key={i} className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                  <div className="flex-1">
                    <input className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                      placeholder={t("variantSizeNamePlaceholder")}
                      value={v.name} onChange={e => setVariants(vs => vs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                  </div>
                  <div className="w-28 flex items-center border border-gray-300 rounded focus-within:ring-2 focus-within:ring-emerald-500">
                    <span className="pl-2 pr-0.5 text-gray-400 text-sm flex-shrink-0">{curSym}</span>
                    <input type="number" step="0.01" min="0" className="flex-1 min-w-0 border-none bg-transparent pr-2 py-1.5 text-sm focus:outline-none focus:ring-0"
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
                <Plus className="w-4 h-4" /> {t("addVariant")}
              </button>
            </div>
          )}

          {tab === "pizza" && (
            <div className="space-y-5">
              {/* Master toggle */}
              <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                <div>
                  <div className="font-semibold text-gray-900 flex items-center gap-2">
                    <span>🍕</span> {t("pizzaBuilder")}
                  </div>
                  <div className="text-sm text-gray-500 mt-0.5">{t("pizzaBuilderHint")}</div>
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
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("modifierGroupAssignments")}</p>
                    {libraryGroups.length === 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
                        {t("noModifierGroupsYet")}
                      </div>
                    )}
                    {(
                      [
                        ["crustGroupId", t("crustGroupLabel"), t("crustGroupDesc"), "crust"],
                        ["sauceGroupId", t("sauceGroupLabel"), t("sauceGroupDesc"), "sauce"],
                        ["cheeseGroupId", t("cheeseGroupLabel"), t("cheeseGroupDesc"), "cheese"],
                      ] as [keyof PizzaFormState, string, string, string][]
                    ).map(([key, label, desc, role]) => {
                      // Once the owner has tagged ANY group with this role, the picker
                      // shows ONLY those (plus whatever's already selected, so the value
                      // stays valid) — "don't show ALL modifiers here" (Fabrizio
                      // 2026-06-21). Until a role is tagged, fall back to the whole
                      // library so restaurants that never tag see no change.
                      const currentVal = pizza[key] as string;
                      const roleTagged = libraryGroups.filter(g => g.pizzaRole === role);
                      const pool = roleTagged.length > 0
                        ? libraryGroups.filter(g => g.pizzaRole === role || g.id === currentVal)
                        : libraryGroups;
                      // Surface the groups already attached to THIS item first — the
                      // crust/sauce/cheese the owner wants is almost always one of them.
                      const attachedIds = new Set(
                        [pizza.crustGroupId, pizza.sauceGroupId, pizza.cheeseGroupId,
                          ...pizza.toppingGroupIds, ...pizza.sectionOrder].filter(Boolean),
                      );
                      const attached = pool.filter(g => attachedIds.has(g.id));
                      const others = pool.filter(g => !attachedIds.has(g.id));
                      const opt = (g: typeof libraryGroups[number]) => (
                        <option key={g.id} value={g.id}>{g.name} ({g.options.length} options)</option>
                      );
                      return (
                      <div key={key as string}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                        <select
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          value={pizza[key] as string}
                          onChange={e => setPizza(p => ({ ...p, [key]: e.target.value }))}
                        >
                          <option value="">{t("noneOption")}</option>
                          {attached.length > 0 ? (
                            <>
                              <optgroup label={t("attachedToThisItem")}>{attached.map(opt)}</optgroup>
                              <optgroup label={t("allGroups")}>{others.map(opt)}</optgroup>
                            </>
                          ) : (
                            pool.map(opt)
                          )}
                        </select>
                        <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                      </div>
                      );
                    })}

                    {/* Topping groups multi-select */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">{t("toppingGroupsLabel")}</label>
                      <p className="text-xs text-gray-400 mb-2">{t("toppingGroupsHint")}</p>
                      <div className="space-y-1.5 border border-gray-200 rounded-lg p-3 max-h-44 overflow-y-auto bg-gray-50">
                        {(() => {
                          // Same rule as the crust/sauce/cheese pickers: once any group is
                          // tagged "topping", list only those (+ already-selected) instead
                          // of every modifier in the library (Fabrizio 2026-06-21).
                          const roleTagged = libraryGroups.filter(g => g.pizzaRole === "topping");
                          const pool = roleTagged.length > 0
                            ? libraryGroups.filter(g => g.pizzaRole === "topping" || pizza.toppingGroupIds.includes(g.id))
                            : libraryGroups;
                          return pool.length === 0 ? (
                            <p className="text-xs text-gray-400">{t("noGroupsAvailable")}</p>
                          ) : pool.map(g => (
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
                          ));
                        })()}
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
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t("pricingEngine")}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className={form.hasVariants ? "col-span-2" : ""}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{t("includedToppings")}</label>
                        <input type="number" min="0" placeholder="0"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          value={pizza.includedToppings}
                          onChange={e => setPizza(p => ({ ...p, includedToppings: parseInt(e.target.value) || 0 }))} />
                        <p className="text-xs text-gray-400 mt-0.5">{t("includedToppingsHint")}</p>
                        <div className="flex items-start justify-between gap-3 mt-3 p-2.5 bg-gray-50 border border-gray-100 rounded-lg col-span-2">
                          <div>
                            <div className="text-sm font-medium text-gray-700">{t("toppingsOptionalTitle")}</div>
                            <div className="text-xs text-gray-400 mt-0.5">
                              {pizza.toppingsOptional ? t("toppingsOptionalOnHint") : t("toppingsOptionalOffHint")}
                            </div>
                          </div>
                          <Toggle on={pizza.toppingsOptional} onToggle={() => setPizza(p => ({ ...p, toppingsOptional: !p.toppingsOptional }))} />
                        </div>
                      </div>
                      {form.hasVariants ? (
                        <div className="col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-2">{t("pricePerExtraToppingBySize")}</label>
                          {variants.filter(v => v.name.trim()).length === 0 ? (
                            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                              {t("addSizesFirstHint")}
                            </p>
                          ) : (
                            <div className="space-y-2">
                              {variants.filter(v => v.name.trim()).map(v => (
                                <div key={v.name} className="flex items-center gap-3">
                                  <span className="text-sm text-gray-700 w-24 flex-shrink-0 truncate">{v.name}</span>
                                  <div className="flex-1 flex items-center border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-emerald-500">
                                    <span className="pl-3 pr-1 text-gray-400 text-sm flex-shrink-0">{curSym}</span>
                                    <input type="number" step="0.01" min="0" placeholder="0.00"
                                      className="flex-1 min-w-0 border-none bg-transparent pr-3 py-2 text-sm focus:outline-none focus:ring-0"
                                      value={pizza.variantToppingPrices[v.name.trim()] ?? ""}
                                      onChange={e => setPizza(p => ({
                                        ...p,
                                        variantToppingPrices: { ...p.variantToppingPrices, [v.name.trim()]: e.target.value },
                                      }))} />
                                  </div>
                                </div>
                              ))}
                              <p className="text-xs text-gray-400">{t("toppingPricePerSizeHint")}</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">{t("pricePerExtraTopping")}</label>
                          <div className="flex items-center border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-emerald-500">
                            <span className="pl-3 pr-1 text-gray-400 text-sm flex-shrink-0">{curSym}</span>
                            <input type="number" step="0.01" min="0" placeholder="0.00"
                              className="flex-1 min-w-0 border-none bg-transparent pr-3 py-2 text-sm focus:outline-none focus:ring-0"
                              value={pizza.extraToppingPrice}
                              onChange={e => setPizza(p => ({ ...p, extraToppingPrice: e.target.value }))} />
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">{t("extraToppingPriceHint")}</p>
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">{t("halfToppingMultiplier")}</label>
                        <input type="number" step="0.1" min="0" max="1" placeholder="0.5"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          value={pizza.halfToppingMultiplier}
                          onChange={e => setPizza(p => ({ ...p, halfToppingMultiplier: e.target.value }))} />
                        <p className="text-xs text-gray-400 mt-0.5">{t("halfToppingMultiplierHint")}</p>
                      </div>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={pizza.allowMultipleToppings !== false}
                          onChange={e => setPizza(p => ({ ...p, allowMultipleToppings: e.target.checked }))}
                          className="mt-0.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>
                          <span className="block text-sm font-medium text-gray-700">{t("allowMultipleToppings")}</span>
                          <span className="block text-xs text-gray-400">{t("allowMultipleToppingsHint")}</span>
                        </span>
                      </label>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === "combo" && canUseCombos && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3 p-3 bg-fuchsia-50 border border-fuchsia-100 rounded-lg">
                <div>
                  <div className="text-sm font-semibold text-gray-800">{t("comboToggleTitle")}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{t("comboToggleHint")}</div>
                </div>
                <Toggle on={isCombo} onToggle={() => setIsCombo((v) => !v)} />
              </div>

              {isCombo && (
                <>
                  <p className="text-xs text-gray-500">{t("comboPriceNote", { price: form.price || "0" })}</p>
                  <div className="flex items-start justify-between gap-3 p-3 bg-gray-50 border border-gray-100 rounded-lg">
                    <div>
                      <div className="text-sm font-semibold text-gray-800">{t("comboExtrasChargeTitle")}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {comboExtrasCharge ? t("comboExtrasChargeOnHint") : t("comboExtrasChargeOffHint")}
                      </div>
                    </div>
                    <Toggle on={comboExtrasCharge} onToggle={() => setComboExtrasCharge((v) => !v)} />
                  </div>
                  {comboSlots.map((slot, i) => (
                    <div key={slot.id} className="border border-gray-200 rounded-xl p-3 space-y-2">
                      <label className="block text-xs font-semibold text-gray-700">{t("comboSlotNameLabel")}</label>
                      <div className="flex items-center gap-2 flex-wrap">
                        <input
                          className="flex-1 min-w-[160px] border border-gray-200 rounded-lg px-3 py-2 text-sm"
                          placeholder={t("comboSlotLabelPlaceholder", { n: i + 1 })}
                          value={slot.label}
                          onChange={(e) => updateComboSlot(i, { label: e.target.value })}
                        />
                        <label className="text-xs text-gray-500">{t("comboMin")}</label>
                        <input type="number" min={0} className="w-14 border border-gray-200 rounded-lg px-2 py-2 text-sm" value={slot.min} onChange={(e) => updateComboSlot(i, { min: parseInt(e.target.value) || 0 })} />
                        <label className="text-xs text-gray-500">{t("comboMax")}</label>
                        <input type="number" min={1} className="w-14 border border-gray-200 rounded-lg px-2 py-2 text-sm" value={slot.max} onChange={(e) => updateComboSlot(i, { max: parseInt(e.target.value) || 1 })} />
                        <button onClick={() => removeComboSlot(i)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                      </div>
                      <div className="text-xs font-medium text-gray-600">{t("comboEligibleItems")}</div>
                      <div className="max-h-44 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
                        {comboItemPool.length === 0 ? (
                          <div className="p-3 text-xs text-gray-400">{t("comboNoItems")}</div>
                        ) : comboItemPool.map((p) => {
                          const checked = slot.itemIds.includes(p.id);
                          const hasSizes = p.variants.length > 0;
                          const includedSizes = slot.itemVariants[p.id] ?? [];
                          return (
                            <div key={p.id}>
                              <div className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50">
                                <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                                  <input type="checkbox" className="w-4 h-4 accent-fuchsia-500" checked={checked} onChange={() => toggleSlotItem(i, p.id)} />
                                  <span className="flex-1 truncate">{p.name}{p.isPizza && <span className="ml-1 text-[10px] font-bold text-fuchsia-600">{t("comboPizzaTag")}</span>}</span>
                                </label>
                                <span className="text-[11px] text-gray-400 flex-shrink-0">{p.catName}</span>
                                {/* Item-level upcharge only for items WITHOUT sizes;
                                    sized items carry a per-size upcharge below. */}
                                {checked && !hasSizes && (
                                  <input
                                    type="number" min={0} step="0.5" title={t("comboUpcharge")} placeholder="+$"
                                    className="w-16 border border-gray-200 rounded px-2 py-1 text-xs flex-shrink-0"
                                    value={slot.upcharges[p.id] ?? ""}
                                    onChange={(e) => updateComboSlot(i, { upcharges: { ...slot.upcharges, [p.id]: e.target.value } })}
                                  />
                                )}
                              </div>
                              {/* Expandable size picker — choose which sizes of this
                                  item are part of the combo + a per-size upcharge.
                                  The customer is only offered the ticked sizes. */}
                              {checked && hasSizes && (
                                <div className="pl-9 pr-3 pb-2 space-y-1">
                                  <div className="text-[11px] font-medium text-fuchsia-600">{t("comboChooseSizes")}</div>
                                  {p.variants.map((v) => {
                                    const on = includedSizes.includes(v.id);
                                    return (
                                      <div key={v.id} className="flex items-center gap-2">
                                        <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                                          <input type="checkbox" className="w-3.5 h-3.5 accent-fuchsia-500" checked={on} onChange={() => toggleSlotVariant(i, p.id, v.id)} />
                                          <span className="flex-1 truncate text-xs text-gray-700">{v.name}</span>
                                        </label>
                                        {on && (
                                          <input
                                            type="number" min={0} step="0.5" title={t("comboUpcharge")} placeholder="+$"
                                            className="w-16 border border-gray-200 rounded px-2 py-1 text-xs flex-shrink-0"
                                            value={slot.variantUpcharges[`${p.id}::${v.id}`] ?? ""}
                                            onChange={(e) => updateVariantUpcharge(i, p.id, v.id, e.target.value)}
                                          />
                                        )}
                                      </div>
                                    );
                                  })}
                                  {includedSizes.length === 0 && (
                                    <div className="text-[11px] text-amber-600">{t("comboNoSizeSelected")}</div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <button onClick={addComboSlot} className="w-full py-2 border-2 border-dashed border-fuchsia-200 rounded-lg text-sm font-semibold text-fuchsia-600 hover:bg-fuchsia-50">
                    + {t("comboAddSlot")}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-2xl flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">{t("cancel")}</button>
          <button onClick={save} disabled={saving}
            className="px-6 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 transition disabled:opacity-50">
            {saving ? t("saving") : isNew ? t("addItem") : t("saveChanges")}
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
  const t = useTranslations("admin.menuEditor");
  const curSym = useCurrencySymbol();
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
    pizzaRole: group?.pizzaRole ?? null,
  });
  const [options, setOptions] = useState<ModifierOption[]>(
    group?.options?.length
      ? group.options
      : [{ name: "", priceAdjustment: 0, isDefault: false, isAvailable: true }]
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!form.name.trim()) { toast.error(t("groupNameRequired")); return; }
    setSaving(true);
    const payload = { ...form, menuItemId: menuItemId || undefined, options: options.filter(o => o.name.trim()) };
    try {
      const url = isNew ? "/api/menu/modifiers" : `/api/menu/modifiers/${group!.id}`;
      const method = isNew ? "POST" : "PATCH";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error("Failed");
      toast.success(isNew ? t("modifierGroupAdded") : t("modifierGroupUpdated"));
      onSaved();
    } catch { toast.error(t("modifierGroupSaveFailed")); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b flex-shrink-0">
          <h2 className="text-lg font-bold">{isNew ? t("addModifierGroup") : t("editModifierGroup")}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("groupNameLabel")}</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t("groupNamePlaceholder")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("groupDescriptionLabel")}</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t("groupDescriptionPlaceholder")} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("minSelect")}</label>
              <input type="number" min="0" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={form.minSelect} onChange={e => setForm(f => ({ ...f, minSelect: parseInt(e.target.value) || 0 }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("maxSelect")}</label>
              <input type="number" min="1" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={form.maxSelect} onChange={e => setForm(f => ({ ...f, maxSelect: parseInt(e.target.value) || 1 }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t("maxPerOption")}</label>
              <input type="number" min="1" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={form.maxPerOption} onChange={e => setForm(f => ({ ...f, maxPerOption: parseInt(e.target.value) || 1 }))} />
            </div>
          </div>
          <div className="flex gap-3 flex-wrap">
            <button onClick={() => setForm(f => ({ ...f, required: !f.required }))}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition ${form.required ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-600"}`}>
              <Check className="w-4 h-4" /> {t("required")} {form.required && "✓"}
            </button>
            <button onClick={() => setForm(f => ({ ...f, isHidden: !f.isHidden }))}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition ${form.isHidden ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-gray-200 text-gray-600"}`}>
              <EyeOff className="w-4 h-4" /> {t("hidden")} {form.isHidden && "✓"}
            </button>
            <button
              onClick={() => setForm(f => ({ ...f, supportsHalfHalf: !f.supportsHalfHalf }))}
              title={t("canBeHalfHalfTitle")}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition ${form.supportsHalfHalf ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600"}`}>
              {t("canBeHalfHalf")} {form.supportsHalfHalf && "✓"}
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("pizzaRoleLabel")}</label>
            <select
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              value={form.pizzaRole ?? ""}
              onChange={e => setForm(f => ({ ...f, pizzaRole: e.target.value || null }))}
            >
              <option value="">{t("pizzaRoleNone")}</option>
              <option value="crust">{t("pizzaRoleCrust")}</option>
              <option value="sauce">{t("pizzaRoleSauce")}</option>
              <option value="cheese">{t("pizzaRoleCheese")}</option>
              <option value="topping">{t("pizzaRoleTopping")}</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">{t("pizzaRoleHint")}</p>
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-gray-700">{t("optionsChoices")}</label>
              <button onClick={() => setOptions(o => [...o, { name: "", priceAdjustment: 0, isDefault: false, isAvailable: true }])}
                className="text-sm text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> {t("addOption")}
              </button>
            </div>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                  <input className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm focus:ring-1 focus:ring-emerald-400 focus:outline-none bg-white"
                    placeholder={t("optionNamePlaceholder")} value={opt.name}
                    onChange={e => setOptions(os => os.map((o, j) => j === i ? { ...o, name: e.target.value } : o))} />
                  <div className="w-24 flex items-center border border-gray-200 rounded bg-white focus-within:ring-1 focus-within:ring-emerald-400">
                    <span className="pl-2 pr-0.5 text-gray-400 text-xs flex-shrink-0">+{curSym}</span>
                    <input type="number" step="0.01" min="0" className="flex-1 min-w-0 border-none bg-transparent pr-2 py-1.5 text-sm focus:outline-none focus:ring-0"
                      placeholder="0.00" value={opt.priceAdjustment || ""}
                      onChange={e => setOptions(os => os.map((o, j) => j === i ? { ...o, priceAdjustment: parseFloat(e.target.value) || 0 } : o))} />
                  </div>
                  <button
                    onClick={() => setOptions(os => os.map((o, j) => j === i ? { ...o, isDefault: !o.isDefault } : o))}
                    title={t("setAsDefault")}
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

        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-2xl flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">{t("cancel")}</button>
          <button onClick={save} disabled={saving}
            className="px-6 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 disabled:opacity-50">
            {saving ? t("saving") : isNew ? t("addGroup") : t("save")}
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
  const t = useTranslations("admin.menuEditor");
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
      {inherited && <span className="opacity-60 text-[10px]" title={t("inheritedFromCategory")}>↑</span>}
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
          title={inherited ? t("manageOnCategory") : t("removeModifierGroup")}
        >
          <X className="w-2.5 h-2.5" />
        </button>
      )}
    </span>
  );
}

// ─── Sortable Item Row ────────────────────────────────────────────────────────

/** Restaurant 12h/24h preference, provided once by MenuClient and read by the
 *  item rows for the availability badge — avoids threading through every level. */
const MenuHoursFormatCtx = createContext<HoursFormat>("24h");
/** The menu version currently being edited — so new categories land in the
 *  right menu (a draft, not necessarily the live one). Multi-menu Phase 2. */
const MenuEditCtx = createContext<{ menuId?: string }>({});

/** Day-or-time restriction reminder badge for the menu list. Returns null when
 *  the item has no day/time limit. Reads the new Fulfilment Time fields (what
 *  the item editor now saves) FIRST, falling back to the legacy availability
 *  fields for items not re-saved since Phase 2 — so the badge always matches the
 *  restriction the owner actually set. Previously it only read the legacy
 *  available* fields, so a fulfilment restriction never showed. (R5, 2026-06-14) */
function availabilityBadge(
  item: {
    fulfilDays?: number[] | string | null; fulfilFrom?: string | null; fulfilTo?: string | null;
    availableDays?: number[] | string | null; availableFrom?: string | null; availableTo?: string | null;
  },
  hoursFormat: HoursFormat = "24h",
): { text: string; kind: "fulfil" | "visibility" } | null {
  const parseDayList = (d: number[] | string | null | undefined): number[] | null => {
    if (Array.isArray(d)) return d;
    if (typeof d === "string" && d) { try { const a = JSON.parse(d); if (Array.isArray(a)) return a; } catch { /* ignore */ } }
    return null;
  };
  // Prefer the Fulfilment Time fields (the orderable "Availability" window); fall
  // back to the legacy "Visibility" (show/hide) fields so an older, un-re-saved
  // item still shows its badge. The KIND drives the colour (Fabrizio 2026-06-16):
  // amber for an availability/fulfilment restriction, blue for a visibility one.
  const fDays = parseDayList(item.fulfilDays);
  const fRestricted = (fDays !== null && fDays.length > 0 && fDays.length < 7) || !!(item.fulfilFrom && item.fulfilTo);
  const days = fRestricted ? fDays : parseDayList(item.availableDays);
  const from = fRestricted ? item.fulfilFrom : item.availableFrom;
  const to = fRestricted ? item.fulfilTo : item.availableTo;

  const dayLimited = days !== null && days.length > 0 && days.length < 7;
  const timeLimited = !!(from && to);
  if (!dayLimited && !timeLimited) return null;
  // Show the actual DAYS (Fabrizio: "I would also write the days") AND the time
  // window, e.g. "Mon, Wed, Fri · 10:00–20:00".
  const parts: string[] = [];
  if (dayLimited) parts.push([...days!].sort((a, b) => a - b).map((d) => DAY_NAMES[d] ?? "").filter(Boolean).join(", "));
  if (timeLimited) parts.push(`${formatTime(from!, hoursFormat)}–${formatTime(to!, hoursFormat)}`);
  return { text: parts.join(" · "), kind: fRestricted ? "fulfil" : "visibility" };
}

function SortableItemRow({
  item, categoryModGroups, onEdit, onDelete, onCopySettings, onToggle, onAttach, onDetach, onReorderGroups,
}: {
  item: MenuItem;
  categoryModGroups: ModifierGroup[];
  onEdit: () => void;
  onDelete: () => void;
  onCopySettings: () => void;
  onToggle: (field: "isAvailable" | "isSoldOut" | "isHidden", val: boolean) => void;
  onAttach: (libraryGroupId: string, menuItemId: string) => void;
  onDetach: (groupId: string) => void;
  onReorderGroups: (itemId: string, orderedIds: string[]) => void;
}) {
  const formatCurrency = useCurrencyFormat();
  const t = useTranslations("admin.menuEditor");
  const itemHoursFormat = useContext(MenuHoursFormatCtx);
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
      // Native HTML5 drag SOURCE for moving this item into ANOTHER category
      // (drop target = the category header, Luigi 2026-07-04). Coexists with
      // dnd-kit: within-category reordering stays on the grip handle (pointer
      // events), so we cancel the native drag when it starts from the grip or
      // from the modifier-chip strip (both have their own dnd-kit drags).
      draggable
      onDragStart={e => {
        const src = e.target as HTMLElement;
        if (src.closest?.("[data-dnd-grip],[data-chip-strip]")) { e.preventDefault(); return; }
        e.dataTransfer.setData("menuItemId", item.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 border-b border-gray-50 last:border-0 group transition ${item.isHidden ? "opacity-50" : ""} ${dragOver ? "bg-emerald-50 outline outline-2 outline-emerald-400 outline-dashed" : ""}`}>
      <button data-dnd-grip {...attributes} {...listeners} suppressHydrationWarning className="cursor-grab text-gray-300 hover:text-gray-400 touch-none mt-1">
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
          {item.isSoldOut && <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">{t("soldOutBadge")}</span>}
          {item.isHidden && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{t("hiddenBadge")}</span>}
          {item.hasVariants && <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded" title={t("multipleSizesTitle")}>{t("multipleSizesBadge")}</span>}
          {item.pizzaConfig && (() => { try { return JSON.parse(item.pizzaConfig!)?.isPizza; } catch { return false; } })() && (
            <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">🍕 Pizza</span>
          )}
          {(() => {
            const badge = availabilityBadge(item, itemHoursFormat);
            if (!badge) return null;
            // Amber = availability (orderable / Fulfilment Time) restriction;
            // light blue = visibility (show/hide) restriction. Fabrizio 2026-06-16.
            const cls = badge.kind === "fulfil"
              ? "bg-amber-100 text-amber-700"
              : "bg-sky-100 text-sky-700";
            return (
              <span
                className={`text-xs ${cls} px-1.5 py-0.5 rounded inline-flex items-center gap-1`}
                title={t("limitedAvailabilityTitle")}
              >
                <Clock className="w-3 h-3" /> {badge.text}
              </span>
            );
          })()}
        </div>
        {item.description && <div className="text-xs text-gray-400 truncate mt-0.5">{item.description}</div>}
        {(ownGroups.length > 0 || inheritedGroups.length > 0) && (
          <div data-chip-strip className="flex flex-wrap gap-1 mt-1.5">
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
        {dragOver && <div className="text-xs text-emerald-500 mt-1">{t("dropToAttachModifier")}</div>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {item.hasVariants
          ? <span className="text-xs text-gray-400">{t("priceFrom", { price: formatCurrency(Math.min(...item.variants.map(v => v.price))) })}</span>
          : <span className="font-semibold text-gray-700 text-sm">{formatCurrency(item.price)}</span>
        }
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
          <button onClick={() => onToggle("isSoldOut", !item.isSoldOut)} title={item.isSoldOut ? t("markAvailable") : t("markSoldOut")}
            className={`p-1.5 rounded transition text-sm ${item.isSoldOut ? "text-red-400 hover:text-red-600" : "text-gray-400 hover:text-gray-600"}`}>
            <AlertCircle className="w-4 h-4" />
          </button>
          <button onClick={() => onToggle("isHidden", !item.isHidden)} title={item.isHidden ? t("show") : t("hide")}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition">
            {item.isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
          <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-blue-500 rounded transition">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={onCopySettings} title={t("copySettingsTitle")} className="p-1.5 text-gray-400 hover:text-emerald-600 rounded transition">
            <Copy className="w-4 h-4" />
          </button>
          <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500 rounded transition">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Copy item settings → other items ────────────────────────────────────────
// Pick which sections of a SOURCE item to copy, then which items (or whole
// categories) to apply them to. Modifiers + Pizza are checked by default (the
// common "set up one pizza, replicate it" case). Name/photo/price/category stay
// each item's own. Luigi 2026-06-27.
function CopySettingsModal({
  source, categories, onClose, onSaved,
}: {
  source: MenuItem; categories: Category[]; onClose: () => void; onSaved: () => void;
}) {
  const t = useTranslations("admin.menuEditor");
  const SECTION_KEYS = ["modifiers", "pizza", "basic", "visibility", "availability", "sizes"] as const;
  const [sections, setSections] = useState<Set<string>>(new Set(["modifiers", "pizza"]));
  const [targets, setTargets] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const toggle = (set: Set<string>, key: string) => {
    const n = new Set(set); n.has(key) ? n.delete(key) : n.add(key); return n;
  };

  const q = search.trim().toLowerCase();
  const cats = categories
    .map((c) => ({ id: c.id, name: c.name, items: c.menuItems.filter((i) => i.id !== source.id && (!q || i.name.toLowerCase().includes(q))) }))
    .filter((c) => c.items.length > 0);

  const selectCat = (items: MenuItem[]) => setTargets((prev) => {
    const n = new Set(prev);
    const allSel = items.every((i) => n.has(i.id));
    items.forEach((i) => (allSel ? n.delete(i.id) : n.add(i.id)));
    return n;
  });

  const submit = async () => {
    if (targets.size === 0 || sections.size === 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/menu/items/${source.id}/copy-settings`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetItemIds: [...targets], sections: [...sections] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(t("copySettingsDone", { ok: data.ok ?? 0 }));
      onSaved();
    } catch (e: any) {
      toast.error(e.message || t("copySettingsFailed"));
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <Copy className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <h2 className="font-bold text-gray-900 truncate">{t("copySettingsHeading", { name: source.name })}</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-4">
          {/* Sections */}
          <div>
            <div className="text-sm font-semibold text-gray-900 mb-2">{t("copySettingsPickSections")}</div>
            <div className="grid sm:grid-cols-2 gap-1.5">
              {SECTION_KEYS.map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm text-gray-700 rounded-lg border border-gray-200 px-3 py-2 cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" checked={sections.has(k)} onChange={() => setSections((p) => toggle(p, k))} className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                  {t(`copySection_${k}`)}
                </label>
              ))}
            </div>
            {sections.has("pizza") && !sections.has("modifiers") && (
              <p className="mt-1.5 text-[11px] text-gray-400">{t("copySettingsPizzaNote")}</p>
            )}
          </div>

          {/* Targets */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-gray-900">{t("copySettingsPickTargets")}</span>
              <span className="text-xs text-gray-500">{t("copySettingsSelectedCount", { n: targets.size })}</span>
            </div>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("copySettingsSearch")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-400" />
            <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-64 overflow-y-auto">
              {cats.length === 0 ? (
                <div className="p-4 text-sm text-gray-400 text-center">{t("copySettingsNoItems")}</div>
              ) : cats.map((c) => {
                const allSel = c.items.every((i) => targets.has(i.id));
                return (
                  <div key={c.id}>
                    <div className="flex items-center justify-between bg-gray-50 px-3 py-1.5">
                      <span className="text-xs font-bold text-gray-600 uppercase truncate">{c.name}</span>
                      <button onClick={() => selectCat(c.items)} className="text-xs font-semibold text-emerald-600 hover:text-emerald-800">
                        {allSel ? t("deselectAll") : t("selectAll")}
                      </button>
                    </div>
                    {c.items.map((i) => (
                      <label key={i.id} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-50">
                        <input type="checkbox" checked={targets.has(i.id)} onChange={() => setTargets((p) => toggle(p, i.id))} className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                        <span className="truncate">{i.name}</span>
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700">{t("cancel")}</button>
          <button onClick={submit} disabled={saving || targets.size === 0 || sections.size === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
            {t("copySettingsApply", { n: targets.size })}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sortable Category ────────────────────────────────────────────────────────

function SortableCategoryBlock({
  cat, expanded, onToggleExpand, onAddItem, onEditItem, onDeleteItem, onCopyItemSettings,
  onToggleItem, onEditCategory, onDeleteCategory, onDuplicateCategory, onItemsReordered, categories,
  onAttach, onDetach, onReorderGroups, onMoveItemHere,
  selectMode, isSelected, onToggleSelect,
}: {
  cat: Category; expanded: boolean;
  onToggleExpand: () => void; onAddItem: () => void;
  onEditItem: (item: MenuItem) => void; onDeleteItem: (id: string) => void;
  onCopyItemSettings: (item: MenuItem) => void;
  onToggleItem: (id: string, field: "isAvailable" | "isSoldOut" | "isHidden", val: boolean) => void;
  onEditCategory: () => void; onDeleteCategory: () => void; onDuplicateCategory: () => void;
  onItemsReordered: (catId: string, ids: string[]) => void;
  categories: Category[];
  onAttach: (libraryGroupId: string, menuItemId?: string, categoryId?: string) => void;
  onDetach: (groupId: string) => void;
  onReorderGroups: (scope: { itemId?: string; categoryId?: string }, orderedIds: string[]) => void;
  /** A menu item was dragged from another category and dropped on THIS
   *  category's header → move it here (Luigi 2026-07-04). */
  onMoveItemHere: (menuItemId: string) => void;
  /** Bulk-select mode: when true, swap the drag handle for a checkbox
   *  and short-circuit the row click to toggle selection rather than
   *  expand the category. Lets owners blast through pre-reimport
   *  cleanup with Select all → Delete instead of one-at-a-time. */
  selectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}) {
  const t = useTranslations("admin.menuEditor");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: cat.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  // Slightly bigger activation for chip drags so X-button clicks register
  // as clicks, not drags.
  const chipSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
  // What's hovering over the category header: a library modifier group
  // (apply-to-category) or a menu item being MOVED here from another
  // category (Luigi 2026-07-04). Drives the highlight + which hint shows.
  const [catDragOver, setCatDragOver] = useState<false | "group" | "item">(false);

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
        onDragOver={e => {
          e.preventDefault();
          if (e.dataTransfer.types.includes("librarygroupid")) { e.dataTransfer.dropEffect = "copy"; setCatDragOver("group"); }
          else if (e.dataTransfer.types.includes("menuitemid")) { e.dataTransfer.dropEffect = "move"; setCatDragOver("item"); }
        }}
        onDragLeave={() => setCatDragOver(false)}
        onDrop={e => {
          e.preventDefault(); e.stopPropagation(); setCatDragOver(false);
          const gid = e.dataTransfer.getData("libraryGroupId");
          if (gid) { onAttach(gid, undefined, cat.id); return; }
          // Item dragged from another category → move it here (Luigi 2026-07-04).
          const itemId = e.dataTransfer.getData("menuItemId");
          if (itemId) onMoveItemHere(itemId);
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
            {cat.isHidden && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{t("hiddenBadge")}</span>}
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
          {catDragOver && (
            <div className="text-xs text-emerald-500 mt-1">
              {catDragOver === "item" ? t("dropToMoveItemHere") : t("dropToApplyToCategory")}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition flex-shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={onAddItem} className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium px-2 py-1 rounded hover:bg-emerald-50">
            <Plus className="w-3.5 h-3.5" /> {t("addItem")}
          </button>
          <button onClick={onEditCategory} className="p-1.5 text-gray-400 hover:text-blue-500 rounded"><Edit2 className="w-3.5 h-3.5" /></button>
          <button onClick={onDuplicateCategory} title={t("duplicateCategory")} className="p-1.5 text-gray-400 hover:text-emerald-600 rounded"><Copy className="w-3.5 h-3.5" /></button>
          <button onClick={onDeleteCategory} className="p-1.5 text-gray-400 hover:text-red-500 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />}
      </div>

      {expanded && (
        <div className="border-t border-gray-100">
          {cat.menuItems.length === 0 ? (
            <div className="py-8 text-center text-gray-400 text-sm">
              <UtensilsCrossed className="w-8 h-8 mx-auto mb-2 opacity-30" />
              {t("noItemsYet")}
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleItemDragEnd}>
              <SortableContext items={cat.menuItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                {cat.menuItems.map(item => (
                  <SortableItemRow key={item.id} item={item}
                    categoryModGroups={cat.modifierGroups}
                    onEdit={() => onEditItem(item)}
                    onDelete={() => onDeleteItem(item.id)}
                    onCopySettings={() => onCopyItemSettings(item)}
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
  const formatCurrency = useCurrencyFormat();
  const t = useTranslations("admin.menuEditor");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setExpanded(e => ({ ...e, [id]: !e[id] }));
  const { hoveredLibId, setHovered } = useContext(MenuHoverContext);
  // Local search for the modifier-group library (Luigi 2026-06-02).
  // Filters by group name AND by option name — so an owner searching
  // "pepperoni" finds groups that have a Pepperoni option even when
  // the group itself is just called "Toppings". Case-insensitive.
  const [modSearchQuery, setModSearchQuery] = useState("");
  const filteredGroups = (() => {
    const q = modSearchQuery.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(g => {
      if (g.name.toLowerCase().includes(q)) return true;
      return (g.options ?? []).some(o => o.name.toLowerCase().includes(q));
    });
  })();
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
          <h3 className="font-bold text-gray-900 text-sm">{t("choicesAndAddons")}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{t("modifierGroupsLibrary")}</p>
        </div>
        <button onClick={onAddGroup}
          className="flex items-center gap-1 bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-emerald-600">
          <Plus className="w-3.5 h-3.5" /> {t("addGroup")}
        </button>
      </div>

      <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-100">
        <p className="text-xs text-emerald-700">
          <GripVertical className="w-3 h-3 inline mr-1 opacity-60" />
          {t("dragModifierGroupsHint")}
        </p>
      </div>

      {/* Bulk-select toolbar — visible whenever there's at least one
          group. Mirrors the categories toolbar on the left side. */}
      {groups.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-100">
          {!selectMode ? (
            <>
              <span className="text-xs text-gray-500">{t("groupCount", { n: groups.length })}</span>
              <button
                onClick={() => onSetSelectMode(true)}
                className="text-xs font-semibold text-gray-600 hover:text-gray-900 px-2 py-0.5 rounded hover:bg-gray-50 transition"
              >
                {t("select")}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  // Operate on the CURRENTLY FILTERED results, not the whole library, so
                  // "Select all" after a search selects only the matches (Fabrizio
                  // 2026-06-21). Additive toggle preserves any selection outside the filter.
                  const ids = filteredGroups.map(g => g.id);
                  const allSel = ids.length > 0 && ids.every(id => selectedIds.has(id));
                  const next = new Set(selectedIds);
                  ids.forEach(id => { if (allSel) next.delete(id); else next.add(id); });
                  onSetSelectedIds(next);
                }}
                className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline"
              >
                {filteredGroups.length > 0 && filteredGroups.every(g => selectedIds.has(g.id)) ? t("deselectAll") : t("selectAll")}
              </button>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onBulkDelete([...selectedIds])}
                  disabled={selectedIds.size === 0}
                  className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 disabled:bg-red-200 disabled:cursor-not-allowed px-2.5 py-1 rounded transition"
                >
                  {selectedIds.size > 0 ? t("deleteCount", { n: selectedIds.size }) : t("delete")}
                </button>
                <button
                  onClick={() => { onSetSelectMode(false); onSetSelectedIds(new Set()); }}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  {t("cancel")}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Modifier-group search (Luigi 2026-06-02). Filters the library
          rows below by group name OR by any of the group's option
          names — so searching "pepperoni" surfaces a "Toppings" group
          that contains a Pepperoni option, not just groups literally
          named "pepperoni". Always rendered so the input is one tab
          away even when the panel is empty. */}
      {groups.length > 0 && (
        <div className="px-3 pt-3 pb-1">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={modSearchQuery}
              onChange={(e) => setModSearchQuery(e.target.value)}
              placeholder={t("searchModifierGroups")}
              className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-300"
            />
            {modSearchQuery && (
              <button
                type="button"
                onClick={() => setModSearchQuery("")}
                aria-label={t("clearModifierSearch")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-700"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {groups.length === 0 && (
          <div className="py-10 text-center text-gray-400 text-sm">
            <Settings className="w-8 h-8 mx-auto mb-2 opacity-30" />
            {t("noModifierGroupsYet")}
          </div>
        )}
        {groups.length > 0 && filteredGroups.length === 0 && (
          <div className="py-8 text-center text-gray-400 text-xs">
            <Search className="w-6 h-6 mx-auto mb-1.5 opacity-40" />
            {t("noMatchesFor", { query: modSearchQuery })}
          </div>
        )}
        {filteredGroups.map(g => {
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
                  {g.required && <span className="text-xs bg-emerald-50 text-emerald-600 px-1 rounded flex-shrink-0">{t("required")}</span>}
                  {g.isHidden && <span className="text-xs bg-gray-100 text-gray-500 px-1 rounded flex-shrink-0">{t("hidden")}</span>}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {t("optionsSummary", { count: g.options.length, min: g.minSelect, max: g.maxSelect })}
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
                    <span className="text-gray-500">{opt.priceAdjustment ? `+${formatCurrency(opt.priceAdjustment)}` : t("free")}</span>
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
  const t = useTranslations("admin.menuEditor");
  const isNew = !cat;
  const [form, setForm] = useState({
    name: cat?.name ?? "",
    description: cat?.description ?? "",
    imageUrl: cat?.imageUrl ?? "",
    // Catering-category flag — every item in this category is treated
    // as catering for the advance-notice rule, regardless of the per-
    // item isCatering flag. Owners with a dedicated catering menu just
    // tag the whole category instead of every item one by one.
    isCatering: (cat as any)?.isCatering ?? false,
  });
  const [visibility, setVisibility] = useState<VisibilityValue>(() => visibilityFromRow(cat));
  const [saving, setSaving] = useState(false);

  const { menuId: editMenuId } = useContext(MenuEditCtx);
  const save = async () => {
    if (!form.name.trim()) { toast.error(t("categoryNameRequired")); return; }
    setSaving(true);
    try {
      const url = isNew ? "/api/menu/categories" : `/api/menu/categories/${cat!.id}`;
      const method = isNew ? "POST" : "PATCH";
      // On create, tell the server which menu version this category belongs to
      // (the one being edited) so it doesn't default to the live menu.
      const payload = isNew ? { ...form, visibility, menuId: editMenuId } : { ...form, visibility };
      await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      toast.success(isNew ? t("categoryAdded") : t("categoryUpdated"));
      onSaved();
    } catch { toast.error(t("saveFailed")); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold">{isNew ? t("addCategory") : t("editCategory")}</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("categoryNameLabel")}</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t("categoryNamePlaceholder")} autoFocus />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t("descriptionLabel")}</label>
            <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={t("categoryDescriptionPlaceholder")} />
          </div>
          <div>
            <ImageUpload
              label="Category Image"
              value={form.imageUrl}
              onChange={url => setForm(f => ({ ...f, imageUrl: url }))}
              aspectRatio="wide"
            />
          </div>
          <div className="border-t border-gray-100 pt-4">
            <VisibilityEditor value={visibility} onChange={setVisibility} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setForm(f => ({ ...f, isCatering: !f.isCatering }))}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition ${form.isCatering ? "border-amber-500 bg-amber-50 text-amber-700" : "border-gray-200 text-gray-600"}`}
              title={t("cateringCategoryTitle")}
            >
              <PartyPopper className="w-4 h-4" /> {t("cateringCategory")} {form.isCatering && "✓"}
            </button>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-2xl flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">{t("cancel")}</button>
          <button onClick={save} disabled={saving} className="px-6 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 disabled:opacity-50">
            {saving ? t("saving") : isNew ? t("addCategory") : t("save")}
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
  const t = useTranslations("admin.menuEditor");
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
      toast.error(t("selectAtLeastOneItem"));
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
      if (!res.ok) throw new Error(data.error || t("importFailed"));
      const catMsg = data.categoriesCreated > 0
        ? t("importCategoriesCreated", { n: data.categoriesCreated }) + " + "
        : "";
      const dupMsg = data.itemsSkippedDuplicate > 0
        ? " (" + t("importDuplicatesSkipped", { n: data.itemsSkippedDuplicate }) + ")"
        : "";
      toast.success(catMsg + t("importItemsImported", { n: data.itemsCreated }) + dupMsg);
      onImported();
    } catch (e: any) {
      toast.error(e.message || t("importFailed"));
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
            <h2 className="text-lg font-bold text-gray-900">{t("importMenuFromPdf")}</h2>
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
                <div className="font-semibold text-gray-800">{t("dropPdfHere")}</div>
                <div className="text-sm text-gray-500 mt-1">{t("dropPdfOrBrowse")}</div>
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
              {t("pdfReadDescription")}
            </p>
          </div>
        )}

        {step === "review" && (
          <>
            <div className="p-4 border-b bg-gray-50 flex items-center gap-3 flex-wrap">
              <span className="text-sm font-medium text-gray-600">
                {t("pdfCategoriesDetected", { cats: importCats.length, items: totalItems })}
              </span>
              {extractionMethod === "regex_fallback" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800" title={extractionNote}>
                  {t("pdfBasicMode")}
                </span>
              )}
              {extractionMethod === "claude" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                  {t("pdfAutoDetected")}
                </span>
              )}
              <span className="ml-auto text-xs text-gray-500">
                {t("pdfSelectedOf", { selected: totalSelected, total: totalItems })}
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
                        {allOn ? t("deselectAll") : t("selectAll")}
                      </button>
                      <input
                        className="flex-1 min-w-[180px] text-sm font-semibold text-gray-900 border-b border-transparent hover:border-gray-300 focus:border-emerald-400 focus:outline-none px-0 py-0.5 bg-transparent"
                        value={cat.name}
                        onChange={(e) => updateCatName(ci, e.target.value)}
                        disabled={!!cat.existingCategoryId}
                      />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">{t("pdfInto")}</span>
                        <select
                          className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          value={cat.existingCategoryId ?? ""}
                          onChange={(e) => updateCatMerge(ci, e.target.value || null)}
                        >
                          <option value="">{t("pdfNewCategory", { name: cat.name })}</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>{t("pdfMergeInto", { name: c.name })}</option>
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
                              placeholder={t("itemDescriptionPlaceholder")}
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
                {t("uploadAnother")}
              </button>
              <div className="flex gap-3">
                <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">{t("cancel")}</button>
                <button
                  onClick={confirmImport}
                  disabled={importing || totalSelected === 0}
                  className="px-6 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-600 disabled:opacity-50 flex items-center gap-2"
                >
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {t("importItems", { n: totalSelected })}
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

interface Props { categories: Category[]; libraryGroups: ModifierGroup[]; restaurantId: string; hoursFormat?: HoursFormat; menuId?: string; canUseCombos?: boolean }

export function MenuClient({ categories: initial, libraryGroups: initialGroups, hoursFormat = "24h", menuId, canUseCombos = false }: Props) {
  const t = useTranslations("admin.menuEditor");
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
  // Switching to a different menu version sends that menu's categories as fresh
  // server props, but useState() reads its argument only on first mount — so
  // the editor kept showing the previously-loaded menu until a manual reload
  // (Luigi 2026-06-11). Re-sync the editable state whenever the menu changes.
  // Keyed on `menuId` (not on `initial`) so a within-menu edit followed by
  // router.refresh() doesn't clobber the optimistic local state mid-session.
  useEffect(() => {
    setCategories(initial);
    setLibraryGroups(initialGroups);
    setExpandedCats(Object.fromEntries(initial.map((c) => [c.id, true])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuId]);
  const [itemModal, setItemModal] = useState<{ catId: string; item?: MenuItem } | null>(null);
  const [copyModal, setCopyModal] = useState<{ source: MenuItem } | null>(null);
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
      fetch(`/api/menu/categories${menuId ? `?menuId=${encodeURIComponent(menuId)}` : ""}`),
      fetch("/api/menu/modifiers"),
    ]);
    if (catRes.ok) setCategories(await catRes.json());
    if (modRes.ok) setLibraryGroups(await modRes.json());
  }, [menuId]);

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

  /** Item dragged from one category and dropped on ANOTHER category's header
   *  (Luigi 2026-07-04) — re-home it. Optimistic move (item appends to the
   *  end of the target), PATCH persists categoryId + a sortOrder that lands
   *  it last; on failure a reload() reverts to server truth. */
  const moveItemToCategory = async (itemId: string, targetCatId: string) => {
    const sourceCat = categories.find(c => c.menuItems.some(i => i.id === itemId));
    const targetCat = categories.find(c => c.id === targetCatId);
    if (!sourceCat || !targetCat || sourceCat.id === targetCatId) return;
    const item = sourceCat.menuItems.find(i => i.id === itemId)!;
    setCategories(cats => cats.map(c =>
      c.id === sourceCat.id ? { ...c, menuItems: c.menuItems.filter(i => i.id !== itemId) }
      : c.id === targetCatId ? { ...c, menuItems: [...c.menuItems, item] }
      : c
    ));
    const res = await fetch(`/api/menu/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: targetCatId, sortOrder: targetCat.menuItems.length }),
    });
    if (!res.ok) {
      toast.error(t("moveItemFailed"));
      reload();
      return;
    }
    toast.success(t("itemMovedToCategory", { name: item.name, category: targetCat.name }));
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
      toast.error(t("failedToSaveOrder"));
      await reload();
    }
  };

  const deleteItem = (id: string) => {
    setConfirmDialog({
      title: t("deleteItemTitle"),
      message: t("deleteItemMessage"),
      confirmLabel: t("delete"),
      onConfirm: async () => {
        setConfirmDialog(null);
        const res = await fetch(`/api/menu/items/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          toast.error(body.error || t("failedToDeleteItem"));
          return;
        }
        toast.success(t("itemDeleted"));
        await reload();
      },
    });
  };

  const toggleItem = async (id: string, field: "isAvailable" | "isSoldOut" | "isHidden", val: boolean) => {
    await fetch(`/api/menu/items/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: val }) });
    await reload();
  };

  const duplicateCategory = async (id: string) => {
    const res = await fetch(`/api/menu/categories/${id}/duplicate`, { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(body.error || t("failedToDuplicateCategory"));
      return;
    }
    toast.success(t("categoryDuplicated"));
    await reload();
  };

  const deleteCategory = (id: string) => {
    setConfirmDialog({
      title: t("deleteCategoryTitle"),
      message: t("deleteCategoryMessage"),
      confirmLabel: t("deleteCategoryConfirm"),
      onConfirm: async () => {
        setConfirmDialog(null);
        const res = await fetch(`/api/menu/categories/${id}`, { method: "DELETE" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(body.error || t("failedToDeleteCategory"));
          return;
        }
        toast.success(t("categoryDeleted"));
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
      title: t("bulkDeleteCategoriesTitle", { n: ids.length }),
      message: t("bulkDeleteCategoriesMessage", { n: ids.length }),
      confirmLabel: t("deleteCount", { n: ids.length }),
      onConfirm: async () => {
        setConfirmDialog(null);
        const { ok, failed } = await bulkDelete(ids, id => `/api/menu/categories/${id}`);
        if (failed > 0) toast.error(t("bulkDeletePartial", { ok, failed }));
        else toast.success(t("bulkDeleteCategoriesSuccess", { n: ok }));
        setSelectedCategoryIds(new Set());
        setCategorySelectMode(false);
        await reload();
      },
    });
  };

  const deleteModGroup = (id: string) => {
    setConfirmDialog({
      title: t("deleteModifierGroupTitle"),
      message: t("deleteModifierGroupMessage"),
      confirmLabel: t("delete"),
      onConfirm: async () => {
        setConfirmDialog(null);
        const res = await fetch(`/api/menu/modifiers/${id}`, { method: "DELETE" });
        if (!res.ok) {
          toast.error(t("failedToDeleteModifierGroup"));
          return;
        }
        toast.success(t("modifierGroupDeleted"));
        await reload();
      },
    });
  };

  const bulkDeleteModGroups = (ids: string[]) => {
    if (ids.length === 0) return;
    setConfirmDialog({
      title: t("bulkDeleteModGroupsTitle", { n: ids.length }),
      message: t("bulkDeleteModGroupsMessage", { n: ids.length }),
      confirmLabel: t("deleteCount", { n: ids.length }),
      onConfirm: async () => {
        setConfirmDialog(null);
        const { ok, failed } = await bulkDelete(ids, id => `/api/menu/modifiers/${id}`);
        if (failed > 0) toast.error(t("bulkDeletePartial", { ok, failed }));
        else toast.success(t("bulkDeleteModGroupsSuccess", { n: ok }));
        setSelectedModGroupIds(new Set());
        setModGroupSelectMode(false);
        await reload();
      },
    });
  };

  /**
   * One-shot repair for the legacy state where attaching a library
   * group at the category level used to leave behind duplicate
   * item-level attachments. New attaches dedupe inline (see
   * /api/menu/modifiers/attach), but existing menus need a sweep.
   * Luigi 2026-06-01: "added Cheese Options to category, some items
   * came blue and some green."
   */
  const [dedupeRunning, setDedupeRunning] = useState(false);
  const dedupeAttachments = async () => {
    setDedupeRunning(true);
    try {
      // 1) Merge DUPLICATE CATEGORIES (same name within a menu) — the main thing
      //    "Fix duplicates" is expected to do. Moves items into the survivor,
      //    drops exact-duplicate items, deletes the empty shells. Luigi 2026-06-27.
      const catRes = await fetch("/api/admin/menu/dedupe-categories", { method: "POST" });
      const catData = await catRes.json().catch(() => ({}));
      if (!catRes.ok) throw new Error(catData.error || "Failed");
      const mergedCategories = typeof catData.mergedCategories === "number" ? catData.mergedCategories : 0;

      // 2) Clean duplicate MODIFIER attachments (legacy item/category repair).
      const res = await fetch("/api/admin/menu/dedupe-modifier-attachments", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed");
      const cleaned = typeof data.cleaned === "number" ? data.cleaned : 0;

      if (mergedCategories === 0 && cleaned === 0) {
        toast.success(t("dedupeNoDuplicates"));
      } else {
        if (mergedCategories > 0) toast.success(t("dedupeCategoriesSuccess", { n: mergedCategories }));
        if (cleaned > 0) toast.success(t("dedupeSuccess", { n: cleaned }));
        await reload();
      }
    } catch (err: any) {
      toast.error(err?.message ?? t("cleanupFailed"));
    } finally {
      setDedupeRunning(false);
    }
  };

  const attachModifier = async (libraryGroupId: string, menuItemId?: string, categoryId?: string) => {
    const res = await fetch("/api/menu/modifiers/attach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ libraryGroupId, menuItemId, categoryId }),
    });
    if (res.status === 409) { toast.error(t("alreadyAttached")); return; }
    if (!res.ok) { toast.error(t("failedToAttach")); return; }
    toast.success(categoryId ? t("attachedToCategory") : t("attachedToItem"));
    await reload();
  };

  const detachModifier = async (groupId: string) => {
    const res = await fetch("/api/menu/modifiers/attach", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId }),
    });
    if (!res.ok) { toast.error(t("failedToDetach")); return; }
    toast.success(t("removed"));
    await reload();
  };

  // Hover-link wiring — shared between every ModifierChip and the
  // right-side ModifierLibraryPanel. See MenuHoverContext docs.
  const [hoveredLibId, setHoveredLibId] = useState<string | null>(null);
  const hoverValue: HoverState = { hoveredLibId, setHovered: setHoveredLibId };

  return (
    <MenuEditCtx.Provider value={{ menuId }}>
    <MenuHoursFormatCtx.Provider value={hoursFormat}>
    <MenuHoverContext.Provider value={hoverValue}>
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("menuManagement")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{t("menuManagementHint")}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* GloriaFood/FoodBooking direct importer — restaurants migrating
              off Sams Restaurant Systems (sunsetting April 2027) or any
              GloriaFood-powered platform paste their embed snippet and
              their entire menu (incl. modifiers) lands in seconds. */}
          {/* Carry the CURRENTLY-VIEWED menu id so the import lands in THIS menu,
              not the live one. Fabrizio 2026-06-16. */}
          <a href={`/admin/menu/import-gloriafood${menuId ? `?menuId=${encodeURIComponent(menuId)}` : ""}`}
            className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 font-semibold px-4 py-2.5 rounded-xl hover:bg-gray-50 transition text-sm shadow-sm">
            <Download className="w-4 h-4" /> {t("importFromGloriaFood")}
          </a>
          <button onClick={() => setPdfImportOpen(true)}
            className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 font-semibold px-4 py-2.5 rounded-xl hover:bg-gray-50 transition text-sm shadow-sm">
            <Upload className="w-4 h-4" /> {t("importPdf")}
          </button>
          {/* Repair tool — deletes item-level modifier attachments
              that duplicate a category-level attachment. Idempotent;
              clicking on a clean menu is a no-op. Surfaced as a small
              button so it doesn't compete with the primary actions. */}
          <button onClick={dedupeAttachments} disabled={dedupeRunning}
            title={t("fixDuplicatesTitle")}
            className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 font-semibold px-3 py-2.5 rounded-xl hover:bg-gray-50 disabled:opacity-60 transition text-sm shadow-sm">
            {dedupeRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {t("fixDuplicates")}
          </button>
          <button onClick={() => setCatModal({})}
            className="flex items-center gap-2 bg-emerald-500 text-white font-semibold px-4 py-2.5 rounded-xl hover:bg-emerald-600 transition text-sm shadow-sm">
            <Plus className="w-4 h-4" /> {t("addCategory")}
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
                placeholder={t("searchCategoriesItems")}
                className="w-full pl-8 pr-8 py-2 rounded-lg border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
              {menuSearchQuery && (
                <button
                  type="button"
                  onClick={() => setMenuSearchQuery("")}
                  aria-label={t("clearSearch")}
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
                  <span className="text-xs text-gray-500">{t("categoryCount", { n: categories.length })}</span>
                  {/* Bulk expand/collapse (Fabrizio cmr809iu8) — a 113-category
                      menu is unmanageable with everything open. Mirrors the
                      customer page's Expand all | Collapse all. */}
                  <span className="flex items-center gap-1 text-xs font-semibold">
                    <button
                      onClick={() => setExpandedCats(Object.fromEntries(categories.map((c) => [c.id, true])))}
                      className="text-emerald-700 hover:text-emerald-900 px-2 py-1 rounded hover:bg-white transition"
                    >
                      {t("expandAll")}
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      onClick={() => setExpandedCats(Object.fromEntries(categories.map((c) => [c.id, false])))}
                      className="text-emerald-700 hover:text-emerald-900 px-2 py-1 rounded hover:bg-white transition"
                    >
                      {t("collapseAll")}
                    </button>
                  </span>
                  <button
                    onClick={() => setCategorySelectMode(true)}
                    className="text-xs font-semibold text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-white transition"
                  >
                    {t("select")}
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
                      {selectedCategoryIds.size === categories.length ? t("deselectAll") : t("selectAll")}
                    </button>
                    <span className="text-xs text-gray-500">
                      {t("pdfSelectedOf", { selected: selectedCategoryIds.size, total: categories.length })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => bulkDeleteCategories([...selectedCategoryIds])}
                      disabled={selectedCategoryIds.size === 0}
                      className="text-xs font-semibold text-white bg-red-500 hover:bg-red-600 disabled:bg-red-200 disabled:cursor-not-allowed px-3 py-1.5 rounded transition"
                    >
                      {selectedCategoryIds.size > 0 ? t("deleteCount", { n: selectedCategoryIds.size }) : t("delete")}
                    </button>
                    <button
                      onClick={() => { setCategorySelectMode(false); setSelectedCategoryIds(new Set()); }}
                      className="text-xs text-gray-500 hover:text-gray-700 px-2"
                    >
                      {t("cancel")}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {categories.length === 0 ? (
            <div className="py-20 text-center text-gray-400">
              <UtensilsCrossed className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">{t("noCategoriesYet")}</p>
              <p className="text-sm mt-1">{t("noCategoriesHint")}</p>
            </div>
          ) : (() => {
            // Filter visible categories by search query. We compute
            // here (not via useMemo above the JSX) so the search field
            // stays accurate even mid-drag without re-arranging hooks.
            const q = menuSearchQuery.trim().toLowerCase();
            // When searching, ALSO narrow each category to just its matching
            // items (unless the category name itself matches → keep all) so the
            // result actually surfaces the item, not the whole category buried
            // among others. Categories with no match drop out entirely.
            const filteredCategories = !q ? categories : categories
              .map((c: any) => {
                if (c.name.toLowerCase().includes(q)) return c; // whole category matches
                const items = (c.menuItems ?? []).filter((i: any) =>
                  `${i.name ?? ""} ${i.description ?? ""}`.toLowerCase().includes(q),
                );
                return items.length ? { ...c, menuItems: items } : null;
              })
              .filter(Boolean);
            if (filteredCategories.length === 0) {
              return (
                <div className="py-12 text-center text-gray-400">
                  <Search className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="font-medium">{t("noMatchesFor", { query: menuSearchQuery })}</p>
                  <button
                    type="button"
                    onClick={() => setMenuSearchQuery("")}
                    className="mt-2 text-sm text-emerald-600 hover:underline"
                  >{t("clearSearch")}</button>
                </div>
              );
            }
            return (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCatDragEnd}>
              <SortableContext items={filteredCategories.map((c: any) => c.id)} strategy={verticalListSortingStrategy}>
                {filteredCategories.map((cat: any) => (
                  <SortableCategoryBlock key={cat.id} cat={cat}
                    expanded={q ? true : (expandedCats[cat.id] ?? true)}
                    onToggleExpand={() => setExpandedCats(e => ({ ...e, [cat.id]: !e[cat.id] }))}
                    onAddItem={() => setItemModal({ catId: cat.id })}
                    onEditItem={item => setItemModal({ catId: cat.id, item })}
                    onDeleteItem={deleteItem}
                    onCopyItemSettings={item => setCopyModal({ source: item })}
                    onToggleItem={toggleItem}
                    onEditCategory={() => setCatModal({ cat })}
                    onDeleteCategory={() => deleteCategory(cat.id)}
                    onDuplicateCategory={() => duplicateCategory(cat.id)}
                    onItemsReordered={handleItemsReordered}
                    categories={categories}
                    onAttach={attachModifier}
                    onDetach={detachModifier}
                    onReorderGroups={handleReorderGroups}
                    onMoveItemHere={(itemId: string) => moveItemToCategory(itemId, cat.id)}
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
        <ItemModal item={itemModal.item} categoryId={itemModal.catId} categories={categories} canUseCombos={canUseCombos}
          libraryGroups={libraryGroups}
          onClose={() => setItemModal(null)} onSaved={() => { setItemModal(null); reload(); }} />
      )}
      {modModal !== null && (
        <ModifierModal group={modModal.group} menuItemId={modModal.menuItemId}
          onClose={() => setModModal(null)} onSaved={() => { setModModal(null); reload(); }} />
      )}
      {copyModal !== null && (
        <CopySettingsModal source={copyModal.source} categories={categories}
          onClose={() => setCopyModal(null)} onSaved={() => { setCopyModal(null); reload(); }} />
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
    </MenuHoursFormatCtx.Provider>
    </MenuEditCtx.Provider>
  );
}
