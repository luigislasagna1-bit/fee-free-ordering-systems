"use client";
/**
 * Step 2 — configure the chosen type.
 *
 * Dispatcher: switches on promotionType and renders the matching
 * config panel. Each panel writes to the wizard's ruleConfig state.
 * Name + description (always shown) live at the top.
 */

import {
  AmtInput,
  CatEntry,
  DiscountStrategySection,
  GroupsEditor,
  IG,
  ItemGroupRow,
  PctInput,
  PromoRules,
  SL,
} from "./helpers";

export function StepConfig({
  promotionType,
  name,
  description,
  onName,
  onDescription,
  rules,
  onRules,
  cats,
}: {
  promotionType: string;
  name: string;
  description: string;
  onName: (v: string) => void;
  onDescription: (v: string) => void;
  rules: PromoRules;
  onRules: (r: Partial<PromoRules>) => void;
  cats: CatEntry[];
}) {
  const gUp = (groups: IG[]) => onRules({ groups });

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <h2 className="text-lg font-semibold text-gray-900">Configure your promotion</h2>
        <p className="text-sm text-gray-500 mt-1">
          Set the discount details and items this deal applies to.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Promotion name <span className="text-red-500">*</span>
        </label>
        <input
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="e.g. Weekend Lunch Deal"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description{" "}
          <span className="text-xs text-gray-400 font-normal">(shown to customers)</span>
        </label>
        <input
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          value={description}
          onChange={(e) => onDescription(e.target.value)}
          placeholder="e.g. 20% off your lunch order before 3pm"
        />
      </div>

      <div className="border border-gray-100 rounded-xl p-4 bg-gray-50">
        <TypeSpecific
          type={promotionType}
          rules={rules}
          onRules={onRules}
          gUp={gUp}
          cats={cats}
        />
      </div>
    </div>
  );
}

