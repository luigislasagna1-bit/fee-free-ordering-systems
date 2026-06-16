"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";

/**
 * Always-on admin banner shown while the restaurant is inside a failed-payment
 * grace window (Luigi 2026-06-15). Tells the owner their payment failed, that
 * service is STILL on, and counts down the days before paid features pause —
 * with a one-tap link to fix billing. Rendered by the admin layout only when a
 * grace clock is live; the admin stays fully unlocked during this window.
 */
export function DunningBanner({ daysLeft }: { daysLeft: number }) {
  const t = useTranslations("dunning");
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm text-amber-950">
      <span className="flex items-center gap-1.5 font-semibold">
        <Clock className="h-4 w-4 flex-shrink-0" />
        {t("bannerText", { days: daysLeft })}
      </span>
      <Link
        href="/admin/billing"
        className="rounded-md bg-amber-950 px-3 py-1 text-xs font-bold text-white transition hover:bg-amber-900"
      >
        {t("bannerCta")}
      </Link>
    </div>
  );
}
