"use client";
/**
 * Step 2 — configure the chosen type.
 *
 * Dispatcher: switches on promotionType and renders the matching
 * config panel. Each panel writes to the wizard's ruleConfig state.
 * Name + description (always shown) live at the top.
 */

import { useTranslations } from "next-intl";
import {
  AmtInput,
  CatEntry,
  DiscountStrategySection,
  ExtraChargeModeSelect,
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
  paymentMethods,
  currencySymbol = "$",
}: {
  promotionType: string;
  name: string;
  description: string;
  onName: (v: string) => void;
  onDescription: (v: string) => void;
  rules: PromoRules;
  onRules: (r: Partial<PromoRules>) => void;
  cats: CatEntry[];
  /** Restaurant's enabled payment-method slugs (from Restaurant.paymentMethods).
   *  Used by Type 6 (Payment method reward) to limit the dropdown to
   *  methods the restaurant actually accepts. Empty array → fall back
   *  to the full list. */
  paymentMethods?: string[];
  /** Restaurant currency symbol (€, £, $, …) — threaded into every money
   *  input/price label so the wizard reflects Settings, not a hardcoded $. */
  currencySymbol?: string;
}) {
  const t = useTranslations("admin.promoStepConfig");
  const gUp = (groups: IG[]) => onRules({ groups });

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <h2 className="text-lg font-semibold text-gray-900">{t("configureHeading")}</h2>
        <p className="text-sm text-gray-500 mt-1">
          {t("configureSubheading")}
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t("promotionNameLabel")} <span className="text-red-500">*</span>
        </label>
        <input
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder={t("promotionNamePlaceholder")}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t("descriptionLabel")}{" "}
          <span className="text-xs text-gray-400 font-normal">{t("descriptionHint")}</span>
        </label>
        <input
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
          value={description}
          onChange={(e) => onDescription(e.target.value)}
          placeholder={t("descriptionPlaceholder")}
        />
      </div>

      <div className="border border-gray-100 rounded-xl p-4 bg-gray-50">
        <TypeSpecific
          type={promotionType}
          rules={rules}
          onRules={onRules}
          gUp={gUp}
          cats={cats}
          paymentMethods={paymentMethods}
          currencySymbol={currencySymbol}
        />
      </div>

      {/* "Only allowed once per order" — shown ONLY for the promo types whose
          engine calculator actually reads rules.oncePerOrder: bogo,
          buy_n_get_free, percentage_combo, and percentage_off (which caps the
          repeat). The other 8 types apply exactly once regardless, so the
          checkbox was a dead, confusing option there (audit dead#1).
          For the PERCENTAGE types the flag means something much stronger —
          "discount only the single most expensive qualifying item" — so they
          get their own explicit hint. Fabrizio cmqtmfp2n (2026-07-02): a "20%
          off these categories" promo with this ticked discounted €1.20 on a
          €102 cart and the owner read it as broken math. */}
      {["bogo", "buy_n_get_free", "percentage_combo", "percentage_off"].includes(promotionType) && (
        <label className="flex items-start gap-2.5 cursor-pointer border border-gray-200 rounded-xl p-4">
          <input
            type="checkbox"
            checked={!!rules.oncePerOrder}
            onChange={(e) => onRules({ oncePerOrder: e.target.checked })}
            className="mt-0.5"
          />
          <span>
            <span className="block text-sm font-medium text-gray-800">{t("oncePerOrderLabel")}</span>
            <span className="block text-xs text-gray-500 mt-0.5">
              {["percentage_off", "percentage_combo"].includes(promotionType)
                ? t("oncePerOrderHintPercent")
                : t("oncePerOrderHint")}
            </span>
          </span>
        </label>
      )}
    </div>
  );
}

