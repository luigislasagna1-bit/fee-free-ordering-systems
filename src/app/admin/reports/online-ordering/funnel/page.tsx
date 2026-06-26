import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { parseDateRangeInTz, formatRangeLabelInTz } from "@/lib/reports/date-range-tz";
import { resolveReportScope } from "@/lib/reports/report-scope";
import { DateRangePicker } from "@/components/admin/reports/DateRangePicker";
import { ExportMenu } from "@/components/admin/reports/ExportMenu";
import { Info } from "lucide-react";
import { getTranslations } from "next-intl/server";

/**
 * /admin/reports/online-ordering/funnel
 *
 * Step-by-step conversion funnel: how many distinct sessions reached
 * each stage of the order flow + drop-off % between stages.
 *
 * Steps (canonical order):
 *   1. visit          — landed on the order page (fired by VisitTracker)
 *   2. menu_browsed   — engaged with the menu
 *   3. item_added     — first cart add
 *   4. checkout_open  — opened checkout drawer
 *   5. checkout_info  — filled customer details
 *   6. payment_open   — reached payment step
 *   7. order_placed   — successful POST /api/orders (terminal)
 *
 * Today only the "visit" step is wired (via VisitTracker on the order
 * page). Other steps fire as we instrument them — until that happens,
 * the funnel renders with those steps at zero, which is visually
 * informative (owners see exactly which steps aren't tracked yet).
 *
 * Implementation:
 *   - One groupBy on (step) with _count of DISTINCT sessionHash. Prisma
 *     doesn't directly support distinct-on in groupBy, so we groupBy
 *     (step, sessionHash) and count the result rows per step in JS.
 *     With sensible (restaurantId, createdAt) index hits + a typical
 *     few thousand sessions/day, this stays under 50ms.
 */
