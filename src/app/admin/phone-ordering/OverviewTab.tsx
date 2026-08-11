import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AlertTriangle, ArrowRight, Clock, Moon, PhoneCall, ShoppingBag, TrendingUp } from "lucide-react";
import { formatCurrency as fmtCurrency } from "@/lib/utils";
import { resolveReportScope } from "@/lib/reports/report-scope";
import { parseDateRangeInTz, formatRangeLabelInTz } from "@/lib/reports/date-range-tz";
import { DateRangePicker } from "@/components/admin/reports/DateRangePicker";
import { buildQuery, type SearchParams } from "@/components/admin/reports/table-nav";
import {
  fetchVoiceAnalytics,
  fetchVoiceMonthRevenue,
  fetchPopularPhoneItems,
  conversionPct,
  CALL_OUTCOMES,
} from "@/lib/voice/analytics";
import { PollRefresh } from "@/components/admin/PollRefresh";
import { formatTzDateTime, formatDuration, OutcomeChip } from "./shared";

/**
 * Overview tab — the "You've made $X this month with Nabil AI" headline,
 * the KPI tiles, needs-attention card, four charts and the recent-activity
 * feed. Server component; charts are hand-rolled CSS/SVG-free bars (same
 * approach as /admin/reports). Default range = last 28 days.
 */
