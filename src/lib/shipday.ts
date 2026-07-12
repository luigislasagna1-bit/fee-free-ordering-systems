/**
 * ShipDay third-party driver pool integration.
 *
 * Restaurants who subscribed to the Driver Pool or Marketplace Monthly
 * add-on can dispatch delivery orders to ShipDay's network of contracted
 * drivers instead of handling delivery in-house. This module wraps the
 * ShipDay REST API.
 *
 * Per-restaurant credentials live in ShipdayConfig (apiKey encrypted at
 * rest with the platform's ENCRYPTION_KEY). We never send a raw API key
 * in any log line.
 *
 * Webhook status updates land at /api/webhooks/shipday and update the
 * Order.shipdayStatus + status fields.
 *
 * Docs: https://docs.shipday.com/reference/integration
 */

import prisma from "@/lib/db";
import { decrypt } from "@/lib/encrypt";
import { hasFeature } from "@/lib/entitlements";
import { buildShipdayOrderBody, type DispatchInput } from "@/lib/shipday-payload";

// Payload construction lives in the prisma-free shipday-payload.ts so its
// contract is unit-tested; re-exported here for existing importers.
export { buildShipdayOrderBody, type DispatchInput } from "@/lib/shipday-payload";

const SHIPDAY_BASE_URL = "https://api.shipday.com";

/**
 * ShipDay orders MUST be prepaid online (Luigi 2026-07-04): ShipDay drivers
 * only pick up and drop off — they can't collect cash or take a card at the
 * door. So a restaurant may only dispatch via ShipDay when an ONLINE payment
 * method is genuinely usable: active Stripe keys or a connected PayPal
 * account, plus the card_payments entitlement. Used by the Driver Pool admin
 * gate and referenced by the checkout/order-route prepaid-delivery guards.
 */
export async function restaurantHasOnlinePayments(restaurantId: string): Promise<boolean> {
  const [provider, restaurant, entitled] = await Promise.all([
    prisma.paymentProvider.findUnique({
      where: { restaurantId },
      select: { isActive: true, publishableKey: true },
    }),
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { paypalAccountStatus: true },
    }),
    hasFeature(restaurantId, "card_payments"),
  ]);
  if (!entitled) return false;
  return !!(provider?.isActive && provider.publishableKey) || restaurant?.paypalAccountStatus === "connected";
}

/**
 * Fetch the decrypted ShipDay API key for a restaurant. Returns null if
 * the restaurant doesn't have credentials configured.
 */
async function getShipdayApiKey(restaurantId: string): Promise<string | null> {
  const config = await prisma.shipdayConfig.findUnique({
    where: { restaurantId },
    select: { apiKeyEnc: true, apiKeyIv: true, apiKeyTag: true },
  });
  if (!config?.apiKeyEnc || !config.apiKeyIv || !config.apiKeyTag) return null;
  if (!process.env.ENCRYPTION_KEY) {
    console.error("[shipday] ENCRYPTION_KEY missing; cannot decrypt API key");
    return null;
  }
  try {
    return decrypt(config.apiKeyEnc, config.apiKeyIv, config.apiKeyTag);
  } catch (e) {
    console.error("[shipday] failed to decrypt API key for", restaurantId, e);
    return null;
  }
}

/**
 * Resolve whether a restaurant is currently configured to dispatch via
 * ShipDay. Used in PATCH /api/orders/[id] to decide whether to call
 * dispatchOrder() on acceptance.
 *
 * Returns true when:
 *   - ShipdayConfig.enabled = true
 *   - The restaurant has stored credentials
 *   - deliverySource is "shipday" OR ("both" AND activeDispatchMode = "shipday")
 *
 * A restaurant with deliverySource="own" or who flipped activeDispatchMode
 * back to "own" mid-shift returns false — their in-house drivers handle it.
 */
export async function shouldDispatchToShipday(restaurantId: string): Promise<boolean> {
  const config = await prisma.shipdayConfig.findUnique({
    where: { restaurantId },
    select: {
      enabled: true,
      apiKeyEnc: true,
      deliverySource: true,
      activeDispatchMode: true,
    },
  });
  if (!config?.enabled || !config.apiKeyEnc) return false;
  if (config.deliverySource === "own") return false;
  if (config.deliverySource === "shipday") return true;
  if (config.deliverySource === "both" && config.activeDispatchMode === "shipday") return true;
  return false;
}

