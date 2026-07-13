"use client";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

/** Shared Prev / page / Next control for the account dashboard's paginated
 *  lists. Prev disabled on page 1; Next disabled when there's no more data. */
export function AccountPager({
  page, hasMore, loading, onPrev, onNext, primary,
}: {
  page: number;
  hasMore: boolean;
  loading: boolean;
  onPrev: () => void;
  onNext: () => void;
  primary?: string;
}) {
  const t = useTranslations("customer.accountPage.pagination");
  // Only shown when there's actually more than one page's worth to navigate.
  if (page === 1 && !hasMore) return null;
  const btn = "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-semibold border transition disabled:opacity-40 disabled:cursor-not-allowed";
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-100">
      <button
        type="button"
        onClick={onPrev}
        disabled={page === 1 || loading}
        className={`${btn} border-gray-300 text-gray-700 hover:bg-gray-50`}
      >
        <ChevronLeft className="w-4 h-4" /> {t("previous")}
      </button>
      <span className="text-xs font-medium text-gray-500 inline-flex items-center gap-1.5">
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {t("page", { page })}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={!hasMore || loading}
        className={`${btn} text-white`}
        style={{ backgroundColor: primary ?? "#059669", borderColor: primary ?? "#059669" }}
      >
        {t("next")} <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
