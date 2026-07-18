"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Package, RefreshCw, Star } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/utils";
import { DateGroupedList } from "./shared/DateGroupedList";
import { DeliveryStatusChip } from "./shared/DeliveryStatusChip";

/**
 * Restaurant Deliveries tab (v1.1 Phase 7, plan §4.3).
 *
 * Two segments, separated by a pill/segment switcher:
 *
 * (a) IN PROGRESS — data from the shared ops context (zero extra queries;
 *     the 10 s shell poller already has all non-terminal assignments incl.
 *     driver name + ratingPct). Each row tap → detail overlay.
 *
 * (b) COMPLETED — keyset list from GET .../deliveries (day-grouped via the
 *     shared DateGroupedList; Load more; tap a row → detail overlay).
 *
 * The ops context is imported here as a lazy import from RestaurantApp to
 * avoid a circular module dependency; the Context value is passed via the
 * `opsData` prop instead (parent reads from context and passes it down).
 *
 * No own polling. The shell's 10 s interval is the only interval in the
 * whole RestaurantApp (plan §4.1 — tabs never spin their own intervals).
 * The completed list has a manual-refresh button.
 *
 * Activation contract (same as DriverHistory, gate finding 5a0d9860):
 * refetch completed page-1 EVERY time the tab becomes active, because the
 * shell mounts this component forever (CSS-hidden when not active) and a
 * mount-only fetch would go stale.
 */

// ── Segment type ─────────────────────────────────────────────────────────────

type Segment = "in_progress" | "completed";

// ── Completed list row type ──────────────────────────────────────────────────

type CompletedRow = {
  id: string;
  status: string;
  completedAt: string;
  order: {
    orderNumber: string;
    customerName: string;
    deliveryStreet: string | null;
    deliveryCity: string | null;
    total: number;
    tip: number;
    currency: string;
  };
  driver: { name: string; ratingPct: number | null } | null;
};

// ── Active delivery type (mirrors OpsPayload.active) ─────────────────────────

type ActiveDelivery = {
  id: string;
  status: string;
  driver: { name: string; ratingPct: number | null } | null;
  order: {
    orderNumber: string;
    customerName: string;
    deliveryLat: number | null;
    deliveryLng: number | null;
  };
};

// ── Component ────────────────────────────────────────────────────────────────

