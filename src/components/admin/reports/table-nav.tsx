/**
 * Shared query-param helpers + Prev/Next pagination for server-paged list
 * views. Extracted when the Orders List became the third page to need them
 * (the two /admin/reports/list/* pages still carry their own copies — moving
 * those is a safe follow-up, deliberately not bundled with a feature change).
 */
import Link from "next/link";

export type SearchParams = Record<string, string | string[] | undefined>;

/** Every current query param except `page` (paging always resets on a change). */
export function buildQuery(sp: SearchParams): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined || k === "page") continue;
    if (Array.isArray(v)) v.forEach((x) => u.append(k, x));
    else u.set(k, v);
  }
  return u.toString();
}

/** First value of a possibly-repeated query param. */
export function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function Pagination({
  current, total, sp, labelPage, labelPrevious, labelNext,
}: {
  current: number;
  total: number;
  sp: SearchParams;
  labelPage: string;
  labelPrevious: string;
  labelNext: string;
}) {
  const mk = (p: number) => {
    const u = new URLSearchParams(buildQuery(sp));
    u.set("page", String(p));
    return `?${u.toString()}`;
  };
  return (
    <div className="flex items-center justify-between mt-4 text-xs text-gray-600">
      <span>{labelPage}</span>
      <div className="flex gap-1">
        {current > 1 && (
          <Link href={mk(current - 1)} className="px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50">{labelPrevious}</Link>
        )}
        {current < total && (
          <Link href={mk(current + 1)} className="px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50">{labelNext}</Link>
        )}
      </div>
    </div>
  );
}
