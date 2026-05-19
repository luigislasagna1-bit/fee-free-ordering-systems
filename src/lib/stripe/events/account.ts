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
      select: { id: true, name: true, slug: true },
    });
    if (!restaurant) return;
    // Derive status from Stripe's capability flags.
    const status = account.charges_enabled
      ? "connected"
      : account.details_submitted
        ? "pending"
        : "action_required";
    await prisma.restaurant.update({
      where: { id: restaurant.id },
      data: {
        stripeAccountStatus: status,
        stripeChargesEnabled: account.charges_enabled ?? false,
        stripePayoutsEnabled: account.payouts_enabled ?? false,
      },
    });

    // Lock Connect-side business_profile to our canonical values. Stripe
    // Express onboarding lets the owner type any business name and URL
    // (which would then appear on customer receipts + invoices). If
    // they entered something different from the restaurant's actual name
    // in our DB, snap it back. The sync helper no-ops when both already
    // match, so we don't echo-loop on the very webhook our own update
    // triggers.
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const desiredUrl = baseUrl ? `${baseUrl.replace(/\/$/, "")}/order/${restaurant.slug}` : null;
    syncConnectAccountProfile(account.id, {
      name: restaurant.name,
      url: desiredUrl,
    }).catch((err) => {
      console.error("[stripe/account.updated] sync business_profile failed:", err instanceof Error ? err.message : err);
    });
  }
}
