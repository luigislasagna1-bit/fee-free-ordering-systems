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

/** Platform fee on Connect destination charges. 2.9% + $0.30 by default. */
export const PLATFORM_FEE_PERCENT = 2.9;
export const PLATFORM_FEE_FIXED_CENTS = 30;

/** Compute platform application fee for a Connect destination charge. */
export function calculatePlatformFee(amountCents: number): number {
  return Math.round(amountCents * (PLATFORM_FEE_PERCENT / 100)) + PLATFORM_FEE_FIXED_CENTS;
}

// ─── Connect (Layer C) ──────────────────────────────────────────────────────

/** Create a new Stripe Connect Express account for a restaurant. */
export async function createConnectAccount(params: {
  email?: string;
  restaurantName?: string;
}): Promise<{ accountId: string }> {
  const stripe = await getStripe();
  const account = await stripe.accounts.create({
    type: "express",
    email: params.email,
    business_profile: { name: params.restaurantName },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });
  return { accountId: account.id };
}

/** Build a Stripe-hosted Express onboarding link. */
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
 * Create a PaymentIntent for a customer's order using **destination charge**:
 * the platform's secret key creates the intent, money lands in the restaurant's
 * connected account minus the platform application fee.
 */
export async function createDestinationPaymentIntent(params: {
  amountCents: number;
  currency: string;
  restaurantStripeAccountId: string;
  orderId: string;
  restaurantId: string;
  /** Restaurant display name — used to build the customer's bank-statement
   *  suffix so charges read like "FEE FREE* LUIGIS LASAGNA" rather than
   *  just the platform's brand. Optional; falls back to platform default. */
  restaurantName?: string | null;
}) {
  const stripe = await getStripe();
  const platformFee = calculatePlatformFee(params.amountCents);
  const statementDescriptorSuffix = buildStatementDescriptorSuffix(params.restaurantName);
  const intent = await stripe.paymentIntents.create({
    amount: params.amountCents,
    currency: params.currency,
    application_fee_amount: platformFee,
    transfer_data: { destination: params.restaurantStripeAccountId },
    ...(statementDescriptorSuffix ? { statement_descriptor_suffix: statementDescriptorSuffix } : {}),
    metadata: {
      orderId: params.orderId,
      restaurantId: params.restaurantId,
    },
  });
  return {
    clientSecret: intent.client_secret,
    id: intent.id,
    platformFeeCents: platformFee,
  };
}

/** Refund a Connect destination charge by PaymentIntent ID. */
export async function refundDestinationPayment(params: {
  paymentIntentId: string;
  refundApplicationFee?: boolean;
  reason?: "duplicate" | "fraudulent" | "requested_by_customer";
}) {
  const stripe = await getStripe();
  const refund = await stripe.refunds.create({
    payment_intent: params.paymentIntentId,
    refund_application_fee: params.refundApplicationFee ?? true,
    reverse_transfer: true,
    reason: params.reason,
  });
  return { id: refund.id, status: refund.status };
}