export default async function FunnelReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getTranslations("admin.reportFunnel");
  const sp = await searchParams;
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;

  if (!restaurantId) return <p className="text-sm text-gray-500">{t("noRestaurantContext")}</p>;

  const scope = await resolveReportScope(restaurantId);
  const range = parseDateRangeInTz(sp, scope.timezone ?? undefined);

  const FUNNEL_STEPS = [
    { id: "visit",         label: t("stepVisit"),        wired: true },
    { id: "menu_browsed",  label: t("stepMenuBrowsed"),  wired: true },
    { id: "item_added",    label: t("stepItemAdded"),    wired: true },
    { id: "checkout_open", label: t("stepCheckoutOpen"), wired: true },
    { id: "checkout_info", label: t("stepCheckoutInfo"), wired: true },
    { id: "payment_open",  label: t("stepPaymentOpen"),  wired: true },
    { id: "order_placed",  label: t("stepOrderPlaced"),  wired: true },
  ] as const;

  // groupBy(step, sessionHash) gives one row per (step, distinct session).
  // Count rows per step → number of distinct sessions at that step.
  const rows = await prisma.websiteFunnelEvent.groupBy({
    by: ["step", "sessionHash"],
    where: { restaurantId: { in: scope.ids }, createdAt: { gte: range.from, lte: range.to } },
  });

  const counts = new Map<string, number>();
  for (const r of rows) {
    counts.set(r.step, (counts.get(r.step) ?? 0) + 1);
  }
  // Step-1 (visit) is the funnel denominator. Anything else without
  // recorded events shows as 0 — visually broadcasting "not tracked yet".
  const stepCounts = FUNNEL_STEPS.map((s) => ({ ...s, count: counts.get(s.id) ?? 0 }));
  const visitCount = stepCounts[0].count;

  return (
    <div>
      <header className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("heading")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {t("subheading", { range: formatRangeLabelInTz(range, scope.timezone ?? undefined) })}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangePicker />
          <ExportMenu
            exportUrl="/api/admin/reports/online-ordering/funnel/export"
            currentQuery={buildQuery(sp)}
            compact={false}
          />
        </div>
      </header>

      {visitCount === 0 ? (
        <EmptyState
          emptyHeading={t("emptyHeading")}
          emptyBody={t("emptyBody")}
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          {/* Headline conversion rate — the single number owners want
              from this report. Visits to orders, end-to-end. */}
          {(() => {
            const orderPlaced = stepCounts.find((s) => s.id === "order_placed")?.count ?? 0;
            const rate = visitCount > 0 ? (orderPlaced / visitCount) * 100 : 0;
            return (
              <div className="grid grid-cols-3 gap-3 mb-5 pb-5 border-b border-gray-100">
                <SummaryStat label={t("statVisits")} value={visitCount.toLocaleString()} />
                <SummaryStat label={t("statOrdersPlaced")} value={orderPlaced.toLocaleString()} />
                <SummaryStat
                  label={t("statConversionRate")}
                  value={`${rate.toFixed(2)}%`}
                  accent={rate >= 5 ? "good" : rate >= 1 ? "ok" : "low"}
                />
              </div>
            );
          })()}

          <FunnelBars
            steps={stepCounts}
            notTrackedLabel={t("notTrackedYet")}
            ofPrevLabel={t("ofPrev")}
          />

          <div className="mt-5 pt-4 border-t border-gray-100 bg-emerald-50/40 -m-5 mt-5 p-4 rounded-b-xl">
            <div className="flex items-start gap-2 text-xs text-emerald-800">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>
                {t("infoNote")}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Re-stringify the searchParams object into a URLSearchParams-safe query
 *  string so the export honors the active filters (preset/from/to + any
 *  report-specific params like loc). Mirrors the sales/trend page. */
function buildQuery(sp: Record<string, string | string[] | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => u.append(k, x));
    else u.set(k, v);
  }
  return u.toString();
}

function EmptyState({ emptyHeading, emptyBody }: { emptyHeading: string; emptyBody: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
      <div className="text-3xl mb-2">🛒</div>
      <p className="text-sm text-gray-700 font-semibold mb-1">{emptyHeading}</p>
      <p className="text-xs text-gray-500 max-w-md mx-auto">
        {emptyBody}
      </p>
    </div>
  );
}

/** Headline summary stat at the top of the funnel report. Three of
 *  these sit in a grid above the bar chart so owners get visits +
 *  orders + conversion rate at a glance without reading the bars. */
function SummaryStat({ label, value, accent }: { label: string; value: string; accent?: "good" | "ok" | "low" }) {
  const color =
    accent === "good" ? "text-emerald-700" :
    accent === "ok"   ? "text-amber-700" :
    accent === "low"  ? "text-red-600" :
    "text-gray-900";
  return (
    <div className="text-center">
      <div className="text-xs uppercase tracking-wider font-semibold text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function FunnelBars({
  steps,
  notTrackedLabel,
  ofPrevLabel,
}: {
  steps: { id: string; label: string; count: number; wired: boolean }[];
  notTrackedLabel: string;
  ofPrevLabel: string;
}) {
  const max = Math.max(...steps.map((s) => s.count), 1);
  return (
    <div className="space-y-2">
      {steps.map((s, i) => {
        const widthPct = (s.count / max) * 100;
        // Drop-off vs the previous step. Step 0 (visit) is the
        // baseline so it has no drop-off.
        const prev = i > 0 ? steps[i - 1].count : null;
        const conversion = prev && prev > 0 ? (s.count / prev) * 100 : null;
        return (
          <div key={s.id}>
            <div className="flex justify-between text-xs mb-1">
              <span className={s.wired ? "text-gray-800" : "text-gray-400 italic"}>
                {s.label}
                {!s.wired && <span className="ml-2 text-[10px] uppercase tracking-wider text-gray-400">{notTrackedLabel}</span>}
              </span>
              <span className="font-semibold text-gray-900">
                {s.count.toLocaleString()}
                {conversion !== null && (
                  <span className="ml-2 text-[10px] font-medium text-gray-500">
                    {conversion >= 100 ? "+" : ""}{conversion.toFixed(0)}% {ofPrevLabel}
                  </span>
                )}
              </span>
            </div>
            <div className="h-6 bg-gray-100 rounded overflow-hidden">
              <div
                className={`h-full ${s.wired ? "bg-emerald-400" : "bg-gray-300"} transition-all`}
                style={{ width: `${widthPct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
