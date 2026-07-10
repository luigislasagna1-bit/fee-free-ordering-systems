/**
 * Per-restaurant Stripe webhook registration (hardening 2026-07-10).
 *
 * KEY-ONLY MODEL GAP: customer charges live on the RESTAURANT'S OWN Stripe
 * account, whose events never reach the platform webhook. A refund issued
 * from the restaurant's Stripe dashboard therefore left the order marked
 * "paid" and never restored/clawed back Reward Dollars. Fix: register a
 * charge.refunded webhook ON THEIR account, pointed at
 * /api/webhooks/restaurant-stripe/[restaurantId], with the endpoint secret
 * stored AES-encrypted alongside their API key.
 *
 * Called from the Test-connection route (fire-and-forget-safe, never blocks
 * the test result) — every existing provider gets registered the next time
 * the owner clicks Test connection; new providers on their first test.
 * Idempotent: finds an existing endpoint by URL before creating. Stripe only
 * returns the signing secret at CREATE time, so if we ever find an endpoint
 * whose secret we didn't store, we recreate it.
 */
import type Stripe from "stripe";
import prisma from "@/lib/db";
import { encrypt } from "@/lib/encrypt";

const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "charge.refunded",
  // Disputes/chargebacks land on the RESTAURANT'S account too (H-1 / LR-PAY-02)
  // — without these the platform was blind to a disputed order (stayed "paid"
  // forever, owner never told, reward never clawed back).
  "charge.dispute.created",
  "charge.dispute.closed",
];

export function restaurantWebhookUrl(restaurantId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://feefreeordering.com";
  return `${base}/api/webhooks/restaurant-stripe/${restaurantId}`;
}

export async function ensureRestaurantStripeWebhook(opts: {
  restaurantId: string;
  stripe: Stripe; // client already authenticated with the RESTAURANT'S key
}): Promise<{ ok: boolean; detail: string }> {
  const { restaurantId, stripe } = opts;
  try {
    const url = restaurantWebhookUrl(restaurantId);
    // Local dev URLs are unreachable by Stripe — skip registration quietly.
    if (url.startsWith("http://localhost")) return { ok: false, detail: "skipped (localhost)" };

    const provider = await prisma.paymentProvider.findUnique({
      where: { restaurantId },
      select: { webhookEndpointId: true, webhookSecretEnc: true },
    });
    if (!provider) return { ok: false, detail: "no provider row" };

    const existing = await stripe.webhookEndpoints.list({ limit: 100 });
    const ours = existing.data.find((e) => e.url === url);

    // Endpoint already registered AND we hold its secret → just make sure the
    // event set is current. (The secret is only revealed at create time.)
    if (ours && provider.webhookEndpointId === ours.id && provider.webhookSecretEnc) {
      const wanted = new Set<string>(WEBHOOK_EVENTS);
      const has = new Set(ours.enabled_events);
      const eventsDrifted = ours.enabled_events.includes("*")
        ? false
        : [...wanted].some((e) => !has.has(e));
      if (eventsDrifted) {
        await stripe.webhookEndpoints.update(ours.id, { enabled_events: WEBHOOK_EVENTS });
      }
      if (ours.status === "disabled") {
        await stripe.webhookEndpoints.update(ours.id, { disabled: false });
      }
      return { ok: true, detail: "already registered" };
    }

    // Endpoint exists but we don't hold its secret (created pre-tracking or
    // secret lost) → replace it so we get a fresh secret.
    if (ours) {
      try { await stripe.webhookEndpoints.del(ours.id); } catch { /* keep going — create below */ }
    }

    const created = await stripe.webhookEndpoints.create({
      url,
      enabled_events: WEBHOOK_EVENTS,
      description: "Fee Free Ordering — refund sync (auto-registered)",
    });
    const enc = encrypt(created.secret!);
    await prisma.paymentProvider.update({
      where: { restaurantId },
      data: {
        webhookEndpointId: created.id,
        webhookSecretEnc: enc.enc,
        webhookSecretIv: enc.iv,
        webhookSecretTag: enc.tag,
      },
    });
    return { ok: true, detail: "registered" };
  } catch (e) {
    console.error("[ensureRestaurantStripeWebhook]", restaurantId, e instanceof Error ? e.message : e);
    return { ok: false, detail: "error" };
  }
}
