import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireSuperadmin } from "@/lib/platform-auth";
import prisma from "@/lib/db";

/**
 * PATCH /api/superadmin/drivers/[id] — edit a driver (activate/deactivate, rename,
 * phone, hourly rate, home store, reset password). Superadmin only.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireSuperadmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 120);
  if (typeof body.phone === "string") data.phone = body.phone.trim().slice(0, 40) || null;
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;
  if (Number.isFinite(Number(body.hourlyRateCents))) data.hourlyRateCents = Math.max(0, Math.floor(Number(body.hourlyRateCents)));
  if ("homeRestaurantId" in body) data.homeRestaurantId = typeof body.homeRestaurantId === "string" && body.homeRestaurantId ? body.homeRestaurantId : null;
  if (typeof body.password === "string" && body.password) {
    if (body.password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    data.passwordHash = await bcrypt.hash(body.password, 10);
    // Rotating the password invalidates the active session (they must re-login).
    data.driverSessionToken = null;
  }
  // Deactivating a driver also drops their single-active-session token so their
  // app is logged out on next poll.
  if (data.isActive === false) data.driverSessionToken = null;

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  await prisma.driver.update({ where: { id }, data });
  return NextResponse.json({ ok: true });
}
