import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView } from "@/lib/session";
import { isSuperadmin } from "@/lib/roles";

/**
 * GET /api/reseller/commissions
 * Optional ?status=pending|available|paid|reversed and ?limit/?cursor for paging.
 * Superadmin may pass ?resellerProfileId=<id> to view another reseller's commissions.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 200);
  const cursor = url.searchParams.get("cursor") || undefined;
  const queriedReseller = url.searchParams.get("resellerProfileId");

  let resellerProfileId: string;
  if (isSuperadmin(user.role) && queriedReseller) {
    resellerProfileId = queriedReseller;
  } else if (isResellerView(user) && user.resellerProfileId) {
    resellerProfileId = user.resellerProfileId;
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const commissions = await prisma.commissionTransaction.findMany({
    where: { resellerProfileId, ...(status ? { status } : {}) },
    include: {
      restaurant: { select: { id: true, name: true, slug: true } },
      subscriptionInvoice: {
        select: { stripeInvoiceId: true, amountPaid: true, paidAt: true, periodStart: true, periodEnd: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = commissions.length > limit;
  const items = hasMore ? commissions.slice(0, -1) : commissions;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return NextResponse.json({ items, nextCursor });
}
