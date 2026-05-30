"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import {
  CheckCircle, Clock, ChefHat, Package, XCircle, Loader2,
  Phone, Mail, MapPin, Repeat, Printer, HelpCircle,
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
const TRACKING_STEPS = [
  { key: "pending", label: "Order Received", icon: Clock, desc: "Your order is waiting for confirmation" },
  { key: "accepted", label: "Accepted", icon: CheckCircle, desc: "The restaurant confirmed your order" },
  { key: "preparing", label: "Preparing", icon: ChefHat, desc: "Your food is being prepared" },
  { key: "ready", label: "Ready!", icon: Package, desc: "Your order is ready for pickup/delivery" },
  { key: "completed", label: "Completed", icon: CheckCircle, desc: "Order complete. Enjoy your meal!" },
];
const SIMPLE_STEPS = [
  { key: "pending", label: "Order Received", icon: Clock, desc: "Your order is waiting for confirmation" },
  { key: "accepted", label: "Confirmed — being prepared", icon: ChefHat, desc: "The restaurant is preparing your order" },
  { key: "completed", label: "Complete", icon: CheckCircle, desc: "Order complete. Enjoy your meal!" },
];

// Marketplace support email — surfaced in the "Need help?" panel for
// orders placed via the marketplace flow (viaMarketplace=true). Keep in
// sync with the support contact email used in transactional templates.
const MARKETPLACE_SUPPORT_EMAIL = "support@feefreefood.com";

