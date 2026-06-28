"use client";
import Link from "next/link";
import { Gift, ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * Informational card on the Accepted Methods page: when Reward Dollars is on, it's
 * automatically a customer-payable option (applied at checkout). Surfaced here so
 * the owner sees it listed among the ways customers can pay. Luigi 2026-06-27.
 */
export function RewardsPaymentNotice({ label }: { label: string }) {
  const t = useTranslations("admin.payments");
  return (
    <div className="max-w-3xl mx-auto px-4 pb-8">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 flex items-start gap-3">
        <Gift className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
        <div className="min-w-0">
          <div className="font-semibold text-emerald-900">{t("rewardsNoticeTitle", { label })}</div>
          <p className="text-sm text-emerald-800/90 mt-0.5">{t("rewardsNoticeBody", { label })}</p>
          <Link href="/admin/rewards" className="inline-flex items-center gap-1 text-sm font-bold text-emerald-700 hover:text-emerald-900 mt-2">
            {t("rewardsNoticeLink")} <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
