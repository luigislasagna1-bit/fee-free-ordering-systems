/**
 * VIP recurring schedules — collection API.
 *
 *   GET  /api/admin/vip-schedules?groupId=… | ?customerId=… | ?email=…
 *        List schedules for a target (restaurant-scoped).
 *   POST /api/admin/vip-schedules
 *        Create a schedule (credit_grant or discount_resend) + compute the first
 *        nextRunAt in the restaurant's timezone.
 *
 * Auth: getSessionUser() → restaurantId. Every referenced group / promotion /
 * customer is re-validated to belong to the session restaurant. Luigi 2026-06-27.
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { computeNextRun, type Cadence } from "@/lib/vip-schedules";

const CADENCES: Cadence[] = ["once", "daily", "weekly", "monthly"];
const KINDS = ["credit_grant", "discount_resend"];

export async function GET(req: Request) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const groupId = url.searchParams.get("groupId");
  const customerId = url.searchParams.get("customerId");
  const email = url.searchParams.get("email");

  const where: any = { restaurantId };
  if (groupId) where.groupId = groupId;
  else if (customerId) where.customerId = customerId;
  else if (email) where.email = email.toLowerCase();

  const schedules = await prisma.vipSchedule.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true, kind: true, promotionId: true, amount: true, note: true,
      groupId: true, customerId: true, email: true, cadence: true, dayOfWeek: true,
      dayOfMonth: true, sendHour: true, startDate: true, active: true,
      nextRunAt: true, lastRunAt: true, runCount: true,
      promotion: { select: { name: true } },
    },
  });
  return NextResponse.json({ schedules });
}

export async function POST(req: Request) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const kind = String(body.kind ?? "");
  if (!KINDS.includes(kind)) return NextResponse.json({ error: "Invalid kind" }, { status: 400 });

  const cadence = String(body.cadence ?? "") as Cadence;
  if (!CADENCES.includes(cadence)) return NextResponse.json({ error: "Invalid cadence" }, { status: 400 });

  const startDate = String(body.startDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return NextResponse.json({ error: "Invalid start date" }, { status: 400 });
  const sendHour = /^\d{1,2}:\d{2}$/.test(String(body.sendHour ?? "")) ? String(body.sendHour) : "09:00";

  // Target — exactly one of group / customer / email.
  const groupId = body.groupId ? String(body.groupId) : null;
  const customerId = body.customerId ? String(body.customerId) : null;
  const email = body.email ? String(body.email).trim().toLowerCase() : null;
  const targets = [groupId, customerId, email].filter(Boolean);
  if (targets.length !== 1) return NextResponse.json({ error: "Pick exactly one target" }, { status: 400 });

  // Ownership checks.
  if (groupId) {
    const g = await prisma.customerGroup.findUnique({ where: { id: groupId }, select: { restaurantId: true } });
    if (!g || g.restaurantId !== restaurantId) return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }
  if (customerId) {
    const c = await prisma.customer.findUnique({ where: { id: customerId }, select: { restaurantId: true } });
    if (!c || c.restaurantId !== restaurantId) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  // Kind-specific payload.
  let promotionId: string | null = null;
  let amount: number | null = null;
  let note: string | null = null;
  if (kind === "discount_resend") {
    promotionId = body.promotionId ? String(body.promotionId) : null;
    if (!promotionId) return NextResponse.json({ error: "Pick a promotion" }, { status: 400 });
    const p = await prisma.promotion.findUnique({ where: { id: promotionId }, select: { restaurantId: true } });
    if (!p || p.restaurantId !== restaurantId) return NextResponse.json({ error: "Promotion not found" }, { status: 404 });
  } else {
    amount = Math.round((Number(body.amount) || 0) * 100) / 100;
    if (!(amount > 0)) return NextResponse.json({ error: "Enter a credit amount" }, { status: 400 });
    if (amount > 1_000_000) return NextResponse.json({ error: "Amount too large" }, { status: 400 });
    note = typeof body.note === "string" ? body.note.trim().slice(0, 200) || null : null;
  }

  const dayOfWeek = cadence === "weekly" ? Math.min(6, Math.max(0, Math.round(Number(body.dayOfWeek) || 0))) : null;
  const dayOfMonth = cadence === "monthly" ? Math.min(31, Math.max(1, Math.round(Number(body.dayOfMonth) || 1))) : null;

  const rest = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { timezone: true } });
  const tz = rest?.timezone || undefined;

  const shape = { cadence, dayOfWeek, dayOfMonth, sendHour, startDate };
  // Inclusive of "now" so a slot scheduled for right now still fires on the next tick.
  const nextRunAt = computeNextRun(shape, new Date(Date.now() - 1000), tz);

  const created = await prisma.vipSchedule.create({
    data: {
      restaurantId, kind, promotionId, amount, note,
      groupId, customerId, email,
      cadence, dayOfWeek, dayOfMonth, sendHour, startDate,
      active: true, nextRunAt,
    },
    select: { id: true, nextRunAt: true },
  });
  return NextResponse.json({ ok: true, id: created.id, nextRunAt: created.nextRunAt });
}