export default function OrderStatusPage({ params }: { params: Promise<{ slug: string; orderId: string }> }) {
  const { slug, orderId } = use(params);
  const router = useRouter();
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reordering, setReordering] = useState(false);
  const [reorderMsg, setReorderMsg] = useState<string | null>(null);

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

  const handlePrint = useCallback(() => {
    if (typeof window !== "undefined") window.print();
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
    </div>
  );

  if (!order) return (
    <div className="min-h-screen flex flex-col items-center justify-center text-gray-500 px-4 text-center">
      <div>Order not found</div>
      {fetchError && (
        <div className="text-xs text-gray-400 mt-3 max-w-md font-mono">{fetchError}</div>
      )}
    </div>
  );

  const isRejected = order.status === "rejected" || order.status === "cancelled";
  const isTerminal = isRejected || order.status === "completed";
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
  const backLabel = cameFromMarketplace ? "← Browse other restaurants" : "← Back to menu";

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
            {cameFromMarketplace ? "All my orders" : `Back to my account`}
          </Link>
        </div>
        <div className="max-w-lg mx-auto pt-4">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">{order.restaurant.name}</h1>
            <div className="text-gray-500 mt-1">Order #{order.orderNumber}</div>
            {!isTerminal && (
              <div className="no-print inline-block mt-2 text-sm bg-emerald-100 text-emerald-600 px-3 py-1 rounded-full font-medium">
                Auto-refreshes every 10 seconds
              </div>
            )}
          </div>

          {isRejected ? (
            <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-8 text-center mb-6">
              <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                {order.status === "rejected" ? "Order Rejected" : "Order Cancelled"}
              </h2>
              {order.rejectionReason && <p className="text-gray-600 mb-4">Reason: {order.rejectionReason}</p>}
              <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
                <Link
                  href={cameFromMarketplace ? "/" : `/order/${slug}`}
                  className="text-emerald-500 font-medium hover:underline"
                >
                  {cameFromMarketplace ? "Browse other restaurants" : "Place a new order"}
                </Link>
                {cameFromMarketplace && (
                  <Link
                    href={`/order/${slug}`}
                    className="text-gray-500 text-sm hover:text-gray-700"
                  >
                    · Try {order.restaurant.name} again
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
                  return (
                    <div key={step.key} className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${done ? "bg-green-500" : active ? "bg-emerald-500" : "bg-gray-100"}`}>
                        <step.icon className={`w-5 h-5 ${done || active ? "text-white" : "text-gray-400"}`} />
                      </div>
                      <div className="flex-1 pt-1">
                        <div className={`font-semibold ${active ? "text-emerald-600" : done ? "text-green-600" : "text-gray-400"}`}>{step.label}</div>
                        {(active || done) && <div className={`text-sm mt-0.5 ${active ? "text-gray-600" : "text-gray-400"}`}>{step.desc}</div>}
                      </div>
                      {done && <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-1" />}
                    </div>
                  );
                })}
              </div>

              {order.estimatedReady && order.status === "accepted" && (
                <div className="mt-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                  <div className="text-sm text-gray-600">Estimated ready at</div>
                  <div className="text-xl font-bold text-emerald-600">
                    {new Date(order.estimatedReady).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Full order details (NEW) ──────────────────────────────
              Mirrors the confirmation page: line items + bundle children
              + struck-through delivery fee + promos box. */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6 print-container">
            <div className="font-semibold text-gray-900 mb-3">Your order</div>
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
                      <div className="mt-0.5 pl-3 text-xs italic text-gray-400">Note: {item.notes}</div>
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
                    <div className="text-sm font-bold text-emerald-800">Promos applied</div>
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
                          {p.discount > 0 ? `− ${formatCurrency(p.discount)}` : "FREE"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Totals breakdown */}
            <div className="border-t border-gray-100 mt-3 pt-3 space-y-1 text-sm">
              <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{formatCurrency(order.subtotal)}</span></div>
              {cartDiscountTotal > 0 && (
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>Promo discount</span>
                  <span>− {formatCurrency(cartDiscountTotal)}</span>
                </div>
              )}
              {order.type === "delivery" && (
                <div className="flex justify-between text-gray-600">
                  <span>Delivery</span>
                  <span>
                    {savedDeliveryFee > 0 ? (
                      <>
                        <span className="line-through text-gray-400 mr-1.5">{formatCurrency(savedDeliveryFee)}</span>
                        <span className="text-emerald-600 font-semibold">FREE</span>
                      </>
                    ) : (
                      formatCurrency(order.deliveryFee)
                    )}
                  </span>
                </div>
              )}
              {order.taxAmount > 0 && (
                <div className="flex justify-between text-gray-600"><span>Tax</span><span>{formatCurrency(order.taxAmount)}</span></div>
              )}
              {order.tip > 0 && (
                <div className="flex justify-between text-gray-600"><span>Tip</span><span>{formatCurrency(order.tip)}</span></div>
              )}
              <div className="flex justify-between font-bold text-gray-900 pt-1"><span>Total</span><span>{formatCurrency(order.total)}</span></div>
            </div>

            {/* Order metadata */}
            <div className="border-t border-gray-100 mt-3 pt-3 text-xs text-gray-500 space-y-0.5">
              <div className="flex justify-between"><span>Order type</span><span className="capitalize">{order.type}</span></div>
              <div className="flex justify-between"><span>Payment</span><span className="capitalize">{order.paymentMethod}</span></div>
              <div className="flex justify-between"><span>Placed</span><span>{new Date(order.createdAt).toLocaleString()}</span></div>
            </div>
          </div>

          {/* ── Delivery address (delivery only) ───────────────────── */}
          {order.type === "delivery" && order.deliveryAddress && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6 print-container">
              <div className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-500" /> Delivery to
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
              <div className="font-semibold text-gray-900 mb-2 text-sm">Your note</div>
              <div className="text-sm text-gray-700 whitespace-pre-line">{order.notes}</div>
            </div>
          )}

          {/* ── Action buttons (Reorder / Print) ───────────────────── */}
          <div className="no-print grid grid-cols-2 gap-3 mb-6">
            <button
              onClick={handleReorder}
              disabled={reordering}
              className="flex items-center justify-center gap-2 bg-emerald-500 text-white font-semibold py-3 rounded-xl hover:bg-emerald-600 transition disabled:opacity-50"
            >
              {reordering ? <Loader2 className="w-4 h-4 animate-spin" /> : <Repeat className="w-4 h-4" />}
              Reorder
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-50 transition"
            >
              <Printer className="w-4 h-4" />
              Print receipt
            </button>
          </div>
          {reorderMsg && (
            <div className="no-print text-xs text-center text-gray-500 -mt-3 mb-6">{reorderMsg}</div>
          )}

          {/* ── Need help? (contact restaurant + marketplace) ──────── */}
          <div className="no-print bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-6">
            <div className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-emerald-500" /> Need help with this order?
            </div>
            <div className="space-y-2 text-sm">
              <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold pb-1">
                Contact {order.restaurant.name}
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
                  The restaurant has not added a contact yet.
                </div>
              )}
              {cameFromMarketplace && (
                <>
                  <div className="text-xs uppercase tracking-wide text-gray-400 font-semibold pt-3 pb-1 border-t border-gray-100 mt-2">
                    Marketplace support
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
                Or reorder from {order.restaurant.name}
              </Link>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
