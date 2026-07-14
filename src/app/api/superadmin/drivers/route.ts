import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireSuperadmin } from "@/lib/platform-auth";
import prisma from "@/lib/db";

/**
 * Superadmin FeeFreeDelivery driver-pool management.
 * GET  → list drivers (+ live/active-job counts).
 * POST → create a driver (name, email, password, optional phone/home store/rate).
 * Platform-owned identities in the Driver table (never Users).
 */

export async function GET() {
  const user = await requireSuperadmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const drivers = await prisma.driver.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, email: true, phone: true, isActive: true,
      hourlyRateCents: true, homeRestaurantId: true, ratingAvg: true, ratingCount: true,
      lastLat: true, lastLng: true, lastLocationAt: true, createdAt: true,
      homeRestaurant: { select: { name: true } },
      _count: { select: { assignments: { where: { status: { notIn: ["delivered", "failed", "returned", "cancelled"] } } } } },
    },
  });

  const restaurants = await prisma.restaurant.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: 500,
  });

  return NextResponse.json({
    drivers: drivers.map((d) => ({
      id: d.id, name: d.name, email: d.email, phone: d.phone, isActive: d.isActive,
      hourlyRateCents: d.hourlyRateCents, homeRestaurantId: d.homeRestaurantId,
      homeRestaurantName: d.homeRestaurant?.name ?? null,
      ratingAvg: d.ratingAvg, ratingCount: d.ratingCount,
      activeJobs: d._count.assignments,
      lastLocationAt: d.lastLocationAt, hasLocation: d.lastLat != null && d.lastLng != null,
      createdAt: d.createdAt,
    })),
    restaurants,
  });
}

export async function POST(req: NextRequest) {
  const user = await requireSuperadmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!name || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "Name and a valid email are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const existing = await prisma.driver.findUnique({ where: { email }, select: { id: true } });
  if (existing) return NextResponse.json({ error: "A driver with that email already exists" }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 10);
  const homeRestaurantId = typeof body?.homeRestaurantId === "string" && body.homeRestaurantId ? body.homeRestaurantId : null;
  const hourlyRateCents = Number.isFinite(Number(body?.hourlyRateCents)) ? Math.max(0, Math.floor(Number(body.hourlyRateCents))) : 0;
  const phone = typeof body?.phone === "string" ? body.phone.trim().slice(0, 40) || null : null;

  const driver = await prisma.driver.create({
    data: { name, email, phone, passwordHash, homeRestaurantId, hourlyRateCents, isActive: true },
    select: { id: true },
  });
  return NextResponse.json({ ok: true, id: driver.id });
}
