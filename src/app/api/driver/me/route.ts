import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getDriverSession, checkDriverSessionFresh } from "@/lib/driver-session";
import { ratingComponents } from "@/lib/driver-rating";

export const dynamic = "force-dynamic";

/**
 * GET /api/driver/me — the Profile tab's read (v1.1 plan §5.4). ONE
 * select-only findUnique + ratingComponents(); no caching (manual-refresh
 * surface, not a poll — the hot paths stay the 8s queue poll + 30s
 * heartbeat, untouched). ratingAvg/ratingCount ride along because they are
 * the denormalized feedback inputs ratingComponents() needs — the same
 * numbers recomputeDriverRating() keeps in sync.
 */
export async function GET() {
  const driver = await getDriverSession();
  if (!driver) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Single-active-session: a superseded device gets 401 so it redirects to login.
  if ((await checkDriverSessionFresh()) === "stale") {
    return NextResponse.json({ error: "session_superseded", code: "session_superseded" }, { status: 401 });
  }

  const rec = await prisma.driver.findUnique({
    where: { id: driver.driverId },
    select: {
      name: true,
      email: true,
      phone: true,
      homeRestaurant: { select: { name: true } },
      createdAt: true,
      hourlyRateCents: true,
      ratingPct: true,
      deliveredCount: true,
      cancelledCount: true,
      lateCount: true,
      ratingAvg: true,
      ratingCount: true,
    },
  });
  if (!rec) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const components = ratingComponents({
    deliveredCount: rec.deliveredCount,
    cancelledCount: rec.cancelledCount,
    lateCount: rec.lateCount,
    feedbackAvgStars: rec.ratingAvg,
    feedbackCount: rec.ratingCount,
  });

  return NextResponse.json({
    driver: {
      name: rec.name,
      email: rec.email,
      phone: rec.phone,
      homeStoreName: rec.homeRestaurant?.name ?? null,
      createdAt: rec.createdAt,
      hourlyRateCents: rec.hourlyRateCents,
      ratingPct: rec.ratingPct,
      deliveredCount: rec.deliveredCount,
      cancelledCount: rec.cancelledCount,
      lateCount: rec.lateCount,
      components,
    },
  });
}
