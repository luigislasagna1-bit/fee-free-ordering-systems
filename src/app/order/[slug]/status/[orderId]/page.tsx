"use client";
import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { CheckCircle, Clock, ChefHat, Package, XCircle, Loader2 } from "lucide-react";
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

export default function OrderStatusPage({ params }: { params: Promise<{ slug: string; orderId: string }> }) {
  const { slug, orderId } = use(params);
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchOrder = async () => {
    const res = await fetch(`/api/orders/${orderId}`);
    if (res.ok) setOrder(await res.json());
    setLoading(false);
  };

  useEffect(() => {
    fetchOrder();
    const interval = setInterval(fetchOrder, 10000); // poll every 10s
    return () => clearInterval(interval);
  }, [orderId]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
    </div>
  );

  if (!order) return (
    <div className="min-h-screen flex items-center justify-center text-gray-500">Order not found</div>
  );

  const isRejected = order.status === "rejected";
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

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto pt-10">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">{order.restaurant.name}</h1>
          <div className="text-gray-500 mt-1">Order #{order.orderNumber}</div>
          <div className="inline-block mt-2 text-sm bg-emerald-100 text-emerald-600 px-3 py-1 rounded-full font-medium">
            Auto-refreshes every 10 seconds
          </div>
        </div>

        {isRejected ? (
          <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-8 text-center">
            <XCircle className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Order Rejected</h2>
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
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
            <div className="space-y-4">
              {statusSteps.map((step, idx) => {
                const done = idx < currentStep;
                const active = idx === currentStep;
                const future = idx > currentStep;
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

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 text-sm">
          <div className="font-semibold text-gray-900 mb-3">Order Details</div>
          <div className="space-y-1 text-gray-600">
            <div className="flex justify-between"><span>Type</span><span className="capitalize">{order.type}</span></div>
            <div className="flex justify-between"><span>Payment</span><span className="capitalize">{order.paymentMethod}</span></div>
            <div className="flex justify-between font-bold text-gray-900"><span>Total</span><span>{formatCurrency(order.total)}</span></div>
          </div>
        </div>

        <div className="text-center mt-6 space-y-2">
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
  );
}
