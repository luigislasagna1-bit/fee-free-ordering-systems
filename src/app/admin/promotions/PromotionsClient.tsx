"use client";
import { useState, useRef, useEffect } from "react";
import {
  Plus, Tag, Edit2, Trash2, X, ChevronDown, ChevronRight, Copy, Eye, EyeOff,
  Star, Crown, Shield, Percent, Gift, Package, Zap, Truck,
} from "lucide-react";
import toast from "react-hot-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type IG = {
  id: string;
  label: string;
  categoryIds: string[];
  itemIds: string[];
  role?: "paid" | "free" | "trigger" | "required";
  minCount?: number;
  maxCount?: number;
  extraFee?: number;
};

type PromoRules = {
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

type CatEntry = { id: string; name: string; items: { id: string; name: string; price: number }[] };

// ─── Constants ────────────────────────────────────────────────────────────────

const PROMO_TYPES = [
  { value: "percentage_off",         label: "% Discount on Selected Items",   icon: Percent, desc: "e.g. 30% off any dessert or drink" },
  { value: "fixed_cart",             label: "Fixed Discount on Cart",         icon: Tag,     desc: "e.g. $5 off orders over $30" },
  { value: "free_delivery",          label: "Free Delivery",                  icon: Truck,   desc: "e.g. Free delivery on orders over $20" },
  { value: "bogo",                   label: "Buy One Get One Free",           icon: Gift,    desc: "e.g. Buy a main, get the second free" },
  { value: "buy_n_get_free",         label: "Buy 2/3… Get One Free",         icon: Package, desc: "e.g. Buy two mains, get the cheapest free" },
  { value: "free_item",              label: "Get a FREE Item",                icon: Gift,    desc: "e.g. Free drink on any order $30+" },
  { value: "meal_bundle",            label: "Meal Bundle",                    icon: Package, desc: "e.g. 2 mains + 2 sides + 2 drinks = $55" },
  { value: "meal_bundle_speciality", label: "Meal Bundle with Speciality",    icon: Star,    desc: "Bundle where a subset has an extra charge" },
  { value: "fixed_combo",            label: "Fixed Discount on Combo Deal",   icon: Tag,     desc: "e.g. Buy main + dessert and get $5 off" },
  { value: "percentage_combo",       label: "% Discount on Combo Deal",       icon: Percent, desc: "e.g. Buy main + dessert and get 10% off" },
  { value: "payment_reward",         label: "Payment Method Reward",          icon: Zap,     desc: "e.g. 5% off when paying by card online" },
  { value: "free_dish_meal",         label: "Free Dish as Part of a Meal",    icon: Gift,    desc: "e.g. Free dessert with starter + main" },
];

const STACKING_RULES = [
  { value: "standard",  label: "Standard",    icon: Shield, desc: "Stacks with other standard promos." },
  { value: "exclusive", label: "Exclusive",   icon: Crown,  desc: "Blocks all others except Masters." },
  { value: "master",    label: "Master Deal", icon: Star,   desc: "Applies alongside any other promo." },
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

let _gc = 0;
function newGroup(role?: IG["role"]): IG {
  return { id: `g${++_gc}_${Date.now()}`, label: "", categoryIds: [], itemIds: [], role };
}

function initRulesForType(type: string): PromoRules {
  switch (type) {
    case "bogo":              return { groups: [newGroup("paid"), newGroup("free")], discountStrategy: "cheapest", cheapestDiscount: 100 };
    case "buy_n_get_free":   return { groups: [newGroup("paid"), newGroup("free")], discountStrategy: "cheapest", cheapestDiscount: 100 };
    case "fixed_combo":      return { groups: [newGroup(), newGroup()] };
    case "percentage_combo": return { groups: [newGroup(), newGroup()] };
    case "meal_bundle":      return { groups: [newGroup()] };
    case "meal_bundle_speciality": return { groups: [newGroup()] };
    case "free_dish_meal":   return { groups: [newGroup("trigger"), newGroup("free")] };
    case "free_item":        return { groups: [newGroup("free")], triggerAmount: 0 };
    default:                 return {};
  }
}

function groupSummary(g: IG, cats: CatEntry[]): string {
  const cc = g.categoryIds.length;
  const ic = g.itemIds.length;
  if (!cc && !ic) return "No items selected — click to edit";
  const parts: string[] = [];
  if (cc) {
    const names = g.categoryIds.slice(0, 2).map(id => cats.find(c => c.id === id)?.name ?? id).join(", ");
    parts.push(`${names}${cc > 2 ? ` +${cc - 2} more` : ""}`);
  }
  if (ic) parts.push(`${ic} specific item${ic > 1 ? "s" : ""}`);
  return parts.join(" + ");
}

function stackingBadge(rule: string) {
  if (rule === "master")    return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 flex items-center gap-1"><Star className="w-3 h-3" />Master</span>;
  if (rule === "exclusive") return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 flex items-center gap-1"><Crown className="w-3 h-3" />Exclusive</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Standard</span>;
}

// ─── ItemGroupPicker ──────────────────────────────────────────────────────────

function ItemGroupPicker({ group, cats, onApply, onCancel }: {
  group: IG; cats: CatEntry[];
  onApply: (g: IG) => void; onCancel: () => void;
}) {
  const [draft, setDraft] = useState<IG>(() => ({
    ...group,
    categoryIds: [...group.categoryIds],
    itemIds: [...group.itemIds],
  }));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleCat = (catId: string) => {
    setDraft(d => {
      if (d.categoryIds.includes(catId)) {
        return { ...d, categoryIds: d.categoryIds.filter(c => c !== catId) };
      }
      const catItemIds = cats.find(c => c.id === catId)?.items.map(i => i.id) ?? [];
      return {
        ...d,
        categoryIds: [...d.categoryIds, catId],
        itemIds: d.itemIds.filter(id => !catItemIds.includes(id)),
      };
    });
  };

  const toggleItem = (itemId: string) =>
    setDraft(d => ({
      ...d,
      itemIds: d.itemIds.includes(itemId) ? d.itemIds.filter(i => i !== itemId) : [...d.itemIds, itemId],
    }));

  const toggleExpand = (catId: string) =>
    setExpanded(prev => {
      const s = new Set(prev);
      s.has(catId) ? s.delete(catId) : s.add(catId);
      return s;
    });

  return (
    <div className="absolute left-0 top-full z-50 mt-1 w-80 bg-white rounded-xl border border-gray-200 shadow-xl overflow-hidden">
      <div className="px-3 py-2 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
        Select categories or items
      </div>
      <div className="max-h-60 overflow-y-auto">
        {cats.length === 0 ? (
          <div className="px-3 py-4 text-sm text-gray-400 text-center">No categories found</div>
        ) : cats.map(cat => {
          const catChecked = draft.categoryIds.includes(cat.id);
          const isExpanded = expanded.has(cat.id);
          const catItemIds = cat.items.map(i => i.id);
          const selectedInCat = catItemIds.filter(id => draft.itemIds.includes(id)).length;

          return (
            <div key={cat.id}>
              <div className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
                <input type="checkbox" checked={catChecked} onChange={() => toggleCat(cat.id)}
                  className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500 flex-shrink-0" />
                <span className="flex-1 text-sm text-gray-800 cursor-pointer select-none" onClick={() => toggleCat(cat.id)}>
                  {cat.name}
                </span>
                {!catChecked && selectedInCat > 0 && (
                  <span className="text-xs bg-emerald-100 text-emerald-600 px-1.5 rounded-full">{selectedInCat}</span>
                )}
                {cat.items.length > 0 && (
                  <button onClick={() => toggleExpand(cat.id)} className="p-0.5 text-gray-400 hover:text-gray-600 flex-shrink-0">
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
              {isExpanded && (
                <div className="pl-8 pr-3 pb-1 space-y-0.5">
                  {cat.items.map(item => {
                    const checked = catChecked || draft.itemIds.includes(item.id);
                    return (
                      <label key={item.id} className={`flex items-center gap-2 py-1 text-sm cursor-pointer ${catChecked ? "opacity-50" : ""}`}>
                        <input type="checkbox" checked={checked} disabled={catChecked}
                          onChange={() => !catChecked && toggleItem(item.id)}
                          className="rounded border-gray-300 text-emerald-500 focus:ring-emerald-500" />
                        <span className="flex-1 text-gray-700">{item.name}</span>
                        <span className="text-xs text-gray-400">${item.price.toFixed(2)}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 px-3 py-2 border-t bg-gray-50">
        <button onClick={() => onApply(draft)}
          className="flex-1 bg-emerald-500 text-white text-sm font-semibold py-1.5 rounded-lg hover:bg-emerald-600 transition">
          Apply
        </button>
        <button onClick={onCancel}
          className="px-4 text-sm text-gray-600 rounded-lg border border-gray-200 hover:bg-gray-100 transition">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── ItemGroupRow ─────────────────────────────────────────────────────────────

function ItemGroupRow({ group, index, cats, onChange, onRemove, canRemove = true }: {
  group: IG; index: number; cats: CatEntry[];
  onChange: (g: IG) => void; onRemove: () => void; canRemove?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const roleLabel: Record<string, string> = {
    paid: " (Paid)", free: " (Free)", trigger: " (Trigger)", required: " (Required)",
  };

  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="flex-1 relative" ref={ref}>
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center gap-3 border border-gray-200 rounded-lg px-3 py-2 bg-white text-left hover:border-emerald-300 transition"
        >
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-gray-400 mb-0.5">
              Items Group {index + 1}{group.role ? roleLabel[group.role] ?? "" : ""}
            </div>
            <div className="text-sm text-gray-700 truncate">{groupSummary(group, cats)}</div>
          </div>
          <Edit2 className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
        </button>
        {open && (
          <ItemGroupPicker
            group={group}
            cats={cats}
            onApply={g => { onChange(g); setOpen(false); }}
            onCancel={() => setOpen(false)}
          />
        )}
      </div>
      {canRemove && (
        <button onClick={onRemove} className="p-1.5 text-gray-300 hover:text-red-500 transition">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ─── GroupsEditor ─────────────────────────────────────────────────────────────

function GroupsEditor({ groups, onChange, cats, defaultRole, addLabel = "Add Group", minGroups = 0 }: {
  groups: IG[]; onChange: (groups: IG[]) => void; cats: CatEntry[];
  defaultRole?: IG["role"]; addLabel?: string; minGroups?: number;
}) {
  return (
    <div>
      {groups.map((g, i) => (
        <ItemGroupRow
          key={g.id}
          group={g}
          index={i}
          cats={cats}
          onChange={updated => onChange(groups.map((x, j) => j === i ? updated : x))}
          onRemove={() => onChange(groups.filter((_, j) => j !== i))}
          canRemove={groups.length > minGroups}
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

// ─── DiscountStrategySection ──────────────────────────────────────────────────

function DiscountStrategySection({ rules, onChange }: {
  rules: PromoRules; onChange: (r: Partial<PromoRules>) => void;
}) {
  const strategy = rules.discountStrategy ?? "cheapest";
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">Discount Strategy</label>
      <select value={strategy}
        onChange={e => onChange({ discountStrategy: e.target.value as PromoRules["discountStrategy"] })}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
        <option value="cheapest">Automatically set discounts (cheapest item free)</option>
        <option value="most_expensive">Automatically set discounts (most expensive item free)</option>
        <option value="fixed_percent">Fixed discount percentage</option>
      </select>
      {strategy === "cheapest" && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 flex-1">% off cheapest item</span>
          <input type="number" min="0" max="100" step="1" value={rules.cheapestDiscount ?? 100}
            onChange={e => onChange({ cheapestDiscount: parseFloat(e.target.value) || 100 })}
            className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
          <span className="text-xs text-gray-400">%</span>
        </div>
      )}
      {strategy === "most_expensive" && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 flex-1">% off most expensive item</span>
          <input type="number" min="0" max="100" step="1" value={rules.mostExpensiveDiscount ?? 100}
            onChange={e => onChange({ mostExpensiveDiscount: parseFloat(e.target.value) || 100 })}
            className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
          <span className="text-xs text-gray-400">%</span>
        </div>
      )}
      {strategy === "fixed_percent" && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 flex-1">Discount %</span>
          <input type="number" min="0" max="100" step="1" value={rules.discountPercent ?? 0}
            onChange={e => onChange({ discountPercent: parseFloat(e.target.value) || 0 })}
            className="w-20 border border-gray-300 rounded px-2 py-1 text-sm text-right focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
          <span className="text-xs text-gray-400">%</span>
        </div>
      )}
    </div>
  );
}

// ─── Shared input helpers ─────────────────────────────────────────────────────

function PctInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative w-44">
        <input type="number" min="0" max="100" step="1"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-8 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          value={value} onChange={e => onChange(parseFloat(e.target.value) || 0)} />
        <span className="absolute right-3 top-2 text-gray-400 text-sm">%</span>
      </div>
    </div>
  );
}

function AmtInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="relative w-48">
        <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
        <input type="number" min="0" step="0.01"
          className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          value={value} onChange={e => onChange(parseFloat(e.target.value) || 0)} />
      </div>
    </div>
  );
}

function SL({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="mt-3 mb-2">
      <div className="text-sm font-semibold text-gray-700">{label}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

// ─── Per-type configuration panels ───────────────────────────────────────────

function TypeConfig({ type, rules, onRules, cats }: {
  type: string; rules: PromoRules;
  onRules: (r: Partial<PromoRules>) => void; cats: CatEntry[];
}) {
  const gUp = (groups: IG[]) => onRules({ groups });

  switch (type) {
    case "percentage_off":
      return (
        <div className="space-y-4">
          <PctInput label="Discount %" value={rules.discountPercent ?? 0} onChange={v => onRules({ discountPercent: v })} />
          <div>
            <SL label="Eligible Items" sub="Leave empty to apply discount to the whole cart" />
            <GroupsEditor groups={rules.groups ?? []} onChange={gUp} cats={cats} addLabel="Add item group" />
          </div>
        </div>
      );

    case "free_delivery":
      return (
        <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-sm text-blue-800">
          Free delivery will be applied automatically when conditions are met. Set a minimum order amount in the field above.
        </div>
      );

    case "bogo": {
      const pG: IG = rules.groups?.[0] ?? { id: "bogo-paid", label: "", categoryIds: [], itemIds: [], role: "paid" };
      const fG: IG = rules.groups?.[1] ?? { id: "bogo-free", label: "", categoryIds: [], itemIds: [], role: "free" };
      return (
        <div className="space-y-3">
          <SL label="Paid group" sub="Items the customer buys" />
          <ItemGroupRow group={{ ...pG, role: "paid" }} index={0} cats={cats}
            onChange={g => gUp([{ ...g, role: "paid" }, { ...fG, role: "free" }])} onRemove={() => {}} canRemove={false} />
          <SL label="Free group" sub="The item the customer gets free" />
          <ItemGroupRow group={{ ...fG, role: "free" }} index={1} cats={cats}
            onChange={g => gUp([{ ...pG, role: "paid" }, { ...g, role: "free" }])} onRemove={() => {}} canRemove={false} />
          <DiscountStrategySection rules={rules} onChange={onRules} />
        </div>
      );
    }

    case "buy_n_get_free": {
      const gs = rules.groups ?? [];
      const paidGs = gs.filter(g => g.role !== "free");
      const fG: IG = gs.find(g => g.role === "free") ?? { id: "bnf-free", label: "", categoryIds: [], itemIds: [], role: "free" };
      const setPaid = (pgs: IG[]) => gUp([...pgs.map(g => ({ ...g, role: "paid" as const })), { ...fG, role: "free" as const }]);
      return (
        <div className="space-y-3">
          <SL label="Paid groups" sub="Customer must order from each group to qualify" />
          <GroupsEditor
            groups={paidGs.length ? paidGs : [{ id: "bnf-paid1", label: "", categoryIds: [], itemIds: [], role: "paid" }]}
            onChange={setPaid} cats={cats} defaultRole="paid" addLabel="Add paid group" minGroups={1} />
          <SL label="Free group" sub="The item the customer gets free" />
          <ItemGroupRow group={{ ...fG, role: "free" }} index={0} cats={cats}
            onChange={g => gUp([...paidGs.map(pg => ({ ...pg, role: "paid" as const })), { ...g, role: "free" as const }])}
            onRemove={() => {}} canRemove={false} />
          <DiscountStrategySection rules={rules} onChange={onRules} />
        </div>
      );
    }

    case "fixed_cart":
      return <AmtInput label="Discount Amount" value={rules.discountAmount ?? 0} onChange={v => onRules({ discountAmount: v })} />;

    case "payment_reward":
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
            <select value={rules.paymentMethod ?? "any"} onChange={e => onRules({ paymentMethod: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
              <option value="any">Any payment method</option>
              <option value="card">Card (online)</option>
              <option value="cash">Cash on delivery</option>
            </select>
          </div>
          <PctInput label="Discount %" value={rules.discountPercent ?? 0} onChange={v => onRules({ discountPercent: v })} />
        </div>
      );

    case "free_item": {
      const fG: IG = rules.groups?.[0] ?? { id: "fi-free", label: "", categoryIds: [], itemIds: [], role: "free" };
      return (
        <div className="space-y-4">
          <AmtInput label="Minimum spend to trigger" value={rules.triggerAmount ?? 0} onChange={v => onRules({ triggerAmount: v })} />
          <div>
            <SL label="Free item pool" sub="The cheapest matching item will be given free" />
            <ItemGroupRow group={{ ...fG, role: "free" }} index={0} cats={cats}
              onChange={g => gUp([{ ...g, role: "free" }])} onRemove={() => {}} canRemove={false} />
          </div>
        </div>
      );
    }

    case "meal_bundle":
      return (
        <div className="space-y-4">
          <AmtInput label="Bundle Price" value={rules.bundlePrice ?? 0} onChange={v => onRules({ bundlePrice: v })} />
          <div>
            <SL label="Bundle item groups" sub="Customer must have items from each group for the bundle price" />
            <GroupsEditor groups={rules.groups ?? []} onChange={gUp} cats={cats} addLabel="Add group" />
          </div>
        </div>
      );

    case "meal_bundle_speciality":
      return (
        <div className="space-y-4">
          <AmtInput label="Bundle Base Price" value={rules.bundlePrice ?? 0} onChange={v => onRules({ bundlePrice: v })} />
          <div>
            <SL label="Bundle item groups" sub="Groups with premium items can have an extra fee set" />
            <GroupsEditor groups={rules.groups ?? []} onChange={gUp} cats={cats} addLabel="Add group" />
          </div>
        </div>
      );

    case "fixed_combo":
      return (
        <div className="space-y-4">
          <AmtInput label="Discount Amount" value={rules.discountAmount ?? 0} onChange={v => onRules({ discountAmount: v })} />
          <div>
            <SL label="Combo groups" sub="Customer must have at least one item from each group" />
            <GroupsEditor groups={rules.groups ?? []} onChange={gUp} cats={cats} addLabel="Add combo group" minGroups={2} />
          </div>
        </div>
      );

    case "percentage_combo":
      return (
        <div className="space-y-4">
          <PctInput label="Discount %" value={rules.discountPercent ?? 0} onChange={v => onRules({ discountPercent: v })} />
          <div>
            <SL label="Combo groups" sub="Customer must have at least one item from each group" />
            <GroupsEditor groups={rules.groups ?? []} onChange={gUp} cats={cats} addLabel="Add combo group" minGroups={2} />
          </div>
        </div>
      );

    case "free_dish_meal": {
      const gs = rules.groups ?? [];
      const triggerGs = gs.filter(g => g.role === "trigger");
      const fG: IG = gs.find(g => g.role === "free") ?? { id: "fdm-free", label: "", categoryIds: [], itemIds: [], role: "free" };
      const setTriggers = (tgs: IG[]) => gUp([...tgs.map(g => ({ ...g, role: "trigger" as const })), { ...fG, role: "free" as const }]);
      return (
        <div className="space-y-3">
          <SL label="Trigger groups" sub="Items the customer must order to qualify" />
          <GroupsEditor
            groups={triggerGs.length ? triggerGs : [{ id: "fdm-t1", label: "", categoryIds: [], itemIds: [], role: "trigger" }]}
            onChange={setTriggers} cats={cats} defaultRole="trigger" addLabel="Add trigger group" minGroups={1} />
          <SL label="Free dish pool" />
          <ItemGroupRow group={{ ...fG, role: "free" }} index={0} cats={cats}
            onChange={g => gUp([...triggerGs.map(t => ({ ...t, role: "trigger" as const })), { ...g, role: "free" as const }])}
            onRemove={() => {}} canRemove={false} />
          <PctInput label="Discount on free dish (100 = fully free)" value={rules.discountPercent ?? 100} onChange={v => onRules({ discountPercent: v })} />
        </div>
      );
    }

    default:
      return null;
  }
}

// ─── PromoTypeSelector ────────────────────────────────────────────────────────

function PromoTypeSelector({ onSelect }: { onSelect: (type: string) => void }) {
  return (
    <div>
      <p className="text-sm text-gray-600 mb-4">Choose the type of promotion:</p>
      <div className="space-y-2">
        {PROMO_TYPES.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.value} onClick={() => onSelect(t.value)}
              className="w-full flex items-center gap-3 p-3.5 border border-gray-200 rounded-xl hover:border-emerald-400 hover:bg-emerald-50 text-left transition group">
              <div className="w-9 h-9 bg-emerald-50 group-hover:bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-800">{t.label}</div>
                <div className="text-xs text-gray-400">{t.desc}</div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-emerald-400 flex-shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── PromoModal ───────────────────────────────────────────────────────────────

type FormState = {
  name: string; description: string; promotionType: string;
  orderType: string; customerType: string; minimumOrder: string;
  stackingRule: string; autoApply: boolean; couponCode: string;
  usageLimit: string; startsAt: string; endsAt: string;
  daysOfWeek: number[]; isActive: boolean;
};

function PromoModal({ promo, categories, menuItems, onClose, onSaved }: {
  promo?: any; categories: any[]; menuItems: any[];
  onClose: () => void; onSaved: () => void;
}) {
  const isNew = !promo;
  const [step, setStep] = useState<"type" | "config">(isNew ? "type" : "config");
  const [saving, setSaving] = useState(false);
  const [showAdv, setShowAdv] = useState(false);

  const [form, setForm] = useState<FormState>({
    name: promo?.name ?? "",
    description: promo?.description ?? "",
    promotionType: promo?.promotionType ?? "",
    orderType: promo?.orderType ?? "both",
    customerType: promo?.customerType ?? "any",
    minimumOrder: promo?.minimumOrder?.toString() ?? "0",
    stackingRule: promo?.stackingRule ?? "standard",
    autoApply: promo?.autoApply ?? true,
    couponCode: promo?.couponCode ?? "",
    usageLimit: promo?.usageLimit?.toString() ?? "",
    startsAt: promo?.startsAt ? new Date(promo.startsAt).toISOString().slice(0, 16) : "",
    endsAt: promo?.endsAt ? new Date(promo.endsAt).toISOString().slice(0, 16) : "",
    daysOfWeek: promo?.daysOfWeek ? JSON.parse(promo.daysOfWeek) : [0, 1, 2, 3, 4, 5, 6],
    isActive: promo?.isActive ?? true,
  });

  const [rules, setRules] = useState<PromoRules>(() => {
    if (promo?.rules) { try { return JSON.parse(promo.rules); } catch { return {}; } }
    return {};
  });

  const setF = (field: keyof FormState, val: any) => setForm(f => ({ ...f, [field]: val }));
  const setR = (partial: Partial<PromoRules>) => setRules(r => ({ ...r, ...partial }));

  const cats: CatEntry[] = categories.map(cat => ({
    id: cat.id,
    name: cat.name,
    items: menuItems.filter(i => i.categoryId === cat.id).map(i => ({ id: i.id, name: i.name, price: i.price })),
  }));

  const selectType = (type: string) => {
    setF("promotionType", type);
    setRules(initRulesForType(type));
    setStep("config");
  };

  const toggleDay = (d: number) => {
    const days = form.daysOfWeek.includes(d)
      ? form.daysOfWeek.filter(x => x !== d)
      : [...form.daysOfWeek, d].sort((a, b) => a - b);
    setF("daysOfWeek", days);
  };

  const save = async () => {
    if (!form.name.trim() || !form.promotionType) {
      toast.error("Name and promotion type are required");
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      minimumOrder: parseFloat(form.minimumOrder) || 0,
      usageLimit: form.usageLimit ? parseInt(form.usageLimit) : null,
      startsAt: form.startsAt || null,
      endsAt: form.endsAt || null,
      couponCode: form.autoApply ? null : (form.couponCode || null),
      rules: JSON.stringify(rules),
    };
    try {
      const url = isNew ? "/api/restaurants/promotions" : `/api/restaurants/promotions/${promo.id}`;
      const method = isNew ? "POST" : "PATCH";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        let msg = `Save failed (${res.status})`;
        try { const d = await res.json(); msg = d.error || msg; } catch {}
        throw new Error(msg);
      }
      toast.success(isNew ? "Promotion created!" : "Promotion updated");
      onSaved();
    } catch (e: any) {
      toast.error(e.message || "Failed to save promotion");
    }
    setSaving(false);
  };

  const typeInfo = PROMO_TYPES.find(t => t.value === form.promotionType);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{isNew ? "Create Promotion" : "Edit Promotion"}</h2>
            {typeInfo && <p className="text-xs text-gray-500 mt-0.5">{typeInfo.label}</p>}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {step === "type" ? (
            <div className="p-6">
              <PromoTypeSelector onSelect={selectType} />
            </div>
          ) : (
            <div className="p-6 space-y-5">
              {isNew && (
                <button onClick={() => setStep("type")} className="text-sm text-emerald-600 hover:text-emerald-700 font-medium">
                  ← Change type
                </button>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Promotion Name *</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  value={form.name} onChange={e => setF("name", e.target.value)}
                  placeholder={typeInfo?.desc ?? "e.g. Weekend deal"}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">How is this promotion activated?</label>
                <div className="flex gap-2">
                  <button onClick={() => { setF("autoApply", true); setF("couponCode", ""); }}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border-2 text-sm transition ${form.autoApply ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold" : "border-gray-200 text-gray-600"}`}>
                    <Zap className="w-4 h-4" /> Auto-apply
                  </button>
                  <button onClick={() => setF("autoApply", false)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border-2 text-sm transition ${!form.autoApply ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold" : "border-gray-200 text-gray-600"}`}>
                    <Tag className="w-4 h-4" /> Coupon code
                  </button>
                </div>
                {!form.autoApply && (
                  <input className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono uppercase focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    value={form.couponCode} onChange={e => setF("couponCode", e.target.value.toUpperCase())} placeholder="e.g. SAVE20" />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Order Amount</label>
                <div className="relative w-48">
                  <span className="absolute left-3 top-2 text-gray-400 text-sm">$</span>
                  <input type="number" min="0" step="0.01"
                    className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    value={form.minimumOrder} onChange={e => setF("minimumOrder", e.target.value)} />
                </div>
              </div>

              {form.promotionType && (
                <div className="border border-gray-100 rounded-xl p-4 bg-gray-50">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    {typeInfo?.label} Settings
                  </div>
                  <TypeConfig type={form.promotionType} rules={rules} onRules={setR} cats={cats} />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Stacking Rule</label>
                <div className="grid grid-cols-3 gap-2">
                  {STACKING_RULES.map(r => {
                    const Icon = r.icon;
                    const active = form.stackingRule === r.value;
                    return (
                      <button key={r.value} onClick={() => setF("stackingRule", r.value)}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 text-center transition ${active ? "border-emerald-500 bg-emerald-50" : "border-gray-200 hover:border-emerald-200"}`}>
                        <Icon className={`w-4 h-4 ${active ? "text-emerald-500" : "text-gray-400"}`} />
                        <span className={`text-xs font-semibold ${active ? "text-emerald-700" : "text-gray-600"}`}>{r.label}</span>
                        <span className="text-xs text-gray-400 leading-tight">{r.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Order Type</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    value={form.orderType} onChange={e => setF("orderType", e.target.value)}>
                    <option value="both">Pickup & Delivery</option>
                    <option value="pickup">Pickup Only</option>
                    <option value="delivery">Delivery Only</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer Type</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                    value={form.customerType} onChange={e => setF("customerType", e.target.value)}>
                    <option value="any">Any Customer</option>
                    <option value="new">New Customers Only</option>
                    <option value="returning">Returning Customers</option>
                  </select>
                </div>
              </div>

              <div>
                <button onClick={() => setShowAdv(!showAdv)}
                  className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
                  {showAdv ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  Advanced settings
                </button>
                {showAdv && (
                  <div className="mt-4 space-y-4 pl-2 border-l-2 border-gray-100">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Description (shown to customers)</label>
                      <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        value={form.description} onChange={e => setF("description", e.target.value)} placeholder="e.g. Valid before midnight" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Days of Week</label>
                      <div className="flex gap-1.5 flex-wrap">
                        {DAY_NAMES.map((d, i) => (
                          <button key={i} onClick={() => toggleDay(i)}
                            className={`w-11 h-9 rounded-lg border text-xs font-medium transition ${form.daysOfWeek.includes(i) ? "bg-emerald-500 border-emerald-500 text-white" : "border-gray-200 text-gray-500 hover:border-gray-400"}`}>
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Start Date/Time</label>
                        <input type="datetime-local"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          value={form.startsAt} onChange={e => setF("startsAt", e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">End Date/Time</label>
                        <input type="datetime-local"
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                          value={form.endsAt} onChange={e => setF("endsAt", e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Usage Limit (optional)</label>
                      <input type="number" min="1"
                        className="w-40 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                        value={form.usageLimit} onChange={e => setF("usageLimit", e.target.value)} placeholder="Unlimited" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {step === "config" && (
          <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
            {isNew ? (
              <button onClick={() => setStep("type")} className="text-sm text-gray-500 hover:text-gray-700">
                ← Back
              </button>
            ) : <div />}
            <div className="flex gap-3">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={save} disabled={saving}
                className="px-6 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition shadow-sm">
                {saving ? "Saving..." : isNew ? "Create Promotion" : "Save Changes"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CouponModal ─────────────────────────────────────────────────────────────

const emptyCouponForm = {
  code: "", description: "", discountType: "percentage" as "percentage" | "fixed",
  discountValue: "", minimumOrder: "0", maxUses: "", expiresAt: "",
};

function CouponModal({ coupon, onClose, onSaved }: { coupon?: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState(coupon ? {
    code: coupon.code,
    description: coupon.description || "",
    discountType: coupon.discountType as "percentage" | "fixed",
    discountValue: String(coupon.discountValue),
    minimumOrder: String(coupon.minimumOrder),
    maxUses: coupon.maxUses ? String(coupon.maxUses) : "",
    expiresAt: coupon.expiresAt ? coupon.expiresAt.slice(0, 10) : "",
  } : emptyCouponForm);
  const [saving, setSaving] = useState(false);
  const isNew = !coupon;

  const save = async () => {
    if (!form.code.trim()) { toast.error("Coupon code is required"); return; }
    if (!form.discountValue) { toast.error("Discount value is required"); return; }
    setSaving(true);
    const body = {
      code: form.code.toUpperCase().trim(),
      description: form.description || null,
      discountType: form.discountType,
      discountValue: parseFloat(form.discountValue),
      minimumOrder: parseFloat(form.minimumOrder) || 0,
      maxUses: form.maxUses ? parseInt(form.maxUses) : null,
      expiresAt: form.expiresAt || null,
    };
    try {
      const url = isNew ? "/api/restaurants/coupons" : `/api/restaurants/coupons/${coupon.id}`;
      const method = isNew ? "POST" : "PATCH";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        let msg = `Save failed (${res.status})`;
        try { const d = await res.json(); msg = d.error || msg; } catch {}
        throw new Error(msg);
      }
      toast.success(isNew ? "Coupon created!" : "Coupon updated!");
      onSaved();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold text-gray-900">{isNew ? "New Coupon Code" : "Edit Coupon"}</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Coupon Code *</label>
              <input type="text" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none uppercase font-mono" placeholder="SAVE10"
                value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Discount Type</label>
              <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={form.discountType} onChange={e => setForm(f => ({ ...f, discountType: e.target.value as "percentage" | "fixed" }))}>
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount ($)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Value *</label>
              <input type="number" step="0.01" min="0" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                placeholder={form.discountType === "percentage" ? "10" : "5.00"} value={form.discountValue}
                onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min. Order ($)</label>
              <input type="number" step="0.01" min="0" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                placeholder="0" value={form.minimumOrder} onChange={e => setForm(f => ({ ...f, minimumOrder: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Uses</label>
              <input type="number" min="1" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                placeholder="Unlimited" value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expires At</label>
              <input type="date" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <input type="text" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              placeholder="10% off your first order" value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-6 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition">
            {saving ? "Saving..." : isNew ? "Create Coupon" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── CouponCard ───────────────────────────────────────────────────────────────

function CouponCard({ coupon, onEdit, onDelete, onToggle, onDuplicate }: {
  coupon: any; onEdit: () => void; onDelete: () => void;
  onToggle: () => void; onDuplicate: () => void;
}) {
  const isExpired = coupon.expiresAt && new Date(coupon.expiresAt) < new Date();
  const discountLabel = coupon.discountType === "percentage"
    ? `${coupon.discountValue}% off`
    : `$${parseFloat(coupon.discountValue).toFixed(2)} off`;

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${coupon.isActive && !isExpired ? "border-gray-100" : "border-gray-100 opacity-60"}`}>
      <div className="flex items-start gap-4 p-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${coupon.isActive ? "bg-blue-50" : "bg-gray-50"}`}>
          <Tag className={`w-5 h-5 ${coupon.isActive ? "text-blue-500" : "text-gray-400"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-xs bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 rounded">COUPON</span>
            <span className="font-mono font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded text-sm">{coupon.code}</span>
            {!coupon.isActive && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactive</span>}
            {isExpired && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Expired</span>}
          </div>
          <div className="text-sm font-medium text-gray-700">{discountLabel}
            {coupon.minimumOrder > 0 && <span className="text-gray-400 font-normal"> (min ${parseFloat(coupon.minimumOrder).toFixed(2)})</span>}
          </div>
          {coupon.description && <div className="text-xs text-gray-400 truncate mt-0.5">{coupon.description}</div>}
          <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-400">
            <span>{coupon.usedCount}/{coupon.maxUses ?? "∞"} used</span>
            {coupon.expiresAt && <span>Expires {new Date(coupon.expiresAt).toLocaleDateString()}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onToggle} title={coupon.isActive ? "Deactivate" : "Activate"}
            className={`p-1.5 rounded transition ${coupon.isActive ? "text-green-500 hover:text-green-700" : "text-gray-400 hover:text-green-500"}`}>
            {coupon.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          <button onClick={onDuplicate} className="p-1.5 text-gray-400 hover:text-blue-500 rounded" title="Duplicate">
            <Copy className="w-4 h-4" />
          </button>
          <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-blue-500 rounded">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500 rounded">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PromoCard ────────────────────────────────────────────────────────────────

function PromoCard({ promo, onEdit, onDelete, onToggle, onDuplicate }: {
  promo: any; onEdit: () => void; onDelete: () => void;
  onToggle: () => void; onDuplicate: () => void;
}) {
  const typeInfo = PROMO_TYPES.find(t => t.value === promo.promotionType) ?? PROMO_TYPES[0];
  const Icon = typeInfo.icon;

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${promo.isActive ? "border-gray-100" : "border-gray-100 opacity-60"}`}>
      <div className="flex items-start gap-4 p-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${promo.isActive ? "bg-emerald-50" : "bg-gray-50"}`}>
          <Icon className={`w-5 h-5 ${promo.isActive ? "text-emerald-500" : "text-gray-400"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-gray-900">{promo.name}</span>
            {!promo.isActive && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactive</span>}
            {stackingBadge(promo.stackingRule)}
            {promo.couponCode && (
              <span className="text-xs bg-blue-50 text-blue-700 font-mono px-2 py-0.5 rounded border border-blue-100">
                {promo.couponCode}
              </span>
            )}
            {promo.autoApply && !promo.couponCode && (
              <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">Auto</span>
            )}
          </div>
          <div className="text-sm text-gray-500">{typeInfo.label}</div>
          {promo.description && <div className="text-xs text-gray-400 truncate mt-0.5">{promo.description}</div>}
          <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-400">
            {promo.minimumOrder > 0 && <span>Min ${promo.minimumOrder}</span>}
            {promo.endsAt && <span>Ends {new Date(promo.endsAt).toLocaleDateString()}</span>}
            {promo.usageLimit && <span>{promo.usedCount}/{promo.usageLimit} used</span>}
            {promo.orderType !== "both" && <span className="capitalize">{promo.orderType} only</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={onToggle} title={promo.isActive ? "Deactivate" : "Activate"}
            className={`p-1.5 rounded transition ${promo.isActive ? "text-green-500 hover:text-green-700" : "text-gray-400 hover:text-green-500"}`}>
            {promo.isActive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          <button onClick={onDuplicate} className="p-1.5 text-gray-400 hover:text-blue-500 rounded" title="Duplicate">
            <Copy className="w-4 h-4" />
          </button>
          <button onClick={onEdit} className="p-1.5 text-gray-400 hover:text-blue-500 rounded">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={onDelete} className="p-1.5 text-gray-400 hover:text-red-500 rounded">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── PromotionsClient ─────────────────────────────────────────────────────────

type TabFilter = "all" | "promotions" | "coupons" | "active" | "inactive" | "expired";
type ModalState = { kind: "promo"; promo?: any } | { kind: "coupon"; coupon?: any } | { kind: "choose" } | null;

export function PromotionsClient({ promotions: initial, coupons: initialCoupons, categories, menuItems }: {
  promotions: any[]; coupons: any[]; categories: any[]; menuItems: any[];
}) {
  const [promotions, setPromotions] = useState(initial);
  const [coupons, setCoupons] = useState(initialCoupons);
  const [modal, setModal] = useState<ModalState>(null);
  const [tab, setTab] = useState<TabFilter>("all");
  const now = new Date();

  const reloadPromos = async () => {
    const res = await fetch("/api/restaurants/promotions");
    if (res.ok) setPromotions(await res.json());
  };
  const reloadCoupons = async () => {
    const res = await fetch("/api/restaurants/coupons");
    if (res.ok) setCoupons(await res.json());
  };

  const deletePromo = async (id: string) => {
    if (!confirm("Delete this promotion? This cannot be undone.")) return;
    await fetch(`/api/restaurants/promotions/${id}`, { method: "DELETE" });
    toast.success("Promotion deleted");
    await reloadPromos();
  };
  const togglePromo = async (promo: any) => {
    await fetch(`/api/restaurants/promotions/${promo.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !promo.isActive }),
    });
    await reloadPromos();
  };
  const duplicatePromo = async (promo: any) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, createdAt: _ca, updatedAt: _ua, usedCount: _uc, ...rest } = promo;
    const res = await fetch("/api/restaurants/promotions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...rest, name: `${rest.name} (Copy)`, couponCode: null, autoApply: true }),
    });
    if (res.ok) { toast.success("Promotion duplicated"); await reloadPromos(); }
    else { let msg = "Failed"; try { const d = await res.json(); msg = d.error || msg; } catch {} toast.error(msg); }
  };

  const deleteCoupon = async (id: string) => {
    if (!confirm("Delete this coupon? This cannot be undone.")) return;
    await fetch(`/api/restaurants/coupons/${id}`, { method: "DELETE" });
    toast.success("Coupon deleted");
    await reloadCoupons();
  };
  const toggleCoupon = async (coupon: any) => {
    await fetch(`/api/restaurants/coupons/${coupon.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !coupon.isActive }),
    });
    await reloadCoupons();
  };
  const duplicateCoupon = async (coupon: any) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, createdAt: _ca, updatedAt: _ua, usedCount: _uc, ...rest } = coupon;
    const res = await fetch("/api/restaurants/coupons", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...rest, code: `${rest.code}_COPY` }),
    });
    if (res.ok) { toast.success("Coupon duplicated"); await reloadCoupons(); }
    else { let msg = "Failed"; try { const d = await res.json(); msg = d.error || msg; } catch {} toast.error(msg); }
  };

  const filteredPromos = promotions.filter(p => {
    if (tab === "coupons") return false;
    if (tab === "promotions") return true;
    if (tab === "active") return p.isActive;
    if (tab === "inactive") return !p.isActive;
    if (tab === "expired") return p.endsAt && new Date(p.endsAt) < now;
    return true;
  });
  const filteredCoupons = coupons.filter(c => {
    if (tab === "promotions") return false;
    if (tab === "coupons") return true;
    if (tab === "active") return c.isActive && !(c.expiresAt && new Date(c.expiresAt) < now);
    if (tab === "inactive") return !c.isActive;
    if (tab === "expired") return c.expiresAt && new Date(c.expiresAt) < now;
    return true;
  });

  const totalAll = promotions.length + coupons.length;
  const totalActive = promotions.filter(p => p.isActive).length + coupons.filter(c => c.isActive && !(c.expiresAt && new Date(c.expiresAt) < now)).length;
  const totalInactive = promotions.filter(p => !p.isActive).length + coupons.filter(c => !c.isActive).length;
  const totalExpired = promotions.filter(p => p.endsAt && new Date(p.endsAt) < now).length + coupons.filter(c => c.expiresAt && new Date(c.expiresAt) < now).length;

  const TABS: { id: TabFilter; label: string; count: number }[] = [
    { id: "all",        label: "All",          count: totalAll },
    { id: "promotions", label: "Promotions",   count: promotions.length },
    { id: "coupons",    label: "Coupon Codes", count: coupons.length },
    { id: "active",     label: "Active",       count: totalActive },
    { id: "inactive",   label: "Inactive",     count: totalInactive },
    { id: "expired",    label: "Expired",      count: totalExpired },
  ];

  const isEmpty = filteredPromos.length === 0 && filteredCoupons.length === 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Promotions &amp; Coupons</h1>
          <p className="text-sm text-gray-500 mt-0.5">Automatic deals, bundles, and coupon codes for your customers</p>
        </div>
        <button onClick={() => setModal({ kind: "choose" })}
          className="flex items-center gap-2 bg-emerald-500 text-white font-semibold px-4 py-2.5 rounded-xl hover:bg-emerald-600 transition text-sm shadow-sm">
          <Plus className="w-4 h-4" /> New Deal
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-5 flex items-start gap-3">
        <Shield className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-blue-800">
          <span className="font-semibold">Stacking: </span>
          <span className="font-bold text-yellow-700">Master</span> deals apply alongside everything.{" "}
          <span className="font-bold text-purple-700">Exclusive</span> deals block all others except Masters.{" "}
          <span className="font-bold text-gray-700">Standard</span> deals stack with each other.
          Coupon codes are customer-entered and never auto-applied.
        </p>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${tab === t.id ? "bg-emerald-500 text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-emerald-300"}`}>
            {t.label} <span className={`ml-1 text-xs ${tab === t.id ? "opacity-80" : "text-gray-400"}`}>({t.count})</span>
          </button>
        ))}
      </div>

      {isEmpty ? (
        <div className="bg-white rounded-2xl p-16 text-center border border-gray-100 shadow-sm">
          <Tag className="w-12 h-12 mx-auto mb-3 text-gray-200" />
          <p className="text-gray-500 font-medium">No deals found</p>
          <p className="text-sm text-gray-400 mt-1">Create promotions or coupon codes to attract and retain customers.</p>
          <button onClick={() => setModal({ kind: "choose" })}
            className="mt-4 bg-emerald-500 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-emerald-600 transition">
            Create Deal
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredPromos.map(p => (
            <PromoCard key={p.id} promo={p}
              onEdit={() => setModal({ kind: "promo", promo: p })}
              onDelete={() => deletePromo(p.id)}
              onToggle={() => togglePromo(p)}
              onDuplicate={() => duplicatePromo(p)}
            />
          ))}
          {filteredCoupons.map(c => (
            <CouponCard key={c.id} coupon={c}
              onEdit={() => setModal({ kind: "coupon", coupon: c })}
              onDelete={() => deleteCoupon(c.id)}
              onToggle={() => toggleCoupon(c)}
              onDuplicate={() => duplicateCoupon(c)}
            />
          ))}
        </div>
      )}

      {/* Choose type modal */}
      {modal?.kind === "choose" && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Create New Deal</h2>
              <button onClick={() => setModal(null)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <button onClick={() => setModal({ kind: "promo" })}
                className="w-full flex items-center gap-3 p-4 border-2 border-gray-100 rounded-xl hover:border-emerald-400 hover:bg-emerald-50 transition text-left">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Zap className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <div className="font-semibold text-gray-900">Automatic Promotion</div>
                  <div className="text-sm text-gray-500">BOGO, bundles, % off, free delivery and more</div>
                </div>
              </button>
              <button onClick={() => setModal({ kind: "coupon" })}
                className="w-full flex items-center gap-3 p-4 border-2 border-gray-100 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition text-left">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Tag className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="font-semibold text-gray-900">Coupon Code</div>
                  <div className="text-sm text-gray-500">Customer enters a code at checkout</div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {modal?.kind === "promo" && (
        <PromoModal promo={modal.promo} categories={categories} menuItems={menuItems}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); reloadPromos(); }} />
      )}
      {modal?.kind === "coupon" && (
        <CouponModal coupon={modal.coupon}
          onClose={() => setModal(null)} onSaved={() => { setModal(null); reloadCoupons(); }} />
      )}
    </div>
  );
}
