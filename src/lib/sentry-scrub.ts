/**
 * Sentry URL scrubbing — strips a Gift Wallet Pass code out of anything
 * Sentry might otherwise ship to sentry.io.
 *
 * The pass code rides in the URL FRAGMENT (`#g=...`) specifically so it
 * never reaches a server log or Referer header — but Sentry captures the
 * BROWSER's `window.location` (fragment included) in event/breadcrumb/
 * transaction data, and none of the three Sentry configs (client, server,
 * edge) had any `beforeSend`/`beforeSendTransaction`/`beforeBreadcrumb` URL
 * redaction before this feature — `replayIntegration`'s `maskAllText` masks
 * DOM TEXT, not URLs. Verified 2026-08-03: tracesSampleRate 0.1,
 * replaysOnErrorSampleRate 1.0, zero URL redaction. Without this, a live
 * code would be shipped to sentry.io on the first captured error on the
 * claim page.
 *
 * Also rewrites the path segment so the grant id (a cuid, not secret, but
 * still worth not indexing into error-tracking dashboards verbatim) reads
 * as `/gift/[redacted]`.
 */
const FRAGMENT_RE = /#g=[^&\s]*/gi;
const GIFT_PATH_RE = /\/order\/[^/?#]+\/gift\/[^/?#]+/gi;

export function scrubGiftPassUrl(url: string): string {
  if (typeof url !== "string" || !url) return url;
  let out = url.replace(FRAGMENT_RE, "#g=[redacted]");
  out = out.replace(GIFT_PATH_RE, (m) => m.replace(/\/gift\/[^/?#]+$/, "/gift/[redacted]"));
  return out;
}

function scrubDeep(value: unknown): unknown {
  if (typeof value === "string") return scrubGiftPassUrl(value);
  if (Array.isArray(value)) return value.map(scrubDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = scrubDeep(v);
    return out;
  }
  return value;
}

/**
 * Apply to a Sentry `event` (error or transaction) before sending. Typed as
 * `any` in/out deliberately — the exact Sentry Event/TransactionEvent shape
 * differs per call site (beforeSend vs beforeSendTransaction, and across the
 * client/server/edge SDKs), and this function's only job is to mutate
 * whichever of these known-shaped fields happen to be present, which a
 * generic constrained to a plain index type can't express cleanly. Every
 * access is optional-chained/guarded, so a shape that doesn't have a given
 * field is simply skipped.
 */
export function scrubSentryEvent(event: any): any {
  try {
    if (event?.request?.url) event.request.url = scrubGiftPassUrl(event.request.url);
    if (event?.request?.headers?.Referer) event.request.headers.Referer = scrubGiftPassUrl(event.request.headers.Referer);
    if (typeof event?.transaction === "string") event.transaction = scrubGiftPassUrl(event.transaction);
    if (Array.isArray(event?.breadcrumbs)) event.breadcrumbs = event.breadcrumbs.map((b: any) => scrubSentryBreadcrumb(b));
    if (event?.extra) event.extra = scrubDeep(event.extra);
    if (event?.contexts) event.contexts = scrubDeep(event.contexts);
  } catch {
    // Scrubbing must never block a send — worst case an un-scrubbed field
    // survives, which is the pre-existing behaviour, not a new regression.
  }
  return event;
}

/** Apply to a Sentry breadcrumb (fetch/xhr/navigation entries carry URLs).
 *  Typed `any` in/out for the same reason as scrubSentryEvent above. */
export function scrubSentryBreadcrumb(breadcrumb: any): any {
  try {
    if (breadcrumb?.data?.url) breadcrumb.data.url = scrubGiftPassUrl(breadcrumb.data.url);
    if (breadcrumb?.data?.to) breadcrumb.data.to = scrubGiftPassUrl(breadcrumb.data.to);
    if (breadcrumb?.data?.from) breadcrumb.data.from = scrubGiftPassUrl(breadcrumb.data.from);
    if (typeof breadcrumb?.message === "string") breadcrumb.message = scrubGiftPassUrl(breadcrumb.message);
  } catch {
    // Never block on a scrub failure.
  }
  return breadcrumb;
}
