/**
 * PayPal REST API wrapper — per-restaurant direct charges.
 *
 * Architectural model mirrors Stripe Connect (see src/lib/stripe.ts):
 *   - Each restaurant owns their PayPal Business account.
 *   - Restaurant pastes their REST app's client_id + secret into our admin
 *     (`/admin/payments/providers`). We encrypt with src/lib/encrypt.ts and
 *     store ciphertext on the Restaurant row.
 *   - At payment time we OAuth into THEIR account using their creds and
 *     call /v2/checkout/orders with intent=AUTHORIZE. Money lands directly
 *     in their PayPal balance — platform never touches funds.
 *   - PayPal's hosted-onboarding "Partner / Commerce Platform" flow is the
 *     prettier UX but requires platform-level Partner approval that takes
 *     days-to-weeks. The per-restaurant REST app model ships today.
 *
 * Why not the @paypal/checkout-server-sdk npm package?
 * PayPal officially deprecated their Node SDK in 2023 and recommends direct
 * REST calls. The SDK still works but is unmaintained and the package
 * shape is awkward. Direct fetch keeps the surface tiny + auditable + lets
 * us swap to live/sandbox per restaurant trivially.
 *
 * Production vs Sandbox:
 * The restaurant chooses `paypalEnvironment` ("sandbox" | "live") at
 * onboarding. We pick the API base + auth URL off that field at every call.
 * No platform-wide env switch.
 *
 * Idempotency:
 * Every mutating call accepts an optional `idempotencyKey` (orderId is the
 * natural choice) which we pass in the `PayPal-Request-Id` header. PayPal
 * dedups on this for 24h — duplicate calls return the original result
 * instead of creating a new order/authorization.
 */

import prisma from "@/lib/db";
import { decrypt } from "@/lib/encrypt";

// Tiny in-process token cache. PayPal access tokens last 9 hours; we
// cache by (restaurantId, environment) and refresh ~5min before expiry.
// Key is just `${restaurantId}:${env}`. Value carries the bearer + the
// epoch ms when we should refresh. No need for a Redis backing — the
// cache is best-effort. A cold lambda just re-OAuths once.
type CachedToken = { bearer: string; refreshAt: number };
const tokenCache = new Map<string, CachedToken>();

export type PaypalEnv = "sandbox" | "live";

function apiBase(env: PaypalEnv): string {
  return env === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

/** Looks up + decrypts a restaurant's PayPal credentials.
 *
 *  `requireConnected` (default: true) controls the status gate:
 *    - true  → throws unless paypalAccountStatus === "connected". Used by
 *              customer-facing paths (createPaypalOrder, capture, refund, ...)
 *              where we MUST refuse to process payments against a not-yet-
 *              verified connection.
 *    - false → throws ONLY if the credentials themselves are missing. Used
 *              by the verify-during-onboarding path, where the WHOLE POINT
 *              of the call is to test creds whose status is still "pending"
 *              and decide whether to flip it to "connected". Without this
 *              flag, the verify call would always 4xx with "not connected"
 *              before ever reaching PayPal — chicken and egg.
 */
export async function getRestaurantPaypalCreds(
  restaurantId: string,
  opts: { requireConnected?: boolean } = {},
): Promise<{
  clientId: string;
  secret: string;
  env: PaypalEnv;
  merchantEmail: string | null;
}> {
  const requireConnected = opts.requireConnected !== false;
  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      paypalAccountStatus: true,
      paypalEnvironment: true,
      paypalClientIdEnc: true,
      paypalClientIdIv: true,
      paypalClientIdTag: true,
      paypalSecretEnc: true,
      paypalSecretIv: true,
      paypalSecretTag: true,
      paypalMerchantEmail: true,
    },
  });
  if (!r) throw new Error(`Restaurant ${restaurantId} not found`);
  if (
    !r.paypalClientIdEnc || !r.paypalClientIdIv || !r.paypalClientIdTag ||
    !r.paypalSecretEnc || !r.paypalSecretIv || !r.paypalSecretTag
  ) {
    throw new Error(`Restaurant ${restaurantId} PayPal credentials are incomplete`);
  }
  if (requireConnected && r.paypalAccountStatus !== "connected") {
    throw new Error(`Restaurant ${restaurantId} has not connected PayPal`);
  }
  const env = (r.paypalEnvironment ?? "live") as PaypalEnv;
  const clientId = decrypt(r.paypalClientIdEnc, r.paypalClientIdIv, r.paypalClientIdTag);
  const secret = decrypt(r.paypalSecretEnc, r.paypalSecretIv, r.paypalSecretTag);
  return { clientId, secret, env, merchantEmail: r.paypalMerchantEmail };
}

