// ─── Stripe Integration ───────────────────────────────────────────────────────
//
// Required environment variables:
//   STRIPE_SECRET_KEY         — from Stripe Dashboard → Developers → API Keys
//   STRIPE_PUBLISHABLE_KEY    — from Stripe Dashboard (NEXT_PUBLIC_ prefix for client)
//   STRIPE_WEBHOOK_SECRET     — from Stripe Dashboard → Webhooks (for order payments)
//   STRIPE_ENABLED=true       — set to "true" to activate all Stripe features
//
// For Stripe Connect onboarding to work in LOCAL development:
//   You need a publicly accessible return URL (e.g., use ngrok or Stripe's test mode).
//   In production, set NEXT_PUBLIC_APP_URL to your domain (e.g., https://yoursite.com).
//
// Install: npm install stripe

export const STRIPE_ENABLED = process.env.STRIPE_ENABLED === "true";

function getStripe() {
  if (!STRIPE_ENABLED || !process.env.STRIPE_SECRET_KEY) {
    return null;
  }
  // Dynamic require to avoid errors when stripe package is not installed
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Stripe = require("stripe");
    return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-11-20.acacia" });
  } catch {
    console.warn("[Stripe] stripe package not installed. Run: npm install stripe");
    return null;
  }
}

// Create or retrieve a Stripe Connect Express account for a restaurant
export async function createConnectAccount(params: { email?: string; restaurantName?: string }) {
  const stripe = getStripe();
  if (!stripe) {
    return { error: "Stripe not configured. Set STRIPE_SECRET_KEY and STRIPE_ENABLED=true in .env" };
  }
  const account = await stripe.accounts.create({
    type: "express",
    email: params.email,
    business_profile: { name: params.restaurantName },
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
  });
  return { accountId: account.id };
}

// Create an onboarding link for a Stripe Connect account
export async function createConnectOnboardingLink(accountId: string, baseUrl: string) {
  const stripe = getStripe();
  if (!stripe) {
    return { error: "Stripe not configured" };
  }
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${baseUrl}/api/stripe/connect/refresh`,
    return_url: `${baseUrl}/api/stripe/connect/return`,
    type: "account_onboarding",
  });
  return { url: link.url };
}

// Check the status of a Stripe Connect account
export async function getConnectAccountStatus(accountId: string) {
  const stripe = getStripe();
  if (!stripe) return { error: "Stripe not configured" };
  const account = await stripe.accounts.retrieve(accountId);
  return {
    id: account.id,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
    requiresAction: !account.details_submitted || !account.charges_enabled,
  };
}

// Create a Payment Intent for an order (charged to restaurant's connected account)
export async function createPaymentIntent(params: {
  amount: number; // in cents
  currency: string;
  restaurantStripeAccountId: string;
  orderId: string;
  platformFeePercent?: number;
}) {
  const stripe = getStripe();
  if (!stripe) {
    return { error: "Stripe not configured" };
  }
  const platformFee = params.platformFeePercent
    ? Math.round(params.amount * (params.platformFeePercent / 100))
    : 0;
  const intent = await stripe.paymentIntents.create({
    amount: params.amount,
    currency: params.currency,
    application_fee_amount: platformFee,
    transfer_data: { destination: params.restaurantStripeAccountId },
    metadata: { orderId: params.orderId },
  });
  return { clientSecret: intent.client_secret, id: intent.id };
}

export async function createCheckoutSession(params: {
  restaurantId: string; planSlug: string; successUrl: string; cancelUrl: string;
}) {
  const stripe = getStripe();
  if (!stripe) {
    console.log("[Stripe] Not configured — would redirect to:", params.successUrl);
    return { url: params.successUrl };
  }
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: { restaurantId: params.restaurantId, planSlug: params.planSlug },
  });
  return { url: session.url };
}
