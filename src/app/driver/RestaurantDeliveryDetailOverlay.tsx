"use client";
import { useEffect, useState } from "react";
import { Loader2, MapPin, Phone, RefreshCw, Star } from "lucide-react";
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
 *  - Driver card: name + ratingPct star, tap-to-call phone (Phase 8),
 *    "last seen {n} min ago" from denormalized Driver.lastLocationAt
 *  - Order card: customerName, street + city, total + tip
 *  - Billing line: platformFeeCents + Settled/Unsettled flag
 *  - Rate-this-driver (Phase 8): 5 tappable stars + optional comment →
 *    POST .../feedback (upsert — re-submitting EDITS the same rating).
 *    Rendered only when canRate (terminal + driver, server-computed);
 *    prefilled from myFeedback so an existing rating reads as editable.
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
    phone: string | null;
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
  /** Terminal + driver present — server-computed gate for the rate block. */
  canRate: boolean;
  /** This restaurant's existing rating for this delivery (prefill). */
  myFeedback: { stars: number; comment: string | null } | null;
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

          {/* Driver card — name + ratingPct + tap-to-call + "last seen N min
              ago". Absent when no driver was ever assigned (driver === null). */}
          {detail.driver && (
            <section className="bg-gray-800 border border-gray-700 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold text-sm text-white">
                  {detail.driver.name}
                </div>
                <div className="flex items-center gap-2.5">
                  {detail.driver.ratingPct != null && (
                    <div className="inline-flex items-center gap-1 text-amber-400 text-sm font-semibold">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      {Math.round(detail.driver.ratingPct)}%
                    </div>
                  )}
                  {detail.driver.phone && (
                    <a
                      href={`tel:${detail.driver.phone}`}
                      aria-label={tApp("callDriver")}
                      title={tApp("callDriver")}
                      className="w-9 h-9 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 flex items-center justify-center"
                    >
                      <Phone className="w-4 h-4" />
                    </a>
                  )}
                </div>
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

          {/* Rate this driver (Phase 8) — only when terminal + driver
              (server-computed canRate). key= remounts the block when the
              overlay is reused for a different assignment, so prefill state
              never bleeds across deliveries. */}
          {detail.canRate && detail.driver && (
            <RateDriverSection
              key={detail.id}
              assignmentId={detail.id}
              initial={detail.myFeedback}
            />
          )}
        </>
      )}
    </DetailOverlay>
  );
}

// ── Rate this driver ─────────────────────────────────────────────────────────
//
// POST /api/admin/feefree-delivery/feedback — upsert on
// [assignmentId, source="restaurant"], so re-submitting edits the same row
// (one restaurant rating per delivery, ever). driverId is derived
// server-side from the assignment; the client only ever sends
// { assignmentId, stars, comment }.

const MAX_COMMENT_LEN = 500;

function RateDriverSection({
  assignmentId,
  initial,
}: {
  assignmentId: string;
  initial: { stars: number; comment: string | null } | null;
}) {
  const tApp = useTranslations("feefreeApp");

  const [stars, setStars] = useState(initial?.stars ?? 0);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  // Whether a rating already exists server-side (submit reads as "update").
  const [hasExisting, setHasExisting] = useState(initial != null);

  async function submit() {
    if (stars < 1 || saving) return;
    setSaving(true);
    setSaved(false);
    setError(false);
    try {
      const res = await fetch("/api/admin/feefree-delivery/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId,
          stars,
          comment: comment.trim() || null,
        }),
      });
      if (res.status === 401) {
        window.location.assign("/driver/login");
        return;
      }
      if (!res.ok) {
        setError(true);
        return;
      }
      setSaved(true);
      setHasExisting(true);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bg-gray-800 border border-gray-700 rounded-2xl p-4 space-y-3">
      <h3 className="text-sm font-semibold text-white">
        {tApp("rateDriver")}
      </h3>
      <div className="flex items-center justify-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => {
              setStars(n);
              // A new pick invalidates the previous "saved" confirmation.
              setSaved(false);
            }}
            aria-label={tApp("rateStarsAria", { n })}
            aria-pressed={n <= stars}
            className="p-1"
          >
            <Star
              className={`w-8 h-8 transition-colors ${
                n <= stars
                  ? "fill-amber-400 text-amber-400"
                  : "text-gray-600"
              }`}
            />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => {
          setComment(e.target.value.slice(0, MAX_COMMENT_LEN));
          setSaved(false);
        }}
        maxLength={MAX_COMMENT_LEN}
        rows={2}
        placeholder={tApp("rateCommentPlaceholder")}
        className="w-full bg-gray-900 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500 resize-none"
      />
      <button
        type="button"
        onClick={submit}
        disabled={stars < 1 || saving}
        className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:hover:bg-emerald-600 text-white text-sm font-semibold py-2.5 rounded-xl"
      >
        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
        {hasExisting ? tApp("rateUpdate") : tApp("rateSubmit")}
      </button>
      {saved && (
        <p className="text-xs text-emerald-400 text-center">
          {tApp("rateSaved")}
        </p>
      )}
      {error && (
        <p className="text-xs text-rose-400 text-center">
          {tApp("rateFailed")}
        </p>
      )}
    </section>
  );
}
