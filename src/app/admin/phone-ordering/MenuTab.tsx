import { getTranslations } from "next-intl/server";
import { TrendingUp } from "lucide-react";
import prisma from "@/lib/db";
import { resolveMenuRestaurantId } from "@/lib/brand";
import { formatCurrency as fmtCurrency } from "@/lib/utils";
import { resolveReportScope } from "@/lib/reports/report-scope";
import { parseDateRangeInTz, formatRangeLabelInTz } from "@/lib/reports/date-range-tz";
import { DateRangePicker } from "@/components/admin/reports/DateRangePicker";
import { type SearchParams } from "@/components/admin/reports/table-nav";
import { HelpTip } from "@/components/HelpTip";
import UpsellsManager from "./UpsellsManager";

/**
 * Menu tab — the Featured Upsells manager (Loman parity, max 5 active) plus
 * the range-scoped upsell-revenue mini-stat. Server component; the manager
 * itself is a client island talking to /api/admin/phone-ordering/upsells.
 */
export default async function MenuTab({
  restaurantId,
  sp,
}: {
  restaurantId: string;
  sp: SearchParams;
}) {
  const t = await getTranslations("admin.phoneOrderingPage.upsells");
  const scope = await resolveReportScope(restaurantId);
  // A brand-menu child serves the PARENT's catalog — the picker must offer the
  // same items the upsells POST validates against (and the voice agent reads).
  const menuOwnerId = await resolveMenuRestaurantId(restaurantId);
  const spEff: SearchParams = { ...sp, preset: sp.preset ?? "last_28" };
  const range = parseDateRangeInTz(spEff, scope.timezone ?? undefined);

  const [upsells, menuItems, upsellAgg] = await Promise.all([
    prisma.voiceUpsell.findMany({
      where: { restaurantId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        menuItemId: true,
        note: true,
        active: true,
        menuItem: { select: { name: true, price: true } },
      },
    }),
    // Picker source — capped; the client filters by name as the owner types.
    prisma.menuItem.findMany({
      where: { restaurantId: menuOwnerId },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true, price: true },
    }),
    prisma.voiceCall.aggregate({
      where: { restaurantId, startedAt: { gte: range.from, lte: range.to } },
      _sum: { upsellCents: true },
    }),
  ]);

  const upsellRevenue = (upsellAgg._sum.upsellCents ?? 0) / 100;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-1.5">
            {t("title")}
            <HelpTip text={t("helpTip")} />
          </h2>
          <p className="text-sm text-gray-500 mt-0.5 max-w-2xl">{t("explainer")}</p>
        </div>
        <DateRangePicker defaultPreset="last_28" />
      </div>

      {/* Upsell revenue mini-stat for the active range. */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 inline-flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
          <TrendingUp className="w-4 h-4" />
        </div>
        <div>
          <div className="text-xs text-gray-500">
            {t("revenueStat")} · {formatRangeLabelInTz(range, scope.timezone ?? undefined)}
          </div>
          <div className="text-xl font-bold text-gray-900">{fmtCurrency(upsellRevenue, scope.currency)}</div>
        </div>
      </div>

      <UpsellsManager
        initialUpsells={upsells.map((u) => ({
          id: u.id,
          menuItemId: u.menuItemId,
          name: u.menuItem.name,
          price: u.menuItem.price,
          note: u.note,
          active: u.active,
        }))}
        menuItems={menuItems}
        currency={scope.currency}
      />
    </div>
  );
}
