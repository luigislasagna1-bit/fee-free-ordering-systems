"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { formatCurrency as fmtCurrency } from "@/lib/utils";
import {
  CheckCircle, Clock, ChefHat, Package, XCircle, Loader2,
  Phone, Mail, MapPin, Repeat, Printer, HelpCircle, X,
  ThumbsUp, ThumbsDown, Share2,
} from "lucide-react";
import Link from "next/link";
import { use } from "react";

// Two step sets based on the restaurant's kitchen workflow mode. The
// "simple" mode (GloriaFood-style) just has accept/reject in the kitchen —
// there's no Preparing/Ready/Complete transition. The customer status
// page should reflect that: showing Preparing→Ready→Complete steps that
// the kitchen never visibly transitions through is confusing and makes
// the order look stuck. "tracking" restaurants use the full state
// machine and see all 5 steps.
// Marketplace support email — surfaced in the "Need help?" panel for
// orders placed via the marketplace flow (viaMarketplace=true). Keep in
// sync with the support contact email used in transactional templates.
const MARKETPLACE_SUPPORT_EMAIL = "support@feefreefood.com";

export default function OrderStatusPage({ params }: { params: Promise<{ slug: string; orderId: string }> }) {
  const { slug, orderId } = use(params);
  const router = useRouter();
  const t = useTranslations("customer.orderStatus");

  const TRACKING_STEPS = [
    { key: "pending", label: t("stepPendingLabel"), icon: Clock, desc: t("stepPendingDesc") },
    { key: "accepted", label: t("stepAcceptedLabel"), icon: CheckCircle, desc: t("stepAcceptedDesc") },
    { key: "preparing", label: t("stepPreparingLabel"), icon: ChefHat, desc: t("stepPreparingDesc") },
    { key: "ready", label: t("stepReadyLabel"), icon: Package, desc: t("stepReadyDesc") },
    { key: "completed", label: t("stepCompletedLabel"), icon: CheckCircle, desc: t("stepCompletedDesc") },
  ];
  const SIMPLE_STEPS = [
    { key: "pending", label: t("stepPendingLabel"), icon: Clock, desc: t("stepPendingDesc") },
    { key: "accepted", label: t("stepSimpleAcceptedLabel"), icon: ChefHat, desc: t("stepSimpleAcceptedDesc") },
    { key: "completed", label: t("stepSimpleCompletedLabel"), icon: CheckCircle, desc: t("stepCompletedDesc") },
  ];
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reordering, setReordering] = useState(false);
  const [reorderMsg, setReorderMsg] = useState<string | null>(null);
  // Customer cancel state
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  // Rating state — loaded lazily once the order reaches `completed`.
  const [ratingScore, setRatingScore] = useState<1 | -1 | null>(null);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const [ratingSaving, setRatingSaving] = useState(false);
  // Fetch existing rating once the order is completed (idempotent —
  // re-render with the same status doesn't re-fetch).
  useEffect(() => {
    if (order?.status !== "completed") return;
    let cancelled = false;
    fetch(`/api/public/orders/${orderId}/rating`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (cancelled || !d?.rating) return;
        setRatingScore(d.rating.score);
        setRatingComment(d.rating.comment ?? "");
        setRatingSubmitted(true);
      })
      .catch(() => { /* silently ignore — UI just shows the empty rate prompt */ });
    return () => { cancelled = true; };
  }, [order?.status, orderId]);
  const submitRating = async (score: 1 | -1) => {
    setRatingSaving(true);
    setRatingScore(score);
    try {
      await fetch(`/api/public/orders/${orderId}/rating`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score, comment: ratingComment.trim() || undefined }),
      });
      setRatingSubmitted(true);
    } finally {
      setRatingSaving(false);
    }
  };

  // Live ETA countdown — ticks every second so the customer sees
  // "Ready in 7 min" → "6 min" → … → "Ready now!" without refreshing.
  // Toast/Uber/DoorDash all do this; static "Estimated ready at 6:42"
  // makes the page feel frozen by comparison.
  const [nowTick, setNowTick] = useState<number>(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const [fetchError, setFetchError] = useState<string | null>(null);
  const fetchOrder = async () => {
    try {
      const res = await fetch(`/api/orders/${orderId}`);
      if (res.ok) {
        setOrder(await res.json());
        setFetchError(null);
      } else {
        // Surface the HTTP error instead of silently rendering "Order
        // not found" — that label used to fire for both a real 404 AND
        // any 500 from the API (e.g. an invalid Prisma select), which
        // hid debug info. Now we show the status so the operator can
        // tell the two apart from the page itself.
        const body = await res.text().catch(() => "");
        setFetchError(`HTTP ${res.status}${body ? ` · ${body.slice(0, 200)}` : ""}`);
      }
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
    // Stop polling once we've reached a terminal state — no need to keep
    // hammering the API on a completed/rejected order someone reopened
    // from /account days later.
    const interval = setInterval(() => {
      setOrder((cur: any) => {
        if (cur && ["completed", "rejected", "cancelled"].includes(cur.status)) {
          clearInterval(interval);
          return cur;
        }
        fetchOrder();
        return cur;
      });
    }, 10000);
    return () => clearInterval(interval);
  }, [orderId]);

  // ── Reorder: write the order's items to the OrderingPageClient's
  //   cart-restoration query handshake (?reorder=<orderId>) and
  //   navigate. The order page picks it up, fetches the order, maps
  //   each line back to a CartItem (best-effort modifier match) and
  //   pre-fills the cart so the customer can review and check out.
  const handleReorder = useCallback(() => {
    setReordering(true);
    setReorderMsg(null);
    // Stamp a sessionStorage flag too so the destination page knows the
    // reorder was user-initiated (vs. an arbitrary URL with the param
    // bookmarked). Auto-cleared by the order page after consumption.
    try {
      sessionStorage.setItem(`ff_reorder_${slug}`, orderId);
    } catch { /* private mode — ignore, query param still works */ }
    router.push(`/order/${slug}?reorder=${encodeURIComponent(orderId)}`);
  }, [router, slug, orderId]);

  // Customer cancel — only enabled when:
  //   • order is pending (not yet accepted by kitchen)
  //   • createdAt is within the 10-minute self-cancel window
  // The server enforces both; the button is also gated on the client
  // so customers don't see it grayed out unhelpfully past the window.
  const handleCancel = useCallback(async () => {
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/public/orders/${orderId}/cancel`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Cancel failed (${res.status})`);
      }
      // Re-fetch so the cancelled state renders immediately.
      await fetchOrder();
      setShowCancelConfirm(false);
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : String(e));
    } finally {
      setCancelling(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const handlePrint = useCallback(() => {
    if (typeof window !== "undefined") window.print();
  }, []);

  // Share — Web Share API on supported browsers (mobile), copy-to-
  // clipboard fallback elsewhere. Lets a customer send the live
  // status URL to whoever's picking up the order.
  const [shareCopied, setShareCopied] = useState(false);
  const handleShare = useCallback(async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    const title = order ? `Order #${order.orderNumber} at ${order.restaurant.name}` : t("myOrder");
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      }
    } catch { /* user cancelled or clipboard denied */ }
  }, [order]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
    </div>
  );

  if (!order) return (
    <div className="min-h-screen flex flex-col items-center justify-center text-gray-500 px-4 text-center">
      <div>{t("orderNotFound")}</div>
      {fetchError && (
        <div className="text-xs text-gray-400 mt-3 max-w-md font-mono">{fetchError}</div>
      )}
    </div>
  );

  const isRejected = order.status === "rejected" || order.status === "cancelled";
  const isTerminal = isRejected || order.status === "completed";
  // A SCHEDULED order (customer picked a future time) should show that time —
  // not a "ready in ~20 min" prep countdown, which is meaningless for an order
  // placed for next week (reseller report). Once the scheduled time passes we
  // fall back to the normal countdown/ready logic. nowTick keeps it reactive.
  const scheduledForFuture =
    !!order.scheduledFor && new Date(order.scheduledFor).getTime() > nowTick;
  // Format every price label on this status page in the restaurant's
  // chosen currency. Falls back to USD if the column is unset (legacy
  // rows pre-currency-column).
  const orderCurrency: string = (order.restaurant?.currency || "usd").toLowerCase();
  const formatCurrency = (amount: number) => fmtCurrency(amount, orderCurrency);
  // Pick the step set based on the restaurant's kitchenWorkflowMode.
  // Status values not present in the chosen set (e.g. "preparing" on a
  // simple-mode restaurant — shouldn't happen, but defensive) collapse
  // onto the nearest valid step.
  const workflowMode = order.restaurant?.kitchenWorkflowMode ?? "simple";
  const statusSteps = workflowMode === "tracking" ? TRACKING_STEPS : SIMPLE_STEPS;
  // Map intermediate statuses onto the simple-mode set: "preparing"
  // and "ready" both fall into the "accepted" bucket visually.
  const effectiveStatus =
    workflowMode === "simple" && (order.status === "preparing" || order.status === "ready")
      ? "accepted"
      : order.status;
  const currentStep = statusSteps.findIndex((s) => s.key === effectiveStatus);
  // If the order originated from the marketplace, "back" should land the
  // customer on the marketplace grid (where they were browsing) rather
  // than the restaurant's standalone menu. On the marketplace domain
  // (feefreefood.com) "/" rewrites to the grid via proxy.ts; on any
  // other host "/" goes to the marketing root which still gives them a
  // way out. The restaurant-menu link is kept as a secondary CTA when
  // marketplace so customers can also reorder from the SAME restaurant
  // without bouncing through the grid.
  const cameFromMarketplace = !!order.viaMarketplace;
  const backHref = cameFromMarketplace ? "/" : `/order/${slug}`;
  const backLabel = cameFromMarketplace ? t("browseOtherRestaurantsBack") : t("backToMenu");

  // ── Promo snapshot parse ─────────────────────────────────────────
  // Same shape used by the confirmation page + receipt template.
  let appliedPromos: Array<{ name: string; type: string; discount: number; couponCode?: string }> = [];
  if (order.appliedPromos) {
    try {
      const p = JSON.parse(order.appliedPromos);
      if (Array.isArray(p)) appliedPromos = p;
    } catch { /* ignore */ }
  }
  const freeDelivery = appliedPromos.find((p) => p.type === "free_delivery");
  const savedDeliveryFee = freeDelivery ? freeDelivery.discount : 0;
  const cartDiscountTotal = appliedPromos
    .filter((p) => p.type !== "free_delivery")
    .reduce((s, p) => s + (p.discount || 0), 0)
    + ((order.couponDiscount as number | undefined) ?? 0);

  // Subject prefilled with order number so the restaurant can pull the
  // order up immediately when they open the email.
  const supportSubject = encodeURIComponent(`Question about order #${order.orderNumber}`);
  const supportBody = encodeURIComponent(
    `Hi ${order.restaurant.name},\n\nI have a question about my order #${order.orderNumber} placed ${new Date(order.createdAt).toLocaleString()}.\n\n`
  );

  return (
    <>
      {/* Print stylesheet — when the customer hits "Print receipt" we
          only want the order card on the page, not the back-link nav or
          the auto-refresh badge. */}
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .print-container { box-shadow: none !important; border: 0 !important; max-width: 100% !important; }
        }
      `}</style>

      <div className="min-h-screen bg-gray-50 p-4">
        {/* Top breadcrumb — gives the customer a clear way back to
            "All my orders" without using the browser back button.
            Hidden in print. The destinations depend on context:
              • viaMarketplace=true → marketplace account orders list
              • else (per-restaurant) → per-restaurant account dashboard
            Both pages redirect to login when no session is present,
            so it's safe to render unconditionally. */}
        <div className="no-print max-w-lg mx-auto pt-4">
          <Link
            href={
              cameFromMarketplace
                ? "/account/orders"
                : `/order/${slug}/account`
            }
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 font-medium"
          >
            <span aria-hidden="true">←</span>
            {cameFromMarketplace ? t("allMyOrders") : t("backToMyAccount")}
          </Link>
        </div>
        <div className="max-w-lg mx-auto pt-4">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">{order.restaurant.name}</h1>
            <div className="text-gray-500 mt-1">{t("orderNumber", { number: order.orderNumber })}</div>
            {!isTerminal && (
              <div className="no-print inline-block mt-2 text-sm bg-emerald-100 text-emerald-600 px-3 py-1 rounded-full font-medium">
                {t("autoRefreshes")}
              </div>
            )}
          </div>

          {isRejected ? (
            <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-8 text-center mb-6">
              <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                {order.status === "rejected" ? t("orderRejected") : t("orderCancelled")}
              </h2>
              {order.rejectionReason && <p className="text-gray-600 mb-4">{t("rejectionReason", { reason: order.rejectionReason })}</p>}
              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                <Link
                  href={cameFromMarketplace ? "/" : `/order/${slug}`}
                  className="text-emerald-500 font-medium hover:underline"
                >
                  {cameFromMarketplace ? t("browseOtherRestaurants") : t("placeNewOrder")}
                </Link>
                {cameFromMarketplace && (
                  <Link
                    href={`/order/${slug}`}
                    className="text-gray-500 text-sm hover:text-gray-700"
                  >
                    {t("tryRestaurantAgain", { name: order.restaurant.name })}
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6 print-container">
              <div className="space-y-4">
                {statusSteps.map((step, idx) => {
                  const done = idx < currentStep;
                  const active = idx === currentStep;
                  // Timestamp for this step — map each step.key to the
                  // matching Order.*At column so the customer can see
                  // exactly when each thing happened. Pending uses
                  // createdAt. Industry-standard pattern (Toast / Uber /
                  // DoorDash all show timestamps).
                  const stepTs: Date | null = (() => {
                    if (step.key === "pending" && order.createdAt) return new Date(order.createdAt);
                    if (step.key === "accepted" && order.acceptedAt) return new Date(order.acceptedAt);
                    if (step.key === "completed" && order.completedAt) return new Date(order.completedAt);
                    return null;
                  })();
                  const tsLabel = stepTs && (done || active)
                    ? stepTs.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: order.restaurant?.hoursFormat !== "24h" })
                    : null;
                  return (
                    <div key={step.key} className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${done ? "bg-green-500" : active ? "bg-emerald-500" : "bg-gray-100"}`}>
                        <step.icon className={`w-5 h-5 ${done || active ? "text-white" : "text-gray-400"}`} />
                      </div>
                      <div className="flex-1 pt-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className={`font-semibold ${active ? "text-emerald-600" : done ? "text-green-600" : "text-gray-400"}`}>{step.label}</div>
                          {tsLabel && (
                            <div className={`text-xs flex-shrink-0 tabular-nums ${active ? "text-emerald-600" : "text-gray-400"}`}>
                              {tsLabel}
                            </div>
                          )}
                        </div>
                        {(active || done) && <div className={`text-sm mt-0.5 ${active ? "text-gray-600" : "text-gray-400"}`}>{step.desc}</div>}
                      </div>
                      {done && <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-1" />}
                    </div>
                  );
                })}
              </div>

              {/* ── Rating prompt (completed orders) ──────────────
                  Toast / Uber / DoorDash / Skip / Grubhub all ask
                  "how was it" once the order completes. Thumbs-only
                  for higher completion vs 1-5 stars. Idempotent —
                  re-tapping updates the row. */}
              {order.status === "completed" && (
                <div className="no-print mt-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                  <div className="text-sm font-semibold text-emerald-900 text-center">
                    {ratingSubmitted ? t("ratingThanks") : t("ratingPrompt")}
                  </div>
                  <div className="mt-3 flex justify-center gap-3">
                    <button
                      onClick={() => submitRating(1)}
                      disabled={ratingSaving}
                      aria-label={t("thumbsUp")}
                      className={`flex items-center justify-center w-12 h-12 rounded-full border-2 transition disabled:opacity-50 ${
                        ratingScore === 1
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : "bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                      }`}
                    >
                      <ThumbsUp className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => submitRating(-1)}
                      disabled={ratingSaving}
                      aria-label={t("thumbsDown")}
                      className={`flex items-center justify-center w-12 h-12 rounded-full border-2 transition disabled:opacity-50 ${
                        ratingScore === -1
                          ? "bg-red-500 border-red-500 text-white"
                          : "bg-white border-red-200 text-red-600 hover:bg-red-50"
                      }`}
                    >
                      <ThumbsDown className="w-5 h-5" />
                    </button>
                  </div>
                  {ratingScore === -1 && (
                    <div className="mt-3">
                      <textarea
                        className="w-full border border-red-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-red-400 focus:outline-none resize-none"
                        rows={2}
                        placeholder={t("ratingCommentPlaceholder")}
                        value={ratingComment}
                        onChange={(e) => setRatingComment(e.target.value)}
                        maxLength={500}
                      />
                      <div className="text-right mt-1">
                        <button
                          onClick={() => submitRating(-1)}
                          disabled={ratingSaving}
                          className="text-xs font-semibold text-red-700 hover:text-red-800 disabled:opacity-50"
                        >
                          {ratingSaving ? t("ratingSending") : t("submitFeedback")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Live ETA countdown — ticks once per second. Shows
                  "Ready in 12 min" → "Ready in 6 min" → "Ready in <1 min"
                  → "Ready now — pickup time!" once estimatedReady passes.
                  Renders for BOTH pending and accepted states:
                    • pending = muted grey "Estimated ~X min" + "Waiting
                      for restaurant to confirm" subtitle. The estimate
                      is a soft prediction (createdAt + prep time) the
                      server stamps at order creation — matches the
                      "~20 min" the customer saw on the confirmation
                      page. UX precedent: DoorDash/Uber/Toast all show
                      an estimate immediately and tighten it on accept.
                    • accepted = bold green "Ready in ~X min" — the
                      kitchen's confirmed promise. Acceptance overwrites
                      estimatedReady server-side so the countdown stays
                      precise. */}
              {/* Scheduled order → show the chosen date/time, not a prep countdown. */}
              {scheduledForFuture && (order.status === "pending" || order.status === "accepted") && (
                <div className="mt-6 rounded-xl p-4 text-center border bg-emerald-50 border-emerald-200">
                  <div className="text-2xl font-bold text-emerald-700">
                    {new Date(order.scheduledFor).toLocaleString(undefined, {
                      weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                      hour12: order.restaurant?.hoursFormat !== "24h",
                      ...(order.restaurant?.timezone ? { timeZone: order.restaurant.timezone } : {}),
                    })}
                  </div>
                  <div className="text-xs mt-0.5 text-emerald-700/70">{t("scheduledTitle")}</div>
                </div>
              )}
              {!scheduledForFuture && order.estimatedReady && (order.status === "pending" || order.status === "accepted") && (() => {
                const target = new Date(order.estimatedReady).getTime();
                const msLeft = target - nowTick;
                const minLeft = Math.max(1, Math.round(msLeft / 60000));
                const isPending = order.status === "pending";
                const verb = order.type === "delivery" ? "delivery" : "pickup";
                let line: string;
                if (isPending) {
                  // Soft language during pending — no "Ready now!" copy
                  // because the kitchen hasn't actually started prep.
                  line = t("etaEstimated", { verb, min: minLeft });
                } else if (msLeft <= -60_000) {
                  line = order.type === "delivery" ? t("etaReadyNowDelivery") : t("etaReadyNowPickup");
                } else if (msLeft <= 60_000) {
                  line = t("etaReadyLessThan1Min");
                } else if (minLeft === 1) {
                  line = t("etaReady1Min");
                } else {
                  line = t("etaReadyNMin", { min: minLeft });
                }
                const targetLabel = new Date(target).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: order.restaurant?.hoursFormat !== "24h" });
                return (
                  <div className={`mt-6 rounded-xl p-4 text-center border ${
                    isPending
                      ? "bg-gray-50 border-gray-200"
                      : "bg-emerald-50 border-emerald-200"
                  }`}>
                    <div className={`text-2xl font-bold tabular-nums ${
                      isPending ? "text-gray-600" : "text-emerald-700"
                    }`}>{line}</div>
                    <div className={`text-xs mt-0.5 ${
                      isPending ? "text-gray-500" : "text-emerald-700/70"
                    }`}>
                      {isPending
                        ? (order.type === "delivery"
                          ? t("etaWaitingDelivery", { time: targetLabel })
                          : t("etaWaitingPickup", { time: targetLabel }))
                        : (order.type === "delivery"
                          ? t("etaConfirmedDelivery", { time: targetLabel })
                          : t("etaConfirmedPickup", { time: targetLabel }))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── Full order details (NEW) ──────────────────────────────
              Mirrors the confirmation page: line items + bundle children
              + struck-through delivery fee + promos box. */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6 print-container">
            <div className="font-semibold text-gray-900 mb-3">{t("yourOrder")}</div>
            <div className="space-y-2">
              {(order.items ?? []).map((item: any) => {
                const bundle = Array.isArray(item.bundleItems) ? item.bundleItems : null;
                const mods = Array.isArray(item.modifiers) ? item.modifiers : [];
                return (
                  <div key={item.id} className="text-sm">
                    <div className="flex justify-between gap-3">
                      <span className="text-gray-700">
                        {item.quantity}× {item.name}
                        {item.variantName ? ` (${item.variantName})` : ""}
                      </span>
                      <span className="text-gray-600 whitespace-nowrap">{formatCurrency(item.subtotal)}</span>
                    </div>
                    {mods.length > 0 && (
                      <div className="mt-0.5 pl-3 text-xs text-gray-500">
                        {mods.map((m: any, i: number) => (
                          <div key={i}>
                            • {m.name}
                            {m.priceAdjustment > 0 ? ` (+${formatCurrency(m.priceAdjustment)})` : ""}
                          </div>
                        ))}
                      </div>
                    )}
                    {bundle && bundle.length > 0 && (
                      <div className="mt-1 pl-3 border-l-2 border-gray-100 space-y-0.5 text-xs text-gray-500">
                        {bundle.map((child: any, i: number) => (
                          <div key={i}>
                            • {child.name}
                            {child.variantName ? ` (${child.variantName})` : ""}
                            {child.specialityFee && child.specialityFee > 0
                              ? ` (+${formatCurrency(child.specialityFee)})`
                              : ""}
                          </div>
                        ))}
                      </div>
                    )}
                    {item.notes && (
                      <div className="mt-0.5 pl-3 text-xs italic text-gray-400">{t("itemNote", { notes: item.notes })}</div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Promo highlight box */}
            {appliedPromos.length > 0 && (
              <div className="border-t border-gray-100 mt-3 pt-3">
                <div className="rounded-xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-green-50 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span aria-hidden>🎉</span>
                    <div className="text-sm font-bold text-emerald-800">{t("promosApplied")}</div>
                  </div>
                  <div className="space-y-1">
                    {appliedPromos.map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 text-emerald-700 font-medium truncate">
                          <span aria-hidden>✓</span>
                          <span className="truncate">{p.name}</span>
                          {p.couponCode && (
                            <span className="font-mono bg-white border border-emerald-200 text-emerald-700 rounded px-1.5 py-0.5 ml-1">
                              {p.couponCode}
                            </span>
                          )}
                        </div>
                        <div className="font-semibold text-emerald-800 whitespace-nowrap ml-2">
                          {p.discount > 0 ? `− ${formatCurrency(p.discount)}` : t("free")}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Totals breakdown */}
            <div className="border-t border-gray-100 mt-3 pt-3 space-y-1 text-sm">
              <div className="flex justify-between text-gray-600"><span>{t("subtotal")}</span><span>{formatCurrency(order.subtotal)}</span></div>
              {cartDiscountTotal > 0 && (
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>{t("promoDiscount")}</span>
                  <span>− {formatCurrency(cartDiscountTotal)}</span>
                </div>
              )}
              {order.type === "delivery" && (
                <div className="flex justify-between text-gray-600">
                  <span>{t("delivery")}</span>
                  <span>
                    {savedDeliveryFee > 0 ? (
                      <>
                        <span className="line-through text-gray-400 mr-1.5">{formatCurrency(savedDeliveryFee)}</span>
                        <span className="text-emerald-600 font-semibold">{t("free")}</span>
                      </>
                    ) : (
                      formatCurrency(order.deliveryFee)
                    )}
                  </span>
                </div>
              )}
              {order.taxAmount > 0 && (
                <div className="flex justify-between text-gray-600"><span>{t("tax")}</span><span>{formatCurrency(order.taxAmount)}</span></div>
              )}
              {order.tip > 0 && (
                <div className="flex justify-between text-gray-600"><span>{t("tip")}</span><span>{formatCurrency(order.tip)}</span></div>
              )}
              <div className="flex justify-between font-bold text-gray-900 pt-1"><span>{t("total")}</span><span>{formatCurrency(order.total)}</span></div>
            </div>

            {/* Order metadata */}
            <div className="border-t border-gray-100 mt-3 pt-3 text-xs text-gray-500 space-y-0.5">
              <div className="flex justify-between"><span>{t("orderType")}</span><span className="capitalize">{order.type}</span></div>
              <div className="flex justify-between"><span>{t("payment")}</span><span className="capitalize">{order.paymentMethod}</span></div>
              <div className="flex justify-between"><span>{t("placed")}</span><span>{new Date(order.createdAt).toLocaleString()}</span></div>
            </div>
          </div>

          {/* ── Delivery address (delivery only) ───────────────────── */}
          {order.type === "delivery" && order.deliveryAddress && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6 print-container">
              <div className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-500" /> {t("deliveryTo")}
              </div>
              <div className="text-sm text-gray-700">
                {order.deliveryAddress}
                {order.deliveryCity ? `, ${order.deliveryCity}` : ""}
                {order.deliveryZip ? ` ${order.deliveryZip}` : ""}
              </div>
              {/* No separate deliveryInstructions column — those are
                  concatenated into `notes` at order-create time and
                  rendered by the customer-note card further down. */}
            </div>
          )}

          {/* ── Customer note ──────────────────────────────────────── */}
          {order.notes && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6 print-container">
              <div className="font-semibold text-gray-900 mb-2 text-sm">{t("yourNote")}</div>
              <div className="text-sm text-gray-700 whitespace-pre-line">{order.notes}</div>
            </div>
          )}

          {/* ── Action buttons (Reorder / Print / Share) ──────────── */}
          <div className="no-print grid grid-cols-3 gap-2 sm:gap-3 mb-6">
            <button
              onClick={handleReorder}
              disabled={reordering}
              className="flex items-center justify-center gap-1.5 bg-emerald-500 text-white font-semibold py-3 rounded-xl hover:bg-emerald-600 transition disabled:opacity-50 text-sm"
            >
              {reordering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Repeat className="w-4 h-4" />}
              <span className="hidden sm:inline">{t("reorder")}</span>
              <span className="sm:hidden">{t("again")}</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center justify-center gap-1.5 bg-white border border-gray-300 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-50 transition text-sm"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">{t("print")}</span>
              <span className="sm:hidden">{t("print")}</span>
            </button>
            <button
              onClick={handleShare}
              className="flex items-center justify-center gap-1.5 bg-white border border-gray-300 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-50 transition text-sm"
            >
              <Share2 className="w-4 h-4" />
              <span>{shareCopied ? t("copied") : t("share")}</span>
            </button>
          </div>
          {reorderMsg && (
            <div className="no-print text-xs text-center text-gray-500 -mt-3 mb-6">{reorderMsg}</div>
          )}

          {/* ── Customer cancel — pure "pending" gate. Once the kitchen
              accepts, the button disappears and the customer must call
              the restaurant (Luigi 2026-05-30: "no cancelling after
              acceptance"). The server enforces the same rule.
              Abandoned-pending orders are swept after 30 min by the
              auto-reject cron, so we don't need a time window here. */}
          {order.status === "pending" && (
            <div className="no-print mb-6">
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="w-full flex items-center justify-center gap-2 bg-white border border-red-200 text-red-600 font-semibold py-3 rounded-xl hover:bg-red-50 transition text-sm"
              >
                <X className="w-4 h-4" /> {t("cancelOrder")}
              </button>
            </div>
          )}

          {/* ── Need help? (contact restaurant + marketplace) ──────── */}
          <div className="no-print bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
            <div className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-emerald-500" /> {t("needHelp")}
            </div>
            <div className="space-y-2 text-sm">
              <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold pb-1">
                {t("contactRestaurant", { name: order.restaurant.name })}
              </div>
              {order.restaurant.phone && (
                <a
                  href={`tel:${order.restaurant.phone.replace(/\s+/g, "")}`}
                  className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-gray-50 transition"
                >
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-700">{order.restaurant.phone}</span>
                </a>
              )}
              {order.restaurant.email && (
                <a
                  href={`mailto:${order.restaurant.email}?subject=${supportSubject}&body=${supportBody}`}
                  className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-gray-50 transition"
                >
                  <Mail className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-700">{order.restaurant.email}</span>
                </a>
              )}
              {!order.restaurant.phone && !order.restaurant.email && (
                <div className="text-xs text-gray-500 italic">
                  {t("noContactYet")}
                </div>
              )}
              {cameFromMarketplace && (
                <>
                  <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold pt-3 pb-1 border-t border-gray-100 mt-2">
                    {t("marketplaceSupport")}
                  </div>
                  <a
                    href={`mailto:${MARKETPLACE_SUPPORT_EMAIL}?subject=${supportSubject}&body=${encodeURIComponent(
                      `Hi Fee Free Food,\n\nI need help with order #${order.orderNumber} at ${order.restaurant.name} placed ${new Date(order.createdAt).toLocaleString()}.\n\n`,
                    )}`}
                    className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-gray-50 transition"
                  >
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-700">{MARKETPLACE_SUPPORT_EMAIL}</span>
                  </a>
                </>
              )}
            </div>
          </div>

          <div className="no-print text-center mt-6 space-y-2">
            <Link href={backHref} className="text-gray-500 text-sm hover:text-gray-700 block">
              {backLabel}
            </Link>
            {cameFromMarketplace && (
              <Link href={`/order/${slug}`} className="text-gray-400 text-xs hover:text-gray-600 block">
                {t("orReorderFrom", { name: order.restaurant.name })}
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* ── Cancel confirmation modal ────────────────────────────── */}
      {showCancelConfirm && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-gray-900">{t("cancelModalTitle")}</h3>
            <p className="text-sm text-gray-600 mt-2">
              {t("cancelModalBody", { name: order.restaurant.name })}
            </p>
            {cancelError && (
              <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {cancelError}
              </div>
            )}
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => { setShowCancelConfirm(false); setCancelError(null); }}
                className="flex-1 bg-white border border-gray-300 text-gray-700 font-semibold py-2.5 rounded-lg hover:bg-gray-50 text-sm"
                disabled={cancelling}
              >
                {t("keepOrder")}
              </button>
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="flex-1 flex items-center justify-center gap-2 bg-red-500 text-white font-semibold py-2.5 rounded-lg hover:bg-red-600 disabled:opacity-50 text-sm"
              >
                {cancelling && <Loader2 className="w-4 h-4 animate-spin" />}
                {cancelling ? t("cancellingInProgress") : t("yesCancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
