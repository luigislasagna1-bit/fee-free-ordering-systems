// ─────────────────────────────────────────────────────────────────────────
// Next.js client instrumentation — boots Sentry's browser SDK.
// ─────────────────────────────────────────────────────────────────────────
// Auto-discovered by Next.js 15.3+ from this path (same convention as
// instrumentation.ts, but client-only). Captures uncaught browser errors,
// unhandled promise rejections, and Sentry.captureX() calls from any
// client component.
//
// Replay is configured for ERROR ONLY (replaysSessionSampleRate=0,
// replaysOnErrorSampleRate=1.0) — we don't record every session, but when
// something does throw we can replay the user's last 30 seconds to see
// what they clicked. Big debugging win without burning quota.
//
// onRouterTransitionStart is the Next.js 15.3+ hook that lets Sentry tag
// performance traces with the new route, so we can see which page a slow
// load happened on.
// ─────────────────────────────────────────────────────────────────────────
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,
  integrations: [
    Sentry.replayIntegration({
      // Mask all text + inputs by default — prevents PII (customer
      // emails, addresses, phone numbers) from leaving the browser
      // in replay recordings.
      maskAllText: true,
      maskAllInputs: true,
      blockAllMedia: true,
    }),
  ],
  // Same prod-gate as the server config — don't spam errors from dev.
  enabled:
    process.env.NODE_ENV === "production" ||
    process.env.NEXT_PUBLIC_SENTRY_FORCE_ENABLE === "1",
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
