/**
 * VIP recurring schedules — item API.
 *
 *   PATCH  /api/admin/vip-schedules/[id]   — toggle active / edit cadence; recompute nextRunAt
 *   DELETE /api/admin/vip-schedules/[id]   — remove the schedule
 *
 * Restaurant-scoped: the schedule must belong to the session restaurant.
 * Luigi 2026-06-27.
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { computeNextRun, type Cadence } from "@/lib/vip-schedules";

const CADENCES: Cadence[] = ["once", "daily", "weekly", "monthly"];

async function ownedSchedule(id: string, restaurantId: string) {
  const s = await prisma.vipSchedule.findUnique({ where: { id } });
  if (!s || s.restaurantId !== restaurantId) return null;
  return s;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const s = await ownedSchedule(id, restaurantId);
  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const data: any = {};
  if ("active" in body) data.active = !!body.active;
  if ("amount" in body) data.amount = Math.round((Number(body.amount) || 0) * 100) / 100;
  if ("note" in body) data.note = typeof body.note === "string" ? body.note.trim().slice(0, 200) || null : null;
  if ("cadence" in body && CADENCES.includes(body.cadence)) data.cadence = body.cadence;
  if ("dayOfWeek" in body) data.dayOfWeek = body.dayOfWeek == null ? null : Math.min(6, Math.max(0, Math.round(Number(body.dayOfWeek))));
  if ("dayOfMonth" in body) data.dayOfMonth = body.dayOfMonth == null ? null : Math.min(31, Math.max(1, Math.round(Number(body.dayOfMonth))));
  if ("sendHour" in body && /^\d{1,2}:\d{2}$/.test(String(body.sendHour))) data.sendHour = String(body.sendHour);
  if ("startDate" in body && /^\d{4}-\d{2}-\d{2}$/.test(String(body.startDate))) data.startDate = String(body.startDate);

  // Recompute nextRunAt whenever cadence/timing changed OR a paused schedule is
  // re-enabled — so it resumes at the correct future slot, never a stale one.
  const timingChanged = ["cadence", "dayOfWeek", "dayOfMonth", "sendHour", "startDate"].some((k) => k in data);
  const reEnabled = data.active === true && !s.active;
  if (timingChanged || reEnabled) {
    const rest = await prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { timezone: true } });
    const shape = {
      cadence: (data.cadence ?? s.cadence) as Cadence,
      dayOfWeek: "dayOfWeek" in data ? data.dayOfWeek : s.dayOfWeek,
      dayOfMonth: "dayOfMonth" in data ? data.dayOfMonth : s.dayOfMonth,
      sendHour: data.sendHour ?? s.sendHour,
      startDate: data.startDate ?? s.startDate,
    };
    data.nextRunAt = shape.cadence === "once" && s.runCount > 0
      ? null
      : computeNextRun(shape, new Date(Date.now() - 1000), rest?.timezone || undefined);
  }

  await prisma.vipSchedule.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  if (!restaurantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const s = await ownedSchedule(id, restaurantId);
  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.vipSchedule.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