/**
 * Validate a ShipDay API key with a lightweight authenticated call, so an
 * owner can confirm their key works from the "Test connection" button WITHOUT
 * placing a real delivery order. GET /orders requires a valid key — a 2xx means
 * the key is good; 401/403 means it's wrong. Never logs the key. Luigi 2026-06-17.
 */
export async function testShipdayKey(apiKey: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  const key = apiKey.trim();
  if (!key) return { ok: false, error: "No API key provided" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(`${SHIPDAY_BASE_URL}/orders`, {
      method: "GET",
      headers: { Authorization: `Basic ${key}` },
      signal: ctrl.signal,
    });
    if (res.ok) return { ok: true, status: res.status };
    return {
      ok: false,
      status: res.status,
      error: res.status === 401 || res.status === 403 ? "Invalid API key" : `ShipDay returned ${res.status}`,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  } finally {
    clearTimeout(timer);
  }
}

type ShipdayCreateResponse = {
  orderId?: number;
  orderNumber?: string;
  success?: boolean;
  response?: string;
};

/**
 * Create a delivery order in ShipDay for the given restaurant. Returns
 * the ShipDay order ID (numeric, as a string) on success or null on
 * failure (logs the failure reason).
 *
 * The expectedPickupTime is set to (now + preparationMinutes). ShipDay
 * uses this to time driver dispatch — driver shows up roughly when the
 * food's ready.
 */
export async function dispatchOrderToShipday(
  restaurantId: string,
  input: DispatchInput,
): Promise<{ ok: boolean; shipdayOrderId?: string; error?: string }> {
  const apiKey = await getShipdayApiKey(restaurantId);
  if (!apiKey) {
    return { ok: false, error: "No ShipDay API key configured" };
  }

  const body = buildShipdayOrderBody(input, new Date());

  try {
    const res = await fetch(`${SHIPDAY_BASE_URL}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let json: ShipdayCreateResponse = {};
    try { json = JSON.parse(text); } catch { /* non-JSON response */ }

    if (!res.ok) {
      console.error("[shipday] dispatch failed", { restaurantId, orderId: input.orderId, status: res.status, body: text.slice(0, 500) });
      return { ok: false, error: `ShipDay returned ${res.status}: ${text.slice(0, 200)}` };
    }
    // ShipDay can REJECT an order with HTTP 200 + {"success": false, ...}
    // (bad address, missing required field). Treating any 2xx as dispatched
    // stamped orders "assigned" that never existed on ShipDay's side — found
    // live on Luigi's first real test order (2026-07-12): 200-with-no-orderId,
    // nothing in the ShipDay dashboard. success:false OR a missing orderId is
    // a failure; the raw body is logged so the real reason is visible.
    if (json.success === false || json.orderId == null) {
      console.error("[shipday] dispatch rejected by ShipDay (2xx)", {
        restaurantId, orderId: input.orderId, body: text.slice(0, 500),
      });
      return { ok: false, error: `ShipDay rejected the order: ${(json.response ?? text).slice(0, 200)}` };
    }
    return { ok: true, shipdayOrderId: String(json.orderId) };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[shipday] dispatch network error", { restaurantId, orderId: input.orderId, msg });
    return { ok: false, error: msg };
  }
}

/**
 * Cancel a previously-dispatched ShipDay order. Idempotent: a 404 from
 * ShipDay (order already cancelled or never existed) is treated as ok.
 * Used when a restaurant rejects/cancels an order AFTER dispatch.
 */
export async function cancelShipdayOrder(
  restaurantId: string,
  shipdayOrderId: string,
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = await getShipdayApiKey(restaurantId);
  if (!apiKey) {
    return { ok: false, error: "No ShipDay API key configured" };
  }
  try {
    const res = await fetch(`${SHIPDAY_BASE_URL}/orders/${shipdayOrderId}`, {
      method: "DELETE",
      headers: { Authorization: `Basic ${apiKey}` },
    });
    if (res.ok || res.status === 404) {
      return { ok: true };
    }
    const text = await res.text();
    console.error("[shipday] cancel failed", { restaurantId, shipdayOrderId, status: res.status, body: text.slice(0, 500) });
    return { ok: false, error: `ShipDay returned ${res.status}: ${text.slice(0, 200)}` };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[shipday] cancel network error", { restaurantId, shipdayOrderId, msg });
    return { ok: false, error: msg };
  }
}

// translateShipdayEvent lives in the prisma-free shipday-payload.ts so the
// event vocabulary is unit-tested against ShipDay's documented list;
// re-exported here for existing importers (webhook route).
export { translateShipdayEvent } from "@/lib/shipday-payload";
