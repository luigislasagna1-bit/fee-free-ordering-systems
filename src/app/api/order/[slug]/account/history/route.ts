/**
 * GET /api/order/[slug]/account/history?tab=reward|orders&page=N
 *
 * Paginated feeds for the per-restaurant customer dashboard's two long lists
 * (reward-wallet activity + order history). The page renders page 1 inline
 * (no loading flash); this route serves pages 2+ when the customer clicks
 * Next — one page per request, so a power user with thousands of rows never
 * loads an unbounded list. Luigi 2026-07-13.
 *
 * Auth: the per-restaurant customer session, scoped to THIS restaurant (the
 * helper resolves the right Customer.id even for a chain login), so one
 * customer can only ever page their OWN history at this restaurant.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getCurrentRestaurantCustomer } from "@/lib/restaurant-customer-session";

export const dynamic = "force-dynamic";

export const REWARD_PAGE_SIZE = 20;
export const ORDERS_PAGE_SIZE = 10;

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tab = req.nextUrl.searchParams.get("tab") === "orders" ? "orders" : "reward";
  const page = Math.max(1, parseInt(req.nextUrl.searchParams.get("page") || "1", 10) || 1);

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, rewardsEnabled: true },
  });
  if (!restaurant) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const me = await getCurrentRestaurantCustomer({ expectedRestaurantId: restaurant.id });
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (tab === "orders") {
    const pageSize = ORDERS_PAGE_SIZE;
    // Fetch one extra to know whether a next page exists without a count query.
    const rows = await prisma.order.findMany({
      where: { customerId: me.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize + 1,
      select: { id: true, orderNumber: true, total: true, status: true, createdAt: true, type: true },
    });
    const hasMore = rows.length > pageSize;
    return NextResponse.json({ tab, page, hasMore, rows: rows.slice(0, pageSize) });
  }

  // reward activity
  if (!restaurant.rewardsEnabled) {
    return NextResponse.json({ tab: "reward", page, hasMore: false, rows: [], orderNumbers: {} });
  }
  const pageSize = REWARD_PAGE_SIZE;
  const acct = await prisma.rewardAccount.findUnique({
    where: { restaurantId_customerId: { restaurantId: restaurant.id, customerId: me.id } },
    select: { id: true },
  });
  if (!acct) return NextResponse.json({ tab: "reward", page, hasMore: false, rows: [], orderNumbers: {} });

  const ledger = await prisma.rewardLedger.findMany({
    where: { accountId: acct.id },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * pageSize,
    take: pageSize + 1,
    select: { id: true, amount: true, reason: true, createdAt: true, orderId: true },
  });
  const hasMore = ledger.length > pageSize;
  const rows = ledger.slice(0, pageSize);

  // Resolve real order ids → order numbers so each activity row can deep-link
  // to that order's receipt (synthetic "signup:"/"sched:" ids are skipped).
  const realOrderIds = [...new Set(rows.map((l) => l.orderId).filter((o): o is string => !!o && !o.includes(":")))];
  let orderNumbers: Record<string, string> = {};
  if (realOrderIds.length) {
    const ords = await prisma.order.findMany({
      where: { id: { in: realOrderIds } },
      select: { id: true, orderNumber: true },
    });
    orderNumbers = Object.fromEntries(ords.map((o) => [o.id, o.orderNumber]));
  }
  return NextResponse.json({ tab: "reward", page, hasMore, rows, orderNumbers });
}
