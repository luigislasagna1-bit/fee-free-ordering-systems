import { getTranslations } from "next-intl/server";
import { getSessionUser } from "@/lib/session";
import { formatCurrency as fmtCurrency } from "@/lib/utils";
import { resolveReportScope } from "@/lib/reports/report-scope";
import { buildPromoStatRows } from "@/lib/reports/promo-rows";
import { parseDateRangeInTz, formatRangeLabelInTz } from "@/lib/reports/date-range-tz";
import { DateRangePicker } from "@/components/admin/reports/DateRangePicker";
import { ExportMenu } from "@/components/admin/reports/ExportMenu";
import { PromotionsTable } from "./PromotionsTable";

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

      {/* Table extracted to a client component so name / redemptions /
          discount / revenue are click-sortable (shared sortable primitive). */}
      <PromotionsTable
        rows={rows}
        totalRevenue={totalRevenue}
        currency={scope.currency}
        labels={{
          coupon: t("colCoupon"),
          name: t("colDescription"),
          redemptions: t("colRedemptions"),
          discount: t("colDiscountGiven"),
          revenue: t("colRevenueGenerated"),
          pctOfRevenue: t("colPercentOfRevenue"),
          emptyState: t("emptyState"),
        }}
      />

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
