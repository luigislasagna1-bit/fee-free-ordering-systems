/**
 * Reward Dollars earn rules — collection API.
 *
 *   GET  /api/admin/reward-rules        list the restaurant's earn rules
 *   POST /api/admin/reward-rules        create a rule (campaign)
 *
 * Auth: getSessionUser() → restaurantId. Date-window inputs are picked as plain
 * dates and converted to the restaurant's local day boundaries here (so rule
 * evaluation downstream can compare plain instants). Luigi 2026-06-27.
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { parseLocalDateTimeInTz } from "@/lib/restaurant-hours";

const TRIGGERS = ["signup", "first_order", "order_over", "nth_order"];

const numOrNull = (v: any, min = 0, max = 1_000_000): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
};

export async function GET() {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rules = await prisma.rewardEarnRule.findMany({
    where: { restaurantId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ rules });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const triggerType = String(body.triggerType ?? "");
  if (!TRIGGERS.includes(triggerType)) return NextResponse.json({ error: "Invalid trigger" }, { status: 400 });

  const earnAmount = numOrNull(body.earnAmount);
  const earnPercent = numOrNull(body.earnPercent, 0, 100);
  const orderThreshold = numOrNull(body.orderThreshold);
  const nthInterval = body.nthInterval ? Math.max(1, Math.min(1000, Math.round(Number(body.nthInterval)))) : null;

  // Per-trigger validation.
  if (triggerType === "signup" && !(earnAmount && earnAmount > 0))
    return NextResponse.json({ error: "Sign-up bonus needs a credit amount" }, { status: 400 });
  if (!(earnAmount && earnAmount > 0) && !(earnPercent && earnPercent > 0))
    return NextResponse.json({ error: "Set a credit amount or percentage" }, { status: 400 });
  if (triggerType === "order_over" && !(orderThreshold && orderThreshold > 0))
    return NextResponse.json({ error: "Set the order amount that qualifies" }, { status: 400 });
  if (triggerType === "nth_order" && !nthInterval)
    return NextResponse.json({ error: "Set which order number earns" }, { status: 400 });

  // Optional campaign window → restaurant-local day boundaries.
  const rest = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { timezone: true } });
  const tz = rest?.timezone || undefined;
  const startDate = typeof body.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate) ? body.startDate : null;
  const endDate = typeof body.endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.endDate) ? body.endDate : null;
  const startsAt = startDate ? parseLocalDateTimeInTz(startDate, 0, 0, tz) : null;
  const endsAt = endDate ? parseLocalDateTimeInTz(endDate, 23, 59, tz) : null;

  const created = await prisma.rewardEarnRule.create({
    data: {
      restaurantId, triggerType, earnAmount, earnPercent, orderThreshold, nthInterval,
      startsAt, endsAt,
      label: typeof body.label === "string" ? body.label.trim().slice(0, 80) || null : null,
      active: body.active === false ? false : true,
    },
  });
  return NextResponse.json({ ok: true, id: created.id });
}
