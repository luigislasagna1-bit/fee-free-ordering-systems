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

/** The FCM/APNs token THIS device registered (null when none is stored —
 *  plain browser, storage disabled, or logged out). The kitchen Test-ring
 *  button ships it to /api/kitchen/test-push so the server can tell the
 *  presser when ANOTHER device owns the ring (single-active-device rule).
 *  Kept here so the storage key lives in exactly one file. */
export function getStoredKitchenPushToken(): string | null {
  try {
    return localStorage.getItem(KITCHEN_PUSH_TOKEN_KEY);
  } catch {
    return null; // SSR / private mode / storage disabled
  }
}

// ── Push-health telemetry (Fabrizio cmrkvs5r, 2026-07-17) ────────────────────
// The iOS shell has NO native alarm plugin — its closed/locked ring depends
// entirely on APNs pushes reaching this device — so the kitchen 3-dot menu
// (iOS only) shows whether THIS device can actually receive the ring. We
// persist the registration outcome here: permission state, whether FCM/APNs
// issued a token, and how the register-device POST landed (incl. the 401
// session_superseded "another device took over the ring" case). Module state
// for the current run + localStorage so the panel still reads the last known
// outcome after a WebView reload. Pure telemetry: never changes registration
// behavior, all writes are best-effort.
export interface KitchenPushHealth {
  /** PushNotifications permission ("granted" / "denied" / "prompt" / …); null = not requested yet. */
  permission: string | null;
  /** True once FCM/APNs delivered a registration token this device shipped to the server. */
  tokenObtained: boolean;
  /** HTTP status of the last /api/kitchen/register-device POST (0 = network error); null = never attempted. */
  registerStatus: number | null;
  /** Server error code from a failed POST — "session_superseded" means another device owns the ring. */
  registerCode: string | null;
  /** ms timestamp of the last update (0 = never). */
  updatedAt: number;
}

const KITCHEN_PUSH_HEALTH_KEY = "ffo_kitchen_push_health";
const DEFAULT_PUSH_HEALTH: KitchenPushHealth = {
  permission: null,
  tokenObtained: false,
  registerStatus: null,
  registerCode: null,
  updatedAt: 0,
};
let pushHealth: KitchenPushHealth | null = null; // lazily hydrated from localStorage

function readStoredPushHealth(): KitchenPushHealth {
  try {
    const raw = localStorage.getItem(KITCHEN_PUSH_HEALTH_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return { ...DEFAULT_PUSH_HEALTH, ...parsed };
    }
  } catch {
    /* SSR / private mode / corrupt JSON — fall through to defaults */
  }
  return { ...DEFAULT_PUSH_HEALTH };
}

function updatePushHealth(patch: Partial<KitchenPushHealth>): void {
  const current = pushHealth ?? readStoredPushHealth();
  pushHealth = { ...current, ...patch, updatedAt: Date.now() };
  try {
    localStorage.setItem(KITCHEN_PUSH_HEALTH_KEY, JSON.stringify(pushHealth));
  } catch {
    /* storage disabled — module state still serves the current run */
  }
}

/** Latest push-registration health for THIS device (see KitchenPushHealth docs). */
export function getKitchenPushHealth(): KitchenPushHealth {
  if (!pushHealth) pushHealth = readStoredPushHealth();
  return pushHealth;
}

async function postToken(token: string): Promise<void> {
  try {
    localStorage.setItem(KITCHEN_PUSH_TOKEN_KEY, token);
  } catch {
    /* private mode / storage disabled — unregister-on-logout falls back to a no-op */
  }
  try {
    const res = await fetch("/api/kitchen/register-device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, platform: getPlatform() }),
    });
    // Record how registration landed — 200 = this device owns the ring; 401 +
    // code "session_superseded" = another device took it over (the server
    // refuses stale sessions; see register-device route). Body read is
    // best-effort: a non-JSON error body just leaves code null.
    let code: string | null = null;
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { code?: unknown } | null;
      code = typeof body?.code === "string" ? body.code : null;
    }
    updatePushHealth({ registerStatus: res.status, registerCode: code });
  } catch (e) {
    updatePushHealth({ registerStatus: 0, registerCode: null }); // 0 = network error
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
      if (info?.value) {
        updatePushHealth({ tokenObtained: true }); // FCM/APNs issued a token
        void postToken(info.value);
      }
    });
    await push.addListener("registrationError", (err: unknown) => {
      // APNs/FCM refused to issue a token (aps-environment entitlement
      // problem, no network to the push gateway at launch, …) — one of the
      // PRIMARY failures the iOS push-health panel exists to diagnose.
      // Record it (-1 = registration error; distinct from real HTTP statuses
      // and from 0 = register-device network error) so the panel shows a
      // FAILURE instead of the neutral "Not registered yet" forever.
      // tokenObtained:false also overwrites a stale earlier success, so a
      // previously-working device that breaks stops claiming it receives the
      // ring. (Review, 2026-07-17.)
      updatePushHealth({ tokenObtained: false, registerStatus: -1, registerCode: "registration_error" });
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
      const data = action?.notification?.data ?? {};
      const orderId = data?.orderId;
      if (orderId) console.log("[native-push] opened from order", orderId);
      // Ring-notification tap → land on the LIST (Android parity, cmrkvs5r
      // round 2). Android's tap intent opens MainActivity with NO order
      // extra (OrderAlarmService openPi): staff land on the list still
      // ringing, and the ring stops only when they open the pending order
      // themselves. The kitchen display listens for this event and closes
      // any open detail — the per-order hush subtracts an OPEN pending
      // order from the ring set, so landing on the list keeps the web ring
      // alive until the operator opens the order.
      //
      // A ring push is NOT only the initial per-order push (data.orderId):
      // the iOS cron re-ring carries only { type: "pending_reminder" } (it is
      // restaurant-aggregated, so it can never name one order), and the
      // reservation ring carries only { reservationId }. After ~29s the
      // reminder REPLACES the original banner (collapseId), so keying this on
      // orderId alone left every reminder/reservation tap resuming into the
      // open-detail-hushed kitchen — the exact silence this event exists to
      // end. Non-ring pushes (test_push, …) keep the refresh-only behavior.
      const isRingPush =
        Boolean(orderId) || Boolean(data?.reservationId) || data?.type === "pending_reminder";
      if (isRingPush) {
        try { window.dispatchEvent(new CustomEvent("ffo:kitchen-ring-tap")); } catch { /* SSR-safe */ }
      }
      broadcastRefresh();
    });

    const perm = await push.requestPermissions();
    updatePushHealth({ permission: perm?.receive ?? null });
    if (perm?.receive === "granted") {
      await push.register();
    } else {
      console.warn("[native-push] push permission not granted:", perm?.receive);
      started = false; // let a later mount retry (user may grant in Settings)
    }
  } catch (e) {
    // A throw from push.register() (or the permission request) is a
    // registration failure too — surface it in push health the same way the
    // registrationError listener does, or the panel would read the neutral
    // "Not registered yet" forever. tokenObtained is left alone here: this
    // catch can also fire after a token already landed (listener wiring
    // issues), and postToken's own status write is the fresher signal then.
    updatePushHealth({ registerStatus: -1, registerCode: "registration_error" });
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
