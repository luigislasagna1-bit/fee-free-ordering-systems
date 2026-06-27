"use client";
/**
 * Three-step admin promo wizard.
 *
 * Steps:
 *   1. Type     — pick from PROMO_TYPES (locked types gate behind add-on)
 *   2. Configure — type-specific knobs (discount %, item groups, etc.)
 *   3. Restrictions & Display — all 8 restriction families + display + activation
 *
 * Used by both the create flow (/admin/promotions/new) and the edit flow
 * (/admin/promotions/[id]/edit) — same shell, just prefilled in edit mode.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Save } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";

import { PROMO_TYPES, isLockedType } from "@/lib/promo-types";
import { CatEntry, hhmmToMin, initRulesForType, minToHHMM, PromoRules } from "./helpers";
import { StepType } from "./StepType";
import { StepConfig } from "./StepConfig";
import { StepRestrictions, Step3Form } from "./StepRestrictions";

export type WizardMode = "new" | "edit";

export type WizardProps = {
  mode: WizardMode;
  hasAdvanced: boolean;
  categories: { id: string; name: string; menuId?: string | null; menuName?: string | null }[];
  menuItems: { id: string; name: string; categoryId: string; price: number; variants?: { id: string; name: string; price: number }[] }[];
  paymentMethods: string[];
  deliveryZones: { id: string; name: string }[];
  /** Restaurant's currency symbol (e.g. "€"/"$") for money input prefixes.
   *  Defaults to "$" when not provided. Luigi 2026-06-07. */
  currencySymbol?: string;
  /** When mode === "edit", the existing promo (already scoped to restaurantId). */
  initialPromo?: PromoRow | null;
  /** True when the restaurant is actually listed on the marketplace — gates the
   *  channel (website / marketplace / both) picker in Step 3. Luigi 2026-06-09. */
  isOnMarketplace?: boolean;
};

export type PromoRow = {
  id: string;
  name: string;
  description: string | null;
  promotionType: string;
  isActive: boolean;
  stackingRule: string;
  channel: string; // website | marketplace | both
  orderType: string; // legacy "both"/"pickup"/"delivery"/CSV
  customerType: string;
  minimumOrder: number;
  rules: string;
  ruleConfig: unknown;
  daysOfWeek: string | null;
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  autoApply: boolean;
  couponCode: string | null;
  usableHourStart: number | null;
  usableHourEnd: number | null;
  showOnBanner: boolean;
  bannerHeadline: string | null;
  paymentMethodSlugs: string | null;
  deliveryZoneIds: string | null;
  onceLifetimePerClient: boolean;
  imageUrl: string | null;
  displayMode: string;
  highlightThreshold: number | null;
};

// ─── Form state ─────────────────────────────────────────────────────────────

function parseJsonArr<T>(s: string | null | undefined): T[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? (v as T[]) : [];
  } catch {
    return [];
  }
}

function parseRules(raw: string | null | undefined): PromoRules {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as PromoRules) : {};
  } catch {
    return {};
  }
}

/** Canonical full set of order channels. "both"/empty = UNRESTRICTED, which the
 *  engine treats as ALL channels — so the wizard must show them ALL checked, not
 *  just pickup+delivery (Luigi 2026-06-27: a "both" promo showed only 2 boxes,
 *  and re-saving silently narrowed it to pickup+delivery). */
const ALL_ORDER_CHANNELS = ["pickup", "delivery", "dine_in", "take_out", "catering"];

function normalizeOrderTypeFromDb(s: string | undefined): string[] {
  // No value (new promo) OR "both" = unrestricted → show every channel checked.
  if (!s || s === "both") return [...ALL_ORDER_CHANNELS];
  // Rows store a single value | a JSON array (multi-select) | CSV.
  let arr: string[];
  if (s.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(s);
      arr = Array.isArray(parsed) ? parsed.map(String) : [s];
    } catch {
      arr = s.split(",").map((x) => x.trim()).filter(Boolean);
    }
  } else {
    arr = s.split(",").map((x) => x.trim()).filter(Boolean);
  }
  // Canonicalise legacy spellings so the matching checkbox pre-checks.
  return arr.map((x) => (x === "takeout" ? "take_out" : x === "dinein" ? "dine_in" : x));
}

