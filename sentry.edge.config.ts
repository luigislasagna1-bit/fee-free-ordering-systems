// ─────────────────────────────────────────────────────────────────────────
// Sentry — Edge runtime init
// ─────────────────────────────────────────────────────────────────────────
// Loaded by src/instrumentation.ts when NEXT_RUNTIME === "edge". Covers
// the proxy.ts middleware + any route handlers that opt into the edge
// runtime via `export const runtime = "edge"`.
// ─────────────────────────────────────────────────────────────────────────
import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent, scrubSentryBreadcrumb } from "@/lib/sentry-scrub";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  enabled:
    process.env.NODE_ENV === "production" ||
    process.env.SENTRY_FORCE_ENABLE === "1",
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  // Gift Wallet Pass (2026-08-03): the proxy sees every request path,
  // including /order/:slug/gift/:grantId — strip any code before it leaves
  // this runtime. See src/lib/sentry-scrub.ts.
  beforeSend: (event) => scrubSentryEvent(event),
  beforeSendTransaction: (event) => scrubSentryEvent(event),
  beforeBreadcrumb: (breadcrumb) => scrubSentryBreadcrumb(breadcrumb),
});
