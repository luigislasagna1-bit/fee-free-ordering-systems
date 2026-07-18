"use client";
import { useEffect, useState } from "react";
import { Loader2, MapPin, RefreshCw, Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatCurrency, PLATFORM_CURRENCY } from "@/lib/utils";
import { DetailOverlay } from "./shared/DetailOverlay";
import { DeliveryStatusChip } from "./shared/DeliveryStatusChip";
import { StageTimeline, type TimelineNode } from "./shared/StageTimeline";

/**
 * Restaurant Delivery Detail Overlay (v1.1 Phase 7, plan §4.3).
 *
 * Opens from both the Dispatch tab active rows (non-terminal) and the
 * Deliveries tab In-progress + Completed rows (all statuses). Fetches
 * GET /api/admin/feefree-delivery/deliveries/[id] — one round trip on open;
 * the shell keeps `detailId` state so the overlay stays mounted while the
 * request is in flight (shows a spinner).
 *
 * Contains:
 *  - Status chip (all statuses via admin.feefreeDelivery st_* keys)
 *  - Stage timeline: Assigned → Accepted → Heading to store → Picked up
 *    → terminal node (Delivered/Failed/Returned/Cancelled)
 *  - Driver card: name + ratingPct star, "last seen {n} min ago" from
 *    denormalized Driver.lastLocationAt (NO phone — Phase 8).
 *  - Order card: customerName, street + city, total + tip
 *  - Billing line: platformFeeCents + Settled/Unsettled flag
 *  - Rate-this-driver: PLACEHOLDER only this phase — no write path
 *    (Phase 8 ships the upsert). The block is absent if driver is null.
 *
 * Money split (plan §8 / the Fabrizio euro/$ rule):
 *   order money → formatCurrency(amount, detail.order.currency)
 *   platform fee → formatCurrency(billingCents/100, PLATFORM_CURRENCY)
 */

// ── Types ────────────────────────────────────────────────────────────────────

type DeliveryDetail = {
  id: string;
  status: string;
  assignedAt: string | null;
  acceptedAt: string | null;
  startedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  failedAt: string | null;
  returnedAt: string | null;
  completedAt: string | null;
  driver: {
    name: string;
    ratingPct: number | null;
    lastLocationAt: string | null;
  } | null;
  order: {
    orderNumber: string;
    customerName: string;
    deliveryStreet: string | null;
    deliveryCity: string | null;
    total: number;
    tip: number;
    currency: string;
  };
  billingCents: number | null;
  billingCurrency: string;
  settled: boolean;
};

// ── Timeline builder ─────────────────────────────────────────────────────────
//
// 5-node restaurant ladder: Assigned → Accepted → Heading to store →
// Picked up → terminal node. Rose for failed/returned/cancelled.
// Null timestamps are skipped by StageTimeline (node not reached yet).
// Cancelled rows carry their stamp in failedAt (Phase 2 write).

function buildTimelineNodes(
  detail: DeliveryDetail,
  tShared: ReturnType<typeof useTranslations<"feefreeShared">>,
  tAdmin: ReturnType<typeof useTranslations<"admin.feefreeDelivery">>,
): TimelineNode[] {
  const nodes: TimelineNode[] = [
    {
      key: "assigned",
      label: tShared("timelineAssigned"),
      at: detail.assignedAt,
    },
    {
      key: "accepted",
      label: tShared("timelineAccepted"),
      at: detail.acceptedAt,
    },
    {
      key: "started",
      label: tShared("timelineStarted"),
      at: detail.startedAt,
    },
    {
      key: "pickedUp",
      label: tShared("timelinePickedUp"),
      at: detail.pickedUpAt,
    },
  ];

  if (detail.status === "delivered") {
    nodes.push({
      key: "delivered",
      label: tShared("timelineDelivered"),
      at: detail.deliveredAt ?? detail.completedAt,
      tone: "ok",
    });
  } else if (detail.status === "failed") {
    nodes.push({
      key: "failed",
      label: tShared("timelineFailed"),
      at: detail.failedAt ?? detail.completedAt,
      tone: "fail",
    });
  } else if (detail.status === "returned") {
    nodes.push({
      key: "returned",
      label: tShared("timelineReturned"),
      at: detail.returnedAt ?? detail.completedAt,
      tone: "fail",
    });
  } else if (detail.status === "cancelled") {
    // Cancelled rows write their stamp into failedAt (Phase 2 status route).
    nodes.push({
      key: "cancelled",
      label: tAdmin("st_cancelled"),
      at: detail.failedAt ?? detail.completedAt,
      tone: "fail",
    });
  }
  // Live statuses (assigned/accepted/started/picked_up etc.) have no
  // terminal node yet — StageTimeline renders however far they've gotten.

  return nodes;
}

// ── Component ────────────────────────────────────────────────────────────────

