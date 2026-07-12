import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform-auth";

/**
 * GET /api/superadmin/resellers
 * List all reseller profiles. Optional ?status=pending|approved|suspended|rejected filter.
 * Read-only — platform_support may view.
 */
export async function GET(req: NextRequest) {
  const user = await requirePlatformStaff();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  const profiles = await prisma.resellerProfile.findMany({
    where: status ? { status } : undefined,
    include: {
      user: { select: { id: true, email: true, name: true, role: true } },
      _count: { select: { restaurants: true, commissions: true, payouts: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ profiles });
}
