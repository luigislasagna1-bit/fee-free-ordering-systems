import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { requireSuperadmin } from "@/lib/platform-auth";

/**
 * GET /api/superadmin/payouts
 * List all payout requests. Optional ?status= filter.
 */
export async function GET(req: NextRequest) {
  const user = await requireSuperadmin();
  if (!user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const url = new URL(req.url);
  const status = url.searchParams.get("status");

  const payouts = await prisma.payoutRequest.findMany({
    where: status ? { status } : undefined,
    include: {
      resellerProfile: {
        select: {
          id: true,
          companyName: true,
          payoutMethod: true,
          user: { select: { email: true, name: true } },
        },
      },
      _count: { select: { commissions: true } },
    },
    orderBy: { requestedAt: "desc" },
  });
  return NextResponse.json({ payouts });
}
