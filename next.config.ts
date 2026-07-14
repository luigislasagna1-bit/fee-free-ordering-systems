import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3", "pdfkit"],
  // Web build stamp baked into the client bundle at build time. The kitchen 3-dot
  // menu shows this next to the NATIVE app version so we can tell — for an
  // installed iOS/Android app that loads the LIVE /kitchen — whether a device is
  // running current web code or a stale WebView-cached bundle (the root cause of
  // "the fix didn't reach the installed app"). /api/build-id returns the CURRENT
  // deploy's value at runtime; the kitchen compares the two and reloads when idle.
  env: {
    NEXT_PUBLIC_WEB_BUILD: (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || "dev",
  },
  experimental: {
    // Prevent Next.js HMR cache from serving stale fetch responses across
    // hot-reloads — belt-and-suspenders alongside the node:https Connection:close fix.
    serverComponentsHmrCache: false,
  },
  images: {
    // Whitelist the hosts we accept user-uploaded images from. Without this
    // entry, /_next/image returns 400 INVALID_IMAGE_OPTIMIZE_REQUEST for any
    // external source — which is what was breaking logos + banners on the
    // hosted marketing pages. Vercel Blob's hostname is per-store
    // (e.g. <store-id>.public.blob.vercel-storage.com), so a wildcard
    // covers any blob bucket we provision.
    remotePatterns: [
      { protocol: "https", hostname: "**.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "**.blob.vercel-storage.com" },
    ],
  },
  // Baseline HTTP security headers (2026-07-06 security audit). These are the
  // SAFE-to-enforce set — none touch script execution, so no CSP script-src
  // here (that needs a report-only rollout with nonces; tracked in TODO). HSTS
  // ships WITHOUT `preload` deliberately — preload is a months-long one-way
  // commitment; add it only after confirming no plain-HTTP subdomain is needed.
  async headers() {
    const SECURITY_HEADERS = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
      // Kill camera/mic (never used); KEEP payment (Stripe Elements delegates to
      // js.stripe.com) + geolocation (order-page address autocomplete + zones map,
      // also delegated into the embed iframe) or those features break.
      { key: "Permissions-Policy", value: 'camera=(), microphone=(), payment=(self "https://js.stripe.com"), geolocation=(self)' },
    ];
    // Anti-clickjacking for the whole app EXCEPT the embeddable widget and the
    // order page it renders — those MUST stay frameable by third-party sites.
    // next.config can't unset a header, so scope the frame rule to
    // non-embed/non-order paths with a negative lookahead.
    const FRAME_HEADERS = [
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
    ];
    return [
      { source: "/(.*)", headers: SECURITY_HEADERS },
      { source: "/((?!embed|order).*)", headers: FRAME_HEADERS },
    ];
  },
};

// Plugin order: next-intl wraps first (Babel-style locale rewriting), then
// Sentry wraps the lot (sourcemap upload + perf instrumentation injection).
// Reversing this order causes Sentry's webpack plugin to miss the locale
// route segments, so don't swap them.
export default withSentryConfig(withNextIntl(nextConfig), {
  // Sentry org + project — read from env at build time. If unset (e.g. on
  // a fresh clone before Sentry's been provisioned), withSentryConfig is
  // a no-op for sourcemap upload but the runtime SDKs still work fine.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Silence build-time noise locally; CI still sees full logs.
  silent: !process.env.CI,
  // Upload sourcemaps from client + server bundles so stack traces in
  // the Sentry UI map back to TypeScript source. (`hideSourceMaps` moved
  // under `sourcemaps` in @sentry/nextjs v10 — keeping the strip behaviour
  // for the served bundle but still uploading them to Sentry.)
  widenClientFileUpload: true,
  sourcemaps: {
    disable: false,
    deleteSourcemapsAfterUpload: true,
  },
  // Drop the Sentry SDK's own logger in prod — they're verbose by default.
  disableLogger: true,
  // Tunneling routes Sentry SDK requests through our own /monitoring
  // endpoint so ad-blockers don't drop them. Not enabled by default
  // since most ad-blockers don't target Sentry, but here as a flip
  // when we hit reports of "no events from user X" later.
  // tunnelRoute: "/monitoring",
});
