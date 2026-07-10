"use client";
import Link from "next/link";
import { useTranslations, useFormatter } from "next-intl";
import { Gift } from "lucide-react";

/**
 * Always-on admin banner while a FREE PARTNER PERIOD is running (Luigi
 * 2026-07-10): the restaurant's add-ons from the pre-live era are
 * complimentary until `endsAt`, then switch off automatically (the
 * expire-addon-trials cron). Tells the owner the date and where to subscribe
 * with a card to keep them. Rendered by the admin layout only when the
 * restaurant has trialing, unbilled add-on rows.
 */
export function PartnerPeriodBanner({ endsAt, count }: { endsAt: string; count: number }) {
  const t = useTranslations("partnerPeriod");
  const format = useFormatter();
  const date = format.dateTime(new Date(endsAt), { dateStyle: "long" });
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 bg-sky-600 px-4 py-2 text-sm text-white">
      <span className="flex items-center gap-1.5 font-semibold">
        <Gift className="h-4 w-4 flex-shrink-0" />
        {t("bannerText", { count, date })}
      </span>
      <Link
        href="/admin/billing/add-ons"
        className="rounded-md bg-white/15 px-3 py-1 text-xs font-bold text-white ring-1 ring-white/40 transition hover:bg-white/25"
      >
        {t("bannerCta")}
      </Link>
    </div>
  );
}
