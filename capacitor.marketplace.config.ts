import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for the Fee Free MARKETPLACE native app.
 *
 * Companion to the kitchen-display config at capacitor.config.ts (the
 * default). Two distinct native apps share this repo:
 *
 *   capacitor.config.ts             → Kitchen Display (com.feefreeordering.kitchen)
 *   capacitor.marketplace.config.ts → Marketplace customer browse app
 *
 * ── BUILDING THE MARKETPLACE APP ──────────────────────────────────────
 *
 * Capacitor's CLI only sees ONE config at a time. To build / sync /
 * inspect the marketplace app, point the CLI at this file:
 *
 *   npx cap sync   --config capacitor.marketplace.config.ts
 *   npx cap copy   --config capacitor.marketplace.config.ts
 *   npx cap open   --config capacitor.marketplace.config.ts ios
 *   npx cap open   --config capacitor.marketplace.config.ts android
 *
 * Or set the npm scripts in package.json (recommended):
 *   "cap:marketplace:sync": "cap sync --config capacitor.marketplace.config.ts"
 *
 * First-time setup (one-off, not done in this commit because it
 * mutates the filesystem with /android-marketplace and /ios-marketplace
 * directories that need your review):
 *
 *   1. Move the existing /android + /ios dirs to /android-kitchen +
 *      /ios-kitchen, then update capacitor.config.ts to reference
 *      those paths. (See android.path + ios.path below for the
 *      marketplace's equivalent.)
 *   2. Run `npx cap add ios --config capacitor.marketplace.config.ts`
 *      to scaffold ios-marketplace/.
 *   3. Run `npx cap add android --config capacitor.marketplace.config.ts`
 *      to scaffold android-marketplace/.
 *   4. Open both projects in Xcode / Android Studio to set:
 *      - App icon (use /public/icons/marketplace-icon.svg as the
 *        source — see comment below on icon generation).
 *      - Bundle identifier (already set here; verify it matches
 *        what you registered in App Store Connect / Play Console).
 *      - Code signing certificates.
 *      - Push notification capabilities (optional — see
 *        "Push notifications" comment in /AGENTS.md for status).
 *
 * ── ARCHITECTURE — same as the kitchen app ───────────────────────────
 *
 * Remote-URL Capacitor — the native shell wraps a WebView pointed at
 * https://feefreefood.com/marketplace. We don't bundle a static
 * export. Same trade-offs:
 *   + Updates ship via web deploy, no App Store re-review per change
 *   + Single Next.js codebase drives both web + native
 *   - App can't run offline (marketplace browse needs the catalogue
 *     anyway, so this is fine)
 *
 * The marketplace page already has a PWA manifest at
 * /public/manifest-marketplace.webmanifest so install-on-home-screen
 * works on web too — the native wrapper is the "give us App Store
 * presence + push notifications" upgrade on top of that.
 */
const config: CapacitorConfig = {
  appId: "com.feefreeordering.marketplace",
  appName: "Fee Free Marketplace",
  // Dummy webDir — unused at runtime because server.url is set.
  webDir: "public",
  server: {
    url: process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/marketplace`
      : "https://feefreefood.com/marketplace",
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      // Slightly longer than the kitchen splash (1500ms vs 1000ms) —
      // the marketplace landing has more above-the-fold imagery to
      // paint, and a touch more splash time hides the LCP shift.
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: "#FFFFFF",
    },
    StatusBar: {
      // Marketplace uses a light theme (#10B981 accent on white), so
      // the OS status bar text should be dark to remain legible.
      style: "LIGHT",
      backgroundColor: "#FFFFFF",
    },
  },
  android: {
    // When you run `npx cap add android --config capacitor.marketplace.config.ts`
    // for the first time, set path: "android-marketplace" here so it
    // doesn't collide with the kitchen app's /android directory.
    // (Commented out until that scaffold step happens so the CLI doesn't
    // error on a non-existent path.)
    // path: "android-marketplace",
    allowMixedContent: false,
    webContentsDebuggingEnabled: true,
  },
  ios: {
    // Same here — set path: "ios-marketplace" after `npx cap add ios`
    // creates the directory.
    // path: "ios-marketplace",
    contentInset: "always",
    scrollEnabled: true,
  },
};

export default config;
