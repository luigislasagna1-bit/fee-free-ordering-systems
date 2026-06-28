"use client";
import { useState } from "react";
import { Gift, ToggleLeft, ToggleRight, Loader2, CreditCard } from "lucide-react";
import toast from "react-hot-toast";
import { useTranslations } from "next-intl";
import { HelpTip } from "@/components/HelpTip";
import { EarnRulesEditor } from "./EarnRulesEditor";

interface Initial {
  rewardsEnabled: boolean;
  rewardLabelSingular: string;
  rewardLabelPlural: string;
  rewardEarnEnabled: boolean;
  rewardEarnMode: "percent" | "per_dollar";
  rewardEarnPercent: number;
  rewardEarnPerDollar: number;
  rewardRedeemEnabled: boolean;
  rewardMinRedeemBalance: number;
  rewardMaxRedeemPercent: number;
  rewardSignupBonus: number;
}

/**
 * Reward Dollars (store-credit wallet) settings. A restaurant turns it on, names
 * it (default "Reward Dollars", renameable), and configures how customers EARN
 * (auto % back or $ per $X — optional) and SPEND (cap by % of order + minimum
 * balance). FREE for all restaurants. One explicit Save (the form mixes toggles
 * with numeric inputs). Persists via PATCH /api/admin/rewards/settings.
 * Luigi 2026-06-27.
 */
