"use client";
// ─────────────────────────────────────────────────────────────────────────
// App-router global error boundary.
// ─────────────────────────────────────────────────────────────────────────
// Catches client-side React errors that escape all per-route error.tsx
// boundaries (i.e. errors thrown during initial render of a layout). Next.js
// renders this OUTSIDE the normal layout, so it must include its own <html>
// + <body>.
//
// We forward the error to Sentry on mount, then render a minimal "something
// broke" screen. The branding stays light here on purpose — we can't trust
// the layout to render either.
// ─────────────────────────────────────────────────────────────────────────
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#fafafa" }}>
        <div style={{ maxWidth: 480, margin: "10vh auto", padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111", marginBottom: 8 }}>
            Something went wrong
          </h1>
          <p style={{ color: "#666", lineHeight: 1.5, marginBottom: 24 }}>
            Our team has been notified automatically. Try refreshing the page
            — if the problem persists, please email{" "}
            <a href="mailto:support@feefreeordering.com" style={{ color: "#10b981" }}>
              support@feefreeordering.com
            </a>
            .
          </p>
          {error.digest && (
            <p style={{ color: "#999", fontSize: 12, fontFamily: "monospace", marginBottom: 24 }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: "#10b981",
              color: "#fff",
              border: 0,
              borderRadius: 10,
              padding: "12px 24px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
