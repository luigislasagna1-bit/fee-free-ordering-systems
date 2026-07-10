/**
 * Stripe integration — single source of truth for all Stripe API calls.
 *
 * Configuration precedence:
 *   1. PlatformSettings row (saved via /superadmin/settings/stripe) — DB-first
 *   2. Environment variables — used only when the DB row hasn't been set yet
 *
 * Per-process cache with a short TTL absorbs the steady-state read load so we
 * don't query PlatformSettings on every API call / webhook event. Call
 * `resetStripeCache()` after saving new settings so the next call re-reads.
 *
 * Three architectural layers this file serves:
 *   B. Platform subscription (restaurant pays platform)
 *   C. Customer payments (customer pays restaurant via Connect) — destination charges
 *   Webhook events — verified + dispatched in src/app/api/webhooks/stripe/route.ts
 */

import Stripe from "stripe";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encrypt";

// ─── Config loader (DB-first / env-fallback, cached) ────────────────────────

type StripeConfig = {
  enabled: boolean;
  mode: string | null;            // "test" | "live" | null
  secretKey: string | null;
  publishableKey: string | null;
  webhookSecret: string | null;
  source: "db" | "env" | "mixed";
};

let cached: { config: StripeConfig; loadedAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

/** Force a reload on the next call. Call this after saving new settings. */
export function resetStripeCache() {
  cached = null;
  _stripe = null;
}

async function loadConfig(): Promise<StripeConfig> {
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return cached.config;
  }

  let dbSecret: string | null = null;
  let dbPublishable: string | null = null;
  let dbWebhook: string | null = null;
  let dbMode: string | null = null;
  let dbEnabled = false;

  try {
    const settings = await prisma.platformSettings.findUnique({ where: { id: "singleton" } });
    if (settings) {
      dbMode = settings.stripeMode ?? null;
      dbEnabled = !!settings.stripeEnabled;
      dbPublishable = settings.stripePublishableKey ?? null;

      const k = process.env.ENCRYPTION_KEY;
      if (settings.stripeSecretKeyEnc && settings.stripeSecretKeyIv && settings.stripeSecretKeyTag && k) {
        try {
          dbSecret = decrypt(settings.stripeSecretKeyEnc, settings.stripeSecretKeyIv, settings.stripeSecretKeyTag);
        } catch (e: any) {
          console.error("[stripe config] Decryption of stripeSecretKey FAILED:", e?.message);
        }
      }
      if (settings.stripeWebhookSecretEnc && settings.stripeWebhookSecretIv && settings.stripeWebhookSecretTag && k) {
        try {
          dbWebhook = decrypt(settings.stripeWebhookSecretEnc, settings.stripeWebhookSecretIv, settings.stripeWebhookSecretTag);
        } catch (e: any) {
          console.error("[stripe config] Decryption of stripeWebhookSecret FAILED:", e?.message);
        }
      }
    }
  } catch (e: any) {
    // PlatformSettings query failed (DB down, migration not run, etc.) — fall
    // back to env vars entirely so the platform doesn't break.
    console.error("[stripe config] PlatformSettings query failed:", e?.message);
  }

  const envSecret = process.env.STRIPE_SECRET_KEY || null;
  const envPublishable = process.env.STRIPE_PUBLISHABLE_KEY || null;
  const envWebhook = process.env.STRIPE_WEBHOOK_SECRET || null;
  const envEnabled = process.env.STRIPE_ENABLED === "true";

  const secretKey = dbSecret ?? envSecret;
  const publishableKey = dbPublishable ?? envPublishable;
  const webhookSecret = dbWebhook ?? envWebhook;
  // DB explicitly off only if there is a settings row AND it says disabled.
  // If no DB row, fall back to env flag. (Once a row exists, that's source of truth.)
  const enabled = dbMode !== null || dbEnabled
    ? dbEnabled
    : envEnabled;
  const mode = dbMode ?? (envSecret?.startsWith("sk_live") ? "live" : envSecret ? "test" : null);

  const hasDb = !!(dbSecret || dbPublishable || dbWebhook);
  const hasEnv = !!(envSecret || envPublishable || envWebhook);
  const source: StripeConfig["source"] = hasDb && hasEnv ? "mixed" : hasDb ? "db" : "env";

  const config: StripeConfig = {
    enabled,
    mode,
    secretKey,
    publishableKey,
    webhookSecret,
    source,
  };
  cached = { config, loadedAt: Date.now() };
  return config;
}