export function RestaurantDeliveryDetailOverlay({
  assignmentId,
  onClose,
}: {
  /** The DeliveryAssignment id to load. */
  assignmentId: string;
  onClose: () => void;
}) {
  const tShared = useTranslations("feefreeShared");
  const tAdmin = useTranslations("admin.feefreeDelivery");
  const tApp = useTranslations("feefreeApp");
  const tCommon = useTranslations("common");
  // driver.* has tip/refresh translated ×38 (common.tip does not exist —
  // tCommon("tip") rendered the raw key path "common.tip").
  const tDriver = useTranslations("driver");

  const [detail, setDetail] = useState<DeliveryDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  async function load() {
    setLoading(true);
    setFailed(false);
    try {
      const res = await fetch(
        `/api/admin/feefree-delivery/deliveries/${encodeURIComponent(assignmentId)}`,
        { cache: "no-store" },
      );
      if (res.status === 401) {
        window.location.assign("/driver/login");
        return;
      }
      if (!res.ok) {
        setFailed(true);
        return;
      }
      setDetail(await res.json());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignmentId]);

  // Title: "#<orderNumber>" once loaded, "…" while loading.
  const title = detail ? `#${detail.order.orderNumber}` : "…";
  const subtitle = detail
    ? detail.order.customerName
    : undefined;

  return (
    <DetailOverlay title={title} subtitle={subtitle} onClose={onClose}>
      {loading && !detail && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        </div>
      )}

      {failed && !detail && (
        <div className="py-10 text-center space-y-4">
          <p className="text-sm text-gray-400">{tApp("deliveryLoadFailed")}</p>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl"
          >
            <RefreshCw className="w-4 h-4" />
            {tDriver("refresh")}
          </button>
        </div>
      )}

      {detail && (
        <>
          {/* Status chip */}
          <div className="flex items-center gap-2">
            <DeliveryStatusChip status={detail.status} />
          </div>

          {/* Stage timeline */}
          <section className="bg-gray-800 border border-gray-700 rounded-2xl p-4">
            <StageTimeline
              nodes={buildTimelineNodes(detail, tShared, tAdmin)}
            />
          </section>

          {/* Driver card — name + ratingPct + "last seen N min ago".
              Phone is NOT shown here — Phase 8 adds the call button.
              Absent when no driver was ever assigned (driver === null). */}
          {detail.driver && (
            <section className="bg-gray-800 border border-gray-700 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold text-sm text-white">
                  {detail.driver.name}
                </div>
                {detail.driver.ratingPct != null && (
                  <div className="inline-flex items-center gap-1 text-amber-400 text-sm font-semibold">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    {Math.round(detail.driver.ratingPct)}%
                  </div>
                )}
              </div>
              {detail.driver.lastLocationAt != null && (() => {
                // Clamp at 0 — client/server clock skew can put a fresh ping
                // a few seconds in the future, which floored to "-1 min ago".
                const minsAgo = Math.max(
                  0,
                  Math.floor(
                    (Date.now() -
                      new Date(detail.driver.lastLocationAt!).getTime()) /
                      60_000,
                  ),
                );
                return (
                  <div className="text-xs text-gray-500">
                    {tApp("lastSeenAgo", { n: minsAgo })}
                  </div>
                );
              })()}
            </section>
          )}

          {/* Order card — customerName, address, total + tip.
              Money: formatCurrency(amount, detail.order.currency) — the
              restaurant's own currency (Fabrizio euro/$ rule, plan §8). */}
          <section className="bg-gray-800 border border-gray-700 rounded-2xl p-4 space-y-2">
            <div className="text-sm font-semibold text-white">
              {detail.order.customerName}
            </div>
            {(detail.order.deliveryStreet || detail.order.deliveryCity) && (
              <div className="flex items-start gap-2 text-sm text-gray-400">
                <MapPin className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                <div>
                  {detail.order.deliveryStreet && (
                    <div>{detail.order.deliveryStreet}</div>
                  )}
                  {detail.order.deliveryCity && (
                    <div>{detail.order.deliveryCity}</div>
                  )}
                </div>
              </div>
            )}
            <div className="flex items-center justify-between text-sm pt-1">
              <span className="text-gray-400">{tCommon("total")}</span>
              <span className="font-bold text-emerald-400">
                {formatCurrency(detail.order.total, detail.order.currency)}
              </span>
            </div>
            {detail.order.tip > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">{tDriver("tip")}</span>
                <span className="font-semibold text-amber-400">
                  {formatCurrency(detail.order.tip, detail.order.currency)}
                </span>
              </div>
            )}
          </section>

          {/* Billing line — platformFeeCents in PLATFORM_CURRENCY + settlement
              state. Only shown when billingCents is set (non-null).
              Money: formatCurrency(billingCents/100, PLATFORM_CURRENCY) —
              settlement money is always platform money, never restaurant
              money (plan §8 currency split). */}
          {detail.billingCents != null && (
            <section className="bg-gray-800 border border-gray-700 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">{tApp("billingLine")}</span>
                <span className="font-semibold text-white">
                  {formatCurrency(
                    detail.billingCents / 100,
                    PLATFORM_CURRENCY,
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span />
                <span
                  className={`text-[11px] font-semibold ${
                    detail.settled
                      ? "text-emerald-400"
                      : "text-amber-400"
                  }`}
                >
                  {detail.settled ? tApp("settled") : tApp("unsettled")}
                </span>
              </div>
            </section>
          )}

          {/* Rate this driver — PLACEHOLDER only this phase (Phase 8 ships
              the feedback POST + upsert). Shown only when a driver exists so
              there is someone to rate. The block is visually greyed out to
              communicate "not yet available" without a dead submit button. */}
          {detail.driver && (
            <section className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-4 text-center">
              <p className="text-xs text-gray-600">{tApp("rateComingSoon")}</p>
            </section>
          )}
        </>
      )}
    </DetailOverlay>
  );
}