export function RestaurantDeliveriesTab({
  active = true,
  activeDeliveries,
  activeLoading,
  onOpenDetail,
}: {
  /** CSS-visibility gate — the parent hides this tab via the `hidden` class. */
  active?: boolean;
  /**
   * Non-terminal deliveries from the ops context (the shell's 10 s poller).
   * Passed as a prop so this component avoids a direct context dependency on
   * OpsCtx (which lives in RestaurantApp.tsx — would be a circular import).
   *
   * `null` = the ops payload has not arrived yet (first fetch in flight, or
   * it failed). Discriminating on null — not on activeLoading alone — keeps
   * the In-progress segment from flashing a definitive "no deliveries in
   * progress" empty state before the first ops response lands.
   */
  activeDeliveries: ActiveDelivery[] | null;
  /** True while the shell's ops fetch is in flight. */
  activeLoading: boolean;
  /** Called when a row is tapped; the shell renders the overlay. */
  onOpenDetail: (id: string) => void;
}) {
  const tApp = useTranslations("feefreeApp");
  // driver.refresh is translated ×38 and already labels the sibling History
  // tab's refresh/retry controls — reuse it here for the same controls.
  const tDriver = useTranslations("driver");
  const locale = useLocale();

  const [segment, setSegment] = useState<Segment>("in_progress");
  const [completedRows, setCompletedRows] = useState<CompletedRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [completedLoading, setCompletedLoading] = useState(true);
  const [completedLoadingMore, setCompletedLoadingMore] = useState(false);
  const [completedFailed, setCompletedFailed] = useState(false);
  // Bumps on each fresh (page-1) load so in-flight "Load more" requests
  // from the previous list can't append onto the reloaded one.
  const seqRef = useRef(0);

  const loadCompleted = useCallback(async () => {
    const seq = ++seqRef.current;
    setCompletedLoading(true);
    setCompletedFailed(false);
    try {
      const res = await fetch("/api/admin/feefree-delivery/deliveries", {
        cache: "no-store",
      });
      if (res.status === 401) {
        window.location.assign("/driver/login");
        return;
      }
      if (!res.ok) {
        if (seq === seqRef.current) setCompletedFailed(true);
        return;
      }
      const data = await res.json();
      if (seq !== seqRef.current) return;
      if (Array.isArray(data?.rows)) {
        setCompletedRows(data.rows);
        setNextCursor(
          typeof data.nextCursor === "string" ? data.nextCursor : null,
        );
      } else {
        setCompletedFailed(true);
      }
    } catch {
      if (seq === seqRef.current) setCompletedFailed(true);
    } finally {
      if (seq === seqRef.current) setCompletedLoading(false);
    }
  }, []);

  const loadMoreCompleted = useCallback(async () => {
    if (!nextCursor || completedLoadingMore) return;
    const seq = seqRef.current;
    setCompletedLoadingMore(true);
    try {
      const res = await fetch(
        `/api/admin/feefree-delivery/deliveries?cursor=${encodeURIComponent(nextCursor)}`,
        { cache: "no-store" },
      );
      if (res.status === 401) {
        window.location.assign("/driver/login");
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      if (seq !== seqRef.current) return;
      if (Array.isArray(data?.rows)) {
        setCompletedRows((prev) => {
          // Dedupe by id — keyset pages can overlap when a delivery
          // completes between fetches.
          const seen = new Set(prev.map((r) => r.id));
          return [
            ...prev,
            ...(data.rows as CompletedRow[]).filter((r) => !seen.has(r.id)),
          ];
        });
        setNextCursor(
          typeof data.nextCursor === "string" ? data.nextCursor : null,
        );
      }
    } catch {
      // Leave current list + cursor in place; the button retries.
    } finally {
      setCompletedLoadingMore(false);
    }
  }, [nextCursor, completedLoadingMore]);

  // Refetch completed page-1 EVERY time the tab becomes active — the shell
  // mounts this forever, so mount-only would go stale (same contract as
  // DriverHistory, gate finding 5a0d9860).
  useEffect(() => {
    if (active) loadCompleted();
  }, [active, loadCompleted]);

  return (
    <main className="px-4 py-4 pb-24 max-w-lg mx-auto space-y-4">
      {/* Segment switcher */}
      <div className="flex gap-1 bg-gray-800 rounded-xl p-1">
        {(["in_progress", "completed"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSegment(s)}
            className={`flex-1 text-sm font-semibold py-1.5 rounded-lg transition-colors ${
              segment === s
                ? "bg-gray-700 text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {s === "in_progress"
              ? tApp("deliveriesInProgress")
              : tApp("deliveriesCompleted")}
          </button>
        ))}
      </div>

      {/* ── In progress ─────────────────────────────────────────────────── */}
      {segment === "in_progress" && (
        <>
          {activeDeliveries === null ? (
            // Ops payload not here yet: spinner while the fetch is in flight,
            // load-failed copy if it failed (the shell's 10 s poller retries
            // on its own — no manual button needed). Never the definitive
            // empty state: that's reserved for a real, loaded [].
            activeLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
              </div>
            ) : (
              <div className="text-center py-10 space-y-2">
                <Package className="w-10 h-10 mx-auto text-gray-700" />
                <p className="text-sm text-gray-400">
                  {tApp("deliveriesLoadFailed")}
                </p>
              </div>
            )
          ) : activeDeliveries.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <Package className="w-10 h-10 mx-auto text-gray-700" />
              <p className="text-sm text-gray-500">
                {tApp("noInProgressDeliveries")}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeDeliveries.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => onOpenDetail(a.id)}
                  className="w-full text-left bg-gray-800 border border-gray-700 hover:border-gray-600 active:border-gray-500 rounded-xl px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-sm font-semibold text-white">
                        #{a.order.orderNumber}
                        <span className="text-gray-400 font-normal">
                          {" "}
                          · {a.order.customerName}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500">
                        {a.driver ? (
                          <span className="inline-flex items-center gap-1">
                            {a.driver.name}
                            {a.driver.ratingPct != null && (
                              <span className="inline-flex items-center gap-0.5 text-amber-400 font-semibold">
                                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                {Math.round(a.driver.ratingPct)}%
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-gray-600">—</span>
                        )}
                      </div>
                    </div>
                    <DeliveryStatusChip status={a.status} />
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Completed ───────────────────────────────────────────────────── */}
      {segment === "completed" && (
        <>
          {/* Manual refresh */}
          <div className="flex justify-end -mt-2">
            <button
              type="button"
              onClick={loadCompleted}
              disabled={completedLoading}
              className="text-gray-400 hover:text-white disabled:opacity-50"
              title={tDriver("refresh")}
              aria-label={tDriver("refresh")}
            >
              <RefreshCw
                className={`w-4 h-4 ${completedLoading ? "animate-spin" : ""}`}
              />
            </button>
          </div>

          {completedLoading && completedRows.length === 0 ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            </div>
          ) : completedFailed && completedRows.length === 0 ? (
            <div className="py-10 text-center space-y-4">
              <Package className="w-10 h-10 mx-auto text-gray-700" />
              <p className="text-sm text-gray-400">
                {tApp("deliveriesLoadFailed")}
              </p>
              <button
                type="button"
                onClick={loadCompleted}
                className="inline-flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl"
              >
                <RefreshCw className="w-4 h-4" />
                {tDriver("refresh")}
              </button>
            </div>
          ) : completedRows.length === 0 ? (
            <div className="text-center py-10 space-y-2">
              <Package className="w-10 h-10 mx-auto text-gray-700" />
              <p className="text-sm text-gray-500">
                {tApp("noCompletedDeliveries")}
              </p>
            </div>
          ) : (
            <DateGroupedList
              items={completedRows}
              getDate={(r) => r.completedAt}
              getKey={(r) => r.id}
              hasMore={nextCursor != null}
              loadingMore={completedLoadingMore}
              onLoadMore={loadMoreCompleted}
              renderItem={(r) => (
                <button
                  type="button"
                  onClick={() => onOpenDetail(r.id)}
                  className="w-full text-left bg-gray-800 border border-gray-700 hover:border-gray-600 rounded-2xl p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white truncate">
                        #{r.order.orderNumber}
                        <span className="text-gray-400 font-normal">
                          {" "}
                          · {r.order.customerName}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center flex-wrap gap-x-1.5 gap-y-1 text-[11px] text-gray-400">
                        {/* Shared restaurant-shell chip — covers `cancelled`
                            (st_cancelled ×38), which the driver-side
                            TerminalStatusChip deliberately lacks. */}
                        <DeliveryStatusChip status={r.status} />
                        <span>
                          {new Date(r.completedAt).toLocaleTimeString(locale, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                        {r.driver && (
                          <span className="text-gray-500">
                            · {r.driver.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-bold text-emerald-400">
                        {formatCurrency(r.order.total, r.order.currency)}
                      </div>
                      {r.order.tip > 0 && (
                        <div className="text-[11px] text-amber-400">
                          +{formatCurrency(r.order.tip, r.order.currency)}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              )}
            />
          )}
        </>
      )}
    </main>
  );
}
