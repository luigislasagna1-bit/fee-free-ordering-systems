/**
 * Checkout rejection logging — why a customer was told "no" at /api/orders.
 *
 * Luigi 2026-08-14. The 500 path has alerted since stabilization H9, but the ~69
 * deliberate 4xx rejections were completely silent. When customers reported
 * "the promo says it's registered to a different email", there was no server-side
 * trace of it at all — the diagnosis had to be reconstructed from the source and
 * from what one customer remembered. That is the gap this closes: the NEXT time a
 * customer is refused, the reason is in the logs with enough context to act on,
 * and nobody has to rely on a shopper's memory of what they saw.
 *
 * Grep the platform logs for `[checkout-rejected]`.
 *
 * 🔒 PII rule: this logs the SHAPE of the rejection, never who it happened to.
 * Name / email / phone / address are deliberately absent — only booleans saying
 * whether an identity was supplied. The `error` text is server-authored and the
 * coupon code is customer-typed but not personal, so both are safe to record.
 * Anything added here later must clear the same bar (see PII_ERASURE_MAP in
 * src/lib/data-erasure.ts — a log line is not erasable, so PII must never enter).
 */
import { reportError } from "@/lib/report-error";

/**
 * Rejection codes that should never happen to a legitimate customer, and so are
 * escalated to Sentry rather than just logged. Everything else (store closed,
 * below minimum, item sold out) is ordinary business and stays log-only.
 *
 * `promo_email_mismatch` is here because of the 2026-08-14 FIRSTBUY bug: a
 * broadcast code was being treated as identity-bound and rejecting whole orders.
 * Post-fix it should only ever fire when someone types another person's 1:1 gift
 * code — genuinely rare, and worth knowing about if it is not.
 */
const ESCALATE_CODES = new Set(["promo_email_mismatch"]);

export type CheckoutRejection = {
  status: number;
  /** Machine code from the response body, when the route set one. */
  code?: string | null;
  /** Server-authored message shown to the customer. Never customer input. */
  error?: string | null;
  restaurantSlug?: string | null;
  orderType?: string | null;
  /** Customer-typed coupon code — the key signal for promo-integrity bugs. */
  couponCode?: string | null;
  itemCount?: number | null;
  /** Identity PRESENCE only — never the values. */
  hadEmail?: boolean;
  hadPhone?: boolean;
};

/**
 * Record a checkout rejection. Fire-and-forget and fully self-contained: it
 * never throws, never awaits I/O, and must never change the response the
 * customer gets. Safe to call on the hot path.
 */
export function logCheckoutRejection(r: CheckoutRejection): void {
  try {
    const payload = {
      event: "checkout_rejected",
      status: r.status,
      code: r.code ?? null,
      error: typeof r.error === "string" ? r.error.slice(0, 300) : null,
      restaurantSlug: r.restaurantSlug ?? null,
      orderType: r.orderType ?? null,
      couponCode: r.couponCode ? String(r.couponCode).slice(0, 50) : null,
      itemCount: typeof r.itemCount === "number" ? r.itemCount : null,
      hadEmail: !!r.hadEmail,
      hadPhone: !!r.hadPhone,
    };
    // One greppable line — Vercel captures stderr.
    console.error("[checkout-rejected]", JSON.stringify(payload));
    if (r.code && ESCALATE_CODES.has(r.code)) {
      // reportError's context is scalar-only (no booleans) — flatten for Sentry.
      reportError(new Error(`Checkout rejected: ${r.code}`), {
        ...payload,
        hadEmail: String(payload.hadEmail),
        hadPhone: String(payload.hadPhone),
      });
    }
  } catch {
    /* observability must never break a checkout */
  }
}

/**
 * Pull the loggable (non-PII) shape out of a request body. Tolerates any
 * malformed/absent body — this runs on the failure path, where the body is the
 * least trustworthy thing in the request.
 */
export function rejectionContextFromBody(body: unknown): Partial<CheckoutRejection> {
  const b = (body ?? {}) as Record<string, unknown>;
  return {
    restaurantSlug: typeof b.restaurantSlug === "string" ? b.restaurantSlug.slice(0, 100) : null,
    orderType: typeof b.type === "string" ? b.type.slice(0, 30) : null,
    couponCode: typeof b.couponCode === "string" ? b.couponCode : null,
    itemCount: Array.isArray(b.items) ? b.items.length : null,
    hadEmail: typeof b.customerEmail === "string" && b.customerEmail.trim().length > 0,
    hadPhone: typeof b.customerPhone === "string" && b.customerPhone.trim().length > 0,
  };
}
