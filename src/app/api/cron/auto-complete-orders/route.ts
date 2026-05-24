/**
 * Auto-complete cron for kitchen Simple mode.
 *
 * Restaurants on Simple mode (kitchenWorkflowMode === "simple", the
 * GloriaFood-style default) never explicitly mark orders as complete —
 * the kitchen just accepts orders and gets on with the cooking. Without
 * this cron, accepted orders would sit in "In Progress" forever.
 *
 * What it does:
 *   1. Find all restaurants with kitchenWorkflowMode === "simple"
 *   2. For each, find orders in "accepted" status that are PAST due:
 *        - Has scheduledFor: 2+ hours past scheduledFor
 *        - No scheduledFor: 4+ hours past createdAt
 *   3. Move them to "completed" with completedAt = now
 *
 * We intentionally do NOT fire customer notifications here — the
 * customer was already told at order-accept time when the kitchen
 * accepted ("Your order will be ready by …"). Spamming a redundant
 * "Order complete" email 4 hours later for an order they probably
 * already picked up is annoying.
 *
 * Idempotent. Re-running with no past-due orders is a no-op.
 *
 * Scheduled: hourly at :15 (vercel.json crons).
 *
 * Auth: same pattern as other crons —
 *   1. Vercel cron via Authorization: Bearer $CRON_SECRET
 *   2. Superadmin manual trigger for testing
 */
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";

const SCHEDULED_BUFFER_MS = 2 * 60 * 60 * 1000; // 2 hours
const UNSCHEDULED_BUFFER_MS = 4 * 60 * 60 * 1000; // 4 hours

async function autoComplete() {
  const now = new Date();

  // Find restaurants currently in simple mode. We don't push the
  // join-condition down into the order query because the Prisma type
  // for nested where filters on relation scalars is verbose; this
  // two-step query is just as fast and clearer to read.
  const simpleRestaurants = await prisma.restaurant.findMany({
    where: { kitchenWorkflowMode: "simple" },
    select: { id: true },
  });
  if (simpleRestaurants.length === 0) {
    return { ok: true, completed: 0, restaurantsChecked: 0 };
  }

  const restaurantIds = simpleRestaurants.map((r) => r.id);

  // Fetch all candidate "accepted" orders for those restaurants. Filter
  // in-memory because the past-due condition depends on TWO different
  // fields (scheduledFor vs createdAt) with different buffers — clearer
  // to express in JS than in a SQL OR.
  const candidates = await prisma.order.findMany({
    where: {
      restaurantId: { in: restaurantIds },
      status: "accepted",
    },
    select: { id: true, scheduledFor: true, createdAt: true },
  });

  const dueIds: string[] = [];
  for (const o of candidates) {
    if (o.scheduledFor) {
      if (now.getTime() - o.scheduledFor.getTime() >= SCHEDULED_BUFFER_MS) {
        dueIds.push(o.id);
      }
    } else if (o.createdAt) {
      if (now.getTime() - o.createdAt.getTime() >= UNSCHEDULED_BUFFER_MS) {
        dueIds.push(o.id);
      }
    }
  }

  if (dueIds.length === 0) {
    return { ok: true, completed: 0, restaurantsChecked: simpleRestaurants.length };
  }

  await prisma.order.updateMany({
    where: { id: { in: dueIds } },
    data: { status: "completed", completedAt: now },
  });

  return {
    ok: true,
    completed: dueIds.length,
    restaurantsChecked: simpleRestaurants.length,
  };
}

async function handle(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCron) {
    const user = await getSessionUser();
    if (user?.role !== "superadmin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await autoComplete();
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[cron/auto-complete-orders]", err);
    return NextResponse.json({ ok: false, error: err.message ?? "failed" }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;
