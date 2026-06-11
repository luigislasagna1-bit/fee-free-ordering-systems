/**
 * Client-side visit + funnel-event tracker.
 *
 * Browser-only helpers (uses sessionStorage, window, navigator). Import
 * into any "use client" component that needs to fire analytics — most
 * commonly the customer order page at /order/[slug].
 *
 * Lifecycle:
 *   1. On first call to `getSessionHash()`, generate a 32-char hex
 *      session hash and stash it in sessionStorage. Stays the same
 *      across page navigations within the tab; resets on tab close.
 *   2. `trackVisit({ restaurantId })` is called once per page mount.
 *      Idempotent for THIS session — the hash de-dupes server-side
 *      (we accept duplicates rather than fail the user-facing page).
 *   3. `trackEvent({ restaurantId, step, targetId? })` for funnel
 *      transitions. Don't fire "visit" through this — that's only
 *      from /api/track/visit.
 *
 * Network behavior:
 *   - sendBeacon when available (fire-and-forget, survives tab close)
 *   - fetch with keepalive: true fallback for older browsers
 *   - Failures are silently swallowed — analytics never breaks the
 *     user experience.
 */

const SESSION_KEY = "ff_session_hash";

/** Get or generate the per-tab session hash. Stable across navigations
 *  within the same tab; resets when sessionStorage clears. */
export function getSessionHash(): string {
  if (typeof window === "undefined") return ""; // SSR guard
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing && /^[a-f0-9]{16,64}$/i.test(existing)) return existing;
    const fresh = generateHash();
    window.sessionStorage.setItem(SESSION_KEY, fresh);
    return fresh;
  } catch {
    // Private browsing / disabled storage — generate ephemerally so
    // the events still flow but won't correlate across pageviews.
    return generateHash();
  }
}

/** Fire the initial /api/track/visit beacon. Called once per page
 *  mount from a useEffect — the hook ensures it runs in the browser
 *  and exactly once. */
export function trackVisit(opts: { restaurantId: string; landingPath?: string }): void {
  if (typeof window === "undefined") return;
  const sessionHash = getSessionHash();
  if (!sessionHash) return;

  // Extract utm_* from current URL (single read; cheap).
  const search = new URLSearchParams(window.location.search);
  const utm = {
    source: search.get("utm_source") || undefined,
    medium: search.get("utm_medium") || undefined,
    campaign: search.get("utm_campaign") || undefined,
  };
  const fromMarketplace = search.get("from") === "marketplace";
  // Marketing Studio smart-link code (the /m/<code> redirect appends ?ref=<code>).
  // Persisted on the visit + resolved to the SmartLink at order-create for
  // per-link scan→order attribution. Luigi 2026-06-10.
  const ref = search.get("ref") || undefined;

  send("/api/track/visit", {
    restaurantId: opts.restaurantId,
    sessionHash,
    landingPath: opts.landingPath ?? window.location.pathname,
    utm: (utm.source || utm.medium || utm.campaign) ? utm : undefined,
    fromMarketplace,
    ref,
  });
}

/** Fire a funnel-step event. The step must be one of the values the
 *  server validates — see /api/track/event for the canonical list. */
export function trackEvent(opts: {
  restaurantId: string;
  step: "menu_browsed" | "item_added" | "checkout_open" | "checkout_info" | "payment_open" | "order_placed";
  targetId?: string;
}): void {
  if (typeof window === "undefined") return;
  const sessionHash = getSessionHash();
  if (!sessionHash) return;
  send("/api/track/event", {
    restaurantId: opts.restaurantId,
    sessionHash,
    step: opts.step,
    targetId: opts.targetId,
  });
}

// ── Internal ──────────────────────────────────────────────────────────

function send(url: string, body: unknown): void {
  try {
    const payload = JSON.stringify(body);
    // sendBeacon is fire-and-forget + survives tab close — perfect for
    // analytics. Browsers without it fall back to fetch+keepalive.
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon(url, blob);
      return;
    }
    fetch(url, {
      method: "POST",
      body: payload,
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    }).catch(() => { /* swallow — analytics never breaks UX */ });
  } catch {
    /* swallow */
  }
}

function generateHash(): string {
  // 32 hex chars (128 bits) — collision-resistant for visit-tracking
  // volume. Use crypto.getRandomValues when available; fall back to
  // Math.random for ancient browsers (the fallback is still unique
  // enough — collisions degrade analytics, not user data integrity).
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
