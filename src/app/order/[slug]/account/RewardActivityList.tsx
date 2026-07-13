"use client";
import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/utils";
import { AccountPager } from "./AccountPager";

export type RewardRow = { id: string; amount: number; reason: string; createdAt: string; orderId: string | null };

/**
 * Reward-wallet activity list with Prev/Next pagination. Page 1 is server-
 * rendered (passed as initial props — no loading flash); pages 2+ are fetched
 * from /api/order/[slug]/account/history. All row rendering (reason labels,
 * order links, dates) lives here so it's identical across every page. Replaces
 * the old fixed 20-row scroll. Luigi 2026-07-13.
 */
export function RewardActivityList({
  slug, currency, timezone, initialRows, initialOrderNumbers, initialHasMore,
}: {
  slug: string;
  currency: string;
  timezone: string | null;
  initialRows: RewardRow[];
  initialOrderNumbers: Record<string, string>;
  initialHasMore: boolean;
}) {
  const t = useTranslations("customer.accountPage");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<RewardRow[]>(initialRows);
  const [orderNumbers, setOrderNumbers] = useState<Record<string, string>>(initialOrderNumbers);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);

  const tzOpts = timezone ? { timeZone: timezone } : {};
  const fmtDate = (d: string) => new Date(d).toLocaleDateString(undefined, tzOpts);

  async function go(next: number) {
    if (loading || next < 1) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/order/${slug}/account/history?tab=reward&page=${next}`);
      const data = await res.json();
      if (res.ok && Array.isArray(data.rows)) {
        setRows(data.rows);
        setOrderNumbers(data.orderNumbers ?? {});
        setHasMore(!!data.hasMore);
        setPage(next);
        // Keep the list top in view when the page changes.
        if (typeof window !== "undefined") document.getElementById("reward-activity-top")?.scrollIntoView({ block: "nearest" });
      }
    } catch { /* keep current page on network error */ }
    finally { setLoading(false); }
  }

  if (rows.length === 0) return null;

  return (
    <div id="reward-activity-top">
      <ul className={`divide-y divide-gray-100 px-6 py-2 transition-opacity ${loading ? "opacity-60" : ""}`}>
        {rows.map((l) => {
          // "earn:signup:<id>" → Sign-up bonus (no order); "promo:<id>" → its
          // own label so a raw promo id never leaks; else the reason prefix.
          const baseReason = l.reason.startsWith("earn:signup:") ? "signup_bonus"
            : l.reason.startsWith("promo:") ? "promo"
            : l.reason.split(":")[0];
          const reasonLabel = ["earn", "grant", "spend", "release", "adjust", "signup_bonus", "expire", "refund", "reverse", "promo"].includes(baseReason)
            ? t(`reward.reason.${baseReason}`)
            : l.reason;
          const orderNumber = l.orderId ? orderNumbers[l.orderId] : undefined;
          return (
            <li key={l.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-gray-600">
                {reasonLabel}
                {orderNumber && l.orderId && (
                  <>
                    {" "}
                    <Link href={`/order/${slug}/status/${l.orderId}`} className="text-emerald-600 hover:underline font-medium">
                      {t("reward.orderRef", { number: orderNumber })}
                    </Link>
                  </>
                )}
                <span className="text-gray-400"> · {fmtDate(l.createdAt)}</span>
              </span>
              <span className={l.amount >= 0 ? "text-emerald-600 font-medium" : "text-gray-700 font-medium"}>
                {l.amount >= 0 ? "+" : "−"} {formatCurrency(Math.abs(l.amount), currency)}
              </span>
            </li>
          );
        })}
      </ul>
      <AccountPager page={page} hasMore={hasMore} loading={loading} onPrev={() => go(page - 1)} onNext={() => go(page + 1)} />
    </div>
  );
}