export function RewardsClient({ currency, initial }: { currency: string; initial: Initial }) {
  const t = useTranslations("admin.rewards");
  const tToasts = useTranslations("admin.toasts");

  const [s, setS] = useState<Initial>(initial);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Initial>(k: K, v: Initial[K]) => setS((p) => ({ ...p, [k]: v }));

  // Plural shown live in the on-page examples so the owner sees their name in use.
  const pluralPreview = s.rewardLabelPlural.trim() || t("defaultPlural");

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/rewards/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Opting into the program means customers can ALWAYS pay with their
        // balance — redeem is bound to the master switch, not a separate toggle.
        body: JSON.stringify({ ...s, rewardRedeemEnabled: s.rewardsEnabled }),
      });
      if (!res.ok) throw new Error();
      toast.success(tToasts("saved"));
    } catch {
      toast.error(tToasts("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const Toggle = ({ on, onClick, label, help }: { on: boolean; onClick: () => void; label: string; help?: string }) => (
    <button type="button" onClick={onClick} className="flex items-center gap-2 text-left">
      {on ? <ToggleRight className="w-9 h-9 text-emerald-600" /> : <ToggleLeft className="w-9 h-9 text-gray-300" />}
      <span className="font-medium text-gray-900">{label}</span>
      {help && <HelpTip text={help} />}
    </button>
  );

  const moneyInput = (value: number, onChange: (n: number) => void, opts?: { suffix?: string; max?: number }) => (
    <div className="inline-flex items-stretch rounded-lg border border-gray-300 overflow-hidden">
      {!opts?.suffix && <span className="px-2.5 flex items-center bg-gray-50 text-gray-500 text-sm border-r border-gray-300">{currency.toUpperCase()}</span>}
      <input
        type="number" min={0} max={opts?.max} step="0.01"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-24 px-3 py-2 text-sm text-gray-900 focus:outline-none"
      />
      {opts?.suffix && <span className="px-2.5 flex items-center bg-gray-50 text-gray-500 text-sm border-l border-gray-300">{opts.suffix}</span>}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-emerald-100"><Gift className="w-6 h-6 text-emerald-700" /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <p className="text-sm text-gray-500">{t("subtitle")}</p>
        </div>
      </div>

      {/* Master enable */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <Toggle on={s.rewardsEnabled} onClick={() => set("rewardsEnabled", !s.rewardsEnabled)} label={t("enable")} help={t("enableHelp")} />
        <p className="mt-1.5 ml-11 text-sm text-gray-500">{t("enableDesc", { label: pluralPreview })}</p>
      </div>

      {s.rewardsEnabled && (
        <>
          {/* Naming */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
            <div className="flex items-center gap-1.5">
              <h2 className="font-semibold text-gray-900">{t("nameTitle")}</h2>
              <HelpTip text={t("nameHelp")} />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">{t("namePlural")}</span>
                <input
                  type="text" maxLength={40}
                  value={s.rewardLabelPlural}
                  placeholder={t("namePluralPlaceholder")}
                  onChange={(e) => set("rewardLabelPlural", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">{t("nameSingular")}</span>
                <input
                  type="text" maxLength={40}
                  value={s.rewardLabelSingular}
                  placeholder={t("nameSingularPlaceholder")}
                  onChange={(e) => set("rewardLabelSingular", e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </label>
            </div>
            <p className="text-xs text-gray-400">{t("nameExamples")}</p>
          </div>

          {/* Earning */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
            <Toggle on={s.rewardEarnEnabled} onClick={() => set("rewardEarnEnabled", !s.rewardEarnEnabled)} label={t("earnTitle")} help={t("earnHelp")} />
            {s.rewardEarnEnabled && (
              <div className="ml-11 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={s.rewardEarnMode}
                    onChange={(e) => set("rewardEarnMode", e.target.value === "per_dollar" ? "per_dollar" : "percent")}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 bg-white"
                  >
                    <option value="percent">{t("earnModePercent")}</option>
                    <option value="per_dollar">{t("earnModePerDollar")}</option>
                  </select>
                  {s.rewardEarnMode === "percent"
                    ? moneyInput(s.rewardEarnPercent, (n) => set("rewardEarnPercent", n), { suffix: "%", max: 100 })
                    : moneyInput(s.rewardEarnPerDollar, (n) => set("rewardEarnPerDollar", n))}
                </div>
                <p className="text-xs text-gray-500">
                  {s.rewardEarnMode === "percent"
                    ? t("earnPreviewPercent", { pct: s.rewardEarnPercent, label: pluralPreview })
                    : t("earnPreviewPerDollar", { amount: s.rewardEarnPerDollar, label: pluralPreview })}
                </p>
              </div>
            )}
          </div>

          {/* Ways to earn — configurable rules/campaigns on top of the base rate */}
          <EarnRulesEditor currency={currency} rewardLabelPlural={pluralPreview} />

          {/* Spending — ALWAYS available when the program is on (it's a payment
              option, per the opt-in promise). No on/off toggle; just the caps. */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-4">
            <div className="flex items-start gap-2">
              <CreditCard className="w-5 h-5 text-emerald-600 mt-0.5" />
              <div>
                <h2 className="font-semibold text-gray-900">{t("redeemTitle", { label: pluralPreview })}</h2>
                <p className="text-sm text-gray-500">{t("redeemAlwaysOn", { label: pluralPreview })}</p>
              </div>
            </div>
            <div className="ml-7 grid sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">{t("maxRedeemPercent")} <HelpTip text={t("maxRedeemPercentHelp")} /></span>
                <div className="mt-1">{moneyInput(s.rewardMaxRedeemPercent, (n) => set("rewardMaxRedeemPercent", n), { suffix: "%", max: 100 })}</div>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">{t("minRedeemBalance")} <HelpTip text={t("minRedeemBalanceHelp")} /></span>
                <div className="mt-1">{moneyInput(s.rewardMinRedeemBalance, (n) => set("rewardMinRedeemBalance", n))}</div>
              </label>
            </div>
          </div>

          {/* Sign-up bonus */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="font-medium text-gray-900 flex items-center gap-1.5">{t("signupBonus")} <HelpTip text={t("signupBonusHelp")} /></span>
              {moneyInput(s.rewardSignupBonus, (n) => set("rewardSignupBonus", n))}
            </div>
          </div>
        </>
      )}

      <div className="flex justify-end">
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving && <Loader2 className="w-5 h-5 animate-spin" />}
          {t("save")}
        </button>
      </div>
    </div>
  );
}
