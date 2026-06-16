"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Clock, AlertTriangle } from "lucide-react";
import type { AddOnBillingState } from "@/lib/dunning";

/**
 * In-context dunning notice for ONE add-on, shown on that add-on's own settings
 * page (Luigi 2026-06-15). The page already tells the owner WHICH add-on they're
 * looking at, so the copy stays generic except the add-on-specific "what happens"
 * consequence line (keyed by slug, with a generic fallback so no add-on is ever
 * left unexplained).
 *
 *   grace      → amber: payment failed, still active, X days to fix.
 *   downgraded → red:   switched off for non-payment + the specific consequence.
 *   active / inactive → nothing.
 *
 * Compute `state` server-side with getAddOnBillingState(restaurantId, slug) and
 * pass it in; this renders inside the admin's NextIntlClientProvider.
 */
export function AddOnBillingNotice({
  state,
  addOnSlug,
}: {
  state: AddOnBillingState;
  addOnSlug: string;
}) {
  const t = useTranslations("addOnBilling");

  if (state.state === "active" || state.state === "inactive") return null;

  if (state.state === "grace") {
    return (
      <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
        <div className="flex items-start gap-2">
          <Clock className="w-5 h-5 flex-shrink-0 text-amber-600 mt-0.5" />
          <div className="min-w-0">
            <div className="font-semibold text-amber-900">{t("graceTitle")}</div>
            <div className="mt-0.5 text-sm text-amber-800">
              {t("graceBody", { days: state.daysLeft })}
            </div>
            <Link
              href="/admin/billing"
              className="mt-2 inline-block rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-amber-600"
            >
              {t("graceCta")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // downgraded — pick the add-on-specific consequence, else the generic line.
  const consKey = `consequence.${addOnSlug}`;
  const consequence = t.has(consKey) ? t(consKey) : t("consequenceGeneric");
  return (
    <div className="mb-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-600 mt-0.5" />
        <div className="min-w-0">
          <div className="font-semibold text-red-900">{t("downgradedTitle")}</div>
          <div className="mt-0.5 text-sm text-red-800">{t("downgradedBody", { consequence })}</div>
          <Link
            href="/admin/billing/add-ons"
            className="mt-2 inline-block rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            {t("downgradedCta")}
          </Link>
        </div>
      </div>
    </div>
  );
}
