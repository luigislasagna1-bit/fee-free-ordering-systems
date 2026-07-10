/**
 * GET/POST /api/cron/expire-addon-trials — daily sweep that ends FREE PARTNER
 * PERIODS (Luigi 2026-07-10).
 *
 * Background: the platform's test→live Stripe switch orphaned every add-on
 * subscription created in test mode — they'd have stayed "active" (and free)
 * forever, since their webhooks can no longer reach us. Those rows were
 * converted to status="trialing" with a per-restaurant trialEndsAt (the free
 * partner period; scripts/convert-partner-periods.ts). This cron flips them to
 * "cancelled" once the date passes, which drops the entitlement — the owner
 * re-enables by subscribing with a real card on the Add-ons page.
 *
 * SCOPE GUARD: only rows with stripeSubscriptionId = NULL. Stripe-billed
 * trials are managed by webhooks (and mapped to "active" anyway — see
 * src/lib/stripe/events/subscription.ts); permanent superadmin comps use
 * status="active" with no sub id, so they are untouched too.
 *
 * Auth: same pattern as other crons — Vercel cron via Authorization: Bearer
 * $CRON_SECRET, or a signed-in superadmin for manual testing.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

async function handle(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!isCron) {
    const user = await getSessionUser();
    if (user?.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const result = await prisma.restaurantAddOn.updateMany({
    where: {
      status: "trialing",
      stripeSubscriptionId: null,
      trialEndsAt: { lte: new Date() },
    },
    data: { status: "cancelled" },
  });
  if (result.count > 0) {
    console.log(`[expire-addon-trials] ended free partner period on ${result.count} add-on row(s)`);
  }
  return NextResponse.json({ ok: true, expired: result.count });
}

export async function GET(req: NextRequest) { return handle(req); }
export async function POST(req: NextRequest) { return handle(req); }
