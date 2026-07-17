"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { History, Loader2, MapPin, RefreshCw, Star, Store } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatCurrency, PLATFORM_CURRENCY } from "@/lib/utils";
import { DateGroupedList } from "./shared/DateGroupedList";
import { DetailOverlay } from "./shared/DetailOverlay";
import { StageTimeline, type TimelineNode } from "./shared/StageTimeline";
import { TerminalStatusChip } from "./shared/TerminalStatusChip";

/**
 * Driver History tab (v1.1 plan §3.3): day-grouped keyset list of this
 * driver's terminal deliveries (delivered | failed | returned — cancelled is
 * deliberately excluded, see the /api/driver/history header) + a full-screen
 * detail overlay rendered from the ALREADY-FETCHED row — zero extra round
 * trips, no detail endpoint exists.
 *
 * Same activation contract as DriverProfile (5a0d9860 gate finding): the
 * shell keeps this mounted forever and CSS-hides it, so a mount-only fetch
 * would go stale — refetch (page 1) EVERY time the tab becomes active. One
 * indexed keyset query per tab-tap is cheap; NO polling — the 8s queue poll
 * and 30s heartbeat in DriverQueue stay the app's only intervals.
 *
 * Money: every order amount renders via formatCurrency(amount, row.currency)
 * — the per-row restaurant currency, never a hardcoded usd() (the Fabrizio
 * euro/$ bug class). The frozen platformFeeCents is platform billing money →
 * PLATFORM_CURRENCY (and the copy never implies driver payout, plan §9).
 *
 * Distance is the store→customer straight line, labeled with the
 * common.kmFromStore convention — NEVER "trip distance" (plan §3.3: drivers
 * comparing odometers would file it as a bug). City only, never the street
 * address post-delivery; null city renders nothing.
 */

type FeedbackRow = { source: string; stars: number; comment: string | null; createdAt: string };

type HistoryRow = {
  id: string;
  status: string;
  orderNumber: string;
  restaurantName: string;
  currency: string;
  total: number;
  tip: number;
  platformFeeCents: number | null;
  city: string | null;
  km: number | null;
  late: boolean;
  completedAt: string;
  acceptedAt: string | null;
  startedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  returnedAt: string | null;
  feedback: FeedbackRow[];
};

