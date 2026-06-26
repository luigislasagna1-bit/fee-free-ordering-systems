"use client";
import { X } from "lucide-react";

/** Owner-configured promotional popup shown on the ordering page (Fabrizio 2026-06-25).
 *  Content (image/title/body/button) is the OWNER'S text — never translated. Only the chrome
 *  (the close button's aria-label) is localized, passed in as `closeLabel`. Theme-aware: the
 *  button uses the restaurant's primary color (no hardcoded brand colors on /order routes).
 *  The button can: link to a free URL, OPEN a specific promotion's "Get it now" detail, or
 *  APPLY a coupon to the order. Configured under Admin → Marketing → Promo Popup. */
export type OrderingPopupConfig = {
  enabled?: boolean;
  imageUrl?: string | null;
  title?: string | null;
  body?: string | null;
  buttonLabel?: string | null;
  /** What the button does. Defaults to "url" (back-compat with popups that only set buttonUrl). */
  buttonAction?: "url" | "promo" | "coupon" | null;
  buttonUrl?: string | null;
  buttonPromoId?: string | null;
  buttonCouponCode?: string | null;
};

export function PromotionalPopup({
  config,
  onClose,
  primaryColor,
  closeLabel,
  onOpenPromo,
  onApplyCoupon,
}: {
  config: OrderingPopupConfig;
  onClose: () => void;
  primaryColor: string;
  closeLabel: string;
  /** Open a specific promotion's "Get it now" detail (popup button → promo). */
  onOpenPromo?: (promoId: string) => void;
  /** Apply a coupon code to the order (popup button → coupon). */
  onApplyCoupon?: (code: string) => void;
}) {
  const action = config.buttonAction || (config.buttonUrl ? "url" : null);
  const labelOk = !!(config.buttonLabel && config.buttonLabel.trim());
  const urlBtn = action === "url" && !!config.buttonUrl?.trim();
  const promoBtn = action === "promo" && !!config.buttonPromoId;
  const couponBtn = action === "coupon" && !!config.buttonCouponCode;
  const hasButton = labelOk && (urlBtn || promoBtn || couponBtn);
  // Absolute URLs open in a new tab so the customer never loses their cart/order page; an
  // in-page anchor or relative path navigates in place.
  const external = urlBtn && /^https?:\/\//i.test(config.buttonUrl!.trim());

  const btnClass =
    "mt-2 inline-block rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90";
  const btnStyle = { backgroundColor: primaryColor };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="absolute right-2 top-2 z-10 rounded-full bg-white/85 p-1.5 text-gray-600 shadow transition hover:text-gray-900"
        >
          <X className="h-5 w-5" />
        </button>
        {config.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={config.imageUrl} alt="" className="max-h-56 w-full object-cover" />
        ) : null}
        <div className="space-y-2 p-5">
          {config.title?.trim() ? <h3 className="text-lg font-bold text-gray-900">{config.title}</h3> : null}
          {config.body?.trim() ? <p className="whitespace-pre-line text-sm text-gray-600">{config.body}</p> : null}
          {hasButton && urlBtn ? (
            <a
              href={config.buttonUrl!.trim()}
              {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              onClick={onClose}
              className={btnClass}
              style={btnStyle}
            >
              {config.buttonLabel}
            </a>
          ) : hasButton && promoBtn ? (
            <button
              type="button"
              onClick={() => {
                onOpenPromo?.(config.buttonPromoId!);
                onClose();
              }}
              className={btnClass}
              style={btnStyle}
            >
              {config.buttonLabel}
            </button>
          ) : hasButton && couponBtn ? (
            <button
              type="button"
              onClick={() => {
                onApplyCoupon?.(config.buttonCouponCode!);
                onClose();
              }}
              className={btnClass}
              style={btnStyle}
            >
              {config.buttonLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
