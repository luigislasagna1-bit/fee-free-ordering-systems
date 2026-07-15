import type Stripe from "stripe";
import prisma from "@/lib/db";
import { syncConnectAccountProfile } from "@/lib/stripe";

/**
 * Handle account.* events for Stripe Connect (Layer C — restaurant's own
 * Stripe account, used to collect payments from THEIR customers).
 *
 * Stripe sends:
 *   - account.updated                  → charges_enabled / payouts_enabled toggle
 *   - account.application.deauthorized → restaurant removed our platform from their Stripe
 */
export async function handleAccountEvent(event: Stripe.Event) {
  if (event.type === "account.application.deauthorized") {
    // Stripe sends this when a connected account revokes our platform's access.
    // The account ID is in the event's `account` field (top-level), not data.object.
    const accountId = (event as any).account as string | undefined;
    if (!accountId) return;
    const restaurant = await prisma.restaurant.findFirst({
      where: { stripeAccountId: accountId },
      select: { id: true },
    });
    if (!restaurant) return;
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        stripeAccountId: null,
        stripeAccountStatus: "disconnected",
        stripeChargesEnabled: false,
        stripePayoutsEnabled: false,
      },
    });
    return;
  }

  if (event.type === "account.updated") {
    const account = event.data.object as Stripe.Account;
    const restaurant = await prisma.restaurant.findFirst({
      where: { stripeAccountId: account.id },
      select: { id: true, name: true, slug: true, currency: true },
    });
    if (!restaurant) return;
    // Derive status from Stripe's capability flags.
    const status = account.charges_enabled
      ? "connected"
      : account.details_submitted
        ? "pending"
        : "action_required";
    // Auto-default the restaurant's display/charge currency from its connected
    // Stripe account so a European (or any non-USD) merchant never sees "$"
    // where their Stripe account is in "€" (Fabrizio cmrkmtva). SAFE RULE: we
    // ONLY promote the untouched "usd" schema default — if the owner has
    // deliberately set ANY currency (incl. usd), we never touch it; and we only
    // change when Stripe's default_currency is present and actually differs.
    // Stripe returns default_currency lowercase (e.g. "eur"), matching our
    // ISO-4217-lowercase convention. Never a schema change; idempotent (once
    // promoted, currency !== "usd" so it won't re-run).
    const stripeCcy = (account.default_currency ?? "").toLowerCase();
    const shouldPromoteCurrency =
      restaurant.currency === "usd" && !!stripeCcy && stripeCcy !== "usd";
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        stripeAccountStatus: status,
        stripeChargesEnabled: account.charges_enabled ?? false,
        stripePayoutsEnabled: account.payouts_enabled ?? false,
        ...(shouldPromoteCurrency ? { currency: stripeCcy } : {}),
      },
    });
    if (shouldPromoteCurrency) {
      console.log(`[stripe/account.updated] auto-set currency for ${restaurant.slug}: usd → ${stripeCcy} (from connected Stripe account)`);
    }

    // Lock Connect-side business_profile to our canonical values. Stripe
    // Express onboarding lets the owner type any business name and URL
    // (which would then appear on customer receipts + invoices). If
    // they entered something different from the restaurant's actual name
    // in our DB, snap it back. The sync helper no-ops when both already
    // match, so we don't echo-loop on the very webhook our own update
    // triggers.
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const desiredUrl = baseUrl ? `${baseUrl.replace(/\/$/, "")}/order/${restaurant.slug}` : null;
    // IMPORTANT: await — Vercel kills unawaited promises the moment this
    // webhook handler returns its 200 to Stripe. We hit this exact bug
    // with kitchen notifications in payment-intent.ts (ORD-529226215).
    try {
      await syncConnectAccountProfile(account.id, {
        name: restaurant.name,
        url: desiredUrl,
      });
    } catch (err) {
      console.error("[stripe/account.updated] sync business_profile failed:", err instanceof Error ? err.message : err);
    }
  }
}
