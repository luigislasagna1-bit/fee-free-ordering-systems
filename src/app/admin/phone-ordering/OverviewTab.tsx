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
import { fetchNabilUsage } from "@/lib/voice/nabil-usage";
import { meterSummary, monthWindowUtc, formatUsdCents, formatSecondsAsMinSec } from "@/lib/voice/nabil-billing";
import { formatTzDateTime, formatDuration, OutcomeChip } from "./shared";

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
  const spEff: SearchParams = { ...sp, preset: sp.preset ?? "last_28" };
  const range = parseDateRangeInTz(spEff, scope.timezone ?? undefined);
  const rangeLabel = formatRangeLabelInTz(range, scope.timezone ?? undefined);

  const now = new Date();
  const meterWindow = monthWindowUtc(now);
  const [a, monthRevenue, popularItems, usage] = await Promise.all([
    fetchVoiceAnalytics(restaurantId, range, scope.timezone),
    fetchVoiceMonthRevenue(restaurantId, scope.timezone),
    fetchPopularPhoneItems(restaurantId, range),
    fetchNabilUsage(restaurantId, meterWindow.start, meterWindow.end),
  ]);
  const meter = meterSummary(usage.seconds, now, meterWindow);

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
  const upsellsTabQuery = (() => {
    const u = new URLSearchParams(buildQuery(sp));
    u.set("tab", "menu");
    return `?${u.toString()}`;
  })();
  const maxPopular = Math.max(...popularItems.map((i) => i.quantity), 1);

  const maxPerDay = Math.max(...a.perDay.map((d) => d.count), 1);
  const maxPerHour = Math.max(...a.perHour, 1);
  const maxPerDow = Math.max(...a.perDow, 1);
  const dowOrder = [1, 2, 3, 4, 5, 6, 0];
  const dowLabels = [tDays("daySun"), tDays("dayMon"), tDays("dayTue"), tDays("dayWed"), tDays("dayThu"), tDays("dayFri"), tDays("daySat")];
  const outcomesSorted = Object.entries(a.outcomes).sort((x, y) => y[1] - x[1]);
  const totalOutcomes = outcomesSorted.reduce((s, [, n]) => s + n, 0);

  const usagePct = Math.min(100, Math.round((meter.seconds / meter.includedSeconds) * 100));

  return (
    <div className="space-y-5">
      <PollRefresh intervalMs={30_000} />

      {/* Top bar: revenue + date picker */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-sm text-gray-500">{t("monthHeadlineSub")}</div>
          <div className="text-3xl font-bold text-gray-900 tabular-nums">{fmt(monthRevenue)}</div>
        </div>
        <DateRangePicker defaultPreset="last_28" />
      </div>

      {/* Billing meter */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
          <div className="text-sm font-medium text-gray-900">{t("meterTitle")}</div>
          <div className="text-xs text-gray-400">{t("meterAiNote")}</div>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
          <div
            className={`h-full rounded-full transition-all ${usagePct >= 100 ? "bg-amber-500" : "bg-emerald-500"}`}
            style={{ width: `${usagePct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
          <span>{t("meterUsedOf", { used: meter.seconds.toLocaleString(), total: meter.includedSeconds.toLocaleString() })}</span>
          <span>{t("meterProgress", { pct: usagePct.toString() })}</span>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-gray-100">
          <MeterStat label={t("meterSecondsLabel")} value={meter.seconds.toLocaleString()} sub={formatSecondsAsMinSec(meter.seconds)} />
          <MeterStat label={t("meterCurrentLabel")} value={formatUsdCents(meter.chargeSoFarCents)} />
          <MeterStat label={t("meterProjectedLabel")} value={formatUsdCents(meter.projectedChargeCents)} />
          <MeterStat
            label={t("meterIncluded", {
              included: meter.includedMinutes,
              minimum: formatUsdCents(meter.monthlyMinCents),
              rate: formatUsdCents(meter.perMinuteCents),
            })}
            value=""
            small
          />
        </div>
        {meter.overageMinutes > 0 && (
          <div className="mt-3 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5">
            {t("meterOver", { minutes: meter.overageMinutes.toLocaleString() })}
          </div>
        )}
      </div>

      {/* Needs attention */}
      {a.needsAttention > 0 && (
        <Link
          href={errorsQuery}
          className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 hover:border-amber-300 transition"
        >
          <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span className="flex-1 text-sm font-medium text-amber-900">
            {t("needsAttentionTitle", { count: a.needsAttention })}
          </span>
          <span className="text-xs font-semibold text-amber-700 inline-flex items-center gap-1">
            {t("needsAttentionCta")} <ArrowRight className="w-3 h-3" />
          </span>
        </Link>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiTile icon={PhoneCall} accent="text-blue-600 bg-blue-50" label={t("kpiCalls")} value={a.calls.toLocaleString()} sub={rangeLabel} />
        <KpiTile icon={Clock} accent="text-emerald-600 bg-emerald-50" label={t("kpiStaffHours")} value={t("hoursValue", { hours: a.staffHours })} sub={rangeLabel} />
        <KpiTile icon={Moon} accent="text-purple-600 bg-purple-50" label={t("kpiAfterHours")} value={a.afterHours.toLocaleString()} sub={rangeLabel} />
        <KpiTile
          icon={ShoppingBag}
          accent="text-amber-600 bg-amber-50"
          label={t("kpiOrders")}
          value={a.ordersLinked.toLocaleString()}
          sub={t("conversionOfCalls", { pct: conversionPct(a.ordersLinked, a.calls).toString() })}
        />
        <KpiTile icon={TrendingUp} accent="text-emerald-600 bg-emerald-50" label={t("kpiUpsell")} value={fmt(a.upsellCents / 100)} sub={rangeLabel} />
      </div>

      {a.calls === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          {t("noCallsInRange")}
        </div>
      ) : (
        <>
          {/* Charts */}
          <div className="grid lg:grid-cols-2 gap-4">
            {/* Calls per day */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">{t("chartCallsPerDay")}</h3>
              <div className="space-y-1.5">
                {a.perDay.map((d) => (
                  <div key={d.key} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-16 flex-shrink-0 tabular-nums">
                      {new Date(`${d.key}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-400 rounded-full" style={{ width: `${(d.count / maxPerDay) * 100}%` }} />
                    </div>
                    <span className="text-xs font-medium text-gray-700 w-6 text-right tabular-nums">{d.count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Outcomes */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">{t("chartOutcomes")}</h3>
              <div className="space-y-2">
                {outcomesSorted.map(([o, n]) => (
                  <div key={o} className="flex items-center gap-3">
                    <div className="w-32 flex-shrink-0">
                      <OutcomeChip outcome={o} label={outcomeLabel(o)} />
                    </div>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-sky-400 rounded-full" style={{ width: `${(n / Math.max(totalOutcomes, 1)) * 100}%` }} />
                    </div>
                    <span className="text-xs font-medium text-gray-700 w-6 text-right tabular-nums">{n}</span>
                  </div>
                ))}
              </div>
              {(Object.keys(a.languages).length > 0 || Object.keys(a.sentiments).length > 0) && (
                <div className="mt-4 pt-3 border-t border-gray-100 space-y-2 text-xs">
                  {Object.keys(a.languages).length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-gray-500 font-medium">{t("languageMix")}:</span>
                      {Object.entries(a.languages).sort((x, y) => y[1] - x[1]).map(([lang, n]) => (
                        <span key={lang} className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600">
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
                          <span key={s} className="inline-flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600">
                            {s === "positive" ? "🙂" : s === "neutral" ? "😐" : "🙁"} {a.sentiments[s]}
                          </span>
                        ) : null,
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Peak hours */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">{t("chartPeakHours")}</h3>
              <div className="flex items-end gap-[3px] h-28">
                {a.perHour.map((n, h) => (
                  <div key={h} className="flex-1 flex flex-col items-center justify-end h-full" title={`${h}:00 — ${n}`}>
                    <div
                      className={`w-full rounded-t ${n > 0 ? "bg-blue-300" : "bg-gray-100"}`}
                      style={{ height: `${Math.max((n / maxPerHour) * 100, n > 0 ? 6 : 3)}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-gray-400 mt-1.5">
                <span>0</span><span>6</span><span>12</span><span>18</span><span>23</span>
              </div>
            </div>

            {/* Popular items */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-900">{t("chartPopularItems")}</h3>
                <Link href={upsellsTabQuery} className="text-xs font-medium text-blue-600 hover:text-blue-700 inline-flex items-center gap-1">
                  {t("popularItemsCta")} <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              {popularItems.length === 0 ? (
                <p className="text-sm text-gray-400">{t("popularItemsEmpty")}</p>
              ) : (
                <div className="space-y-1.5">
                  {popularItems.map((it) => (
                    <div key={it.name} className="flex items-center gap-3">
                      <div className="w-32 flex-shrink-0 truncate text-xs text-gray-700" title={it.name}>
                        {it.name}
                      </div>
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${(it.quantity / maxPopular) * 100}%` }} />
                      </div>
                      <span className="text-xs font-medium text-gray-700 w-6 text-right tabular-nums">{it.quantity}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Day of week */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">{t("chartDayOfWeek")}</h3>
              <div className="flex items-end gap-2 h-28">
                {dowOrder.map((dow) => (
                  <div key={dow} className="flex-1 flex flex-col items-center justify-end h-full">
                    <span className="text-xs font-medium text-gray-700 mb-1 tabular-nums">{a.perDow[dow]}</span>
                    <div
                      className={`w-full rounded-t ${a.perDow[dow] > 0 ? "bg-sky-300" : "bg-gray-100"}`}
                      style={{ height: `${Math.max((a.perDow[dow] / maxPerDow) * 82, a.perDow[dow] > 0 ? 6 : 3)}%` }}
                    />
                    <span className="text-[10px] text-gray-400 mt-1">{dowLabels[dow]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent activity */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">{t("recentActivity")}</h3>
              <Link href={callsTabQuery} className="text-xs font-medium text-gray-500 hover:text-gray-700 inline-flex items-center gap-1">
                {t("viewAll")} <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-gray-50">
              {a.recent.map((c) => (
                <Link
                  key={c.id}
                  href={`/admin/phone-ordering/calls/${c.id}`}
                  className="flex items-center gap-3 py-2.5 px-5 hover:bg-gray-50/80 transition"
                >
                  <div className="w-28 flex-shrink-0 text-xs text-gray-400 tabular-nums">
                    {formatTzDateTime(c.startedAt, scope.timezone)}
                  </div>
                  <div className="flex-1 min-w-0 text-sm text-gray-800 truncate">
                    {c.customerName || (c.fromNumber ? <span className="font-mono text-xs">{c.fromNumber}</span> : tCalls("anonymousCaller"))}
                  </div>
                  <OutcomeChip outcome={c.outcome} label={outcomeLabel(c.outcome)} />
                  <span className="w-12 text-right text-xs text-gray-400 tabular-nums flex-shrink-0">{formatDuration(c.durationSeconds)}</span>
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
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${accent}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <div className="text-xl font-bold text-gray-900 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function MeterStat({
  label,
  value,
  sub,
  small = false,
}: {
  label: string;
  value: string;
  sub?: string;
  small?: boolean;
}) {
  if (small) {
    return (
      <div className="col-span-2 sm:col-span-1">
        <div className="text-[11px] text-gray-500 leading-snug">{label}</div>
      </div>
    );
  }
  return (
    <div>
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="text-lg font-bold text-gray-900 tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-gray-400">{sub}</div>}
    </div>
  );
}
