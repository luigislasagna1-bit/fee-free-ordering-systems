import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { parseDateRange, toISODate } from "@/lib/reports/date-range";
import { buildExportResponse, pickFormat } from "@/lib/reports/export-response";

/**
 * GET /api/admin/reports/online-ordering/promotions/export
 *
 * Per-coupon redemption breakdown for the date range. Same Order
 * groupBy as the page; we resolve coupon names in a follow-up query.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.restaurantId) return NextResponse.json({ error: "Restaurant scope required" }, { status: 403 });

  const url = new URL(req.url);
  const sp: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { sp[k] = v; });
  const range = parseDateRange(sp);
  const format = pickFormat(url);

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: user.restaurantId },
    select: { slug: true },
  });
  if (!restaurant) return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });

  const grouped = await prisma.order.groupBy({
    by: ["couponId"],
    where: {
      restaurantId: user.restaurantId,
      status: "completed",
      couponId: { not: null },
      createdAt: { gte: range.from, lte: range.to },
    },
    _count: true,
    _sum: { total: true, couponDiscount: true },
    orderBy: { _count: { couponId: "desc" } },
  });

  const couponIds = grouped.map((g) => g.couponId!).filter(Boolean);
  const coupons = couponIds.length > 0
    ? await prisma.coupon.findMany({
        where: { id: { in: couponIds } },
        select: { id: true, code: true, description: true },
      })
    : [];
  const byId = new Map(coupons.map((c) => [c.id, c]));

  const rows: (string | number)[][] = [["Coupon code", "Description", "Redemptions", "Discount given", "Revenue generated"]];
  for (const g of grouped) {
    const c = byId.get(g.couponId!);
    const revenue = g._sum.total ?? 0;
    const discount = g._sum.couponDiscount ?? 0;
    rows.push([
      c?.code ?? "—",
      c?.description ?? "",
      g._count,
      Math.round(discount * 100) / 100,
      Math.round(revenue * 100) / 100,
    ]);
  }

  return buildExportResponse({
    restaurantSlug: restaurant.slug,
    reportSlug: "promotions-stats",
    fromISO: toISODate(range.from),
    toISO: toISODate(range.to),
    format,
    rows,
    metadata: [
      "Promotions Stats",
      `Range: ${toISODate(range.from)} to ${toISODate(range.to)}`,
    ],
  });
}