function TypeSpecific({
  type,
  rules,
  onRules,
  gUp,
  cats,
  paymentMethods,
  currencySymbol = "$",
}: {
  type: string;
  rules: PromoRules;
  onRules: (r: Partial<PromoRules>) => void;
  gUp: (groups: IG[]) => void;
  cats: CatEntry[];
  paymentMethods?: string[];
  currencySymbol?: string;
}) {
  const t = useTranslations("admin.promoStepConfig");
  switch (type) {
    case "percentage_off": {
      const wholeCart = (rules.groups?.length ?? 0) === 0;
      return (
        <div className="space-y-4">
          <PctInput
            label={t("discountPctLabel")}
            value={rules.discountPercent ?? 0}
            onChange={(v) => onRules({ discountPercent: v })}
          />
          <div>
            <SL label={t("appliesToLabel")} />
            <div className="space-y-2">
              <label className="flex items-start gap-2 cursor-pointer p-2 rounded-lg hover:bg-gray-50">
                <input
                  type="radio"
                  name="appliesTo"
                  checked={wholeCart}
                  onChange={() => onRules({ groups: [] })}
                  className="mt-1"
                />
                <div>
                  <div className="text-sm font-medium text-gray-800">{t("wholeCartLabel")}</div>
                  <div className="text-xs text-gray-500">
                    {t("wholeCartSub")}
                  </div>
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer p-2 rounded-lg hover:bg-gray-50">
                <input
                  type="radio"
                  name="appliesTo"
                  checked={!wholeCart}
                  onChange={() => {
                    if ((rules.groups?.length ?? 0) === 0) {
                      onRules({ groups: [{ id: `g${Date.now()}`, label: "", categoryIds: [], itemIds: [] }] });
                    }
                  }}
                  className="mt-1"
                />
                <div>
                  <div className="text-sm font-medium text-gray-800">{t("specificItemsLabel")}</div>
                  <div className="text-xs text-gray-500">
                    {t("specificItemsSub")}
                  </div>
                </div>
              </label>
            </div>
            {!wholeCart && (
              <div className="mt-3">
                <GroupsEditor
                  currencySymbol={currencySymbol}
                  groups={rules.groups ?? []}
                  onChange={gUp}
                  cats={cats}
                  addLabel={t("addItemGroupLabel")}
                />
              </div>
            )}
          </div>
        </div>
      );
    }

    case "free_delivery":
      return (
        <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-sm text-blue-800">
          {t("freeDeliveryInfo")}
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
          <SL label={t("bogoPaidGroupLabel")} sub={t("bogoPaidGroupSub")} />
          <ItemGroupRow
            currencySymbol={currencySymbol}
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
          <SL label={t("bogoFreeGroupLabel")} sub={t("bogoFreeGroupSub")} />
          <ItemGroupRow
            currencySymbol={currencySymbol}
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
          <DiscountStrategySection rules={rules} onChange={onRules} promotionType="bogo" />
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
            label={t("bnfPaidGroupsLabel")}
            sub={t("bnfPaidGroupsSub")}
          />
          <GroupsEditor
            currencySymbol={currencySymbol}
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
            addLabel={t("addPaidGroupLabel")}
            minGroups={1}
            // Expose the "buy N" count — without it every Buy-N-Get-Free was
            // stuck at Buy-1-Get-1 (minCount could never be set). Luigi 2026-06-27.
            showSlotConfig
          />
          <SL label={t("bogoFreeGroupLabel")} sub={t("bogoFreeGroupSub")} />
          <ItemGroupRow
            currencySymbol={currencySymbol}
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
          <DiscountStrategySection rules={rules} onChange={onRules} promotionType="buy_n_get_free" />
        </div>
      );
    }

    case "fixed_cart":
      return (
        <AmtInput
          currencySymbol={currencySymbol}
          label={t("discountAmountLabel")}
          value={rules.discountAmount ?? 0}
          onChange={(v) => onRules({ discountAmount: v })}
        />
      );

    case "reward_credit":
      // Grants store credit (Reward Dollars) on order completion — no cart
      // discount. The amount is the credit added to the customer's balance.
      return (
        <div className="space-y-2">
          <AmtInput
            currencySymbol={currencySymbol}
            label={t("rewardCreditLabel")}
            value={rules.creditAmount ?? 0}
            onChange={(v) => onRules({ creditAmount: v })}
          />
          <p className="text-xs text-gray-500">{t("rewardCreditHint")}</p>
        </div>
      );

    case "payment_reward": {
      // Pull the dropdown options from the restaurant's enabled payment
      // methods so the owner can't accidentally promise a PayPal discount
      // when PayPal isn't even turned on. Falls back to the full list
      // when the restaurant hasn't configured any (defensive).
      const PAYMENT_LABELS: Record<string, string> = {
        cash: t("paymentLabelCash"),
        card_in_person: t("paymentLabelCardInPerson"),
        online_card: t("paymentLabelOnlineCard"),
        paypal: t("paymentLabelPaypal"),
      };
      const enabled = paymentMethods && paymentMethods.length > 0
        ? paymentMethods
        : ["cash", "card_in_person", "online_card", "paypal"];
      return (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("paymentMethodLabel")}
            </label>
            <select
              value={rules.paymentMethod ?? "any"}
              onChange={(e) => onRules({ paymentMethod: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"
            >
              <option value="any">{t("paymentMethodAny")}</option>
              {enabled.map((slug) => (
                <option key={slug} value={slug}>
                  {PAYMENT_LABELS[slug] ?? slug}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              {t("paymentMethodHint")}
            </p>
          </div>
          <PctInput
            label={t("discountPctLabel")}
            value={rules.discountPercent ?? 0}
            onChange={(v) => onRules({ discountPercent: v })}
          />
        </div>
      );
    }

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
            currencySymbol={currencySymbol}
            label={t("minSpendLabel")}
            value={rules.triggerAmount ?? 0}
            onChange={(v) => onRules({ triggerAmount: v })}
          />
          <div>
            <SL
              label={t("freeItemPoolLabel")}
              sub={t("freeItemPoolSub")}
            />
            <ItemGroupRow
              currencySymbol={currencySymbol}
              group={{ ...fG, role: "free" }}
              index={0}
              cats={cats}
              onChange={(g) => gUp([{ ...g, role: "free" }])}
              onRemove={() => {}}
              canRemove={false}
            />
          </div>
          <ExtraChargeModeSelect rules={rules} onChange={onRules} />
        </div>
      );
    }

    case "meal_bundle":
      return (
        <div className="space-y-4">
          <AmtInput
            currencySymbol={currencySymbol}
            label={t("bundlePriceLabel")}
            value={rules.bundlePrice ?? 0}
            onChange={(v) => onRules({ bundlePrice: v })}
          />
          <div>
            <SL
              label={t("bundleGroupsLabel")}
              sub={t("bundleGroupsSub")}
            />
            <GroupsEditor
              currencySymbol={currencySymbol}
              groups={rules.groups ?? []}
              onChange={gUp}
              cats={cats}
              addLabel={t("addGroupLabel")}
              showSlotConfig
            />
          </div>
        </div>
      );

    case "meal_bundle_speciality":
      return (
        <div className="space-y-4">
          <AmtInput
            currencySymbol={currencySymbol}
            label={t("bundleBasePriceLabel")}
            value={rules.bundlePrice ?? 0}
            onChange={(v) => onRules({ bundlePrice: v })}
          />
          <div>
            <SL
              label={t("bundleGroupsLabel")}
              sub={t("bundleSpecialityGroupsSub")}
            />
            <GroupsEditor
              currencySymbol={currencySymbol}
              groups={rules.groups ?? []}
              onChange={gUp}
              cats={cats}
              addLabel={t("addGroupLabel")}
              showSlotConfig
              showSpecialityFee
            />
          </div>
        </div>
      );

    case "fixed_combo":
      return (
        <div className="space-y-4">
          <AmtInput
            currencySymbol={currencySymbol}
            label={t("discountAmountLabel")}
            value={rules.discountAmount ?? 0}
            onChange={(v) => onRules({ discountAmount: v })}
          />
          <div>
            <SL
              label={t("comboGroupsLabel")}
              sub={t("comboGroupsSub")}
            />
            <GroupsEditor
              currencySymbol={currencySymbol}
              groups={rules.groups ?? []}
              onChange={gUp}
              cats={cats}
              addLabel={t("addComboGroupLabel")}
              minGroups={2}
            />
          </div>
        </div>
      );

    case "percentage_combo":
      return (
        <div className="space-y-4">
          <PctInput
            label={t("discountPctLabel")}
            value={rules.discountPercent ?? 0}
            onChange={(v) => onRules({ discountPercent: v })}
          />
          <div>
            <SL
              label={t("comboGroupsLabel")}
              sub={t("comboGroupsSub")}
            />
            <GroupsEditor
              currencySymbol={currencySymbol}
              groups={rules.groups ?? []}
              onChange={gUp}
              cats={cats}
              addLabel={t("addComboGroupLabel")}
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
            label={t("triggerGroupsLabel")}
            sub={t("triggerGroupsSub")}
          />
          <GroupsEditor
            currencySymbol={currencySymbol}
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
            addLabel={t("addTriggerGroupLabel")}
            minGroups={1}
          />
          <SL label={t("freeDishPoolLabel")} />
          <ItemGroupRow
            currencySymbol={currencySymbol}
            group={{ ...fG, role: "free" }}
            index={0}
            cats={cats}
            onChange={(g) =>
              gUp([
                ...triggerGs.map((tg) => ({ ...tg, role: "trigger" as const })),
                { ...g, role: "free" as const },
              ])
            }
            onRemove={() => {}}
            canRemove={false}
          />
          <PctInput
            label={t("freeDishDiscountLabel")}
            value={rules.discountPercent ?? 100}
            onChange={(v) => onRules({ discountPercent: v })}
          />
          <ExtraChargeModeSelect rules={rules} onChange={onRules} />
        </div>
      );
    }

    default:
      return (
        <div className="text-sm text-gray-500">
          {t("pickTypePrompt")}
        </div>
      );
  }
}
