"use client";
import { useEffect } from "react";

/**
 * Registers /sw.js once per session so the customer-ordering and kitchen-
 * display surfaces qualify as installable PWAs. The actual caching strategy
 * lives in public/sw.js. Failures are silent — a missing SW shouldn't break
 * the live app.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    // Wait for window load so registration doesn't compete with critical
    // boot work (first paint, hydration, font loads, etc.).
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Intentional: swallow registration failures — they shouldn't surface
        // to end-users. Browser devtools still log the underlying error.
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
