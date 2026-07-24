import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getDriverSession, checkDriverSessionFresh } from "@/lib/driver-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Driver shift clock (B0) — the hours source for hourly pay (B5).
 *
 *   GET  → { open: { id, clockInAt } | null }   the driver's one OPEN shift, if any
 *   POST { action: "start" } → open a shift (409 if one is already open)
 *   POST { action: "end" }   → close the open shift (atomic; 404 if none open)
 *
 * Auth: the standard driver-session + single-active-session freshness gate (a
 * superseded device gets 401 → login), same as every other /driver endpoint.
 * State is SERVER-authoritative: the app renders elapsed time from clockInAt, never
 * a client timer, so shift state survives backgrounding / remount / device switch.
 */
async function requireDriver() {
  const driver = await getDriverSession();
  if (!driver) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if ((await checkDriverSessionFresh()) === "stale") {
    return { error: NextResponse.json({ error: "session_superseded", code: "session_superseded" }, { status: 401 }) };
  }
  return { driver };
}

export async function GET() {
  const { driver, error } = await requireDriver();
  if (error) return error;
  const open = await prisma.driverShift.findFirst({
    where: { driverId: driver.driverId, clockOutAt: null },
    orderBy: { clockInAt: "desc" },
    select: { id: true, clockInAt: true },
  });
  return NextResponse.json({ open: open ? { id: open.id, clockInAt: open.clockInAt.toISOString() } : null });
}

export async function POST(req: NextRequest) {
  const { driver, error } = await requireDriver();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const action = body?.action;

  if (action === "start") {
    // One open shift at a time. Guard in the write path (Prisma can't express a
    // partial-unique index). A benign race that slips two opens through is healed
    // by clock-out's updateMany (closes all open rows) + the auto-close cron.
    const existing = await prisma.driverShift.findFirst({
      where: { driverId: driver.driverId, clockOutAt: null },
      select: { id: true, clockInAt: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: "already_on_shift", code: "already_on_shift", open: { id: existing.id, clockInAt: existing.clockInAt.toISOString() } },
        { status: 409 },
      );
    }
    const shift = await prisma.driverShift.create({
      data: { driverId: driver.driverId, source: "app" },
      select: { id: true, clockInAt: true },
    });
    return NextResponse.json({ open: { id: shift.id, clockInAt: shift.clockInAt.toISOString() } });
  }

  if (action === "end") {
    // Atomic close of every open shift for this driver — a double-tap or a stray
    // second open row can't close twice or leave one dangling.
    const closed = await prisma.driverShift.updateMany({
      where: { driverId: driver.driverId, clockOutAt: null },
      data: { clockOutAt: new Date() },
    });
    if (closed.count === 0) {
      return NextResponse.json({ error: "not_on_shift", code: "not_on_shift" }, { status: 404 });
    }
    return NextResponse.json({ open: null, closed: closed.count });
  }

  return NextResponse.json({ error: "bad_action" }, { status: 400 });
}
