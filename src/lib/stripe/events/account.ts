import type Stripe from "stripe";
import prisma from "@/lib/db";

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
      select: { id: true },
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
  }
}
