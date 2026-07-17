"use client";
import { Fragment, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

/**
 * Date-grouped keyset list (v1.1 plan §3.1 shared building block) — used by
 * the driver History tab (Phase 4) and reusable by the restaurant Deliveries
 * tab (Phase 7) so the two shells stay visually identical.
 *
 * Grouping is by DEVICE-LOCAL day (Date getters are local-time by design):
 * "Today" / "Yesterday" headers, then locale-formatted dates (year shown only
 * when it differs from the current year). Items must arrive already sorted
 * newest-first (the keyset order) — grouping merges consecutive same-day runs,
 * so a "Load more" append that continues the same day extends its group.
 *
 * Pagination is an explicit "Load more" button — deliberately NO
 * infinite-scroll plumbing (plan §3.3). Loading/empty/error states belong to
 * the PARENT (each shell has its own copy); this component renders nothing
 * for an empty list.
 */
export function DateGroupedList<T>({
  items,
  getDate,
  getKey,
  renderItem,
  hasMore,
  loadingMore = false,
  onLoadMore,
}: {
  /** Newest-first items (keyset order). */
  items: T[];
  /** The timestamp an item is grouped by (e.g. completedAt). */
  getDate: (item: T) => string | Date;
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  /** Whether another keyset page exists (shows the Load more button). */
  hasMore: boolean;
  loadingMore?: boolean;
  onLoadMore: () => void;
}) {
  const tCommon = useTranslations("common");
  const tShared = useTranslations("feefreeShared");
  const locale = useLocale();

  if (items.length === 0) return null;

  const now = new Date();
  const todayKey = dayKey(now);
  const yesterdayKey = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));

  // Consecutive-run grouping (input is sorted, so runs == days).
  const groups: { key: number; label: string; items: T[] }[] = [];
  for (const item of items) {
    const d = new Date(getDate(item));
    const k = dayKey(d);
    const tail = groups[groups.length - 1];
    if (tail && tail.key === k) {
      tail.items.push(item);
      continue;
    }
    const label =
      k === todayKey
        ? tCommon("today")
        : k === yesterdayKey
          ? tCommon("yesterday")
          : d.toLocaleDateString(locale, {
              month: "long",
              day: "numeric",
              ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" as const } : {}),
            });
    groups.push({ key: k, label, items: [item] });
  }

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.key} className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">{g.label}</h2>
          <div className="space-y-2">
            {g.items.map((item) => (
              <Fragment key={getKey(item)}>{renderItem(item)}</Fragment>
            ))}
          </div>
        </section>
      ))}
      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="w-full flex items-center justify-center gap-2 bg-gray-800 border border-gray-700 hover:border-gray-600 disabled:opacity-50 text-gray-300 text-sm font-semibold py-3 rounded-2xl"
        >
          {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
          {tShared("loadMore")}
        </button>
      )}
    </div>
  );
}

/** Local-day bucket key (yyyymmdd as a number) — device-local by construction. */
function dayKey(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
