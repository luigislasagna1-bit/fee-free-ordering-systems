"use client";
import { useEffect } from "react";

/**
 * "Book a Demo" button — opens Luigi's Calendly scheduling popup (which carries
 * the intake questions + auto-generates a Google Meet link per booking).
 *
 * Driven by NEXT_PUBLIC_CALENDLY_URL (e.g. https://calendly.com/you/fee-free-demo).
 * Renders NOTHING until that's set, so it's safe to place on the marketing pages
 * before Calendly is configured — the moment the URL is wired the button appears.
 * Same env-driven pattern as the support chat. Luigi 2026-06-14.
 */
const CALENDLY_URL = process.env.NEXT_PUBLIC_CALENDLY_URL || "";

export function BookDemoButton({
  className,
  label = "Book a Demo",
}: {
  className?: string;
  label?: string;
}) {
  useEffect(() => {
    if (!CALENDLY_URL) return;
    // Load Calendly's popup widget assets once (css + js).
    if (!document.getElementById("calendly-css")) {
      const l = document.createElement("link");
      l.id = "calendly-css";
      l.rel = "stylesheet";
      l.href = "https://assets.calendly.com/assets/external/widget.css";
      document.head.appendChild(l);
    }
    if (!document.getElementById("calendly-js")) {
      const s = document.createElement("script");
      s.id = "calendly-js";
      s.src = "https://assets.calendly.com/assets/external/widget.js";
      s.async = true;
      document.body.appendChild(s);
    }
  }, []);

  if (!CALENDLY_URL) return null;

  return (
    <button
      type="button"
      onClick={() =>
        (window as unknown as { Calendly?: { initPopupWidget: (o: { url: string }) => void } }).Calendly?.initPopupWidget(
          { url: CALENDLY_URL },
        )
      }
      className={className}
    >
      {label}
    </button>
  );
}
