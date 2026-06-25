import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { toISODate } from "@/lib/reports/date-range";
import { parseDateRangeInTz } from "@/lib/reports/date-range-tz";
import { reportOrderWhere } from "@/lib/reports/order-filter";
import { resolveReportScope } from "@/lib/reports/report-scope";
import { buildExportResponse, pickFormat } from "@/lib/reports/export-response";

/**
 * GET /api/admin/reports/list/orders/export
 *
 * Flat order list export. UNBOUNDED — the page paginates at 20/row;
 * the export gives every order in range. For very high-volume
 * restaurants over a wide date range this could be tens of thousands
 * of rows — Postgres handles it in a single index-only scan via
 * (restaurantId, createdAt). We don't chunk the response yet; revisit
 * if anyone reports a memory issue.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.restaurantId) return NextResponse.json({ error: "Restaurant scope required" }, { status: 403 });

  const url = new URL(req.url);
  const sp: Record<string, string> = {};
  url.searchParams.forEach((v, k) => { sp[k] = v; });
  const format = pickFormat(url);

  const scope = await resolveReportScope(user.restaurantId);
  const range = parseDateRangeInTz(sp, scope.timezone ?? undefined);

  // Optional ?status= drill-down — allowlist real statuses ONLY (never
  // rejected/cancelled), matching the page's filter.
  const statusParam = sp.status?.trim();
  const allowedStatus = (["completed", "pending", "accepted"] as const).find((s) => s === statusParam);

  const orders = await prisma.order.findMany({
    where: { ...reportOrderWhere(scope.ids, range), ...(allowedStatus ? { status: allowedStatus } : {}) },
    select: {
      orderNumber: true,
      createdAt: true,
      customerName: true,
      customerEmail: true,
      customerPhone: true,
      type: true,
      paymentMethod: true,
      status: true,
      subtotal: true,
      taxAmount: true,
      deliveryFee: true,
      tip: true,
      couponDiscount: true,
      promoDiscount: true,
      total: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const rows: (string | number | Date)[][] = [[
    "Order #", "Date", "Customer", "Email", "Phone", "Type", "Payment", "Status",
    "Subtotal", "Tax", "Delivery fee", "Tip", "Coupon discount", "Promo discount", "Total",
  ]];
  for (const o of orders) {
    rows.push([
      o.orderNumber,
      o.createdAt,
      o.customerName,
      o.customerEmail ?? "",
      o.customerPhone ?? "",
      o.type,
      o.paymentMethod,
      o.status,
      round2(o.subtotal),
      round2(o.taxAmount),
      round2(o.deliveryFee),
      round2(o.tip),
      round2(o.couponDiscount),
      round2(o.promoDiscount),
      round2(o.total),
    ]);
  }

  return buildExportResponse({
    restaurantSlug: scope.slug,
    reportSlug: "orders",
    fromISO: toISODate(range.from),
    toISO: toISODate(range.to),
    format,
    rows: rows as (string | number)[][],
    metadata: [
      "Orders — List View",
      `Range: ${toISODate(range.from)} to ${toISODate(range.to)}`,
      `Rows: ${orders.length}`,
    ],
  });
}

function round2(v: number): number { return Math.round(v * 100) / 100; }
