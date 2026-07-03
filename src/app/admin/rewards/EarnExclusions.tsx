"use client";
import { useTranslations } from "next-intl";
import { HelpTip } from "@/components/HelpTip";
import { MenuExclusionsPanel } from "@/components/admin/MenuExclusionsPanel";

/**
 * "Don't earn {rewardName} on…" — lets the owner exclude whole CATEGORIES
 * (e.g. Gift Cards) or specific ITEMS from Reward Dollars EARNING, so
 * customers don't earn store credit for buying store credit. Engine:
 * reward-ledger.earnBasisForOrder. Thin wrapper since 2026-07-02: strings
 * from admin.rewards.exclude*, behavior in the shared MenuExclusionsPanel
 * (collapsible; field rewardEarnExcluded).
 */
export function EarnExclusions({ label }: { label: string }) {
  const t = useTranslations("admin.rewards");
  return (
    <MenuExclusionsPanel
      field="rewardEarnExcluded"
      helpTip={<HelpTip text={t("excludeHelp", { label })} />}
      strings={{
        title: t("excludeTitle", { label }),
        help: t("excludeHelp", { label }),
        desc: t("excludeDesc", { label }),
        on: t("excludeOn"),
        off: t("excludeOff"),
        viaCategory: t("excludeViaCategory"),
        failed: t("excludeFailed"),
        loading: t("excludeLoading"),
        none: t("excludeNone"),
      }}
    />
  );
}

/**
 * "Can't be paid with {rewardName}" — the SEPARATE switch Luigi asked for
 * (2026-07-02): which categories/items are excluded from the Reward-Dollars
 * REDEEMABLE base at checkout. Independent from both the earn exclusion
 * above and the promo-discount exclusion on /admin/promotions. Enforced in
 * BOTH the cart preview (redeemExcludedTotal) and the charge (reserveCredit
 * base). Field: rewardRedeemExcluded.
 */
export function RedeemExclusions({ label }: { label: string }) {
  const t = useTranslations("admin.rewards");
  return (
    <MenuExclusionsPanel
      field="rewardRedeemExcluded"
      helpTip={<HelpTip text={t("redeemExcludeHelp", { label })} />}
      strings={{
        title: t("redeemExcludeTitle", { label }),
        help: t("redeemExcludeHelp", { label }),
        desc: t("redeemExcludeDesc", { label }),
        on: t("redeemExcludeOn"),
        off: t("redeemExcludeOff"),
        viaCategory: t("excludeViaCategory"),
        failed: t("excludeFailed"),
        loading: t("excludeLoading"),
        none: t("excludeNone"),
      }}
    />
  );
}