/** Returns the loaded config so callers (UI status panel) can inspect state. */
export async function getStripeConfig(): Promise<StripeConfig> {
  return loadConfig();
}

// ─── Stripe client (async, lazy) ────────────────────────────────────────────

let _stripe: Stripe | null = null;
let _stripeKeyAtConstruct: string | null = null;

/** Lazy singleton — Stripe client is constructed on first use, cached, and
 *  rebuilt automatically if the secret key changes (e.g. after the superadmin
 *  rotates it via the UI). */
export async function getStripe(): Promise<Stripe> {
  const cfg = await loadConfig();
  if (!cfg.secretKey) {
    throw new Error(
      "Stripe secret key is not configured. Set it in /superadmin/settings/stripe or via STRIPE_SECRET_KEY env var."
    );
  }
  if (_stripe && _stripeKeyAtConstruct === cfg.secretKey) {
    return _stripe;
  }
  _stripe = new Stripe(cfg.secretKey, {
    // Pin a known API version so Stripe doesn't auto-upgrade us behind a feature flag.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    apiVersion: "2025-09-30.clover" as any,
    typescript: true,
    appInfo: { name: "Fee Free Ordering Systems" },
  });
  _stripeKeyAtConstruct = cfg.secretKey;
  return _stripe;
}

/** True if Stripe is fully configured (key + publishable + enabled). */
export async function stripeReady(): Promise<boolean> {
  const cfg = await loadConfig();
  return cfg.enabled && !!cfg.secretKey && !!cfg.publishableKey;
}

export async function getPublishableKey(): Promise<string> {
  const cfg = await loadConfig();
  if (!cfg.publishableKey) {
    throw new Error("Stripe publishable key is not configured.");
  }
  return cfg.publishableKey;
}

export async function getWebhookSecret(): Promise<string> {
  const cfg = await loadConfig();
  if (!cfg.webhookSecret) {
    throw new Error(
      "Stripe webhook secret is not configured. Set it in /superadmin/settings/stripe or via STRIPE_WEBHOOK_SECRET env var."
    );
  }
  return cfg.webhookSecret;
}

/**
 * Return EVERY webhook signing secret the platform should accept. The
 * route handler tries them in order and uses whichever one verifies the
 * incoming signature.
 *
 * Why multiple secrets: under the direct-charge model we have TWO Stripe
 * webhook destinations pointing at the same endpoint URL:
 *   1. The platform-level destination (events on the platform account —
 *      subscriptions, invoices, account.updated, etc.). Secret comes from
 *      STRIPE_WEBHOOK_SECRET (or /superadmin/settings/stripe in DB).
 *   2. The Connect-level destination (events on connected accounts —
 *      direct-charge payment_intent.* events for customer orders). Secret
 *      comes from STRIPE_CONNECT_WEBHOOK_SECRET (env-only — there's no
 *      per-restaurant admin page for this since it's a platform-wide
 *      destination just like #1).
 *
 * The signatures Stripe generates use destination-specific secrets, so
 * verification has to try each candidate. Wrong-secret verification fails
 * fast and locally — no extra network call.
 *
 * Also useful for zero-downtime secret rotation: add the new secret as
 * a second value, deploy, rotate the destination in Stripe, then drop
 * the old one.
 */
export async function getWebhookSecrets(): Promise<string[]> {
  const cfg = await loadConfig();
  const secrets: string[] = [];
  if (cfg.webhookSecret) secrets.push(cfg.webhookSecret);
  const connectSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET || null;
  if (connectSecret && !secrets.includes(connectSecret)) {
    secrets.push(connectSecret);
  }
  if (secrets.length === 0) {
    throw new Error(
      "Stripe webhook secret is not configured. Set it in /superadmin/settings/stripe or via STRIPE_WEBHOOK_SECRET / STRIPE_CONNECT_WEBHOOK_SECRET env vars."
    );
  }
  return secrets;
}

