import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform-auth";

/**
 * Superadmin — branded-app project queue (Luigi 2026-08-02). Read-only list
 * over BrandedAppPlatform rows (indexed status) joined to project +
 * restaurant. English-only surface (superadmin rule). Never selects
 * credential ciphertext (separate table by design).
 */
export async function GET() {
  const staff = await requirePlatformStaff();
  if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rows = await prisma.brandedAppPlatform.findMany({
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true,
      platform: true,
      status: true,
      packageName: true,
      storeUrl: true,
      accessVerifiedAt: true,
      lastBuildAt: true,
      liveAt: true,
      updatedAt: true,
      project: {
        select: {
          id: true,
          appName: true,
          platformsRequested: true,
          approvedAt: true,
          approvedConfigVersion: true,
          restaurant: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });
  return NextResponse.json({ rows });
}
