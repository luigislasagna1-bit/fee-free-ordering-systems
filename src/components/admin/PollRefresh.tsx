"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Silently re-runs the current route's server components on an interval via
 * router.refresh() — the same RSC-refresh pattern the kitchen orders page
 * uses, extracted so any server panel can become "live" without becoming a
 * client component (Luigi 2026-07-20: the FeeFree dispatch queue should
 * refresh itself, not require a manual reload).
 *
 * Renders nothing. Pauses while the tab is hidden so a backgrounded admin
 * doesn't poll for no reason, and refreshes once on becoming visible again so
 * the operator sees current state the moment they look back.
 */
export function PollRefresh({ intervalMs = 20_000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    let timer: number | null = null;
    const start = () => {
      if (timer !== null) return;
      timer = window.setInterval(() => router.refresh(), intervalMs);
    };
    const stop = () => {
      if (timer !== null) { window.clearInterval(timer); timer = null; }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") { router.refresh(); start(); }
      else stop();
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [router, intervalMs]);
  return null;
}
