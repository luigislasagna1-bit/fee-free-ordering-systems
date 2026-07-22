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
 * kitchen.ios = TestFlight-only on the old Apple team (OWNER-ACTIONS D1).
 * driver.play + driver.ios = in store review as of 2026-07-22.
 */

export type StoreLinks = { play: string | null; ios: string | null };

export const APP_LINKS: Record<"kitchen" | "driver", StoreLinks> = {
  kitchen: {
    play: "https://play.google.com/store/apps/details?id=com.feefreeordering.kitchen",
    ios: null,
  },
  driver: {
    play: null,
    ios: null,
  },
};
