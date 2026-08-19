"use client";
import { useEffect, useState, useCallback, useRef } from "react";

/**
 * Guards the customer against silently walking away from the payment page
 * mid-checkout (Luigi 2026-08-17: "customers shouldn't be able to exit the
 * payment flow without paying... shouldn't be able to click back").
 *
 * Two browser mechanisms, both deliberately limited — this is a deterrent
 * layered on top of the real backstop (the 10-minute abandoned-payment cron +
 * the instant "Cancel my order" action this hook's modal offers), not a
 * guarantee. A browser cannot be forced to stay on a page.
 *
 *   - popstate: a dummy history entry is pushed on mount so the browser BACK
 *     button fires a popstate we can intercept instead of actually
 *     navigating away. We re-push the dummy entry (staying put) and open the
 *     confirm modal — unless a payment is currently in flight (see below).
 *   - beforeunload: shows the browser's own generic "Leave site?" prompt on
 *     tab-close/refresh/address-bar navigation. Cannot run async code, cannot
 *     customize the message in any modern browser, and cannot be relied on to
 *     fire the cancel API call — it is a nudge, nothing more.
 *
 * `paymentInFlight` gates BOTH: capture is authorize-then-capture and our DB's
 * paymentStatus does not update synchronously the instant
 * stripe.confirmPayment() is called, and on the SUCCESS path Stripe.js
 * performs the redirect itself (the call never "returns"). Offering an
 * instant-cancel button — or popping a stray "Leave site?" prompt — during
 * that window risks confusing a customer who just successfully paid. The
 * 10-minute cron backstop covers the residual few-second gap where someone
 * force-quits mid-authorization.
 */
export function usePreventPaymentAbandon(opts: { enabled: boolean; paymentInFlight: boolean }) {
  const { enabled, paymentInFlight } = opts;
  const [showConfirm, setShowConfirm] = useState(false);
  // Read inside the listener via a ref so the popstate handler (attached
  // once) always sees the LATEST in-flight state without needing to be
  // re-attached on every paying/setPaying toggle.
  const inFlightRef = useRef(paymentInFlight);
  useEffect(() => { inFlightRef.current = paymentInFlight; }, [paymentInFlight]);

  useEffect(() => {
    if (!enabled) return;
    // Dummy entry to intercept — pressing back lands here first, we catch it,
    // and re-push to stay put rather than actually leaving.
    window.history.pushState(null, "", window.location.href);

    const onPopState = () => {
      window.history.pushState(null, "", window.location.href);
      if (!inFlightRef.current) setShowConfirm(true);
      // While paying: silently re-push, no modal — the inline "processing"
      // notice the page already renders is the only feedback.
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (inFlightRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [enabled]);

  const requestLeave = useCallback(() => {
    if (paymentInFlight) return;
    setShowConfirm(true);
  }, [paymentInFlight]);
  const dismiss = useCallback(() => setShowConfirm(false), []);

  return { showConfirm, requestLeave, dismiss };
}
