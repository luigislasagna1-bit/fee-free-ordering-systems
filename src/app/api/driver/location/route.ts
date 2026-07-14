import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getDriverSession, checkDriverSessionFresh } from "@/lib/driver-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/driver/location
 * Body: { lat, lng, accuracy?, assignmentId? }
 *
 * Foreground GPS ping from the /driver app's watchPosition (day-1 live tracking).
 * Appends to the DriverLocation trail AND denormalizes the latest fix onto
 * Driver.lastLat/Lng/lastLocationAt so owner + customer "where's my driver"
 * reads are a single-row lookup (no scan of the trail).
 */
export async function POST(req: NextRequest) {
  const driver = await getDriverSession();
  if (!driver) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((await checkDriverSessionFresh()) === "stale") {
    return NextResponse.json({ error: "session_superseded", code: "session_superseded" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }
  const accuracy = Number.isFinite(Number(body?.accuracy)) ? Number(body.accuracy) : null;

  // Only accept an assignmentId the driver actually owns — never let a ping
  // attach to another driver's job.
  let assignmentId: string | null = null;
  if (typeof body?.assignmentId === "string" && body.assignmentId) {
    const owned = await prisma.deliveryAssignment.findFirst({
      where: { id: body.assignmentId, driverId: driver.driverId },
      select: { id: true },
    });
    assignmentId = owned?.id ?? null;
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.driverLocation.create({
      data: { driverId: driver.driverId, assignmentId, lat, lng, accuracy, recordedAt: now },
    }),
    prisma.driver.update({
      where: { id: driver.driverId },
      data: { lastLat: lat, lastLng: lng, lastLocationAt: now },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
