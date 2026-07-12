/**
 * ShipDay partner handoff — the "route them to Justin" flow (Justin's own
 * recommended process, email 2026-07-12): the moment a restaurant selects the
 * ShipDay delivery option, ONE email loops Justin + the merchant + our ops
 * inbox so the account gets created with the partner discount, credits, and
 * scheduled onboarding — never "put the ball completely in the restaurant's
 * court."
 *
 * Two triggers share this module so they can't drift:
 *   1. PUT /api/admin/driver-pool — the first save with deliverySource ≠ own
 *      (fires in `after()`, non-blocking).
 *   2. POST /api/admin/driver-pool/contact — the wizard's explicit
 *      "Have ShipDay contact me" button on the no-account path (awaited, so
 *      the owner gets real confirmation).
 *
 * Idempotency: `ShipdayConfig.partnerNotifiedAt` is claimed ATOMICALLY
 * (conditional updateMany) before any send — double-saves, double-clicks, and
 * the two triggers racing each other all collapse to one email. A failed send
 * un-claims so the intro isn't silently lost.
 */
import prisma from "@/lib/db";
import { sendShipdayPartnerIntro } from "@/lib/email";

/** Atomically claim the one-shot intro. True = this caller owns the send. */
export async function claimPartnerIntro(restaurantId: string): Promise<boolean> {
  const res = await prisma.shipdayConfig.updateMany({
    where: { restaurantId, partnerNotifiedAt: null },
    data: { partnerNotifiedAt: new Date() },
  });
  return res.count === 1;
}

/** Release the claim after a FAILED send so a retry can fire the intro. */
export async function unclaimPartnerIntro(restaurantId: string): Promise<void> {
  try {
    await prisma.shipdayConfig.updateMany({
      where: { restaurantId },
      data: { partnerNotifiedAt: null },
    });
  } catch (e) {
    console.error("[shipday-partner] unclaim failed", e);
  }
}

/** Load the restaurant + owner details and send the three-way intro email.
 *  Throws on send failure — callers decide whether to unclaim. */
export async function buildAndSendPartnerIntro(restaurantId: string): Promise<void> {
  const r = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      name: true, address: true, city: true, state: true, email: true, phone: true,
      users: { where: { role: "restaurant_admin" }, select: { name: true, email: true }, take: 1 },
    },
  });
  if (!r) throw new Error("restaurant not found");
  const owner = r.users[0];
  const addr = [r.address, r.city, r.state].filter(Boolean).join(", ");
  await sendShipdayPartnerIntro({
    restaurantName: r.name,
    restaurantAddress: addr || null,
    ownerName: owner?.name ?? null,
    ownerEmail: owner?.email ?? r.email ?? null,
    ownerPhone: r.phone ?? null,
  });
}
