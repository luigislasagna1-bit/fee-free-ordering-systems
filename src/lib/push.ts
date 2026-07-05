/**
 * Native push notifications to a restaurant's kitchen devices (the phone/
 * tablet running the Kitchen Order App), so a NEW ORDER rings even when the
 * screen is off or the app is backgrounded — the #1 "don't miss an order"
 * reliability feature. Luigi 2026-06-15.
 *
 * Transport: Firebase Cloud Messaging HTTP v1 (Android + iOS-via-APNs). We
 * authenticate with a Google service-account key (FIREBASE_SERVICE_ACCOUNT —
 * the full service-account JSON, single line) by signing a short-lived OAuth2
 * assertion locally with `jsonwebtoken`. No firebase-admin dependency, no
 * extra serverless cold-start weight.
 *
 * GATED: if FIREBASE_SERVICE_ACCOUNT is absent (local dev, or before Firebase
 * is wired up) every send is a silent no-op — exactly like the Resend email
 * path. Nothing in the order flow ever fails because push isn't configured.
 *
 * HOT-PATH SAFE: sendKitchenPush is fire-and-forget and NEVER throws — call it
 * without await (or with a .catch) from the order-release path.
 */
import jwt from "jsonwebtoken";
import prisma from "@/lib/db";

interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

// undefined = not parsed yet; null = absent/invalid (→ every send is a no-op).
let saCache: ServiceAccount | null | undefined;

function getServiceAccount(): ServiceAccount | null {
  if (saCache !== undefined) return saCache;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw || !raw.trim()) {
    saCache = null;
    return null;
  }
  try {
    const j = JSON.parse(raw);
    if (!j.project_id || !j.client_email || !j.private_key) {
      console.error("[push] FIREBASE_SERVICE_ACCOUNT missing required fields");
      saCache = null;
      return null;
    }
    saCache = {
      projectId: String(j.project_id),
      clientEmail: String(j.client_email),
      // Env-stored keys frequently carry escaped newlines — normalize to real ones.
      privateKey: String(j.private_key).replace(/\\n/g, "\n"),
    };
    return saCache;
  } catch (e) {
    console.error("[push] FIREBASE_SERVICE_ACCOUNT is not valid JSON", e);
    saCache = null;
    return null;
  }
}

// Cache the OAuth2 access token (~1h life) across invocations of a warm lambda.
let tokenCache: { token: string; exp: number } | null = null;

async function getAccessToken(sa: ServiceAccount): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.exp - 60 > now) return tokenCache.token;
  let assertion: string;
  try {
    assertion = jwt.sign(
      {
        iss: sa.clientEmail,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      },
      sa.privateKey,
      { algorithm: "RS256" },
    );
  } catch (e) {
    console.error("[push] failed to sign service-account JWT", e);
    return null;
  }
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    if (!res.ok) {
      console.error("[push] OAuth token exchange failed", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) return null;
    tokenCache = { token: data.access_token, exp: now + (data.expires_in ?? 3600) };
    return tokenCache.token;
  } catch (e) {
    console.error("[push] OAuth token exchange error", e);
    return null;
  }
}

export interface KitchenPushPayload {
  title: string;
  body: string;
  /** String→string only (FCM data payloads are always strings). */
  data?: Record<string, string>;
}

/**
 * Send a push to EVERY registered device for the restaurant. Fire-and-forget,
 * never throws; prunes tokens FCM reports as dead. Returns counts (handy for
 * logging / tests). A no-op (sent:0) when push isn't configured or no devices
 * are registered.
 */
/** Per-device outcome — surfaced by the kitchen test-push diagnostic so a
 *  failing FCM send is READABLE (status + error text) instead of buried in
 *  server logs. Regular callers ignore it. Luigi 2026-07-05 (iOS no-ring). */
export interface KitchenPushDeviceResult {
  platform: string;
  ok: boolean;
  status?: number;
  error?: string;
}

