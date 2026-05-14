"use client";
import { useState } from "react";
import {
  X, Phone, Mail, MapPin, Clock, CheckCircle, XCircle, ChefHat,
  Package, CreditCard, Printer, UtensilsCrossed, RefreshCw, Loader2,
  AlertTriangle, ReceiptText, User,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import toast from "react-hot-toast";
import type { T, Order } from "./kitchen-types";

interface Props {
  order: Order;
  t: T;
  onClose: () => void;
  onUpdate: (orderId: string, status: string, extra?: Record<string, unknown>) => Promise<void>;
  onPrint: (orderId: string, type: "kitchen" | "customer" | "both") => Promise<void>;
  printerReady: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "New Order",
  accepted: "Accepted",
  preparing: "In Progress",
  ready: "Ready",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

function fmtTime(d: string | Date | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

export function OrderDetail({ order, t, onClose, onUpdate, onPrint, printerReady }: Props) {
  const [rejectReason, setRejectReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState<string | null>(null);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const print = async (type: "kitchen" | "customer" | "both") => {
    if (!printerReady) {
      toast.error("No printer configured. Open Printer Setup first.");
      return;
    }
    setPrinting(type);
    try {
      await onPrint(order.id, type);
    } catch (err: any) {
      toast.error(err?.message ?? "Print failed");
    } finally {
      setPrinting(null);
    }
  };

  const StatusBadge = () => {
    const cls: Record<string, string> = {
      pending: "bg-yellow-500 text-white",
      accepted: "bg-blue-500 text-white",
      preparing: "bg-orange-500 text-white",
      ready: "bg-green-500 text-white",
      completed: "bg-gray-500 text-white",
      rejected: "bg-red-500 text-white",
      cancelled: "bg-red-500 text-white",
    };
    return (
      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${cls[order.status] ?? "bg-gray-500 text-white"}`}>
        {STATUS_LABEL[order.status] ?? order.status}
      </span>
    );
  };

  return (
    <div className={`flex flex-col h-full ${t.detail}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-5 py-4 border-b ${t.border} flex-shrink-0`}>
        <div className="flex items-center gap-3">
          <button onClick={onClose} className={`p-1.5 rounded-lg ${t.btn} md:hidden`}>
            <X className="w-4 h-4" />
          </button>
          <div>
            <div className={`font-bold text-lg ${t.text}`}>Order #{order.orderNumber}</div>
            <div className={`text-xs ${t.muted}`}>{fmtTime(order.createdAt)}</div>
          </div>
          <StatusBadge />
        </div>
        <button onClick={onClose} className={`p-1.5 rounded-lg ${t.btn} hidden md:flex`}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-5 space-y-5">

          {/* Customer Info */}
          <Section title="Customer" t={t}>
            <div className="space-y-2">
              <Row icon={<User className="w-4 h-4" />} t={t}>{order.customerName}</Row>
              {order.customerPhone && <Row icon={<Phone className="w-4 h-4" />} t={t}>{order.customerPhone}</Row>}
              {order.customerEmail && <Row icon={<Mail className="w-4 h-4" />} t={t}>{order.customerEmail}</Row>}
            </div>
          </Section>

          {/* Delivery/Pickup */}
          <Section title={order.type === "delivery" ? "Delivery Address" : "Order Type"} t={t}>
            <div className="space-y-1">
              <div className={`flex items-center gap-2 text-sm font-semibold ${t.text}`}>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${order.type === "delivery" ? "bg-blue-500 text-white" : "bg-orange-500 text-white"}`}>
                  {order.type.toUpperCase()}
                </span>
              </div>
              {order.deliveryAddress && (
                <Row icon={<MapPin className="w-4 h-4" />} t={t}>
                  {order.deliveryAddress}{order.deliveryCity ? `, ${order.deliveryCity}` : ""}
                </Row>
              )}
            </div>
          </Section>

          {/* Timing */}
          {(order.acceptedAt || order.estimatedReady || order.completedAt) && (
            <Section title="Timing" t={t}>
              <div className="space-y-1.5">
                {order.acceptedAt && <Row icon={<CheckCircle className="w-4 h-4 text-green-500" />} t={t}>Accepted: {fmtTime(order.acceptedAt)}</Row>}
                {order.estimatedReady && <Row icon={<Clock className="w-4 h-4 text-blue-500" />} t={t}>Ready by: {fmtTime(order.estimatedReady)}</Row>}
                {order.preparationTime && <Row icon={<Clock className="w-4 h-4" />} t={t}>Prep time: {order.preparationTime} min</Row>}
                {order.completedAt && <Row icon={<Package className="w-4 h-4 text-gray-500" />} t={t}>Completed: {fmtTime(order.completedAt)}</Row>}
              </div>
            </Section>
          )}

          {/* Notes */}
          {order.notes && (
            <Section title="Order Notes" t={t}>
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2 text-sm text-yellow-700 dark:text-yellow-300">
                {order.notes}
              </div>
            </Section>
          )}

          {/* Items */}
          <Section title="Items" t={t}>
            <div className="space-y-3">
              {order.items.map((item) => (
                <div key={item.id} className={`border-b ${t.border} pb-3 last:border-0 last:pb-0`}>
                  <div className="flex justify-between">
                    <span className={`font-semibold text-sm ${t.text}`}>{item.quantity}× {item.name}</span>
                    <span className={`text-sm font-medium ${t.text}`}>{formatCurrency(item.subtotal)}</span>
                  </div>
                  {item.variantName && <div className={`text-xs ${t.muted} pl-3`}>{item.variantName}</div>}
                  {item.modifiers.map((m, i) => (
                    <div key={i} className={`text-xs ${t.muted} pl-3`}>
                      + {m.name}{m.priceAdjustment !== 0 && ` (${m.priceAdjustment > 0 ? "+" : ""}${formatCurrency(m.priceAdjustment)})`}
                    </div>
                  ))}
                  {item.notes && <div className="text-xs text-yellow-600 pl-3 italic">{item.notes}</div>}
                </div>
              ))}
            </div>
          </Section>

          {/* Totals */}
          <Section title="Totals" t={t}>
            <div className="space-y-1.5">
              <TotalRow label="Subtotal" value={formatCurrency(order.subtotal)} t={t} />
              {(order.couponDiscount ?? 0) > 0 && <TotalRow label="Coupon discount" value={`-${formatCurrency(order.couponDiscount!)}`} t={t} />}
              {(order.promoDiscount ?? 0) > 0 && <TotalRow label="Promo discount" value={`-${formatCurrency(order.promoDiscount!)}`} t={t} />}
              {order.deliveryFee > 0 && <TotalRow label="Delivery fee" value={formatCurrency(order.deliveryFee)} t={t} />}
              <TotalRow label="Tax" value={formatCurrency(order.taxAmount)} t={t} />
              {(order.tip ?? 0) > 0 && <TotalRow label="Tip" value={formatCurrency(order.tip!)} t={t} />}
              <div className={`flex justify-between font-bold text-sm pt-1.5 border-t ${t.border} ${t.text}`}>
                <span>TOTAL</span>
                <span>{formatCurrency(order.total)}</span>
              </div>
            </div>
          </Section>

          {/* Payment */}
          <Section title="Payment" t={t}>
            <div className="space-y-1">
              <Row icon={<CreditCard className="w-4 h-4" />} t={t}>
                {order.paymentMethod === "card" ? "Credit/Debit Card" : order.paymentMethod === "cash" ? "Cash" : order.paymentMethod}
              </Row>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  order.paymentStatus === "paid" ? "bg-green-500/20 text-green-600" :
                  order.paymentStatus === "refunded" ? "bg-blue-500/20 text-blue-600" :
                  "bg-yellow-500/20 text-yellow-700"
                }`}>
                  {order.paymentStatus?.toUpperCase() ?? "PENDING"}
                </span>
                {order.refundStatus && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    order.refundStatus === "refunded" ? "bg-blue-500/20 text-blue-600" :
                    order.refundStatus === "pending" ? "bg-yellow-500/20 text-yellow-700" :
                    "bg-red-500/20 text-red-600"
                  }`}>
                    REFUND: {order.refundStatus.toUpperCase()}
                  </span>
                )}
              </div>
            </div>
          </Section>
        </div>
      </div>

      {/* Action buttons */}
      <div className={`border-t ${t.border} p-4 flex-shrink-0 space-y-3`}>
        {/* Status actions */}
        <div className="grid grid-cols-2 gap-2">
          {order.status === "pending" && (
            <>
              <button
                onClick={() => act(() => onUpdate(order.id, "accepted", { preparationTime: 20 }))}
                disabled={busy}
                className="flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-600 text-white font-bold py-2.5 rounded-xl text-sm transition disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" /> Accept
              </button>
              <button
                onClick={() => setShowReject(true)}
                disabled={busy}
                className="flex items-center justify-center gap-1.5 bg-red-500 hover:bg-red-600 text-white font-bold py-2.5 rounded-xl text-sm transition disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" /> Reject
              </button>
            </>
          )}
          {order.status === "accepted" && (
            <button
              onClick={() => act(() => onUpdate(order.id, "preparing"))}
              disabled={busy}
              className="col-span-2 flex items-center justify-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 rounded-xl text-sm transition disabled:opacity-50"
            >
              <ChefHat className="w-4 h-4" /> Start Preparing
            </button>
          )}
          {order.status === "preparing" && (
            <button
              onClick={() => act(() => onUpdate(order.id, "ready"))}
              disabled={busy}
              className="col-span-2 flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-600 text-white font-bold py-2.5 rounded-xl text-sm transition disabled:opacity-50"
            >
              <Package className="w-4 h-4" /> Mark Ready
            </button>
          )}
          {order.status === "ready" && (
            <button
              onClick={() => act(() => onUpdate(order.id, "completed"))}
              disabled={busy}
              className="col-span-2 flex items-center justify-center gap-1.5 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2.5 rounded-xl text-sm transition disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" /> Complete Order
            </button>
          )}
        </div>

        {/* Print buttons */}
        <div className={`grid grid-cols-3 gap-1.5 border-t ${t.border} pt-3`}>
          <PrintBtn label="Kitchen" icon={<UtensilsCrossed className="w-3.5 h-3.5" />} onClick={() => print("kitchen")} loading={printing === "kitchen"} t={t} />
          <PrintBtn label="Receipt" icon={<ReceiptText className="w-3.5 h-3.5" />} onClick={() => print("customer")} loading={printing === "customer"} t={t} />
          <PrintBtn label="Both" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => print("both")} loading={printing === "both"} t={t} />
        </div>

        {/* Cancel */}
        {!["completed", "rejected", "cancelled"].includes(order.status) && (
          <button
            onClick={() => setShowCancel(true)}
            className={`w-full text-xs ${t.muted} hover:text-red-500 transition py-1`}
          >
            Cancel order
          </button>
        )}
      </div>

      {/* Reject modal */}
      {showReject && (
        <Modal title="Reject Order" t={t} onClose={() => setShowReject(false)}>
          <label className={`text-sm ${t.muted} block mb-2`}>Reason (optional)</label>
          <textarea
            className={`w-full rounded-xl px-3 py-2 text-sm border ${t.input} focus:outline-none focus:ring-2 focus:ring-red-500 mb-4`}
            rows={3}
            placeholder="We are too busy, item not available..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
          />
          <div className="flex gap-3">
            <button
              onClick={() => act(async () => { await onUpdate(order.id, "rejected", { rejectionReason: rejectReason }); setShowReject(false); })}
              disabled={busy}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2.5 rounded-xl text-sm transition"
            >
              {busy ? "Rejecting..." : "Reject Order"}
            </button>
            <button onClick={() => setShowReject(false)} className={`flex-1 ${t.btn} py-2.5 rounded-xl text-sm transition`}>
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* Cancel modal */}
      {showCancel && (
        <Modal title="Cancel Order" t={t} onClose={() => setShowCancel(false)}>
          {order.paymentStatus === "paid" && (
            <div className="flex gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className={`text-xs ${t.muted}`}>
                This order has been paid. A refund will be automatically initiated through your payment provider.
              </p>
            </div>
          )}
          <label className={`text-sm ${t.muted} block mb-2`}>Reason (optional)</label>
          <textarea
            className={`w-full rounded-xl px-3 py-2 text-sm border ${t.input} focus:outline-none focus:ring-2 focus:ring-red-500 mb-4`}
            rows={2}
            placeholder="Out of stock, restaurant closing early..."
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
          />
          <div className="flex gap-3">
            <button
              onClick={() => act(async () => { await onUpdate(order.id, "cancelled", { rejectionReason: cancelReason || "Cancelled by restaurant" }); setShowCancel(false); })}
              disabled={busy}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-2.5 rounded-xl text-sm transition"
            >
              {busy ? "Cancelling..." : "Cancel Order"}
            </button>
            <button onClick={() => setShowCancel(false)} className={`flex-1 ${t.btn} py-2.5 rounded-xl text-sm transition`}>
              Back
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Section({ title, children, t }: { title: string; children: React.ReactNode; t: T }) {
  return (
    <div>
      <div className={`text-xs font-semibold uppercase tracking-wider ${t.muted} mb-2`}>{title}</div>
      {children}
    </div>
  );
}

function Row({ icon, children, t }: { icon?: React.ReactNode; children: React.ReactNode; t: T }) {
  return (
    <div className={`flex items-center gap-2 text-sm ${t.text}`}>
      {icon && <span className={t.muted}>{icon}</span>}
      {children}
    </div>
  );
}

function TotalRow({ label, value, t }: { label: string; value: string; t: T }) {
  return (
    <div className={`flex justify-between text-sm ${t.muted}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}

function PrintBtn({ label, icon, onClick, loading, t }: { label: string; icon: React.ReactNode; onClick: () => void; loading: boolean; t: T }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex flex-col items-center gap-1 py-2 rounded-xl text-xs ${t.btn} ${t.muted} hover:text-orange-500 transition disabled:opacity-50`}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}

function Modal({ title, children, t, onClose }: { title: string; children: React.ReactNode; t: T; onClose: () => void }) {
  return (
    <div className="absolute inset-0 bg-black/60 flex items-end md:items-center justify-center z-10 p-4">
      <div className={`${t.modal} rounded-2xl w-full max-w-sm p-5`}>
        <div className={`flex items-center justify-between mb-4`}>
          <h4 className={`font-bold text-base ${t.text}`}>{title}</h4>
          <button onClick={onClose} className={`${t.btn} p-1.5 rounded-lg`}><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
