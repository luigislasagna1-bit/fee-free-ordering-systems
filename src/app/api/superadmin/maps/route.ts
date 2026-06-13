import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";

/**
 * POST /api/superadmin/maps — set the platform-wide Google Maps key
 * (PlatformSettings.googleMapsApiKey). Superadmin only. Empty string clears it
 * (restaurants then fall back to the free map / their own key).
 */
export async function POST(req: NextRequest) {
  const session = (await getServerSession(authOptions as any)) as any;
  if (session?.user?.role !== "superadmin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { googleMapsApiKey?: unknown };
  const raw = typeof body.googleMapsApiKey === "string" ? body.googleMapsApiKey.trim() : "";

  await prisma.platformSettings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", googleMapsApiKey: raw || null, updatedBy: session.user?.email ?? null },
    update: { googleMapsApiKey: raw || null, updatedBy: session.user?.email ?? null },
  });

  return NextResponse.json({ ok: true });
}
