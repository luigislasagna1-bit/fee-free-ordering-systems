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
export async function sendKitchenPush(
  restaurantId: string,
  payload: KitchenPushPayload,
): Promise<{ sent: number; pruned: number }> {
  try {
    const sa = getServiceAccount();
    if (!sa) return { sent: 0, pruned: 0 };

    const devices = await prisma.kitchenPushToken.findMany({
      where: { restaurantId },
      select: { id: true, token: true },
      take: 50, // a kitchen has a handful of devices; cap defensively
    });
    if (devices.length === 0) return { sent: 0, pruned: 0 };

    const accessToken = await getAccessToken(sa);
    if (!accessToken) return { sent: 0, pruned: 0 };

    const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.projectId}/messages:send`;
    const deadTokenIds: string[] = [];
    let sent = 0;

    await Promise.allSettled(
      devices.map(async (d) => {
        // DATA-ONLY message. Our custom KitchenMessagingService (Android) handles
        // it even when backgrounded / screen-off / app-closed and fires the loud
        // looping order alarm + full-screen notification. A `notification` block
        // would instead be auto-shown by the system (a quiet single ding) and our
        // service would NOT run in the background — so we deliberately omit it.
        // title/body travel inside data so the native alarm can render them.
        const message = {
          message: {
            token: d.token,
            data: {
              ...(payload.data ?? {}),
              title: payload.title,
              body: payload.body,
            },
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
          return;
        }
        const errText = await res.text().catch(() => "");
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
    return { sent, pruned };
  } catch (e) {
    console.error("[push] sendKitchenPush error", e);
    return { sent: 0, pruned: 0 };
  }
}
