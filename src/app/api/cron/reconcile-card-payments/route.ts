import { NextRequest, NextResponse } from "next/server";
import { reconcileCardPayments } from "@/lib/reconcile-card-payments";
import { getSessionUser } from "@/lib/session";

/**
 * POST|GET /api/cron/reconcile-card-payments
 *
 * The safety net that stops a lost browser from losing a real order.
 *
 * Under the key-only Stripe model nothing webhooks us, so a card order only
 * reached the kitchen if the customer's browser rendered the confirmation page
 * after Stripe's redirect. When that round trip failed — tab closed, 3DS
 * bounce into a banking app, in-app browser eating the `?payment_intent=`
 * param, signal lost — the order was stranded with `notifiedAt: null`: never
 * cooked, never emailed, sometimes with money still held on the card.
 *
 * This asks Stripe directly and releases (or, for already-dead orders, voids)
 * whatever the browser failed to report. Runs every minute so a rescue always
 * beats the 30-minute abandoned-payment cancel. See lib/reconcile-card-payments.ts.
 *
 * Two authorized callers, same pattern as the other crons:
 *   1. Vercel cron — Authorization: Bearer $CRON_SECRET
 *   2. Superadmin (manual trigger for testing)
 *
 * Optional query param: ?restaurantId=… to scope a manual run to one store.
 */
// Each candidate costs a Stripe round-trip, so a backlog can outlive the
// default function timeout — and a kill mid-run would drop the VOID sweep that
// releases customers' held money. 55s keeps a whole run inside the 60-second
// cron cadence; anything not reached is simply picked up by the next tick,
// since every phase re-queries from the oldest row.
export const maxDuration = 55;

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const user = await getSessionUser();
    if (user?.role !== "superadmin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const restaurantId = new URL(req.url).searchParams.get("restaurantId") ?? undefined;

  try {
    const result = await reconcileCardPayments({ restaurantId });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/reconcile-card-payments]", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "failed" },
      { status: 500 },
    );
  }
}

/** Vercel runs cron jobs as GET by default. */
export async function GET(req: NextRequest) {
  return POST(req);
}
