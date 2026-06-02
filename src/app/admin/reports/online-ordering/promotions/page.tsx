import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { parseDateRange, formatRangeLabel } from "@/lib/reports/date-range";
import { DateRangePicker } from "@/components/admin/reports/DateRangePicker";
import { ExportMenu } from "@/components/admin/reports/ExportMenu";

/**
 * /admin/reports/online-ordering/promotions
 *
 * Per-coupon redemption stats for the date range — count of uses,
 * revenue from orders that used the coupon, and total discount given.
 * Matches the GloriaFood Promotions Stats screenshot.
 *
 * Backed by Order.couponId (already populated). We groupBy couponId
 * on Order, then resolve Coupon names in a second small query — same
 * pattern as List View → Clients.
 */
export default async function PromotionsReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  const range = parseDateRange(sp);

  if (!restaurantId) return <p className="text-sm text-gray-500">No restaurant context.</p>;

  const rows = await prisma.order.groupBy({
    by: ["couponId"],
    where: {
      restaurantId,
      status: "completed",
      couponId: { not: null },
      createdAt: { gte: range.from, lte: range.to },
    },
    _count: true,
    _sum: { total: true, couponDiscount: true },
    orderBy: { _count: { couponId: "desc" } },
  });

  const couponIds = rows.map((r) => r.couponId!).filter(Boolean);
  const coupons = couponIds.length > 0
    ? await prisma.coupon.findMany({
        where: { id: { in: couponIds } },
        select: { id: true, code: true, description: true },
      })
    : [];
  const byId = new Map(coupons.map((c) => [c.id, c]));

  const totalRedemptions = rows.reduce((s, r) => s + r._count, 0);
  const totalDiscount = rows.reduce((s, r) => s + (r._sum.couponDiscount ?? 0), 0);
  const totalRevenue = rows.reduce((s, r) => s + (r._sum.total ?? 0), 0);

  return (
    <div>
      <header className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Promotions Stats</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {totalRedemptions.toLocaleString()} redemption(s) · {formatCurrency(totalDiscount)} discounts given · {formatRangeLabel(range)}
          </p>
        </div>
        <DateRangePicker />
      </header>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden relative">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100 bg-gray-50">
              <th className="py-2.5 px-4 font-semibold">Coupon</th>
              <th className="py-2.5 px-4 font-semibold">Description</th>
              <th className="py-2.5 px-4 font-semibold text-right">Redemptions</th>
              <th className="py-2.5 px-4 font-semibold text-right">Discount given</th>
              <th className="py-2.5 px-4 font-semibold text-right">Revenue generated</th>
              <th className="py-2.5 px-4 font-semibold text-right">% of revenue</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="py-6 px-4 text-center text-gray-400 italic">No coupon redemptions in this range.</td></tr>
            )}
            {rows.map((r) => {
              const c = byId.get(r.couponId!);
              const revenue = r._sum.total ?? 0;
              const discount = r._sum.couponDiscount ?? 0;
              const pct = totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0;
              return (
                <tr key={r.couponId} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-2.5 px-4 font-mono text-xs text-gray-800">{c?.code ?? "—"}</td>
                  <td className="py-2.5 px-4 text-gray-600 max-w-xs truncate">{c?.description ?? ""}</td>
                  <td className="py-2.5 px-4 text-right text-gray-700">{r._count.toLocaleString()}</td>
                  <td className="py-2.5 px-4 text-right text-red-600">{formatCurrency(discount)}</td>
                  <td className="py-2.5 px-4 text-right font-semibold text-gray-900">{formatCurrency(revenue)}</td>
                  <td className="py-2.5 px-4 text-right text-gray-500">{pct.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>

        <div className="absolute bottom-3 right-3">
          <ExportMenu exportUrl="/api/admin/reports/online-ordering/promotions/export" currentQuery={buildQuery(sp)} />
        </div>
      </div>

      <p className="text-xs text-gray-400 italic mt-3">
        Promotion-engine redemptions (non-coupon, like "Buy 1 Get 1") are tracked separately and will join this report once the unified promo-redemption table ships.
      </p>
    </div>
  );
}

function buildQuery(sp: Record<string, string | string[] | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => u.append(k, x));
    else u.set(k, v);
  }
  return u.toString();
}
