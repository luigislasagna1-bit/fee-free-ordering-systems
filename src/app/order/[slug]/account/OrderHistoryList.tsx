"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/utils";
import { AccountPager } from "./AccountPager";

export type OrderRow = { id: string; orderNumber: string; total: number; status: string; createdAt: string; type: string };

/**
 * Order-history list with Prev/Next pagination. Page 1 server-rendered; pages
 * 2+ fetched from /api/order/[slug]/account/history?tab=orders. Replaces the
 * old fixed 10-row list so a customer can reach their older orders. Luigi 2026-07-13.
 */
export function OrderHistoryList({
  slug, currency, timezone, primary, initialRows, initialHasMore,
}: {
  slug: string;
  currency: string;
  timezone: string | null;
  primary?: string;
  initialRows: OrderRow[];
  initialHasMore: boolean;
}) {
  const t = useTranslations("customer.accountPage");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<OrderRow[]>(initialRows);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);

  const tzOpts = timezone ? { timeZone: timezone } : {};

  async function go(next: number) {
    if (loading || next < 1) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/order/${slug}/account/history?tab=orders&page=${next}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.rows)) {
        setRows(data.rows);
        setHasMore(!!data.hasMore);
        setPage(next);
        if (typeof window !== "undefined") document.getElementById("order-history-top")?.scrollIntoView({ block: "nearest" });
      }
    } catch { /* keep current page on network error */ }
    finally { setLoading(false); }
  }

  if (rows.length === 0) return null;

  return (
    <div id="order-history-top" className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <ul className={`divide-y divide-gray-100 transition-opacity ${loading ? "opacity-60" : ""}`}>
        {rows.map((o) => (
          <li key={o.id}>
            <Link href={`/order/${slug}/status/${o.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-gray-50 transition">
              <div className="min-w-0">
                <div className="text-sm font-bold text-gray-900">#{o.orderNumber}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  {new Date(o.createdAt).toLocaleString(undefined, {
                    month: "short", day: "numeric", year: "numeric",
                    hour: "numeric", minute: "2-digit", ...tzOpts,
                  })}
                  {" · "}{o.type}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-bold text-gray-900">{formatCurrency(o.total, currency)}</div>
                <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mt-0.5">{o.status}</div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <AccountPager page={page} hasMore={hasMore} loading={loading} onPrev={() => go(page - 1)} onNext={() => go(page + 1)} primary={primary} />
    </div>
  );
}