export function DriverHistory({ active = true }: { active?: boolean }) {
  const t = useTranslations("driver");
  const tShared = useTranslations("feefreeShared");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [detail, setDetail] = useState<HistoryRow | null>(null);
  // Bumps on every fresh (page-1) load so an in-flight "Load more" from the
  // previous list can't append onto the reloaded one.
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch("/api/driver/history", { cache: "no-store" });
      if (res.status === 401) {
        // Same superseded-session rule as every other driver surface.
        window.location.assign("/driver/login");
        return;
      }
      if (!res.ok) {
        if (seq === seqRef.current) setFailed(true);
        return;
      }
      const data = await res.json();
      if (seq !== seqRef.current) return;
      if (Array.isArray(data?.rows)) {
        setRows(data.rows);
        setNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
      } else {
        setFailed(true);
      }
    } catch {
      if (seq === seqRef.current) setFailed(true);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    const seq = seqRef.current;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/driver/history?cursor=${encodeURIComponent(nextCursor)}`, { cache: "no-store" });
      if (res.status === 401) {
        window.location.assign("/driver/login");
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      if (seq !== seqRef.current) return; // a fresh reload replaced the list meanwhile
      if (Array.isArray(data?.rows)) {
        setRows((prev) => {
          // Keyset pages can overlap when a delivery completes between
          // fetches — dedupe by id so React keys stay unique.
          const seen = new Set(prev.map((r) => r.id));
          return [...prev, ...(data.rows as HistoryRow[]).filter((r) => !seen.has(r.id))];
        });
        setNextCursor(typeof data.nextCursor === "string" ? data.nextCursor : null);
      }
    } catch {
      // Leave the current list + cursor in place; the button retries.
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore]);

  // Refetch page 1 EVERY time the tab becomes active, not just on first
  // mount — the shell keeps this component mounted forever, and a mount-only
  // fetch showed stale data on Profile until re-login (2026-07-17 gate).
  useEffect(() => {
    if (active) load();
  }, [active, load]);

  if (loading && rows.length === 0) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  if (failed && rows.length === 0) {
    return (
      <div className="px-4 py-10 max-w-lg mx-auto text-center space-y-4">
        <p className="text-sm text-gray-400">{t("historyLoadFailed")}</p>
        <button
          type="button"
          onClick={() => load()}
          className="inline-flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl"
        >
          <RefreshCw className="w-4 h-4" /> {t("refresh")}
        </button>
      </div>
    );
  }

  return (
    <main className="px-4 py-4 pb-24 max-w-lg mx-auto">
      {/* Manual refresh (no polling on this tab) */}
      <div className="flex justify-end mb-3">
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="text-gray-400 hover:text-white disabled:opacity-50"
          title={t("refresh")}
          aria-label={t("refresh")}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-10 text-gray-500">
          <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{t("historyEmpty")}</p>
        </div>
      ) : (
        <DateGroupedList
          items={rows}
          getDate={(r) => r.completedAt}
          getKey={(r) => r.id}
          hasMore={nextCursor != null}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          renderItem={(r) => (
            <button
              type="button"
              onClick={() => setDetail(r)}
              className="w-full text-left bg-gray-800 border border-gray-700 hover:border-gray-600 rounded-2xl p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-bold truncate">
                    #{r.orderNumber} <span className="text-gray-500 font-normal">·</span> {r.restaurantName}
                  </div>
                  <div className="mt-1.5 flex items-center flex-wrap gap-x-1.5 gap-y-1 text-[11px] text-gray-400">
                    <TerminalStatusChip status={r.status} />
                    <span>{new Date(r.completedAt).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}</span>
                    {r.km != null && <span className="text-gray-500">· {tCommon("kmFromStore", { km: r.km })}</span>}
                    {r.city && <span className="text-gray-500">· {r.city}</span>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-sm font-bold text-emerald-400">{formatCurrency(r.total, r.currency)}</div>
                  {r.tip > 0 && (
                    <div className="text-[11px] text-amber-400">
                      {t("tip")} {formatCurrency(r.tip, r.currency)}
                    </div>
                  )}
                </div>
              </div>
            </button>
          )}
        />
      )}

      {/* Detail — full-screen overlay from the already-fetched row (zero
          extra round trips; no detail endpoint exists). */}
      {detail && (
        <DetailOverlay
          title={`#${detail.orderNumber}`}
          subtitle={detail.restaurantName}
          onClose={() => setDetail(null)}
        >
          {/* Status + punctuality. The On time / Late badge renders for
              DELIVERED rows only — it mirrors the lateCount rule (only a
              delivered run bumps it), and "On time" next to a Failed chip
              would read as a contradiction. */}
          <div className="flex items-center gap-2">
            <TerminalStatusChip status={detail.status} />
            {detail.status === "delivered" && (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  detail.late ? "bg-amber-500/15 text-amber-400" : "bg-emerald-500/15 text-emerald-400"
                }`}
              >
                {detail.late ? tShared("lateBadge") : tShared("onTimeBadge")}
              </span>
            )}
          </div>

          {/* Stage timeline with deltas */}
          <section className="bg-gray-800 border border-gray-700 rounded-2xl p-4">
            <StageTimeline nodes={timelineNodes(detail, tShared)} />
          </section>

          {/* Money — order money in the row's currency; the frozen platform
              fee is billing money (PLATFORM_CURRENCY), never driver pay. */}
          <section className="bg-gray-800 border border-gray-700 rounded-2xl p-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-400">{tCommon("total")}</span>
              <span className="font-bold text-emerald-400">{formatCurrency(detail.total, detail.currency)}</span>
            </div>
            {detail.tip > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">{t("tip")}</span>
                <span className="font-semibold text-amber-400">{formatCurrency(detail.tip, detail.currency)}</span>
              </div>
            )}
            {detail.platformFeeCents != null && (
              <div className="flex items-center justify-between">
                <span className="text-gray-400">{tShared("deliveryFee")}</span>
                <span className="font-semibold text-gray-300">
                  {formatCurrency(detail.platformFeeCents / 100, PLATFORM_CURRENCY)}
                </span>
              </div>
            )}
          </section>

          {/* Route — store → customer CITY (never the street address). */}
          <section className="bg-gray-800 border border-gray-700 rounded-2xl p-4 space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <Store className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
              <div className="text-gray-300 font-medium min-w-0 truncate">{detail.restaurantName}</div>
            </div>
            {(detail.city || detail.km != null) && (
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  {detail.city && <div className="text-gray-300 font-medium">{detail.city}</div>}
                  {detail.km != null && (
                    <div className="text-xs text-gray-500">{tCommon("kmFromStore", { km: detail.km })}</div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Rating received — gracefully empty until the write paths ship. */}
          <section className="bg-gray-800 border border-gray-700 rounded-2xl p-4 space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">{t("ratingReceivedTitle")}</h2>
            {detail.feedback.length === 0 ? (
              <p className="text-sm text-gray-500">{t("noRatingYet")}</p>
            ) : (
              detail.feedback.map((f, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex items-center">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={`w-4 h-4 ${n <= f.stars ? "fill-amber-400 text-amber-400" : "text-gray-600"}`}
                      />
                    ))}
                    <span className="ml-2 text-xs text-gray-500">
                      {new Date(f.createdAt).toLocaleDateString(locale)}
                    </span>
                  </div>
                  {f.comment && <p className="text-sm text-gray-300">{f.comment}</p>}
                </div>
              ))
            )}
          </section>
        </DetailOverlay>
      )}
    </main>
  );
}

/**
 * Build the timeline for a history row: the forward stages that actually
 * happened, then ONE terminal node — emerald for delivered, rose for
 * failed/returned (plan §3.3). Terminal stamp falls back to completedAt
 * (they are written together, but belt-and-suspenders for backfilled rows).
 */
function timelineNodes(row: HistoryRow, tShared: ReturnType<typeof useTranslations>): TimelineNode[] {
  const nodes: TimelineNode[] = [
    { key: "accepted", label: tShared("timelineAccepted"), at: row.acceptedAt },
    { key: "started", label: tShared("timelineStarted"), at: row.startedAt },
    { key: "pickedUp", label: tShared("timelinePickedUp"), at: row.pickedUpAt },
  ];
  if (row.status === "delivered") {
    nodes.push({ key: "delivered", label: tShared("timelineDelivered"), at: row.deliveredAt ?? row.completedAt, tone: "ok" });
  } else if (row.status === "failed") {
    nodes.push({ key: "failed", label: tShared("timelineFailed"), at: row.failedAt ?? row.completedAt, tone: "fail" });
  } else if (row.status === "returned") {
    nodes.push({ key: "returned", label: tShared("timelineReturned"), at: row.returnedAt ?? row.completedAt, tone: "fail" });
  }
  return nodes;
}
