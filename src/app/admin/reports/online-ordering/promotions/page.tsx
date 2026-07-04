import { getTranslations } from "next-intl/server";
import { getSessionUser } from "@/lib/session";
import { formatCurrency as fmtCurrency } from "@/lib/utils";
import { resolveReportScope } from "@/lib/reports/report-scope";
import { buildPromoStatRows } from "@/lib/reports/promo-rows";
import { parseDateRangeInTz, formatRangeLabelInTz } from "@/lib/reports/date-range-tz";
import { DateRangePicker } from "@/components/admin/reports/DateRangePicker";
import { ExportMenu } from "@/components/admin/reports/ExportMenu";

/**
 * /admin/reports/online-ordering/promotions
 *
 * Per-PROMOTION redemption stats for the date range — count of uses,
 * revenue from orders the promo applied to, and total discount given.
 * Matches the GloriaFood Promotions Stats screenshot.
 *
 * Backed by each order's appliedPromos snapshot via buildPromoStatRows
 * (shared with the export route). The old Order.couponId groupBy showed
 * ONLY legacy coupon redemptions and missed every modern promotion.
 */
export default async function PromotionsReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("admin.reportPromotions");
  const sp = await searchParams;
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

  if (!restaurantId) return <p className="text-sm text-gray-500">{t("noRestaurantContext")}</p>;
  const scope = await resolveReportScope(restaurantId);
  const range = parseDateRangeInTz(sp, scope.timezone ?? undefined);
  const formatCurrency = (n: number) => fmtCurrency(n, scope.currency);

  const { rows, totalRedemptions, totalDiscount, totalRevenue } =
    await buildPromoStatRows(scope.ids, range);

  return (
    <div>
      <header className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t("subtitle", { redemptions: totalRedemptions.toLocaleString(), discounts: formatCurrency(totalDiscount), range: formatRangeLabelInTz(range, scope.timezone ?? undefined) })}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangePicker />
          <ExportMenu exportUrl="/api/admin/reports/online-ordering/promotions/export" currentQuery={buildQuery(sp)} compact={false} />
        </div>
      </header>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100 bg-gray-50">
              <th className="py-2.5 px-4 font-semibold">{t("colCoupon")}</th>
              <th className="py-2.5 px-4 font-semibold">{t("colDescription")}</th>
              <th className="py-2.5 px-4 font-semibold text-right">{t("colRedemptions")}</th>
              <th className="py-2.5 px-4 font-semibold text-right">{t("colDiscountGiven")}</th>
              <th className="py-2.5 px-4 font-semibold text-right">{t("colRevenueGenerated")}</th>
              <th className="py-2.5 px-4 font-semibold text-right">{t("colPercentOfRevenue")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="py-6 px-4 text-center text-gray-400 italic">{t("emptyState")}</td></tr>
            )}
            {rows.map((r) => {
              const pct = totalRevenue > 0 ? (r.revenue / totalRevenue) * 100 : 0;
              return (
                <tr key={`${r.name}|${r.code}`} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-2.5 px-4 font-mono text-xs text-gray-800">{r.code || "—"}</td>
                  <td className="py-2.5 px-4 text-gray-600 max-w-xs truncate">{r.name}</td>
                  <td className="py-2.5 px-4 text-right text-gray-700">{r.redemptions.toLocaleString()}</td>
                  <td className="py-2.5 px-4 text-right text-red-600">{formatCurrency(r.discount)}</td>
                  <td className="py-2.5 px-4 text-right font-semibold text-gray-900">{formatCurrency(r.revenue)}</td>
                  <td className="py-2.5 px-4 text-right text-gray-500">{pct.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      <p className="text-xs text-gray-400 italic mt-3">
        {t("footerNote")}
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
