"use client";
import { useRef, useState } from "react";
import {
  X, User, Truck, ShoppingBag, Clock, CreditCard, Heart, Edit2, Tag,
  AlertCircle, Loader2, ChevronDown,
} from "lucide-react";
import { Autocomplete } from "@react-google-maps/api";
import { formatCurrency } from "@/lib/utils";
import { parseTheme } from "@/lib/theme";
import { useGoogleMaps } from "@/lib/use-google-maps";

type Theme = ReturnType<typeof parseTheme>;
type SectionKey = null | "contact" | "ordering" | "time" | "payment" | "tips" | "notes";
type CustomerInfo = {
  name: string; email: string; phone: string; address: string; city: string; zip: string;
  notes: string; paymentMethod: string; scheduledFor: string;
};

type CartLine = {
  menuItem: { id: string; name: string };
  variant?: { name: string };
  quantity: number;
  lineTotal: number;
};

interface Props {
  theme: Theme;
  orderType: "pickup" | "delivery";
  cart: CartLine[];
  subtotal: number;
  totalDiscount: number;
  deliveryFee: number;
  taxAmount: number;
  tipAmount: number;
  tipPercent: number;
  setTipPercent: (n: number) => void;
  total: number;
  taxRate: number;
  customerInfo: CustomerInfo;
  setCustomerInfo: (ci: CustomerInfo) => void;
  editingSection: SectionKey;
  setEditingSection: (s: SectionKey) => void;
  orderLoading: boolean;
  placeOrder: () => void;
  cardPaymentEnabled: boolean;
  couponCode: string;
  setCouponCode: (s: string) => void;
  couponId: string | null;
  couponDiscount: number;
  couponLoading: boolean;
  applyCoupon: () => void;
  estimatedDeliveryMinutes: number;
  estimatedPickupMinutes: number;
  hasZones: boolean;
  geocoding: boolean;
  geocodeError: string | null;
  resolvedZone: { zone: { name: string; color: string; deliveryFee: number; estimatedMinutes: number }; inside: boolean } | null;
  mapProvider: "leaflet" | "google";
  googleMapsApiKey: string | null;
  onClose: () => void;
}

