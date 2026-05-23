// ─────────────────────────────────────────────────────────────────────────
// Sentry — Node.js (server) runtime init
// ─────────────────────────────────────────────────────────────────────────
// Loaded by src/instrumentation.ts when NEXT_RUNTIME === "nodejs". Captures
// uncaught exceptions, unhandled rejections, and explicit Sentry.captureX
// calls from server components, route handlers, and server actions.
//
// Disabled when NODE_ENV !== "production" so local dev + preview deploys
// don't spam the issue queue. Enable temporarily in dev by setting
// SENTRY_FORCE_ENABLE=1 in .env.local if you're hunting a server-side bug.
// ─────────────────────────────────────────────────────────────────────────
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // 10% perf-tracing sample rate — enough signal for trends, light on
  // the free-tier quota (10K perf events/mo). Errors are always 100%.
  tracesSampleRate: 0.1,
  // Don't ship server-side breadcrumbs that may contain PII to Sentry by
  // default. We can opt into them per-event with captureException options
  // when we genuinely need them for debugging.
  sendDefaultPii: false,
  // Only run in prod by default. Override with SENTRY_FORCE_ENABLE=1 in
  // .env.local if you need to test capture flows in dev.
  enabled:
    process.env.NODE_ENV === "production" ||
    process.env.SENTRY_FORCE_ENABLE === "1",
  // Tag every event with the deployment env so we can filter "production
  // vs preview" in the Sentry UI. Vercel sets this automatically.
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
});