/**
 * Platform fee on Connect destination charges.
 *
 * **Fee Free Ordering takes 0% of every order.** Restaurants keep 100% of
 * the customer's payment aside from Stripe's own processing fee — that's
 * the entire product promise and brand. We make money instead via:
 *   1. Paid services / add-on subscriptions (Sales Optimized Website,
 *      Multi-Location, Driver Pool, etc.)
 *   2. Marketplace fees (PAYG $3/order OR flat $199.99/month), billed
 *      via a separate Stripe subscription, NOT via application_fee_amount.
 *
 * Both constants are 0 by design. If you find yourself tempted to set
 * them to a non-zero value, you're changing the business model — talk to
 * Luigi first. The variable + helper survives so future per-restaurant
 * override logic has a seam to plug into (e.g. enterprise tier).
 */
export const PLATFORM_FEE_PERCENT = 0;
export const PLATFORM_FEE_FIXED_CENTS = 0;

/**
 * Stripe's official ZERO-DECIMAL currencies (minor unit == whole unit —
 * amounts are sent as-is, NOT ×100). Single source of truth for every
 * amount conversion; the payment-intent and refund routes previously each
 * kept their own copy, and a drift between them would mis-charge or
 * mis-refund by 100× (stabilization finding L8). NOTE: ISK was in the old
 * copies but is NOT zero-decimal on Stripe (it treats ISK as two-decimal)
 * — removed per Stripe's list. Only JPY is currently reachable via the
 * supported-currency lists.
 */
export const STRIPE_ZERO_DECIMAL_CURRENCIES = new Set([
  "bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga",
  "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf",
]);

/** Major units → the integer amount Stripe expects for this currency. */
export function toStripeMinorUnits(amount: number, currency: string): number {
  return STRIPE_ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())
    ? Math.round(amount)
    : Math.round(amount * 100);
}

/** Stripe's integer amount → major units (e.g. webhook amount_refunded). */
export function fromStripeMinorUnits(minor: number, currency: string): number {
  return STRIPE_ZERO_DECIMAL_CURRENCIES.has(currency.toLowerCase())
    ? minor
    : Math.round(minor) / 100;
}

/** Compute platform application fee for a Connect destination charge. Returns
 *  0 under the current Fee Free model. Kept as a function (not just a
 *  constant) so we can later swap to a per-restaurant override without
 *  touching the call sites. */
export function calculatePlatformFee(amountCents: number): number {
  return Math.round(amountCents * (PLATFORM_FEE_PERCENT / 100)) + PLATFORM_FEE_FIXED_CENTS;
}

// ─── Connect (Layer C) ──────────────────────────────────────────────────────

/**
 * Create a new Stripe Connect STANDARD account for a restaurant.
 *
 * We use Standard (not Express) because:
 *   - Restaurants who already have a Stripe account can SIGN IN during
 *     onboarding (the "Sign in" link at the top of Stripe's hosted page).
 *     Express forces a brand-new account every time.
 *   - Restaurants get the FULL stripe.com dashboard for refunds, disputes,
 *     payouts, tax reporting, etc. Express has a stripped-down dashboard.
 *   - The restaurant owns their relationship with Stripe — they pay Stripe
 *     fees directly and handle their own 1099 reporting. Cleaner for our
 *     platform fee accounting too (we only see our application_fee_amount).
 *
 * Destination charges + transfer_data work identically on Standard and
 * Express, so the payment flow code doesn't change.
 */
export async function createConnectAccount(params: {
  email?: string;
  restaurantName?: string;
}): Promise<{ accountId: string }> {
  const stripe = await getStripe();
  const account = await stripe.accounts.create({
    type: "standard",
    email: params.email,
    business_profile: { name: params.restaurantName },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });
  return { accountId: account.id };
}

/** Build a Stripe-hosted Standard onboarding link. AccountLinks work for
 *  both Standard and Express — the only difference is the dashboard the
 *  restaurant gets afterward (full stripe.com vs Express dashboard). */