export async function sendKitchenPush(
  restaurantId: string,
  payload: KitchenPushPayload,
): Promise<{ sent: number; pruned: number; results?: KitchenPushDeviceResult[] }> {
  try {
    const sa = getServiceAccount();
    if (!sa) return { sent: 0, pruned: 0, results: [{ platform: "-", ok: false, error: "FIREBASE_SERVICE_ACCOUNT not configured" }] };

    // Single ACTIVE device per kitchen, mirroring the single-session login rule
    // (logging in on one device logs the others out). Push ONLY to the
    // most-recently-registered token — the live device — so a phone that was
    // logged in earlier never buzzes on new orders after being logged out. A
    // logged-out device can't refresh its lastSeenAt (its register-device call
    // 401s), so the active device is always the freshest. register-device also
    // prunes the others on (re)launch; this is the belt-and-suspenders that
    // silences stale devices immediately, with no app relaunch needed. Luigi
    // 2026-06-16 (Fabrizio multi-device "logged-out phones still vibrate" report).
    const devices = await prisma.kitchenPushToken.findMany({
      where: { restaurantId },
      select: { id: true, token: true, platform: true },
      orderBy: { lastSeenAt: "desc" },
      take: 1,
    });
    if (devices.length === 0) return { sent: 0, pruned: 0, results: [{ platform: "-", ok: false, error: "no registered devices" }] };

    // Per-restaurant alarm preference: ring + vibrate (default) vs ring only.
    // Forwarded in the push data so the native OrderAlarmService knows whether
    // to buzz. Default ON unless the owner explicitly turned vibration off.
    // Luigi 2026-06-16.
    const rest = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { kitchenVibrate: true },
    });
    const vibrate = rest?.kitchenVibrate !== false;

    const accessToken = await getAccessToken(sa);
    if (!accessToken) return { sent: 0, pruned: 0, results: [{ platform: "-", ok: false, error: "OAuth token exchange failed" }] };

    const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.projectId}/messages:send`;
    const deadTokenIds: string[] = [];
    const results: KitchenPushDeviceResult[] = [];
    let sent = 0;

    await Promise.allSettled(
      devices.map(async (d) => {
        // NOTIFICATION message (Luigi 2026-06-16). The data-only "wake the app +
        // loop a custom alarm" approach proved unreliable when the device had
        // been asleep a while — Android throttles waking a backgrounded app, so
        // orders/reservations silently didn't ring. A NOTIFICATION message is
        // delivered + shown by the SYSTEM even in deep sleep (rock-solid), and we
        // point it at the high-importance "orders_loud" channel whose sound is the
        // restaurant's order ring (order_alarm), so it's loud + reliable. data is
        // kept for foreground handling + the tap target.
        const data = { ...(payload.data ?? {}), title: payload.title, body: payload.body, vibrate: vibrate ? "true" : "false" };
        // Two payload shapes, one per platform (Luigi 2026-07-04). iOS has no
        // equivalent of Android's native keep-alive poll/alarm service, so a
        // silent content-available push rings nothing when the app is closed
        // or the phone is locked — iOS devices get an ALERT push whose sound
        // is the bundled order alarm (order_alarm.caf = the finalized ring
        // capped at iOS's 30s notification-sound limit; order_short.caf ≈ the
        // Android ~3s auto-accept chirp). Foreground stays with the WEB ring
        // engine on both platforms (presentationOptions: [] in
        // capacitor.config.ts), so behavior matches Android: full alarm when
        // pending, short ring when auto-accepted, web engine on screen.
        // The Android branch below is the v2.8-verified shape — DO NOT touch.
        const message =
          d.platform === "ios"
            ? {
                message: {
                  token: d.token,
                  notification: { title: payload.title, body: payload.body },
                  data,
                  apns: {
                    headers: { "apns-priority": "10", "apns-push-type": "alert" },
                    payload: {
                      aps: {
                        sound: payload.data?.autoAccept === "true" ? "order_short.caf" : "order_alarm.caf",
                        "interruption-level": "time-sensitive",
                      },
                    },
                  },
                },
              }
            : {
                message: {
                  token: d.token,
                  // DATA-ONLY: the alarm is driven by the native keep-alive POLL (the
                  // reliable path on every device — it rings until the order is accepted
                  // or its window expires). So we do NOT ring via a system notification
                  // here (that would double up + couldn't stop on accept). This push is
                  // just an instant nudge — KitchenMessagingService starts the alarm
                  // right away when delivered (modern devices); on a throttled old
                  // Samsung it simply doesn't arrive and the ~4s poll covers it.
                  // Luigi 2026-06-16.
                  data,
                  android: { priority: "high" },
                  apns: {
                    headers: { "apns-priority": "10", "apns-push-type": "background" },
                    payload: { aps: { "content-available": 1 } },
                  },
                },
              };
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(message),
        });
        if (res.ok) {
          sent++;
          results.push({ platform: d.platform, ok: true, status: res.status });
          return;
        }
        const errText = await res.text().catch(() => "");
        results.push({ platform: d.platform, ok: false, status: res.status, error: errText.slice(0, 600) });
        // Prune ONLY tokens FCM clearly reports as dead — never on a transient
        // 401/403/5xx or a payload-level 400 (that would silently empty a
        // restaurant's device list over a bug).
        if (res.status === 404 || /UNREGISTERED|registration-token-not-registered/i.test(errText)) {
          deadTokenIds.push(d.id);
        } else {
          console.error("[push] FCM send failed", res.status, errText);
        }
      }),
    );

    let pruned = 0;
    if (deadTokenIds.length > 0) {
      const del = await prisma.kitchenPushToken.deleteMany({ where: { id: { in: deadTokenIds } } });
      pruned = del.count;
    }
    return { sent, pruned, results };
  } catch (e) {
    console.error("[push] sendKitchenPush error", e);
    return { sent: 0, pruned: 0, results: [{ platform: "-", ok: false, error: e instanceof Error ? e.message : String(e) }] };
  }
}