function TypeSpecific({
  type,
  rules,
  onRules,
  gUp,
  cats,
}: {
  type: string;
  rules: PromoRules;
  onRules: (r: Partial<PromoRules>) => void;
  gUp: (groups: IG[]) => void;
  cats: CatEntry[];
}) {
  switch (type) {
    case "percentage_off":
      return (
        <div className="space-y-4">
          <PctInput
            label="Discount %"
            value={rules.discountPercent ?? 0}
            onChange={(v) => onRules({ discountPercent: v })}
          />
          <div>
            <SL
              label="Eligible items"
              sub="Leave empty to apply the discount to the entire cart."
            />
            <GroupsEditor
              groups={rules.groups ?? []}
              onChange={gUp}
              cats={cats}
              addLabel="Add item group"
            />
          </div>
        </div>
      );

    case "free_delivery":
      return (
        <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-sm text-blue-800">
          Free delivery applies automatically when the cart meets the minimum
          order set on Step 3. This promo is delivery-only by default — you
          don&apos;t need to configure anything else here.
        </div>
      );

    case "bogo": {
      const pG: IG =
        rules.groups?.[0] ?? {
          id: "bogo-paid",
          label: "",
          categoryIds: [],
          itemIds: [],
          role: "paid",
        };
      const fG: IG =
        rules.groups?.[1] ?? {
          id: "bogo-free",
          label: "",
          categoryIds: [],
          itemIds: [],
          role: "free",
        };
      return (
        <div className="space-y-3">
          <SL label="Paid group" sub="Items the customer buys" />
          <ItemGroupRow
            group={{ ...pG, role: "paid" }}
            index={0}
            cats={cats}
            onChange={(g) =>
              gUp([
                { ...g, role: "paid" },
                { ...fG, role: "free" },
              ])
            }
            onRemove={() => {}}
            canRemove={false}
          />
          <SL label="Free group" sub="The item the customer gets free" />
          <ItemGroupRow
            group={{ ...fG, role: "free" }}
            index={1}
            cats={cats}
            onChange={(g) =>
              gUp([
                { ...pG, role: "paid" },
                { ...g, role: "free" },
              ])
            }
            onRemove={() => {}}
            canRemove={false}
          />
          <DiscountStrategySection rules={rules} onChange={onRules} />
        </div>
      );
    }

    case "buy_n_get_free": {
      const gs = rules.groups ?? [];
      const paidGs = gs.filter((g) => g.role !== "free");
      const fG: IG =
        gs.find((g) => g.role === "free") ?? {
          id: "bnf-free",
          label: "",
          categoryIds: [],
          itemIds: [],
          role: "free",
        };
      const setPaid = (pgs: IG[]) =>
        gUp([
          ...pgs.map((g) => ({ ...g, role: "paid" as const })),
          { ...fG, role: "free" as const },
        ]);
      return (
        <div className="space-y-3">
          <SL
            label="Paid groups"
            sub="Customer must order from each group to qualify"
          />
          <GroupsEditor
            groups={
              paidGs.length
                ? paidGs
                : [
                    {
                      id: "bnf-paid1",
                      label: "",
                      categoryIds: [],
                      itemIds: [],
                      role: "paid",
                    },
                  ]
            }
            onChange={setPaid}
            cats={cats}
            defaultRole="paid"
            addLabel="Add paid group"
            minGroups={1}
          />
          <SL label="Free group" sub="The item the customer gets free" />
          <ItemGroupRow
            group={{ ...fG, role: "free" }}
            index={0}
            cats={cats}
            onChange={(g) =>
              gUp([
                ...paidGs.map((pg) => ({ ...pg, role: "paid" as const })),
                { ...g, role: "free" as const },
              ])
            }
            onRemove={() => {}}
            canRemove={false}
          />
          <DiscountStrategySection rules={rules} onChange={onRules} />
        </div>
      );
    }

    case "fixed_cart":
      return (
        <AmtInput
          label="Discount Amount"
          value={rules.discountAmount ?? 0}
          onChange={(v) => onRules({ discountAmount: v })}
        />
      );

    case "payment_reward":
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Payment Method
            </label>
            <select
              value={rules.paymentMethod ?? "any"}
              onChange={(e) => onRules({ paymentMethod: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="any">Any payment method</option>
              <option value="card">Card (online)</option>
              <option value="cash">Cash on delivery</option>
              <option value="paypal">PayPal</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">
              You can ALSO restrict by specific configured payment slugs on
              Step 3 (Payment restriction).
            </p>
          </div>
          <PctInput
            label="Discount %"
            value={rules.discountPercent ?? 0}
            onChange={(v) => onRules({ discountPercent: v })}
          />
        </div>
      );

    case "free_item": {
      const fG: IG =
        rules.groups?.[0] ?? {
          id: "fi-free",
          label: "",
          categoryIds: [],
          itemIds: [],
          role: "free",
        };
      return (
        <div className="space-y-4">
          <AmtInput
            label="Minimum spend to trigger"
            value={rules.triggerAmount ?? 0}
            onChange={(v) => onRules({ triggerAmount: v })}
          />
          <div>
            <SL
              label="Free item pool"
              sub="The cheapest matching item is given free."
            />
            <ItemGroupRow
              group={{ ...fG, role: "free" }}
              index={0}
              cats={cats}
              onChange={(g) => gUp([{ ...g, role: "free" }])}
              onRemove={() => {}}
              canRemove={false}
            />
          </div>
        </div>
      );
    }

    case "meal_bundle":
      return (
        <div className="space-y-4">
          <AmtInput
            label="Bundle Price"
            value={rules.bundlePrice ?? 0}
            onChange={(v) => onRules({ bundlePrice: v })}
          />
          <div>
            <SL
              label="Bundle item groups"
              sub="Customer must have items from each group for the bundle price."
            />
            {/* TODO follow-up: surface minCount/maxCount per group for true
                mix-and-match slots (catalog #8). v1 uses 1 per group. */}
            <GroupsEditor
              groups={rules.groups ?? []}
              onChange={gUp}
              cats={cats}
              addLabel="Add group"
            />
          </div>
        </div>
      );

    case "meal_bundle_speciality":
      return (
        <div className="space-y-4">
          <AmtInput
            label="Bundle base price"
            value={rules.bundlePrice ?? 0}
            onChange={(v) => onRules({ bundlePrice: v })}
          />
          <div>
            <SL
              label="Bundle item groups"
              sub="Premium groups can carry an extra upsell fee (e.g. lobster +$5)."
            />
            {/* TODO follow-up: per-group extraFee input — catalog #13. */}
            <GroupsEditor
              groups={rules.groups ?? []}
              onChange={gUp}
              cats={cats}
              addLabel="Add group"
            />
          </div>
        </div>
      );

    case "fixed_combo":
      return (
        <div className="space-y-4">
          <AmtInput
            label="Discount Amount"
            value={rules.discountAmount ?? 0}
            onChange={(v) => onRules({ discountAmount: v })}
          />
          <div>
            <SL
              label="Combo groups"
              sub="Customer must have at least one item from each group."
            />
            <GroupsEditor
              groups={rules.groups ?? []}
              onChange={gUp}
              cats={cats}
              addLabel="Add combo group"
              minGroups={2}
            />
          </div>
        </div>
      );

    case "percentage_combo":
      return (
        <div className="space-y-4">
          <PctInput
            label="Discount %"
            value={rules.discountPercent ?? 0}
            onChange={(v) => onRules({ discountPercent: v })}
          />
          <div>
            <SL
              label="Combo groups"
              sub="Customer must have at least one item from each group."
            />
            <GroupsEditor
              groups={rules.groups ?? []}
              onChange={gUp}
              cats={cats}
              addLabel="Add combo group"
              minGroups={2}
            />
          </div>
        </div>
      );

    case "free_dish_meal": {
      const gs = rules.groups ?? [];
      const triggerGs = gs.filter((g) => g.role === "trigger");
      const fG: IG =
        gs.find((g) => g.role === "free") ?? {
          id: "fdm-free",
          label: "",
          categoryIds: [],
          itemIds: [],
          role: "free",
        };
      const setTriggers = (tgs: IG[]) =>
        gUp([
          ...tgs.map((g) => ({ ...g, role: "trigger" as const })),
          { ...fG, role: "free" as const },
        ]);
      return (
        <div className="space-y-3">
          <SL
            label="Trigger groups"
            sub="Items the customer must order to qualify"
          />
          <GroupsEditor
            groups={
              triggerGs.length
                ? triggerGs
                : [
                    {
                      id: "fdm-t1",
                      label: "",
                      categoryIds: [],
                      itemIds: [],
                      role: "trigger",
                    },
                  ]
            }
            onChange={setTriggers}
            cats={cats}
            defaultRole="trigger"
            addLabel="Add trigger group"
            minGroups={1}
          />
          <SL label="Free dish pool" />
          <ItemGroupRow
            group={{ ...fG, role: "free" }}
            index={0}
            cats={cats}
            onChange={(g) =>
              gUp([
                ...triggerGs.map((t) => ({ ...t, role: "trigger" as const })),
                { ...g, role: "free" as const },
              ])
            }
            onRemove={() => {}}
            canRemove={false}
          />
          <PctInput
            label="Discount on free dish (100 = fully free)"
            value={rules.discountPercent ?? 100}
            onChange={(v) => onRules({ discountPercent: v })}
          />
        </div>
      );
    }

    default:
      return (
        <div className="text-sm text-gray-500">
          Pick a promotion type on Step 1 to configure the details here.
        </div>
      );
  }
}
