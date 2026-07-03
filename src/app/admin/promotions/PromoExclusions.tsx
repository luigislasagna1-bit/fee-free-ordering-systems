"use client";
import { useTranslations } from "next-intl";
import { HelpTip } from "@/components/HelpTip";
import { MenuExclusionsPanel } from "@/components/admin/MenuExclusionsPanel";

/**
 * "No discounts on…" — categories/items no promotion or coupon may discount
 * (e.g. Gift Cards; the promo engine enforces it in BOTH preview + charge).
 * Thin wrapper: strings from admin.promotionsPage.exclude*, behavior in the
 * shared MenuExclusionsPanel (collapsible; field promoExcluded). NOTE: paying
 * with Reward Dollars is a SEPARATE switch — the redeem-exclusions panel on
 * /admin/rewards (Luigi 2026-07-02 split).
 */
export function PromoExclusions() {
  const t = useTranslations("admin.promotionsPage");
  return (
    <div className="mt-6">
      <MenuExclusionsPanel
        field="promoExcluded"
        helpTip={<HelpTip text={t("excludeHelp")} />}
        strings={{
          title: t("excludeTitle"),
          help: t("excludeHelp"),
          desc: t("excludeDesc"),
          on: t("excludeOn"),
          off: t("excludeOff"),
          viaCategory: t("excludeViaCategory"),
          failed: t("excludeFailed"),
          loading: t("excludeLoading"),
          none: t("excludeNone"),
        }}
      />
    </div>
  );
}
