// ─────────────────────────────────────────────────────────────────────────
// Next.js instrumentation hook — boots Sentry's server + edge SDKs.
// ─────────────────────────────────────────────────────────────────────────
// Next.js auto-calls register() once per runtime at boot. We branch on
// NEXT_RUNTIME and lazy-import the matching Sentry config so the Node SDK
// doesn't get pulled into the edge bundle (and vice versa). Both configs
// are tiny but the runtimes have different module resolution.
//
// Client-side Sentry init lives in `src/instrumentation-client.ts` (auto-
// discovered by Next.js 15.3+), NOT here — this file only runs server-side.
//
// onRequestError is the Next.js 15+ hook for capturing thrown errors from
// server components / route handlers / server actions, forwarding them to
// Sentry with the request context attached.
// ─────────────────────────────────────────────────────────────────────────
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

export const onRequestError = Sentry.captureRequestError;