export async function createConnectOnboardingLink(
  accountId: string,
  baseUrl: string
): Promise<{ url: string }> {
  const stripe = await getStripe();
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${baseUrl}/api/stripe/connect/refresh`,
    return_url: `${baseUrl}/api/stripe/connect/return`,
    type: "account_onboarding",
  });
  return { url: link.url };
}

/**
 * Sync a Connect account's `business_profile` back to canonical values
 * from our DB. Stripe Express onboarding lets the owner type any business
 * name (which then shows on customer receipts + invoices). We snap it
 * back to the restaurant's actual name + storefront URL so the brand
 * stays consistent across order page, kitchen display, and Stripe-side
 * receipts.
 *
 * No-ops if both values already match what we'd set, to avoid an
 * `account.updated → setProfile → account.updated` echo loop.
 */
export async function syncConnectAccountProfile(
  accountId: string,
  desired: { name: string | null | undefined; url: string | null | undefined }
): Promise<{ changed: boolean }> {
  const stripe = await getStripe();
  const account = await stripe.accounts.retrieve(accountId);
  const currentName = account.business_profile?.name ?? null;
  const currentUrl = account.business_profile?.url ?? null;

  const desiredName = desired.name?.trim() || null;
  const desiredUrl = desired.url?.trim() || null;

  const nameMatches = currentName === desiredName;
  const urlMatches = currentUrl === desiredUrl;
  if (nameMatches && urlMatches) return { changed: false };

  await stripe.accounts.update(accountId, {
    business_profile: {
      ...(desiredName ? { name: desiredName } : {}),
      ...(desiredUrl ? { url: desiredUrl } : {}),
    },
  });
  return { changed: true };
}

/** Retrieve current status of a Connect account. */
export async function getConnectAccountStatus(accountId: string) {
  const stripe = await getStripe();
  const account = await stripe.accounts.retrieve(accountId);
  return {
    id: account.id,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
    requiresAction: !account.details_submitted || !account.charges_enabled,
  };
}

/**
 * Sanitize a restaurant name into a Stripe-acceptable
 * `statement_descriptor_suffix`. Stripe limits the suffix to 22 chars and
 * disallows `< > " ' \`. We also strip control chars and collapse repeated
 * whitespace so a bank statement reads cleanly (e.g. "LUIGIS LASAGNA").
 *
 * The full descriptor the customer sees is `<platform prefix>* <suffix>`,
 * e.g. "FEE FREE* LUIGIS LASAGNA" — far more useful than just the
 * platform name, which historically caused chargebacks because customers
 * didn't recognize "Fee Free Ordering Systems" on their statement.
 */
export function buildStatementDescriptorSuffix(restaurantName: string | null | undefined): string | undefined {
  if (!restaurantName) return undefined;
  const cleaned = restaurantName
    .replace(/[<>"'\\]/g, "")        // Stripe-disallowed chars
    .replace(/[^\x20-\x7E]/g, "")    // strip non-ASCII (accented chars etc) — banks display ASCII only anyway
    .replace(/\s+/g, " ")            // collapse whitespace
    .trim()
    .toUpperCase()
    .slice(0, 22);
  // Stripe requires the suffix to contain at least one letter and to be
  // 5+ chars. If sanitizing produced something too short or pure-numeric,
  // skip it — Stripe falls back to the platform's default descriptor.
  if (cleaned.length < 5) return undefined;
  if (!/[A-Z]/.test(cleaned)) return undefined;
  return cleaned;
}

/**
 * Create a PaymentIntent for a customer's order — GloriaFood-style.
 *
 * Two key behaviors:
 *
 * 1. **Direct charge** (NOT destination charge). The intent is created
 *    on the connected account via Stripe-Account header. Money goes
 *    customer → restaurant directly, never touching the platform's
 *    balance. The platform has zero financial involvement per order.
 *    Card statement shows the RESTAURANT's name (their Stripe business
 *    profile), not Fee Free Ordering.
 *
 * 2. **Manual capture**. The card is AUTHORIZED but not actually charged
 *    when the customer places the order. The hold persists for up to 7
 *    days. When the kitchen accepts the order, we call `capturePayment`
 *    which actually moves the money. When the kitchen rejects, we call
 *    `voidPayment` which releases the hold WITHOUT charging — no Stripe
 *    fee, no refund needed, customer never sees a charge that needs
 *    explaining.
 *
 * Webhook implications: `payment_intent.amount_capturable_updated` fires
 * when authorization succeeds (kitchen release point). `payment_intent.
 * succeeded` fires only AFTER capture completes (so it now means
 * "money moved," not "card OK"). Connect events arrive on the same
 * webhook endpoint with `event.account` set to the connected account.
 */
// ─── KEY-ONLY customer payments (restaurant's own Stripe account) ───────────
//
// The restaurant pastes their OWN Stripe publishable + secret API keys
// (Settings → Payments). We decrypt the secret and build a Stripe client
// bound to THEIR account. Charges / captures / refunds happen directly on
// the restaurant's own Stripe — no Connect, no platform application fee,
// money lands in their balance from the first authorization. This replaces
// the old Stripe Connect model entirely.

type RestaurantStripe = { client: Stripe; publishableKey: string; mode: string };
const _restaurantStripe = new Map<string, RestaurantStripe & { loadedAt: number }>();

/** Drop the cached per-restaurant Stripe client. Call after a key change
 *  (the payment-provider PUT route does this) so the next charge re-reads. */
export function resetRestaurantStripeCache(restaurantId?: string) {
  if (restaurantId) _restaurantStripe.delete(restaurantId);
  else _restaurantStripe.clear();
}

/**
 * Build (or return a cached) Stripe client bound to a restaurant's OWN
 * account, using the keys they saved in PaymentProvider. Returns null when
 * the restaurant has not set up active, complete keys — callers treat that
 * as "card payments not available for this restaurant".
 *
 * The decrypted secret key is held only in the per-process cache and is
 * NEVER logged or returned to any caller.
 */
export async function getRestaurantStripe(
  restaurantId: string,
): Promise<RestaurantStripe | null> {
  const hit = _restaurantStripe.get(restaurantId);
  if (hit && Date.now() - hit.loadedAt < CACHE_TTL_MS) {
    return { client: hit.client, publishableKey: hit.publishableKey, mode: hit.mode };
  }
  const p = await prisma.paymentProvider.findUnique({ where: { restaurantId } });
  if (
    !p ||
    !p.isActive ||
    !p.publishableKey ||
    !p.secretKeyEnc ||
    !p.secretKeyIv ||
    !p.secretKeyTag
  ) {
    return null;
  }
  let secret: string;
  try {
    secret = decrypt(p.secretKeyEnc, p.secretKeyIv, p.secretKeyTag);
  } catch {
    // Never log key material. A decrypt failure means the row is corrupt or
    // ENCRYPTION_KEY rotated — treat as "no card payments" rather than throw
    // into a customer checkout.
    console.error(`[stripe] failed to decrypt restaurant secret key for ${restaurantId}`);
    return null;
  }
  if (!secret) return null;
  const client = new Stripe(secret, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    apiVersion: "2025-09-30.clover" as any,
    typescript: true,
  });
  _restaurantStripe.set(restaurantId, {
    client,
    publishableKey: p.publishableKey,
    mode: p.mode,
    loadedAt: Date.now(),
  });
  return { client, publishableKey: p.publishableKey, mode: p.mode };
}

/**
 * Key-only "can this restaurant take card payments online RIGHT NOW?" gate.
 *
 * True iff BOTH:
 *   1. The restaurant has an active PaymentProvider with a publishable key
 *      (their own Stripe keys, entered via Settings → Payments).
 *   2. They hold the `card_payments` entitlement (Online Payments add-on).
 *
 * This is the key-only successor to the old Stripe-Connect `stripeChargesEnabled`
 * flag. Use it anywhere the Connect-era code gated on charges-enabled — e.g.
 * the marketplace listing visibility + detail page, which are card-only by
 * platform contract. Luigi 2026-06-04.
 */
export async function restaurantCanTakeCardOnline(restaurantId: string): Promise<boolean> {
  const { hasFeature } = await import("@/lib/entitlements");
  const [provider, hasCard] = await Promise.all([
    prisma.paymentProvider.findUnique({
      where: { restaurantId },
      select: { isActive: true, publishableKey: true },
    }),
    hasFeature(restaurantId, "card_payments"),
  ]);
  return !!(provider?.isActive && provider.publishableKey && hasCard);
}

/**
 * Create a card authorization on the restaurant's OWN Stripe account.
 * capture_method "manual" — this only places a hold; the funds move when
 * the kitchen accepts the order (`capturePayment`). No application fee, no
 * stripeAccount header: the call is made with the restaurant's own secret
 * key so the money is theirs from the start.
 *
 * Payment-method config is intentionally omitted — Stripe defaults
 * `automatic_payment_methods: { enabled: true }`, which is what the
 * customer-facing <PaymentElement /> renders against.
 *
 * `idempotencyKey` (REQUIRED) guards against duplicate authorizations on
 * double-submit / retry — Stripe returns the same PaymentIntent for the
 * same key. Throws when the restaurant has no active keys.
 */
export async function createDirectPaymentIntent(params: {
  amountCents: number;
  currency: string;
  restaurantId: string;
  orderId: string;
  idempotencyKey: string;
}): Promise<{
  clientSecret: string | null;
  id: string;
  publishableKey: string;
  platformFeeCents: number;
}> {
  const rs = await getRestaurantStripe(params.restaurantId);
  if (!rs) {
    throw new Error("Restaurant has not configured Stripe card payments");
  }
  const intent = await rs.client.paymentIntents.create(
    {
      amount: params.amountCents,
      currency: params.currency,
      capture_method: "manual",
      metadata: {
        orderId: params.orderId,
        restaurantId: params.restaurantId,
      },
    },
    { idempotencyKey: params.idempotencyKey },
  );
  return {
    clientSecret: intent.client_secret,
    id: intent.id,
    publishableKey: rs.publishableKey,
    /** Always 0 — the restaurant keeps 100% under the Fee Free model. */
    platformFeeCents: 0,
  };
}

/**
 * Capture a previously-authorized payment. Called from the kitchen
 * "Accept" flow — this is the moment money actually moves from the
 * customer's card to the restaurant's Stripe balance.
 *
 * Direct-charge intents live on the connected account, so the capture
 * call needs the same Stripe-Account header.
 *
 * If capture fails (card declined at capture, authorization expired,
 * etc.) we throw — the caller is responsible for blocking the
 * acceptance and surfacing the error.
 */
export async function capturePayment(params: {
  paymentIntentId: string;
  restaurantId: string;
}): Promise<{ id: string; status: string | null }> {
  const rs = await getRestaurantStripe(params.restaurantId);
  if (!rs) throw new Error("Restaurant has not configured Stripe card payments");
  const captured = await rs.client.paymentIntents.capture(
    params.paymentIntentId,
    {}, // no params — capture the full authorized amount
  );
  return { id: captured.id, status: captured.status };
}

/**
 * Void an authorization (release the hold without charging). Called
 * from the kitchen "Reject" flow BEFORE the order has been accepted —
 * the customer's card was authorized but never captured, so the
 * customer never sees a charge. No Stripe fee, no refund mechanics.
 *
 * Idempotent: cancelling an already-cancelled intent returns the same
 * state back without error (Stripe behaviour).
 */
export async function voidPayment(params: {
  paymentIntentId: string;
  restaurantId: string;
}): Promise<{ id: string; status: string | null }> {
  const rs = await getRestaurantStripe(params.restaurantId);
  if (!rs) throw new Error("Restaurant has not configured Stripe card payments");
  const cancelled = await rs.client.paymentIntents.cancel(
    params.paymentIntentId,
    { cancellation_reason: "requested_by_customer" },
  );
  return { id: cancelled.id, status: cancelled.status };
}

/**
 * Refund a CAPTURED direct-charge payment by PaymentIntent ID. Used
 * only when an order is cancelled AFTER the kitchen has already
 * accepted it (rare — most rejections happen before accept and go
 * through `voidPayment` instead).
 *
 * Direct charges live on the connected account, so the refund call
 * needs the Stripe-Account header. No `reverse_transfer` /
 * `refund_application_fee` complexity — the money is already in the
 * restaurant's balance, the refund just pulls it back out.
 *
 * Still possible to fail if the restaurant's available balance is too
 * low. In that case Stripe returns a clear error and we surface it as
 * a failed refund (the platform isn't on the hook to cover — direct
 * charges keep platform out of the money flow entirely).
 */
export async function refundDirectPayment(params: {
  paymentIntentId: string;
  restaurantId: string;
  reason?: "duplicate" | "fraudulent" | "requested_by_customer";
  /** Minor units (cents) to refund for a PARTIAL refund. Omit for a full
   *  refund of the remaining capturable amount. */
  amountCents?: number;
  /** Stripe idempotency key — guards against a double-click issuing two
   *  refunds for the same money. */
  idempotencyKey?: string;
}): Promise<{ id: string; status: string | null }> {
  const rs = await getRestaurantStripe(params.restaurantId);
  if (!rs) throw new Error("Restaurant has not configured Stripe card payments");
  const refund = await rs.client.refunds.create(
    {
      payment_intent: params.paymentIntentId,
      reason: params.reason,
      ...(params.amountCents && params.amountCents > 0
        ? { amount: Math.round(params.amountCents) }
        : {}),
    },
    params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined,
  );
  return { id: refund.id, status: refund.status };
}

