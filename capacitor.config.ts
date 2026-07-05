import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor config for the Fee Free Ordering Kitchen Display native app.
 *
 * ── ARCHITECTURE ──────────────────────────────────────────────────────
 *
 * This is a REMOTE-URL Capacitor app — the native shell (iOS/Android)
 * wraps a WebView that loads the live kitchen page at
 * https://feefreeordering.com/kitchen. We do NOT bundle a static export
 * of the web app inside the native binary.
 *
 * Benefits of the remote-URL approach:
 *   - Updates ship via web deploy. No App Store / Play Store re-review
 *     cycle for every bug fix or feature.
 *   - One codebase (Next.js) drives both the web kitchen and the native
 *     kitchen. No platform-specific UI to maintain.
 *   - Native app only ships when we add NEW native capabilities
 *     (e.g. printer plugin upgrade, push notification handlers).
 *
 * Trade-off: the app cannot run offline. For a kitchen-display app that
 * polls /api/kitchen/orders every 4 seconds anyway, this is acceptable —
 * an offline KDS is not useful.
 *
 * The webDir is set to a dummy directory to satisfy Capacitor's CLI
 * validation; it's never used at runtime because server.url is set.
 *
 * ── PRODUCTION REMOTE URL ─────────────────────────────────────────────
 * The kitchen page redirects to /kitchen/login if the user isn't authed.
 * That works in WebView too — first launch sends the staff to the login
 * page, after which next-auth cookies persist for the session.
 *
 * Server URL is HTTPS — required by both iOS App Transport Security and
 * Android's default network security config.
 */
const config: CapacitorConfig = {
  appId: "com.feefreeordering.kitchen",
  appName: "Fee Free Kitchen",
  // Dummy webDir — required by CLI validation but unused at runtime
  // because server.url is set. Vendor it in /public so it exists.
  webDir: "public",
  // Native shell loads the live kitchen URL. The kitchen page handles
  // its own auth redirect if the user isn't logged in.
  server: {
    url: "https://feefreeordering.com/kitchen",
    // cleartext: false is the secure default. We're on HTTPS so leave it.
    // hostname: lets the WebView's window.location.hostname report this
    // value to the loaded page — useful when the kitchen page needs to
    // distinguish "running inside native app" via hostname check.
    // We do NOT set hostname so the WebView reports feefreeordering.com
    // as expected.
    androidScheme: "https",
  },
  // Native plugin defaults. The DirectPrinter plugin we register below
  // doesn't need configuration — IP and port come from the user via the
  // kitchen settings UI at runtime.
  plugins: {
    SplashScreen: {
      // White launch screen for ~1s while the WebView attaches and the
      // kitchen page starts to render. Longer than this feels broken;
      // shorter and we get a black flash.
      launchShowDuration: 1000,
      launchAutoHide: true,
      backgroundColor: "#FFFFFF",
    },
    StatusBar: {
      // Match the kitchen app's typical dark-header look. Owner can
      // override via the kitchen page's theme toggle.
      style: "DARK",
      backgroundColor: "#111827",
    },
    PushNotifications: {
      // iOS foreground presentation: NOTHING. Same split as Android — when
      // the app is on screen the WEB ring engine owns the alarm (stops on
      // open/accept); the native alert push with its bundled .caf sound only
      // ever plays when the app is backgrounded/closed/locked. Showing the
      // banner+sound in foreground too would double-ring. Android ignores
      // this option entirely.
      presentationOptions: [],
    },
  },
  // Android-specific overrides
  android: {
    // Allows the WebView to access services (like our DirectPrinter)
    // through the JS bridge.
    allowMixedContent: false,
    // Use the system WebView (most up-to-date Chromium).
    // Don't bundle our own WebView; updates come with Android system updates.
    webContentsDebuggingEnabled: true, // can be flipped off for release builds
  },
  // iOS-specific overrides
  ios: {
    // App Transport Security — leave on (HTTPS-only) for security.
    // The DirectPrinter plugin opens TCP sockets directly (not HTTP)
    // so ATS doesn't apply to printer connections; those are handled
    // by Network framework with explicit user-supplied IP.
    //
    // contentInset: "never" — the kitchen pages use viewport-fit=cover +
    // CSS env(safe-area-inset-*) padding to handle the notch/home-indicator
    // themselves. With "always" the WebView ALSO inset the scroll content,
    // double-handling the safe areas: the h-[100dvh] kitchen ended up taller
    // than the visible area on iPhone, so the page scrolled and the bottom bar
    // (gear) was pushed off-screen. "never" lets the CSS own the insets so the
    // screen fills exactly with no page scroll. (Verify sticky header on build.)
    contentInset: "never",
    scrollEnabled: true,
  },
};

export default config;
