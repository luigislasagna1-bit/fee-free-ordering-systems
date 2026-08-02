/**
 * Customer push notifications for Branded Mobile App installs
 * (Luigi 2026-08-02). Order-status pushes to a CUSTOMER's devices — the
 * Apple-4.2 anchor capability of the branded apps and the "your food is
 * ready" moment customers actually want.
 *
 * Transport: the same FCM HTTP v1 flow as kitchen push (auth helpers are
 * shared from src/lib/push.ts so the OAuth code lives once). Same gating
 * philosophy: FIREBASE_SERVICE_ACCOUNT absent → silent no-op; fire-and-forget
 * and NEVER throws — order flows must never fail because push hiccuped.
 *
 * Differences from kitchen push, ON PURPOSE:
 *  - MULTI-DEVICE: sends to every registered device (allSettled fan-out).
 *    The kitchen's newest-token-only rule is a staff-workflow policy.
 *  - Plain NOTIFICATION messages on both platforms (default sound, standard
 *    priority) — no alarms, no time-sensitive interruption.
 *  - Prunes only tokens FCM reports UNREGISTERED/404.
 */
import prisma from "@/lib/db";
import { getAccessToken, getServiceAccount } from "@/lib/push";

export interface CustomerPushPayload {
  title: string;
  body: string;
  /** String→string only (FCM data payloads are always strings). Include a
   *  `path` (e.g. /order/<slug>/status/<orderId>) for the shell's tap deep link. */
  data?: Record<string, string>;
}

export async function sendCustomerPush(
  restaurantId: string,
  customerId: string,
  payload: CustomerPushPayload,
): Promise<{ sent: number; pruned: number }> {
  try {
    const sa = getServiceAccount();
    if (!sa) return { sent: 0, pruned: 0 };

    // Both scoping keys in the WHERE — a token row can never be addressed
    // across tenants even if customerId were somehow guessed. `take` is a
    // defensive cap in line with the house no-unbounded-findMany rule — the
    // register route (register/route.ts) already caps a customer at 10
    // devices, so this should never bite, but a send path fanning out to
    // one FCM call per row shouldn't trust an upstream invariant alone.
    const devices = await prisma.customerPushToken.findMany({
      where: { customerId, restaurantId },
      select: { id: true, token: true, platform: true },
      take: 20,
    });
    if (devices.length === 0) return { sent: 0, pruned: 0 };

    const accessToken = await getAccessToken(sa);
    if (!accessToken) return { sent: 0, pruned: 0 };

    const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.projectId}/messages:send`;
    const deadTokenIds: string[] = [];
    let sent = 0;

    await Promise.allSettled(
      devices.map(async (d) => {
        const message = {
          message: {
            token: d.token,
            notification: { title: payload.title, body: payload.body },
            data: payload.data ?? {},
            ...(d.platform === "ios"
              ? {
                  apns: {
                    headers: { "apns-priority": "10", "apns-push-type": "alert" },
                    payload: { aps: { sound: "default" } },
                  },
                }
              : {
                  android: { priority: "HIGH" as const, notification: { sound: "default" } },
                }),
          },
        };
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(message),
          });
          if (res.ok) {
            sent++;
            return;
          }
          const text = await res.text().catch(() => "");
          // Dead-token pruning: FCM 404 / UNREGISTERED means this device
          // uninstalled or rotated tokens.
          if (res.status === 404 || text.includes("UNREGISTERED")) {
            deadTokenIds.push(d.id);
          } else {
            console.error("[customer-push] send failed", res.status, text.slice(0, 300));
          }
        } catch (e) {
          console.error("[customer-push] send error", e);
        }
      }),
    );

    if (deadTokenIds.length > 0) {
      await prisma.customerPushToken.deleteMany({ where: { id: { in: deadTokenIds } } }).catch(() => {});
    }
    return { sent, pruned: deadTokenIds.length };
  } catch (e) {
    console.error("[customer-push] unexpected", e);
    return { sent: 0, pruned: 0 };
  }
}

/**
 * Transactional order-status gate: entitlement + the customer's pref.
 * Marketing sends must additionally check Customer.marketingConsent AND
 * pref.marketing — deliberately NOT implemented here yet (v1 is
 * transactional-only; the storage exists).
 */
export async function customerWantsOrderPush(customerId: string): Promise<boolean> {
  const pref = await prisma.customerPushPref.findUnique({
    where: { customerId },
    select: { orderUpdates: true },
  });
  return pref?.orderUpdates !== false; // default ON (row may not exist yet)
}