export default async function OverviewTab({
  restaurantId,
  sp,
}: {
  restaurantId: string;
  sp: SearchParams;
}) {
  const t = await getTranslations("admin.phoneOrderingPage.overview");
  const tCalls = await getTranslations("admin.phoneOrderingPage.callLog");
  const tDays = await getTranslations("admin.dateRangePicker");

  const scope = await resolveReportScope(restaurantId);
  const currency = scope.currency;
  const fmt = (n: number) => fmtCurrency(n, currency);
  // Voice analytics default to LAST 28 (Loman parity) — the picker's other
  // presets still apply the moment one is chosen.
  const spEff: SearchParams = { ...sp, preset: sp.preset ?? "last_28" };
  const range = parseDateRangeInTz(spEff, scope.timezone ?? undefined);
  const rangeLabel = formatRangeLabelInTz(range, scope.timezone ?? undefined);

  const [a, monthRevenue, popularItems] = await Promise.all([
    fetchVoiceAnalytics(restaurantId, range, scope.timezone),
    fetchVoiceMonthRevenue(restaurantId, scope.timezone),
    fetchPopularPhoneItems(restaurantId, range),
  ]);

  const outcomeLabel = (o: string | null) =>
    o && (CALL_OUTCOMES as readonly string[]).includes(o) ? tCalls(`outcome.${o}`) : tCalls("outcome.unknown");

  const errorsQuery = (() => {
    const u = new URLSearchParams(buildQuery(sp));
    u.set("tab", "calls");
    u.set("outcome", "error");
    return `?${u.toString()}`;
  })();
  const callsTabQuery = (() => {
    const u = new URLSearchParams(buildQuery(sp));
    u.set("tab", "calls");
    return `?${u.toString()}`;
  })();
  // Featured Upsells live on the Menu tab — this is the "act on it" link from
  // the popularity chart to the place the owner changes what Nabil suggests.
  const upsellsTabQuery = (() => {
    const u = new URLSearchParams(buildQuery(sp));
    u.set("tab", "menu");
    return `?${u.toString()}`;
  })();
  const maxPopular = Math.max(...popularItems.map((i) => i.quantity), 1);

  const maxPerDay = Math.max(...a.perDay.map((d) => d.count), 1);
  const maxPerHour = Math.max(...a.perHour, 1);
  const maxPerDow = Math.max(...a.perDow, 1);
  // Monday-first display order (matches the date picker's calendar).
  const dowOrder = [1, 2, 3, 4, 5, 6, 0];
  const dowLabels = [tDays("daySun"), tDays("dayMon"), tDays("dayTue"), tDays("dayWed"), tDays("dayThu"), tDays("dayFri"), tDays("daySat")];
  const outcomesSorted = Object.entries(a.outcomes).sort((x, y) => y[1] - x[1]);
  const totalOutcomes = outcomesSorted.reduce((s, [, n]) => s + n, 0);

  return (
    <div className="space-y-5">
      {/* Live panel — calls land while the owner is watching. */}
      <PollRefresh intervalMs={30_000} />

      {/* Month headline — collected money from Nabil-taken orders. */}
      <div className="rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 text-white p-6 shadow-md flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {t("monthHeadline", { amount: fmt(monthRevenue) })}
          </h2>
          <p className="mt-1 text-white/85 text-sm">{t("monthHeadlineSub")}</p>
        </div>
        <DateRangePicker defaultPreset="last_28" />
      </div>

      {/* Needs attention — error-outcome calls with a one-click drill-down. */}
      {a.needsAttention > 0 && (
        <Link
          href={errorsQuery}
          className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 hover:border-amber-400 transition"
        >
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-amber-900">
              {t("needsAttentionTitle", { count: a.needsAttention })}
            </div>
            <p className="text-sm text-amber-900/80 mt-0.5">{t("needsAttentionBody")}</p>
          </div>
          <span className="text-xs font-semibold text-amber-700 inline-flex items-center gap-1 mt-1">
            {t("needsAttentionCta")} <ArrowRight className="w-3 h-3" />
          </span>
        </Link>
      )}

      {/* KPI tiles. */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiTile icon={PhoneCall} accent="bg-blue-50 text-blue-600" label={t("kpiCalls")} value={a.calls.toLocaleString()} sub={rangeLabel} />
        <KpiTile icon={Clock} accent="bg-emerald-50 text-emerald-600" label={t("kpiStaffHours")} value={t("hoursValue", { hours: a.staffHours })} sub={rangeLabel} />
        <KpiTile icon={Moon} accent="bg-purple-50 text-purple-600" label={t("kpiAfterHours")} value={a.afterHours.toLocaleString()} sub={rangeLabel} />
        <KpiTile
          icon={ShoppingBag}
          accent="bg-amber-50 text-amber-600"
          label={t("kpiOrders")}
          value={a.ordersLinked.toLocaleString()}
          sub={t("conversionOfCalls", { pct: conversionPct(a.ordersLinked, a.calls).toString() })}
        />
        <KpiTile icon={TrendingUp} accent="bg-emerald-50 text-emerald-600" label={t("kpiUpsell")} value={fmt(a.upsellCents / 100)} sub={rangeLabel} />
      </div>

      {a.calls === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          {t("noCallsInRange")}
        </div>
      ) : (
        <>
          {/* Charts. */}
          <div className="grid lg:grid-cols-2 gap-5">
            {/* Calls per day — horizontal bars like the Reports dashboard. */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-900 mb-4">{t("chartCallsPerDay")}</h3>
              <div className="space-y-2">
                {a.perDay.map((d) => (
                  <div key={d.key}>
                    <div className="flex justify-between text-xs mb-0.5">
                      <span className="text-gray-600">
                        {new Date(`${d.key}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                      <span className="font-semibold text-gray-900">{d.count}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(d.count / maxPerDay) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Outcomes breakdown. */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-900 mb-4">{t("chartOutcomes")}</h3>
              <div className="space-y-2.5">
                {outcomesSorted.map(([o, n]) => (
                  <div key={o} className="flex items-center gap-3">
                    <div className="w-36 flex-shrink-0">
                      <OutcomeChip outcome={o} label={outcomeLabel(o)} />
                    </div>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-sky-400 rounded-full" style={{ width: `${(n / Math.max(totalOutcomes, 1)) * 100}%` }} />
                    </div>
                    <span className="text-sm font-semibold text-gray-900 w-8 text-right tabular-nums">{n}</span>
                  </div>
                ))}
              </div>

              {/* Language + sentiment mix as compact chip rows. */}
              {(Object.keys(a.languages).length > 0 || Object.keys(a.sentiments).length > 0) && (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-2 text-xs">
                  {Object.keys(a.languages).length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-gray-500 font-medium">{t("languageMix")}:</span>
                      {Object.entries(a.languages).sort((x, y) => y[1] - x[1]).map(([lang, n]) => (
                        <span key={lang} className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 font-semibold text-gray-700">
                          <span className="uppercase">{lang}</span> {n}
                        </span>
                      ))}
                    </div>
                  )}
                  {Object.keys(a.sentiments).length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-gray-500 font-medium">{t("sentimentMix")}:</span>
                      {(["positive", "neutral", "negative"] as const).map((s) =>
                        a.sentiments[s] ? (
                          <span key={s} className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 font-semibold text-gray-700">
                            {s === "positive" ? "🙂" : s === "neutral" ? "😐" : "🙁"} {a.sentiments[s]}
                          </span>
                        ) : null,
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Peak hours — 24 vertical columns. */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-900 mb-4">{t("chartPeakHours")}</h3>
              <div className="flex items-end gap-[3px] h-32">
                {a.perHour.map((n, h) => (
                  <div key={h} className="flex-1 flex flex-col items-center justify-end h-full" title={`${h}:00 — ${n}`}>
                    <div
                      className={`w-full rounded-t ${n > 0 ? "bg-amber-400" : "bg-gray-100"}`}
                      style={{ height: `${Math.max((n / maxPerHour) * 100, n > 0 ? 6 : 3)}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-1.5">
                <span>0</span><span>6</span><span>12</span><span>18</span><span>23</span>
              </div>
            </div>

            {/* What callers order most. This is the figure that tells the owner
                what to put in Featured Upsells — and unlike a POS mirror we can
                be exact, because we own the order. Units sold, not money: an
                item's share of an order's money isn't well defined once promos
                and store credit apply. */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">{t("chartPopularItems")}</h3>
                <Link href={upsellsTabQuery} className="text-xs font-semibold text-sky-600 hover:text-sky-700 inline-flex items-center gap-1">
                  {t("popularItemsCta")} <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              {popularItems.length === 0 ? (
                <p className="text-sm text-gray-400">{t("popularItemsEmpty")}</p>
              ) : (
                <div className="space-y-2">
                  {popularItems.map((it) => (
                    <div key={it.name} className="flex items-center gap-3">
                      <div className="w-36 flex-shrink-0 truncate text-sm text-gray-700" title={it.name}>
                        {it.name}
                      </div>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 rounded-full"
                          style={{ width: `${(it.quantity / maxPopular) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-gray-900 w-8 text-right tabular-nums">
                        {it.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Day of week — Monday-first columns. */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-semibold text-gray-900 mb-4">{t("chartDayOfWeek")}</h3>
              <div className="flex items-end gap-2 h-32">
                {dowOrder.map((dow) => (
                  <div key={dow} className="flex-1 flex flex-col items-center justify-end h-full">
                    <span className="text-xs font-semibold text-gray-700 mb-1 tabular-nums">{a.perDow[dow]}</span>
                    <div
                      className={`w-full rounded-t ${a.perDow[dow] > 0 ? "bg-sky-400" : "bg-gray-100"}`}
                      style={{ height: `${Math.max((a.perDow[dow] / maxPerDow) * 82, a.perDow[dow] > 0 ? 6 : 3)}%` }}
                    />
                    <span className="text-[10px] text-gray-400 mt-1">{dowLabels[dow]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent activity feed — last 8 calls, linked to their detail pages. */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900">{t("recentActivity")}</h3>
              <Link href={callsTabQuery} className="text-xs font-semibold text-amber-700 hover:text-amber-900 inline-flex items-center gap-1">
                {t("viewAll")} <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-gray-50">
              {a.recent.map((c) => (
                <Link
                  key={c.id}
                  href={`/admin/phone-ordering/calls/${c.id}`}
                  className="flex items-center gap-3 py-2.5 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition"
                >
                  <div className="w-32 flex-shrink-0 text-xs text-gray-500">
                    {formatTzDateTime(c.startedAt, scope.timezone)}
                  </div>
                  <div className="flex-1 min-w-0 text-sm text-gray-800 truncate">
                    {c.customerName || (c.fromNumber ? <span className="font-mono">{c.fromNumber}</span> : tCalls("anonymousCaller"))}
                  </div>
                  <OutcomeChip outcome={c.outcome} label={outcomeLabel(c.outcome)} />
                  <span className="w-14 text-right text-xs text-gray-500 tabular-nums flex-shrink-0">{formatDuration(c.durationSeconds)}</span>
                  <span className="w-20 text-right text-sm font-semibold text-gray-900 tabular-nums flex-shrink-0">
                    {c.total != null ? fmt(c.total) : "—"}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function KpiTile({
  icon: Icon,
  accent,
  label,
  value,
  sub,
}: {
  icon: typeof PhoneCall;
  accent: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-2xl font-bold text-gray-900 mb-0.5">{value}</div>
      {sub && <div className="text-[11px] text-gray-400">{sub}</div>}
    </div>
  );
}
