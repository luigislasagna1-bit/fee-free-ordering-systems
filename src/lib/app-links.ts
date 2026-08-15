/**
 * Native-app store listings — the SINGLE source of truth (2026-07-22).
 *
 * `null` = not publicly available yet → every consuming surface hides the
 * link or shows a "Soon" pill instead. The day a store approves an app,
 * flip its URL HERE and every surface goes live with zero other edits:
 * marketing badges (AppDownloadBadges), the /admin/publishing install hub
 * + QR, the signup welcome email, the kitchen-login hint, the reseller
 * branding card, and the driver invite email.
 *
 * Pure constants — safe to import from client components, server
 * components, and email templates alike. Guarded by app-links.test.ts
 * (URL shape + package id) so a typo can't ship a broken link.
 *
 * History: kitchen.play LIVE 2026-07-22 (first public listing).
 * driver.ios LIVE 2026-07-23 (first public iOS app — seller Fee Free
 * Ordering Inc., approved under the org). driver.play LIVE 2026-07-23
 * (Play Console shows Production; public listing verified).
 * kitchen.ios LIVE 2026-08-15 — "Fee Free Order App", seller Fee Free
 * Ordering Inc., free, iOS 15+, iPhone AND iPad (iosUniversal). Verified
 * against Apple's own lookup API (itunes.apple.com/lookup?id=6794053932)
 * rather than the storefront HTML, which rate-limits bots with a 429.
 * With BOTH kitchen links live, every "iOS coming soon" surface across
 * marketing, /admin/publishing and the kitchen-app-link email now
 * resolves to a real download with no further edits.
 */

export type StoreLinks = { play: string | null; ios: string | null };

export const APP_LINKS: Record<"kitchen" | "driver", StoreLinks> = {
  kitchen: {
    play: "https://play.google.com/store/apps/details?id=com.feefreeordering.kitchen",
    ios: "https://apps.apple.com/us/app/fee-free-order-app/id6794053932",
  },
  driver: {
    play: "https://play.google.com/store/apps/details?id=com.feefreeordering.driver",
    ios: "https://apps.apple.com/us/app/fee-free-delivery/id6791709145",
  },
};