function initialFormFromPromo(p: PromoRow | null | undefined): Step3Form {
  return {
    daysOfWeek: p?.daysOfWeek
      ? (() => {
          try {
            const v = JSON.parse(p.daysOfWeek!);
            return Array.isArray(v) ? (v as number[]) : [0, 1, 2, 3, 4, 5, 6];
          } catch {
            return [0, 1, 2, 3, 4, 5, 6];
          }
        })()
      : [0, 1, 2, 3, 4, 5, 6],
    usableHourStart:
      typeof p?.usableHourStart === "number" ? minToHHMM(p.usableHourStart) : "",
    usableHourEnd:
      typeof p?.usableHourEnd === "number" ? minToHHMM(p.usableHourEnd) : "",
    minimumOrder: p?.minimumOrder != null ? String(p.minimumOrder) : "0",
    startsAt: p?.startsAt ? new Date(p.startsAt).toISOString().slice(0, 16) : "",
    endsAt: p?.endsAt ? new Date(p.endsAt).toISOString().slice(0, 16) : "",
    orderType: normalizeOrderTypeFromDb(p?.orderType),
    customerType: p?.customerType ?? "any",
    paymentMethodSlugs: parseJsonArr<string>(p?.paymentMethodSlugs ?? null),
    deliveryZoneIds: parseJsonArr<string>(p?.deliveryZoneIds ?? null),
    usageLimit: p?.usageLimit != null ? String(p.usageLimit) : "",
    onceLifetimePerClient: !!p?.onceLifetimePerClient,
    stackingRule: p?.stackingRule ?? "standard",
    channel: p?.channel ?? "website",
    displayMode: p?.displayMode ?? "menu_visible",
    highlightThreshold: p?.highlightThreshold != null ? String(p.highlightThreshold) : "",
    imageUrl: p?.imageUrl ?? "",
    couponCode: p?.couponCode ?? "",
    autoApply: p?.autoApply ?? true,
    showOnBanner: p?.showOnBanner ?? true,
    bannerHeadline: p?.bannerHeadline ?? "",
    isActive: p?.isActive ?? true,
  };
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PromoWizard(props: WizardProps) {
  const { mode, hasAdvanced, categories, menuItems, paymentMethods, deliveryZones, initialPromo, currencySymbol = "$", isOnMarketplace = false } =
    props;
  const router = useRouter();
  const t = useTranslations("admin.promoWizard");

  const [step, setStep] = useState<1 | 2 | 3>(mode === "edit" ? 2 : 1);
  const [saving, setSaving] = useState(false);

  // Type + name + description live above the per-step state so they survive
  // back-navigation between steps.
  const [promotionType, setPromotionType] = useState(initialPromo?.promotionType ?? "");
  const [name, setName] = useState(initialPromo?.name ?? "");
  const [description, setDescription] = useState(initialPromo?.description ?? "");
  const [rules, setRules] = useState<PromoRules>(() => {
    if (initialPromo) {
      // Prefer `ruleConfig` (the engine's source of truth, via getRules) over the
      // legacy `rules` String. Autopilot/Kickstarter promos populate ONLY
      // ruleConfig, so reading `rules` showed an empty form (Discount % = 0) AND
      // a Save would have written `{}` back, wiping the real discount. Mirror the
      // engine's precedence here. Luigi 2026-06-10.
      const rc = initialPromo.ruleConfig;
      if (rc && typeof rc === "object" && !Array.isArray(rc) && Object.keys(rc as object).length > 0) {
        return rc as PromoRules;
      }
      return parseRules(initialPromo.rules);
    }
    return {};
  });
  const [step3, setStep3] = useState<Step3Form>(() => initialFormFromPromo(initialPromo ?? null));

  const cats: CatEntry[] = useMemo(
    () =>
      categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        menuId: cat.menuId ?? null,
        menuName: cat.menuName ?? null,
        items: menuItems
          .filter((i) => i.categoryId === cat.id)
          .map((i) => ({ id: i.id, name: i.name, price: i.price, variants: i.variants ?? [] })),
      })),
    [categories, menuItems],
  );

  const selectType = (slug: string) => {
    setPromotionType(slug);
    // Reset rules to the type's default shape — but only when actually
    // changing the type (not when re-selecting the same one).
    if (slug !== promotionType) {
      setRules(initRulesForType(slug));
    }
  };

  const setRulesPartial = (patch: Partial<PromoRules>) =>
    setRules((r) => ({ ...r, ...patch }));

  const setForm = (patch: Partial<Step3Form>) => setStep3((f) => ({ ...f, ...patch }));

  const canAdvanceFromType = !!promotionType;

  const goNext = () => {
    if (step === 1) {
      if (!canAdvanceFromType) {
        toast.error(t("errorPickType"));
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!name.trim()) {
        toast.error(t("errorNameRequired"));
        return;
      }
      setStep(3);
      return;
    }
  };

  const goBack = () => {
    if (step === 3) setStep(2);
    else if (step === 2 && mode === "new") setStep(1);
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error(t("errorNameRequired"));
      return;
    }
    if (!promotionType) {
      toast.error(t("errorTypeRequired"));
      return;
    }
    setSaving(true);

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      promotionType,
      isActive: step3.isActive,
      stackingRule: step3.stackingRule,
      channel: step3.channel,
      orderType: step3.orderType, // API accepts string[]
      customerType: step3.customerType,
      minimumOrder: parseFloat(step3.minimumOrder) || 0,
      ruleConfig: rules,
      // Legacy `rules` String kept in sync for the existing engine path.
      rules: JSON.stringify(rules ?? {}),
      daysOfWeek: step3.daysOfWeek,
      startsAt: step3.startsAt || null,
      endsAt: step3.endsAt || null,
      usageLimit: step3.usageLimit ? parseInt(step3.usageLimit, 10) : null,
      // Bundles are built from a visible card; auto-apply/code are inert for
      // them, so force auto-apply on + drop any (ignored) code so the save
      // invariant doesn't demand one (Luigi 2026-06-27).
      autoApply: ["meal_bundle", "meal_bundle_speciality"].includes(promotionType) ? true : step3.autoApply,
      couponCode: ["meal_bundle", "meal_bundle_speciality"].includes(promotionType)
        ? null
        : step3.couponCode.trim() || null,
      usableHourStart: step3.usableHourStart ? hhmmToMin(step3.usableHourStart) : null,
      usableHourEnd: step3.usableHourEnd ? hhmmToMin(step3.usableHourEnd) : null,
      showOnBanner: step3.showOnBanner,
      bannerHeadline: step3.bannerHeadline.trim() || null,
      paymentMethodSlugs: step3.paymentMethodSlugs,
      deliveryZoneIds: step3.deliveryZoneIds,
      onceLifetimePerClient: step3.onceLifetimePerClient,
      imageUrl: step3.imageUrl.trim() || null,
      displayMode: step3.displayMode,
      highlightThreshold:
        step3.highlightThreshold && step3.highlightThreshold !== ""
          ? parseFloat(step3.highlightThreshold)
          : null,
    };

    try {
      const isEdit = mode === "edit" && initialPromo?.id;
      const url = isEdit
        ? `/api/restaurants/promotions/${initialPromo!.id}`
        : "/api/restaurants/promotions";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let msg = t("errorSaveFailed", { status: res.status });
        try {
          const d = await res.json();
          msg = d.error || msg;
        } catch {}
        throw new Error(msg);
      }
      toast.success(isEdit ? t("successUpdated") : t("successCreated"));
      router.push("/admin/promotions");
      router.refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("errorSaveFailedGeneric");
      toast.error(msg);
      setSaving(false);
    }
  };

  // Title pieces for the header.
  const meta = PROMO_TYPES.find((pt) => pt.slug === promotionType);
  const headerTitle =
    mode === "edit" ? t("headerEdit") : t("headerNew");

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-4">
        <Link
          href="/admin/promotions"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; {t("backToPromotions")}
        </Link>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Header + step indicator */}
        <div className="px-6 pt-5 pb-4 border-b">
          <h1 className="text-xl font-bold text-gray-900">{headerTitle}</h1>
          {meta && (
            <p className="text-xs text-gray-500 mt-0.5">
              #{meta.catalogNumber} — {meta.name}
            </p>
          )}
          <StepIndicator step={step} />
        </div>

        {/* Body */}
        <div className="px-6 py-6">
          {step === 1 && (
            <StepType
              selectedType={promotionType}
              onSelect={selectType}
              hasAdvanced={hasAdvanced}
            />
          )}
          {step === 2 && (
            <StepConfig
              promotionType={promotionType}
              name={name}
              description={description ?? ""}
              onName={setName}
              onDescription={setDescription}
              rules={rules}
              onRules={setRulesPartial}
              cats={cats}
              currencySymbol={currencySymbol}
              // So the payment_reward method dropdown lists only the methods this
              // restaurant actually accepts, not the hardcoded fallback (audit
              // confusing#1/dead#5).
              paymentMethods={paymentMethods}
            />
          )}
          {step === 3 && (
            <StepRestrictions
              form={step3}
              setForm={setForm}
              paymentMethods={paymentMethods}
              deliveryZones={deliveryZones}
              currencySymbol={currencySymbol}
              isOnMarketplace={isOnMarketplace}
              promotionType={promotionType}
            />
          )}
        </div>

        {/* Footer nav */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50">
          <button
            onClick={goBack}
            disabled={(step === 1) || (step === 2 && mode === "edit")}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="w-4 h-4" /> {t("back")}
          </button>
          {step < 3 ? (
            <button
              onClick={goNext}
              disabled={step === 1 && !canAdvanceFromType}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-xl hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {t("next")} <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-xl hover:bg-emerald-600 disabled:opacity-50 transition"
            >
              {saving ? (
                t("saving")
              ) : (
                <>
                  <Save className="w-4 h-4" /> {t("savePromo")}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const t = useTranslations("admin.promoWizard");
  const labels = [t("stepType"), t("stepConfigure"), t("stepRestrictionsDisplay")];
  return (
    <div className="mt-4 flex items-center gap-2">
      {labels.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const active = step === n;
        const done = step > n;
        return (
          <div key={label} className="flex items-center gap-2 flex-1">
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition ${
                active
                  ? "bg-emerald-500 text-white"
                  : done
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-gray-100 text-gray-500"
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  active
                    ? "bg-white text-emerald-600"
                    : done
                      ? "bg-emerald-500 text-white"
                      : "bg-gray-300 text-white"
                }`}
              >
                {done ? <Check className="w-3 h-3" /> : n}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </div>
            {i < labels.length - 1 && (
              <div
                className={`flex-1 h-0.5 rounded-full ${
                  done ? "bg-emerald-300" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
