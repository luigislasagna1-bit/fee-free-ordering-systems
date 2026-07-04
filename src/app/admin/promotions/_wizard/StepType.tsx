"use client";
/**
 * Step 1 — pick the promotion type.
 *
 * Renders a grid of cards (one per PROMO_TYPES entry from
 * src/lib/promo-types.ts). Free-tier cards are pickable; locked-tier
 * cards (Types 6-13) show a lock badge + open an "upgrade" modal when
 * the restaurant doesn't have the advanced_promos add-on.
 */

import { useState } from "react";
import Link from "next/link";
import * as Icons from "lucide-react";
import { useTranslations } from "next-intl";
import { PROMO_TYPES, isLockedType } from "@/lib/promo-types";

type IconKey = keyof typeof Icons;

function resolveIcon(name: string): React.ComponentType<{ className?: string }> {
  // Most catalog icons map 1:1 to lucide-react exports. Fall back to a
  // safe default if a typo creeps in.
  const Comp = (Icons as Record<string, unknown>)[name as IconKey] as
    | React.ComponentType<{ className?: string }>
    | undefined;
  return Comp ?? (Icons.Tag as React.ComponentType<{ className?: string }>);
}

export function StepType({
  selectedType,
  onSelect,
  hasAdvanced,
  rewardsEnabled = false,
}: {
  selectedType: string;
  onSelect: (slug: string) => void;
  hasAdvanced: boolean;
  /** Reward Dollars master switch — hides the Grant Reward Dollars card when
   *  the program is OFF (feature-gated visibility, Luigi 2026-07-03). */
  rewardsEnabled?: boolean;
}) {
  const t = useTranslations("admin.promoStepType");
  const [upgradePromptOpen, setUpgradePromptOpen] = useState(false);

  const handleCardClick = (slug: string) => {
    if (isLockedType(slug) && !hasAdvanced) {
      setUpgradePromptOpen(true);
      return;
    }
    onSelect(slug);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">{t("heading")}</h2>
        <p className="text-sm text-gray-500 mt-1">
          {t("subheading")}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {PROMO_TYPES.filter(
          // Grant Reward Dollars only exists while the program is ON. Kept
          // visible when it's the CURRENT type so editing an existing
          // reward-credit promo doesn't lose its card.
          (p) => p.slug !== "reward_credit" || rewardsEnabled || selectedType === "reward_credit",
        ).map((promo) => {
          const Icon = resolveIcon(promo.icon);
          const locked = promo.tier === "locked";
          const gated = locked && !hasAdvanced;
          const selected = selectedType === promo.slug;

          return (
            <button
              key={promo.slug}
              onClick={() => handleCardClick(promo.slug)}
              className={`relative text-left p-4 rounded-xl border-2 transition group ${
                selected
                  ? "border-emerald-500 bg-emerald-50"
                  : gated
                    ? "border-gray-200 bg-gray-50 hover:border-amber-300"
                    : "border-gray-200 bg-white hover:border-emerald-400 hover:bg-emerald-50/50"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    selected
                      ? "bg-emerald-500 text-white"
                      : gated
                        ? "bg-gray-200 text-gray-400"
                        : locked
                          ? "bg-amber-50 text-amber-600"
                          : "bg-emerald-50 text-emerald-500"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs font-bold text-gray-400">
                      #{promo.catalogNumber}
                    </span>
                    {locked && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                        <Icons.Lock className="w-2.5 h-2.5" />
                        {gated ? t("badgeLocked") : t("badgePro")}
                      </span>
                    )}
                  </div>
                  <div
                    className={`text-sm font-semibold ${
                      gated ? "text-gray-500" : "text-gray-900"
                    }`}
                  >
                    {promo.name}
                  </div>
                  <div
                    className={`text-xs mt-0.5 ${
                      gated ? "text-gray-400" : "text-gray-500"
                    }`}
                  >
                    {promo.description}
                  </div>
                  {gated && (
                    <div className="text-[11px] text-amber-700 mt-1.5 font-medium">
                      {t("unlockNudge")}
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {upgradePromptOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setUpgradePromptOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                <Icons.Sparkles className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {t("modalTitle")}
                </h3>
                <p className="text-sm text-gray-500">{t("modalPrice")}</p>
              </div>
            </div>
            <p className="text-sm text-gray-700 mb-4">
              {t("modalBody")}
            </p>
            <ul className="text-xs text-gray-600 space-y-1.5 mb-5">
              <li className="flex gap-2">
                <Icons.Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                {t("featurePaymentMethod")}
              </li>
              <li className="flex gap-2">
                <Icons.Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                {t("featureBundles")}
              </li>
              <li className="flex gap-2">
                <Icons.Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                {t("featureBuyNGetFree")}
              </li>
              <li className="flex gap-2">
                <Icons.Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                {t("featureFreeDish")}
              </li>
            </ul>
            <div className="flex gap-2">
              <button
                onClick={() => setUpgradePromptOpen(false)}
                className="flex-1 px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50"
              >
                {t("maybeLater")}
              </button>
              <Link
                href="/admin/billing/add-ons"
                className="flex-1 px-4 py-2.5 bg-amber-500 text-white text-sm font-semibold rounded-xl hover:bg-amber-600 text-center"
              >
                {t("subscribe")}
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