export function CheckoutModal({
  theme, orderType, cart, subtotal, totalDiscount, deliveryFee, taxAmount,
  tipAmount, tipPercent, setTipPercent, total, taxRate,
  customerInfo, setCustomerInfo,
  editingSection, setEditingSection,
  orderLoading, placeOrder,
  cardPaymentEnabled,
  couponCode, setCouponCode, couponId, couponDiscount, couponLoading, applyCoupon,
  estimatedDeliveryMinutes, estimatedPickupMinutes,
  hasZones, geocoding, geocodeError, resolvedZone,
  mapProvider, googleMapsApiKey,
  onClose,
}: Props) {
  const [showCouponField, setShowCouponField] = useState(false);
  const googleEnabled = mapProvider === "google" && !!googleMapsApiKey;
  const { isLoaded: gmapsLoaded } = useGoogleMaps(googleEnabled ? googleMapsApiKey! : "");
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const handlePlaceChanged = () => {
    const place = autocompleteRef.current?.getPlace();
    if (!place || !place.address_components) return;

    const get = (type: string, short = false) =>
      place.address_components!.find((c) => c.types.includes(type))?.[short ? "short_name" : "long_name"] ?? "";

    const streetNumber = get("street_number");
    const route = get("route");
    const street = [streetNumber, route].filter(Boolean).join(" ");
    const city = get("locality") || get("sublocality") || get("administrative_area_level_2");
    const zip = get("postal_code");

    setCustomerInfo({
      ...customerInfo,
      address: street || place.formatted_address || customerInfo.address,
      city: city || customerInfo.city,
      zip: zip || customerInfo.zip,
    });
  };

  const toggleEdit = (s: Exclude<SectionKey, null>) =>
    setEditingSection(editingSection === s ? null : s);

  const contactSummary = customerInfo.name && customerInfo.phone
    ? `${customerInfo.name} · ${customerInfo.phone}${customerInfo.email ? ` · ${customerInfo.email}` : ""}`
    : null;

  const orderingSummary = orderType === "delivery"
    ? (customerInfo.address
        ? `Delivery to ${customerInfo.address}${customerInfo.city ? ", " + customerInfo.city : ""}`
        : "Delivery — add address")
    : `Pickup`;

  const timeSummary = customerInfo.scheduledFor
    ? `Scheduled for ${new Date(customerInfo.scheduledFor).toLocaleString()}`
    : `ASAP · ~${orderType === "delivery" ? estimatedDeliveryMinutes : estimatedPickupMinutes} min`;

  const paymentSummary = customerInfo.paymentMethod === "card"
    ? "Pay online (card)"
    : `Cash on ${orderType === "pickup" ? "pickup" : "delivery"}`;

  const tipsSummary = tipAmount > 0
    ? `${tipPercent}% (${formatCurrency(tipAmount)})`
    : "No tip";

  const notesSummary = customerInfo.notes
    ? customerInfo.notes.length > 60 ? customerInfo.notes.slice(0, 60) + "…" : customerInfo.notes
    : "No notes";

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white sm:rounded-2xl w-full max-w-4xl max-h-[96vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-lg font-bold text-gray-900 truncate">Checkout</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid md:grid-cols-2 gap-0">
            {/* ── Left column: settings cards ── */}
            <div className="p-5 space-y-3 md:border-r md:border-gray-100">
              {/* CONTACT */}
              <SectionCard
                icon={<User className="w-4 h-4" />}
                label="CONTACT"
                summary={contactSummary ?? "Add details"}
                onEdit={() => toggleEdit("contact")}
                expanded={editingSection === "contact"}
                primary={theme.primaryColor}
              >
                <div className="grid grid-cols-2 gap-2 pt-3">
                  <input
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                    placeholder="Full name *" value={customerInfo.name}
                    onChange={e => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                  />
                  <input
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                    placeholder="Phone *" value={customerInfo.phone}
                    onChange={e => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                  />
                  <input
                    className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                    placeholder="Email (optional)" value={customerInfo.email}
                    onChange={e => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                  />
                </div>
              </SectionCard>

              {/* ORDERING METHOD (address only — order-type toggle stays on the main page) */}
              <SectionCard
                icon={orderType === "delivery" ? <Truck className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
                label="ORDERING METHOD"
                summary={orderingSummary}
                onEdit={orderType === "delivery" ? () => toggleEdit("ordering") : undefined}
                expanded={editingSection === "ordering" && orderType === "delivery"}
                primary={theme.primaryColor}
              >
                {orderType === "delivery" && (
                  <div className="pt-3 space-y-2">
                    {googleEnabled && gmapsLoaded ? (
                      <Autocomplete
                        onLoad={(ac) => { autocompleteRef.current = ac; }}
                        onPlaceChanged={handlePlaceChanged}
                        options={{ fields: ["address_components", "formatted_address", "geometry"], types: ["address"] }}
                      >
                        <input
                          type="text" placeholder="Start typing your address…"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                          style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                          value={customerInfo.address}
                          onChange={e => setCustomerInfo({ ...customerInfo, address: e.target.value })}
                        />
                      </Autocomplete>
                    ) : (
                      <input
                        type="text" placeholder="Street address *"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                        style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                        value={customerInfo.address}
                        onChange={e => setCustomerInfo({ ...customerInfo, address: e.target.value })}
                      />
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text" placeholder="City"
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                        style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                        value={customerInfo.city}
                        onChange={e => setCustomerInfo({ ...customerInfo, city: e.target.value })}
                      />
                      <input
                        type="text" placeholder="Zip"
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                        style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                        value={customerInfo.zip}
                        onChange={e => setCustomerInfo({ ...customerInfo, zip: e.target.value })}
                      />
                    </div>
                    {hasZones && geocoding && (
                      <p className="text-xs text-gray-500 flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin" /> Locating your address…
                      </p>
                    )}
                    {hasZones && !geocoding && geocodeError && (
                      <p className="text-xs text-red-600">{geocodeError}</p>
                    )}
                    {hasZones && resolvedZone && resolvedZone.inside && (
                      <p className="text-xs text-gray-600">
                        You're in <span className="font-semibold" style={{ color: resolvedZone.zone.color }}>{resolvedZone.zone.name}</span>
                        {" "}— Fee {formatCurrency(resolvedZone.zone.deliveryFee)}, ~{resolvedZone.zone.estimatedMinutes} min.
                      </p>
                    )}
                    {hasZones && resolvedZone && !resolvedZone.inside && (
                      <p className="text-xs text-amber-700">
                        <strong>Outside our standard delivery areas.</strong> Fee {formatCurrency(resolvedZone.zone.deliveryFee)}, ETA ~{resolvedZone.zone.estimatedMinutes} min.
                      </p>
                    )}
                  </div>
                )}
              </SectionCard>

              {/* AVAILABLE TIME CHOICE */}
              <SectionCard
                icon={<Clock className="w-4 h-4" />}
                label="AVAILABLE TIME CHOICE"
                summary={timeSummary}
                onEdit={() => toggleEdit("time")}
                expanded={editingSection === "time"}
                primary={theme.primaryColor}
              >
                <div className="pt-3 space-y-2">
                  <label className="block text-xs text-gray-500">Schedule for later (optional)</label>
                  <input
                    type="datetime-local"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                    style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                    min={new Date().toISOString().slice(0, 16)}
                    value={customerInfo.scheduledFor}
                    onChange={e => setCustomerInfo({ ...customerInfo, scheduledFor: e.target.value })}
                  />
                  {customerInfo.scheduledFor && (
                    <button
                      onClick={() => setCustomerInfo({ ...customerInfo, scheduledFor: "" })}
                      className="text-xs text-gray-500 hover:text-gray-700 underline"
                    >
                      Switch to ASAP
                    </button>
                  )}
                </div>
              </SectionCard>

              {/* PAYMENT METHOD */}
              <SectionCard
                icon={<CreditCard className="w-4 h-4" />}
                label="PAYMENT METHOD"
                summary={paymentSummary}
                onEdit={() => toggleEdit("payment")}
                expanded={editingSection === "payment"}
                primary={theme.primaryColor}
              >
                <div className="pt-3 grid grid-cols-2 gap-2">
                  {[
                    { value: "cash", label: `Cash on ${orderType === "pickup" ? "Pickup" : "Delivery"}` },
                    { value: "card", label: "Pay Online (Card)" },
                  ].map(pm => (
                    <button
                      key={pm.value}
                      onClick={() => setCustomerInfo({ ...customerInfo, paymentMethod: pm.value })}
                      className="py-2 px-3 rounded-lg border-2 text-xs font-semibold transition"
                      style={customerInfo.paymentMethod === pm.value
                        ? { borderColor: theme.primaryColor, backgroundColor: `${theme.primaryColor}12`, color: theme.primaryColor }
                        : { borderColor: "#e5e7eb", color: "#4b5563" }
                      }
                    >
                      {pm.label}
                    </button>
                  ))}
                </div>
                {customerInfo.paymentMethod === "card" && !cardPaymentEnabled && (
                  <div className="mt-2 p-2.5 bg-blue-50 rounded-lg text-xs text-blue-700 flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    Online card payment coming soon. Please pay on {orderType === "pickup" ? "pickup" : "delivery"} for now.
                  </div>
                )}
              </SectionCard>

              {/* TIPS */}
              <SectionCard
                icon={<Heart className="w-4 h-4" />}
                label="TIPS?"
                summary={tipsSummary}
                onEdit={() => toggleEdit("tips")}
                expanded={editingSection === "tips"}
                primary={theme.primaryColor}
              >
                <div className="pt-3 flex flex-wrap gap-2">
                  {[0, 10, 15, 20].map(p => (
                    <button
                      key={p}
                      onClick={() => setTipPercent(p)}
                      className="px-3 py-1.5 rounded-lg border-2 text-xs font-semibold transition"
                      style={tipPercent === p
                        ? { borderColor: theme.primaryColor, backgroundColor: `${theme.primaryColor}12`, color: theme.primaryColor }
                        : { borderColor: "#e5e7eb", color: "#4b5563" }
                      }
                    >
                      {p === 0 ? "No tip" : `${p}%`}
                    </button>
                  ))}
                </div>
              </SectionCard>

              {/* NOTES */}
              <SectionCard
                icon={<Edit2 className="w-4 h-4" />}
                label="ORDER NOTES"
                summary={notesSummary}
                onEdit={() => toggleEdit("notes")}
                expanded={editingSection === "notes"}
                primary={theme.primaryColor}
              >
                <textarea
                  className="mt-3 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 resize-none"
                  style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                  rows={2}
                  placeholder="Any special instructions…"
                  value={customerInfo.notes}
                  onChange={e => setCustomerInfo({ ...customerInfo, notes: e.target.value })}
                />
              </SectionCard>
            </div>

            {/* ── Right column: order summary ── */}
            <div className="p-5 bg-gray-50">
              <div className="grid grid-cols-[40px_1fr_70px] gap-3 text-xs font-bold text-gray-500 uppercase pb-2 border-b border-gray-200">
                <span>Qty</span>
                <span>Item</span>
                <span className="text-right">Price</span>
              </div>
              {cart.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-sm">Cart is empty</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {cart.map((ci, i) => (
                    <div key={i} className="grid grid-cols-[40px_1fr_70px] gap-3 py-2.5 text-sm items-start">
                      <span className="font-semibold text-gray-700">{ci.quantity}×</span>
                      <span className="text-gray-700">
                        {ci.menuItem.name}
                        {ci.variant && <span className="block text-xs text-gray-400">{ci.variant.name}</span>}
                      </span>
                      <span className="text-right text-gray-700 font-medium">{formatCurrency(ci.lineTotal)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Coupon */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                {couponId ? (
                  <div className="flex items-center justify-between text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
                    <span className="flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" /> Code <span className="font-mono font-bold">{couponCode}</span> applied</span>
                    <span className="font-bold">-{formatCurrency(couponDiscount)}</span>
                  </div>
                ) : showCouponField ? (
                  <div className="flex gap-2">
                    <input
                      type="text" placeholder="Coupon code"
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2"
                      style={{ "--tw-ring-color": theme.primaryColor } as React.CSSProperties}
                      value={couponCode}
                      onChange={e => setCouponCode(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === "Enter" && applyCoupon()}
                    />
                    <button
                      onClick={applyCoupon} disabled={couponLoading}
                      className="bg-gray-900 text-white text-sm font-semibold px-3 rounded-lg hover:bg-gray-800 transition disabled:opacity-50"
                    >
                      {couponLoading ? "..." : "Apply"}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCouponField(true)}
                    className="text-sm font-semibold underline"
                    style={{ color: theme.primaryColor }}
                  >
                    Add coupon code
                  </button>
                )}
              </div>

              {/* Totals */}
              <div className="mt-4 pt-3 border-t border-gray-200 space-y-1 text-sm">
                <div className="flex justify-between text-gray-600"><span>Sub-Total</span><span>{formatCurrency(subtotal)}</span></div>
                {totalDiscount > 0 && (
                  <div className="flex justify-between text-green-600 font-medium"><span>Discount</span><span>-{formatCurrency(totalDiscount)}</span></div>
                )}
                {orderType === "delivery" && (
                  <div className="flex justify-between text-gray-600"><span>Delivery</span><span>{formatCurrency(deliveryFee)}</span></div>
                )}
                <div className="flex justify-between text-gray-600"><span>Tax ({taxRate}%)</span><span>{formatCurrency(taxAmount)}</span></div>
                {tipAmount > 0 && (
                  <div className="flex justify-between text-gray-600"><span>Tip</span><span>{formatCurrency(tipAmount)}</span></div>
                )}
                <div className="flex justify-between font-bold text-gray-900 text-base pt-2 border-t border-gray-200 mt-1">
                  <span>Total</span><span>{formatCurrency(total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-5 py-4 bg-white flex-shrink-0 flex items-center gap-3">
          <div className="flex-1">
            <div className="text-xs text-gray-500 uppercase font-bold">Total</div>
            <div className="text-lg font-bold text-gray-900">{formatCurrency(total)}</div>
          </div>
          <button
            onClick={placeOrder}
            disabled={orderLoading || cart.length === 0}
            className="flex-1 sm:flex-none text-white font-bold py-3 px-6 rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-50 text-base"
            style={{ backgroundColor: theme.primaryColor }}
          >
            {orderLoading && <Loader2 className="w-5 h-5 animate-spin" />}
            {orderLoading
              ? "Placing order…"
              : `Place ${orderType === "delivery" ? "Delivery" : "Pickup"} Order Now`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Card with edit-pencil toggle ────────────────────────────────────────────
function SectionCard({
  icon, label, summary, onEdit, expanded, primary, children,
}: {
  icon: React.ReactNode;
  label: string;
  summary: string;
  onEdit?: () => void;
  expanded: boolean;
  primary: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-gray-400 flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wide">{label}</div>
          <div className="text-sm text-gray-800 truncate">{summary}</div>
        </div>
        {onEdit && (
          <button
            onClick={onEdit}
            title="Edit"
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 flex-shrink-0"
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <Edit2 className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
      {expanded && children && (
        <div className="px-4 pb-3 border-t border-gray-100" style={{ backgroundColor: `${primary}06` }}>
          {children}
        </div>
      )}
    </div>
  );
}
