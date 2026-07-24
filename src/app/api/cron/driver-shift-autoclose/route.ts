import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Auto-close forgotten driver shifts (B0 safety net). A driver who never taps
 * "End shift" would otherwise accrue unbounded hourly pay. This caps any shift
 * still open longer than MAX_SHIFT_HOURS: clockOutAt is set to clockInAt + the
 * cap (NOT `now` — never pay the forgotten hours), and autoClosedAt records that
 * it was closed by the system.
 *
 * MAX_SHIFT_HOURS is a single knob here today; it should graduate to a per-op
 * setting when the delivery ops config grows one (standing rule: business values
 * are settings, not constants). Luigi 2026-07-24.
 *
 * Auth mirrors the other crons: Vercel cron (Bearer CRON_SECRET) or a superadmin.
 */
const MAX_SHIFT_HOURS = 16;

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

  const now = new Date();
  const cutoff = new Date(now.getTime() - MAX_SHIFT_HOURS * 60 * 60 * 1000);
  const stale = await prisma.driverShift.findMany({
    where: { clockOutAt: null, clockInAt: { lt: cutoff } },
    select: { id: true, clockInAt: true },
  });

  let closed = 0;
  for (const s of stale) {
    const cappedOut = new Date(s.clockInAt.getTime() + MAX_SHIFT_HOURS * 60 * 60 * 1000);
    await prisma.driverShift.update({
      where: { id: s.id },
      data: { clockOutAt: cappedOut, autoClosedAt: now },
    });
    closed++;
  }

  return NextResponse.json({ closed, maxShiftHours: MAX_SHIFT_HOURS });
}

// Vercel Cron issues GET; keep POST for manual/curl triggers. Both share `handle`.
export const GET = handle;
export const POST = handle;
