import { NextRequest, NextResponse } from "next/server";
import { requireSuperadmin } from "@/lib/platform-auth";
import prisma from "@/lib/db";

/**
 * POST /api/superadmin/maps — set the platform-wide Google Maps key
 * (PlatformSettings.googleMapsApiKey). Superadmin only. Empty string clears it
 * (restaurants then fall back to the free map / their own key).
 */
export async function POST(req: NextRequest) {
  const user = await requireSuperadmin();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { googleMapsApiKey?: unknown };
  const raw = typeof body.googleMapsApiKey === "string" ? body.googleMapsApiKey.trim() : "";

  await prisma.platformSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", googleMapsApiKey: raw || null, updatedBy: user.email ?? null },
    update: { googleMapsApiKey: raw || null, updatedBy: user.email ?? null },
  });

  return NextResponse.json({ ok: true });
}
