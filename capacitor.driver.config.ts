import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for the Fee Free DELIVERY driver native app.
 *
 * Third native app in this repo (all remote-URL WebView shells — the native
 * binary wraps a WebView of the live page, so web deploys ship without an
 * App Store / Play re-review):
 *
 *   capacitor.config.ts             → Kitchen Display   (com.feefreeordering.kitchen, ios/ + android/)
 *   capacitor.marketplace.config.ts → Marketplace       (com.feefreeordering.marketplace — template only)
 *   capacitor.driver.config.ts      → Fee Free Delivery (com.feefreeordering.driver, ios-driver/ + android-driver/)
 *
 * ── BUILDING THE DRIVER APP ────────────────────────────────────────────
 * The CLI only sees ONE config at a time — always pass --config:
 *   npx cap sync ios     --config capacitor.driver.config.ts
 *   npx cap sync android --config capacitor.driver.config.ts
 *   npx cap open android --config capacitor.driver.config.ts
 * or the npm scripts (cap:driver:*). `ios.path`/`android.path` below keep the
 * driver's native projects in their OWN directories so they never collide with
 * the Kitchen app's ios/ + android/.
 *
 * ── WHY NATIVE (vs the /driver PWA) ────────────────────────────────────
 * The web /driver app already installs to the home screen + does FOREGROUND
 * GPS. The native wrapper exists for the one thing a PWA can't do: keep
 * streaming the driver's location with the phone LOCKED / app backgrounded
 * (a driver's phone is in a pocket or mount mid-run). That's wired via a
 * native background-geolocation plugin — see the location permissions in
 * ios-driver/App/App/Info.plist + android-driver/app/src/main/AndroidManifest.xml.
 */
const config: CapacitorConfig = {
  appId: "com.feefreeordering.driver",
  appName: "Fee Free Delivery",
  // Dummy webDir — unused at runtime because server.url is set. Vendored in
  // /public so the CLI's validation passes.
  webDir: "public",
  server: {
    // Native shell loads the live driver app. /driver redirects to
    // /driver/login when not authed, which works in the WebView too.
    url: process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/driver`
      : "https://feefreeordering.com/driver",
    androidScheme: "https",
  },
  ios: {
    // Separate native project dir so it doesn't overwrite the Kitchen app's ios/.
    path: "ios-driver",
    // The driver pages own their safe-area insets via CSS env(), same as kitchen.
    contentInset: "never",
    scrollEnabled: true,
  },
  android: {
    path: "android-driver",
    allowMixedContent: false,
    webContentsDebuggingEnabled: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1000,
      launchAutoHide: true,
      backgroundColor: "#111827",
    },
    StatusBar: {
      // Driver app is a dark UI (bg-gray-900) — light status-bar text on dark.
      style: "DARK",
      backgroundColor: "#111827",
    },
  },
};

export default config;