/** OAuth into a restaurant's PayPal account. Returns a bearer token.
 *  Caches per (restaurant, env) — PayPal tokens last 9h; we refresh 5min
 *  early. Throws on auth failure (bad creds, revoked app, etc.). */
async function getAccessToken(
  restaurantId: string,
  creds: { clientId: string; secret: string; env: PaypalEnv },
): Promise<string> {
  const cacheKey = `${restaurantId}:${creds.env}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.refreshAt > Date.now()) return cached.bearer;

  const auth = Buffer.from(`${creds.clientId}:${creds.secret}`).toString("base64");
  const res = await fetch(`${apiBase(creds.env)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    // Don't log secret. Log status + a generic body slice for debugging.
    const text = await res.text().catch(() => "");
    throw new Error(`PayPal OAuth failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  const refreshAt = Date.now() + Math.max(0, json.expires_in - 300) * 1000;
  tokenCache.set(cacheKey, { bearer: json.access_token, refreshAt });
  return json.access_token;
}

/** Generic authenticated PayPal call. Used by the higher-level
 *  helpers below. Returns parsed JSON, or null for 204 responses. */
async function paypalFetch<T = unknown>(
  restaurantId: string,
  path: string,
  init: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
    idempotencyKey?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const creds = await getRestaurantPaypalCreds(restaurantId);
  const bearer = await getAccessToken(restaurantId, creds);
  const url = `${apiBase(creds.env)}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${bearer}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(init.headers ?? {}),
  };
  if (init.idempotencyKey) headers["PayPal-Request-Id"] = init.idempotencyKey;
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 204) return null as T;
  // PayPal returns errors as JSON with details — surface them so callers
  // can decide whether to retry / surface to user.
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PayPal ${init.method ?? "GET"} ${path} failed (${res.status}): ${text.slice(0, 500)}`);
  }
  return (await res.json()) as T;
}

// ────────────────────────────────────────────────────────────────────────
// Public API — order lifecycle
// ────────────────────────────────────────────────────────────────────────

/** Verify the restaurant's stored credentials still work + grab their
 *  merchant profile email. Called from the onboarding API after the
 *  owner pastes creds, and from a status-poll endpoint. */
export async function verifyPaypalCredentials(restaurantId: string): Promise<{
  ok: boolean;
  errorMessage?: string;
}> {
  try {
    // IMPORTANT: don't require status=="connected" — this function IS
    // what flips it. During onboarding the row is "pending" with creds
    // freshly stored; we need to OAuth-test the freshly-saved creds
    // and only then mark the restaurant connected.
    const creds = await getRestaurantPaypalCreds(restaurantId, { requireConnected: false });
    await getAccessToken(restaurantId, creds);
    return { ok: true };
  } catch (e) {
    return { ok: false, errorMessage: e instanceof Error ? e.message : String(e) };
  }
}

/** Create a PayPal order with intent=AUTHORIZE. Customer approves on
 *  PayPal-hosted page (or via the JS SDK Smart Buttons in-page); we then
 *  call `authorizePaypalOrder` to lock funds. Capture happens later, on
 *  kitchen accept — same delayed-capture model as Stripe. */
export async function createPaypalOrder(params: {
  restaurantId: string;
  orderId: string;
  amount: number;          // dollars; we serialize to "12.34" string
  currency: string;        // "USD" | "EUR" | ...
  description?: string;
  returnUrl: string;       // where to send the user after approval
  cancelUrl: string;       // where to send the user if they cancel
}): Promise<{ paypalOrderId: string; approveUrl: string }> {
  const body = {
    intent: "AUTHORIZE",
    purchase_units: [
      {
        reference_id: params.orderId,
        description: params.description?.slice(0, 127),
        amount: {
          currency_code: params.currency.toUpperCase(),
          value: params.amount.toFixed(2),
        },
        custom_id: params.orderId, // appears in webhooks
      },
    ],
    application_context: {
      return_url: params.returnUrl,
      cancel_url: params.cancelUrl,
      user_action: "PAY_NOW",
      shipping_preference: "NO_SHIPPING",
    },
  };
  const res = await paypalFetch<{
    id: string;
    links: { href: string; rel: string; method: string }[];
  }>(params.restaurantId, "/v2/checkout/orders", {
    method: "POST",
    body,
    idempotencyKey: `order:${params.orderId}`,
  });
  const approve = res.links.find((l) => l.rel === "approve" || l.rel === "payer-action");
  if (!approve) throw new Error("PayPal did not return an approve link");
  return { paypalOrderId: res.id, approveUrl: approve.href };
}

/** After the customer approves, authorize the order — locks funds on
 *  their funding source. Returns the authorization ID we need later for
 *  capture / void. */
export async function authorizePaypalOrder(params: {
  restaurantId: string;
  paypalOrderId: string;
  orderId: string;
}): Promise<{ authorizationId: string; status: string }> {
  const res = await paypalFetch<{
    id: string;
    status: string;
    purchase_units: {
      payments: { authorizations: { id: string; status: string }[] };
    }[];
  }>(params.restaurantId, `/v2/checkout/orders/${params.paypalOrderId}/authorize`, {
    method: "POST",
    body: {},
    idempotencyKey: `authorize:${params.orderId}`,
  });
  const auth = res.purchase_units?.[0]?.payments?.authorizations?.[0];
  if (!auth) throw new Error(`PayPal authorize returned no authorization: ${JSON.stringify(res).slice(0, 200)}`);
  return { authorizationId: auth.id, status: auth.status };
}

/** Capture a previously-authorized payment. Same role as Stripe's
 *  capturePayment — called from kitchen accept. Idempotent on PayPal's
 *  side via PayPal-Request-Id. */
export async function capturePaypalAuthorization(params: {
  restaurantId: string;
  authorizationId: string;
  orderId: string;
  /** Optional — capture less than full authorized amount. Defaults to
   *  full capture. */
  amount?: { value: string; currency: string };
}): Promise<{ captureId: string; status: string }> {
  const body: Record<string, unknown> = { final_capture: true };
  if (params.amount) {
    body.amount = {
      currency_code: params.amount.currency.toUpperCase(),
      value: params.amount.value,
    };
  }
  const res = await paypalFetch<{ id: string; status: string }>(
    params.restaurantId,
    `/v2/payments/authorizations/${params.authorizationId}/capture`,
    {
      method: "POST",
      body,
      idempotencyKey: `capture:${params.orderId}`,
    },
  );
  return { captureId: res.id, status: res.status };
}

/**
 * Read the current status of a PayPal authorization. Used by
 * /api/public/paypal-order/[id]/authorize to verify a previously-
 * recorded authorizationId is still valid before short-circuiting to
 * "idempotent success." Without this check, an authorization that
 * expired (24h window) or was already captured / voided silently makes
 * the endpoint claim success — then capture fails 25 hours later when
 * the kitchen finally clicks Accept.
 *
 * PayPal authorization statuses: CREATED | CAPTURED | DENIED |
 * EXPIRED | PARTIALLY_CAPTURED | VOIDED | PENDING.
 * Only CREATED means "still capturable."
 */
export async function getPaypalAuthorizationStatus(params: {
  restaurantId: string;
  authorizationId: string;
}): Promise<{ status: string }> {
  const res = await paypalFetch<{ status: string }>(
    params.restaurantId,
    `/v2/payments/authorizations/${params.authorizationId}`,
    { method: "GET" },
  );
  return { status: res.status };
}

/** Void an authorization. Released funds — no money moved. Idempotent. */
export async function voidPaypalAuthorization(params: {
  restaurantId: string;
  authorizationId: string;
  orderId: string;
}): Promise<{ status: string }> {
  // PayPal void returns 204 No Content on success.
  await paypalFetch(params.restaurantId,
    `/v2/payments/authorizations/${params.authorizationId}/void`,
    {
      method: "POST",
      body: {},
      idempotencyKey: `void:${params.orderId}`,
    },
  );
  return { status: "VOIDED" };
}

/** Refund a captured payment. Used for post-accept cancellations. */
export async function refundPaypalCapture(params: {
  restaurantId: string;
  captureId: string;
  orderId: string;
  /** Optional partial refund amount; defaults to full refund. */
  amount?: { value: string; currency: string };
  reason?: string;
}): Promise<{ refundId: string; status: string }> {
  const body: Record<string, unknown> = {};
  if (params.amount) {
    body.amount = {
      currency_code: params.amount.currency.toUpperCase(),
      value: params.amount.value,
    };
  }
  if (params.reason) body.note_to_payer = params.reason.slice(0, 255);
  const res = await paypalFetch<{ id: string; status: string }>(
    params.restaurantId,
    `/v2/payments/captures/${params.captureId}/refund`,
    {
      method: "POST",
      body,
      idempotencyKey: `refund:${params.orderId}`,
    },
  );
  return { refundId: res.id, status: res.status };
}

/** Look up an order's status — useful when reconciling state after a
 *  webhook is missed or a customer bounces back from PayPal mid-flow. */
export async function getPaypalOrder(params: {
  restaurantId: string;
  paypalOrderId: string;
}): Promise<unknown> {
  return paypalFetch(params.restaurantId, `/v2/checkout/orders/${params.paypalOrderId}`);
}

// ────────────────────────────────────────────────────────────────────────
// Webhook verification
// ────────────────────────────────────────────────────────────────────────

/** Verify a PayPal webhook signature using PayPal's own verify endpoint.
 *  We DON'T verify against a shared secret because PayPal doesn't issue
 *  one for webhooks — instead each event is signed with PayPal's cert
 *  chain and we ask PayPal to verify on our behalf. The webhook ID we
 *  pass is the one we created during PayPal app setup (one webhook per
 *  restaurant, registered via /v1/notifications/webhooks). */
export async function verifyPaypalWebhookSignature(params: {
  restaurantId: string;
  webhookId: string;
  headers: {
    transmissionId: string;
    transmissionTime: string;
    transmissionSig: string;
    certUrl: string;
    authAlgo: string;
  };
  rawBody: string;
}): Promise<boolean> {
  try {
    const res = await paypalFetch<{ verification_status: string }>(
      params.restaurantId,
      "/v1/notifications/verify-webhook-signature",
      {
        method: "POST",
        body: {
          auth_algo: params.headers.authAlgo,
          cert_url: params.headers.certUrl,
          transmission_id: params.headers.transmissionId,
          transmission_sig: params.headers.transmissionSig,
          transmission_time: params.headers.transmissionTime,
          webhook_id: params.webhookId,
          webhook_event: JSON.parse(params.rawBody),
        },
      },
    );
    return res.verification_status === "SUCCESS";
  } catch (e) {
    console.error("[paypal] webhook signature verify failed:", e);
    return false;
  }
}
