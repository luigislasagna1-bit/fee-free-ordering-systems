/**
 * POST /api/admin/driver-pool/contact
 *
 * The wizard's "Have ShipDay contact me" button (no-account path). Fires the
 * three-way partner intro — Justin + this merchant + our ops inbox — so
 * ShipDay creates the account WITH the partner discount + credits and
 * schedules onboarding, instead of the owner signing up cold on shipday.com
 * (Justin's requested handoff, 2026-07-12).
 *
 * Awaited (unlike the save-route trigger) so the owner gets a truthful
 * confirmation. Idempotent with that trigger via the shared atomic
 * partnerNotifiedAt claim — double-clicks and the two paths racing collapse
 * to one email; a failed send un-claims so retry works.
 *
 * Owner-scoped + driver_pool-gated like the sibling test route: the button
 * only renders for entitled restaurants, and a direct POST can't use the
 * platform as a spam relay.
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { hasFeature } from "@/lib/entitlements";
import { claimPartnerIntro, unclaimPartnerIntro, buildAndSendPartnerIntro } from "@/lib/shipday-partner";

export async function POST() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!(await hasFeature(restaurantId, "driver_pool"))) {
    return NextResponse.json(
      { error: "Subscribe to Driver Pool or Marketplace Monthly first.", code: "addon_required" },
      { status: 412 },
    );
  }

  // The row may not exist yet — the wizard can reach this before any save.
  await prisma.shipdayConfig.upsert({
    where: { restaurantId },
    create: { restaurantId },
    update: {},
  });

  if (!(await claimPartnerIntro(restaurantId))) {
    return NextResponse.json({ ok: true, alreadySent: true });
  }
  try {
    await buildAndSendPartnerIntro(restaurantId);
    return NextResponse.json({ ok: true, alreadySent: false });
  } catch (e) {
    console.error("[driver-pool/contact] partner intro failed", e);
    await unclaimPartnerIntro(restaurantId);
    return NextResponse.json({ error: "Could not send the intro email — try again." }, { status: 500 });
  }
}
