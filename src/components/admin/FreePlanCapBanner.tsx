"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { HelpTip } from "@/components/HelpTip";

/**
 * Always-on, deliberately LOW-KEY bar shown across the admin panel for FREE
 * (no paid add-on) restaurants: "{count} of {cap} orders this month" + a quiet
 * link on how to lift the cap. Rendered once in the admin layout so it sits on
 * every page; hidden entirely for cap-exempt (paid) restaurants. The tone
 * escalates as usage climbs — near-invisible grey when low, amber near the cap,
 * red once reached. Luigi 2026-06-14 ("slightly visible, not extremely visible").
 */
export function FreePlanCapBanner({
  count,
  cap,
  level,
}: {
  count: number;
  cap: number;
  level: "ok" | "warning" | "cap_reached";
}) {
  const t = useTranslations("admin.orderCapBanner");
  const tone =
    level === "cap_reached"
      ? "bg-red-50 border-red-100 text-red-700"
      : level === "warning"
        ? "bg-amber-50 border-amber-100 text-amber-800"
        : "bg-gray-50 border-gray-100 text-gray-500";
  return (
    <div className={`flex items-center justify-center gap-1.5 px-4 py-1 text-[11.5px] border-b ${tone}`}>
      <span>{t("usage", { count, cap })}</span>
      <Link
        href="/admin/billing/add-ons"
        className="font-semibold underline-offset-2 hover:underline whitespace-nowrap"
      >
        {t("removeLimit")}
      </Link>
      <HelpTip text={t("help", { cap })} />
    </div>
  );
}
