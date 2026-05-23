// ─────────────────────────────────────────────────────────────────────────
// Sentry — Edge runtime init
// ─────────────────────────────────────────────────────────────────────────
// Loaded by src/instrumentation.ts when NEXT_RUNTIME === "edge". Covers
// the proxy.ts middleware + any route handlers that opt into the edge
// runtime via `export const runtime = "edge"`.
// ─────────────────────────────────────────────────────────────────────────
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  sendDefaultPii: false,
  enabled:
    process.env.NODE_ENV === "production" ||
    process.env.SENTRY_FORCE_ENABLE === "1",
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
});
