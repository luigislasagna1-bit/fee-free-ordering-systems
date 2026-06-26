"use client";
import { X } from "lucide-react";

/** Owner-configured promotional popup shown on the ordering page (Fabrizio 2026-06-25).
 *  Content (image/title/body/button) is the OWNER'S text — never translated. Only the chrome
 *  (the close button's aria-label) is localized, passed in as `closeLabel`. Theme-aware: the
 *  button uses the restaurant's primary color (no hardcoded brand colors on /order routes). */
export type OrderingPopupConfig = {
  enabled?: boolean;
  imageUrl?: string | null;
  title?: string | null;
  body?: string | null;
  buttonLabel?: string | null;
  buttonUrl?: string | null;
};

export function PromotionalPopup({
  config,
  onClose,
  primaryColor,
  closeLabel,
}: {
  config: OrderingPopupConfig;
  onClose: () => void;
  primaryColor: string;
  closeLabel: string;
}) {
  const hasButton = !!(config.buttonLabel && config.buttonLabel.trim() && config.buttonUrl && config.buttonUrl.trim());
  // Absolute URLs open in a new tab so the customer never loses their cart/order page; an
  // in-page anchor or relative path navigates in place.
  const external = !!config.buttonUrl && /^https?:\/\//i.test(config.buttonUrl.trim());

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
          {hasButton ? (
            <a
              href={config.buttonUrl!.trim()}
              {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              onClick={onClose}
              className="mt-2 inline-block rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ backgroundColor: primaryColor }}
            >
              {config.buttonLabel}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
