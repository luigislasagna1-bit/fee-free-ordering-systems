"use client";
/**
 * Native push registration for the Kitchen Order App.
 *
 * NO-OP on the web — only does anything inside the Capacitor native shell,
 * where `window.Capacitor.Plugins.PushNotifications` exists (provided by the
 * @capacitor/push-notifications plugin). Mirrors the no-import, global-access
 * pattern of native-printer.ts so the Next.js web/SSR bundle builds without
 * the plugin present. Luigi 2026-06-15.
 *
 * Flow on launch (native only):
 *   1. Create the high-importance "orders" channel (Android 8+) so the alert
 *      rings + wakes the screen — the channelId the server's push targets.
 *   2. Listen for the FCM/APNs token ('registration') → POST it to
 *      /api/kitchen/register-device so the server can ring this device.
 *   3. Request permission, then register.
 *   4. On notification tap, log the order id (the 4s poll surfaces it anyway).
 */

type CapPushPlugin = {
  requestPermissions: () => Promise<{ receive: string }>;
  register: () => Promise<void>;
  addListener: (event: string, cb: (data: any) => void) => Promise<unknown> | unknown;
  createChannel?: (channel: Record<string, unknown>) => Promise<void>;
};

function getPushPlugin(): CapPushPlugin | null {
  if (typeof window === "undefined") return null; // SSR
  const cap = (window as any).Capacitor;
  if (!cap || typeof cap.isNativePlatform !== "function" || !cap.isNativePlatform()) return null;
  return cap.Plugins?.PushNotifications ?? null;
}

function getPlatform(): string {
  if (typeof window === "undefined") return "web";
  try {
    return (window as any).Capacitor?.getPlatform?.() ?? "android";
  } catch {
    return "android";
  }
}

// Remember the live FCM token so logout can unregister exactly THIS device
// (the DELETE is token-scoped → other kitchen devices keep ringing). Luigi 2026-06-23 (L1).
const KITCHEN_PUSH_TOKEN_KEY = "ffo_kitchen_push_token";

async function postToken(token: string): Promise<void> {
  try {
    localStorage.setItem(KITCHEN_PUSH_TOKEN_KEY, token);
  } catch {
    /* private mode / storage disabled — unregister-on-logout falls back to a no-op */
  }
  try {
    await fetch("/api/kitchen/register-device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, platform: getPlatform() }),
    });
  } catch (e) {
    console.error("[native-push] register-device POST failed", e);
  }
}

// Guard so listeners attach + permission is requested only once per app run.
let started = false;

/**
 * Request permission, register with FCM/APNs, and ship the token to the server.
 * Safe to call on every mount — guarded internally. No-op on the web.
 */
export async function registerKitchenPush(): Promise<void> {
  const push = getPushPlugin();
  if (!push) return;

  // Android 8+ routes a notification's sound + importance through a CHANNEL.
  // Create the loud "orders_loud" channel whose sound is the restaurant's order
  // ring (res/raw/order_alarm, bundled in the app) at high importance, so a new
  // order rings + heads-up even from the lock screen. Created on EVERY call
  // (idempotent) so a WebView reload picks it up without a full app restart. The
  // server's notification push targets channelId "orders_loud". Luigi 2026-06-16.
  if (typeof push.createChannel === "function") {
    try {
      await push.createChannel({
        id: "orders_loud",
        name: "New orders",
        description: "Loud alert when a new order arrives",
        importance: 5, // IMPORTANCE_HIGH — heads-up banner + sound
        visibility: 1,
        sound: "order_alarm", // res/raw/order_alarm.mp3 (the order ring)
        vibration: true,
      });
    } catch {
      /* channel creation is best-effort */
    }
  }

  if (started) return;
  started = true;
  try {
    await push.addListener("registration", (info: { value?: string }) => {
      if (info?.value) void postToken(info.value);
    });
    await push.addListener("registrationError", (err: unknown) => {
      console.error("[native-push] registration error", err);
    });
    // A push landing is the strongest "there's a new order RIGHT NOW" signal —
    // stronger than visibilitychange, which iOS WKWebView doesn't always fire
    // on app resume. Broadcast a window event so the kitchen pollers refetch
    // IMMEDIATELY instead of waiting for the (possibly just-resumed) 4s timer.
    // Fixes the iOS build-17 bug: the phone RANG but the order didn't appear
    // in the list until the screen was touched. Luigi 2026-07-04.
    const broadcastRefresh = () => {
      try { window.dispatchEvent(new CustomEvent("ffo:kitchen-refresh")); } catch { /* SSR-safe */ }
    };
    await push.addListener("pushNotificationReceived", () => {
      // App in FOREGROUND when the push arrived.
      broadcastRefresh();
    });
    await push.addListener("pushNotificationActionPerformed", (action: any) => {
      // User tapped the notification banner (app was backgrounded/locked).
      const orderId = action?.notification?.data?.orderId;
      if (orderId) console.log("[native-push] opened from order", orderId);
      broadcastRefresh();
    });

    const perm = await push.requestPermissions();
    if (perm?.receive === "granted") {
      await push.register();
    } else {
      console.warn("[native-push] push permission not granted:", perm?.receive);
      started = false; // let a later mount retry (user may grant in Settings)
    }
  } catch (e) {
    console.error("[native-push] registerKitchenPush failed", e);
    started = false;
  }
}

/**
 * Unregister THIS device's push token on logout so the server stops ringing it.
 *
 * Without this, a logged-out phone's always-on keep-alive poll keeps its still-registered
 * token and rings on every new order (Fabrizio L1, 2026-06-23). We delete the remembered
 * token server-side (DELETE is token-scoped → other kitchen devices are unaffected) and
 * clear it locally. Best-effort + no-op off-app / when no token was stored (a plain
 * browser never registers one). Resets the once-guard so a re-login in the same app run
 * re-registers this device.
 */
export async function unregisterKitchenPush(): Promise<void> {
  let token = "";
  try {
    token = localStorage.getItem(KITCHEN_PUSH_TOKEN_KEY) ?? "";
  } catch {
    /* storage disabled */
  }
  if (token) {
    // Time-bound the DELETE so a dead kitchen network can't hang logout (the device would
    // stay signed in, keep its registered token, and keep ringing — the exact L1 symptom).
    // localStorage removal below is unconditional + a server lastSeenAt sweep is the
    // backstop, so a missed DELETE self-heals. Luigi 2026-06-23 (K3 review).
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2500);
    try {
      await fetch("/api/kitchen/register-device", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        signal: ctrl.signal,
      });
    } catch (e) {
      console.error("[native-push] unregister DELETE failed", e);
    } finally {
      clearTimeout(timer);
    }
  }
  try {
    localStorage.removeItem(KITCHEN_PUSH_TOKEN_KEY);
  } catch {
    /* storage disabled */
  }
  started = false; // let a re-login on the same app run re-register this device
}
