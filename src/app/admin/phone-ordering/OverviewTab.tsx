import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AlertTriangle, ArrowRight, CalendarDays, Clock, Moon, PhoneCall, ShoppingBag, TrendingUp, Users } from "lucide-react";
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
import { phoneDigitsKey } from "@/lib/phone";
import { PollRefresh } from "@/components/admin/PollRefresh";
import { fetchNabilUsage } from "@/lib/voice/nabil-usage";
import { meterSummary, monthWindowUtc, formatUsdCents, formatSecondsAsMinSec } from "@/lib/voice/nabil-billing";
import { formatTzDateTime, formatDuration, OutcomeChip } from "./shared";
import { CallerLink } from "./CallerLink";

/** Local hour → greeting key. Loman says "Good night" after 22:00; we do too. */
function greetingKey(hour: number): "greetingMorning" | "greetingAfternoon" | "greetingEvening" | "greetingNight" {
  if (hour >= 5 && hour < 12) return "greetingMorning";
  if (hour >= 12 && hour < 17) return "greetingAfternoon";
  if (hour >= 17 && hour < 22) return "greetingEvening";
  return "greetingNight";
}

function localHour(d: Date, tz: string | null): number {
  try {
    const h = new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz ?? undefined }).format(d);
    const n = parseInt(h, 10);
    return Number.isFinite(n) ? n % 24 : d.getHours();
  } catch {
    return d.getHours();
  }
}

export default async function OverviewTab({
  restaurantId,
  sp,
  greetingName,
}: {
  restaurantId: string;
  sp: SearchParams;
  /** The signed-in user's name — first token is used ("Good evening, Luigi"). */
  greetingName?: string | null;
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

  const tabQuery = (tab: string, extra?: Record<string, string>) => {
    const u = new URLSearchParams(buildQuery(sp));
    u.set("tab", tab);
    for (const [k, v] of Object.entries(extra ?? {})) u.set(k, v);
    return `?${u.toString()}`;
  };
  const errorsQuery = tabQuery("calls", { outcome: "error" });
  const callsTabQuery = tabQuery("calls");
  const upsellsTabQuery = tabQuery("menu");
  const maxPopular = Math.max(...popularItems.map((i) => i.quantity), 1);

  const maxPerDay = Math.max(...a.perDay.map((d) => d.count), 1);
  const maxPerHour = Math.max(...a.perHour, 1);
  const maxPerDow = Math.max(...a.perDow, 1);
  const dowOrder = [1, 2, 3, 4, 5, 6, 0];
  const dowLabels = [tDays("daySun"), tDays("dayMon"), tDays("dayTue"), tDays("dayWed"), tDays("dayThu"), tDays("dayFri"), tDays("daySat")];
  const outcomesSorted = Object.entries(a.outcomes).sort((x, y) => y[1] - x[1]);
  const totalOutcomes = outcomesSorted.reduce((s, [, n]) => s + n, 0);

  const usagePct = Math.min(100, Math.round((meter.seconds / meter.includedSeconds) * 100));

  // Greeting in the RESTAURANT's clock, never the server's (Vercel is UTC).
  const firstName = (greetingName ?? "").trim().split(/\s+/)[0] || "";
  const greeting = t(greetingKey(localHour(now, scope.timezone)), { name: firstName });
  const whenLabel = formatTzDateTime(now, scope.timezone, { weekday: "long", hour: "numeric", minute: "2-digit" });

  return (
    <div className="space-y-5">
      <PollRefresh intervalMs={30_000} />

      {/* Greeting + the month headline. The amount is the one number the
          owner came for, so it gets the accent colour and the big type. */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="text-lg font-semibold text-gray-900">{greeting}</div>
          <div className="mt-0.5 text-xs text-gray-400 inline-flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            {t("nowLine", { when: whenLabel })}
          </div>
          <div className="mt-3 text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight tabular-nums">
            {t.rich("monthHeadlineRich", {
              amount: fmt(monthRevenue),
              amt: (chunks) => <span className="text-amber-600">{chunks}</span>,
            })}
          </div>
          <div className="mt-1 text-xs text-gray-500">{t("monthHeadlineSub")}</div>
        </div>
        <DateRangePicker defaultPreset="last_28" />
      </div>

      {/* Billing meter */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
          <div className="text-sm font-medium text-gray-900">{t("meterTitle")}</div>
          <div className="text-xs text-gray-400">{t("meterAiNote")}</div>
        </div>

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
          {/* Charts — six cards in a 2-col grid, so nothing is orphaned. */}
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
                  <Link key={o} href={tabQuery("calls", { outcome: o })} className="flex items-center gap-3 group">
                    <div className="w-32 flex-shrink-0">
                      <OutcomeChip outcome={o} label={outcomeLabel(o)} />
                    </div>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-sky-400 group-hover:bg-sky-500 rounded-full transition" style={{ width: `${(n / Math.max(totalOutcomes, 1)) * 100}%` }} />
                    </div>
                    <span className="text-xs font-medium text-gray-700 w-6 text-right tabular-nums">{n}</span>
                  </Link>
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

            {/* Top callers — phone-keyed, drills into the caller history page.
                Loman can't build this: they don't own the order money. */}
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-400" />
                {t("chartTopCallers")}
              </h3>
              {a.topCallers.length === 0 ? (
                <p className="text-sm text-gray-400">{t("topCallersEmpty")}</p>
              ) : (
                <div className="space-y-1">
                  {a.topCallers.map((c, i) => (
                    <Link
                      key={c.digits}
                      href={`/admin/phone-ordering/callers/${c.digits}`}
                      className="flex items-center gap-3 -mx-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition"
                    >
                      <span className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                        {c.name ? c.name.charAt(0).toUpperCase() : i + 1}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className={`block truncate text-sm ${c.name ? "font-medium text-gray-900" : "font-mono text-gray-700"}`}>
                          {c.name ?? c.fromNumber}
                        </span>
                        <span className="block text-[11px] text-gray-400">
                          {t("topCallersCalls", { count: c.calls })} · {t("topCallersOrders", { count: c.orders })}
                        </span>
                      </span>
                      <span className="text-sm font-semibold text-gray-900 tabular-nums">{c.spend > 0 ? fmt(c.spend) : "—"}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-gray-300" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Recent activity — type icon, a clickable caller, and the call
              itself. Two separate links per row (anchors can't nest). */}
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">{t("recentActivity")}</h3>
              <Link href={callsTabQuery} className="text-xs font-medium text-gray-500 hover:text-gray-700 inline-flex items-center gap-1">
                {t("viewAll")} <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-gray-50">
              {a.recent.map((c) => {
                const digits = phoneDigitsKey(c.fromNumber);
                const callHref = `/admin/phone-ordering/calls/${c.id}`;
                const kind = c.outcome === "order_placed" ? "order" : c.outcome === "reservation_booked" ? "reservation" : "call";
                const KindIcon = kind === "order" ? ShoppingBag : kind === "reservation" ? CalendarDays : PhoneCall;
                const kindAccent = kind === "order" ? "bg-amber-50 text-amber-600" : kind === "reservation" ? "bg-sky-50 text-sky-600" : "bg-gray-100 text-gray-500";
                const kindLabel = kind === "order" ? t("activityOrder") : kind === "reservation" ? t("activityReservation") : t("activityCall");
                return (
                  <div key={c.id} className="flex items-center gap-3 py-2.5 px-5 hover:bg-gray-50/80 transition">
                    <Link href={callHref} title={kindLabel} className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${kindAccent}`}>
                      <KindIcon className="w-4 h-4" />
                    </Link>
                    <Link href={callHref} className="w-28 flex-shrink-0 text-xs text-gray-400 tabular-nums hover:text-gray-600">
                      {formatTzDateTime(c.startedAt, scope.timezone)}
                    </Link>
                    <div className="flex-1 min-w-0 text-sm text-gray-800 truncate">
                      {digits ? (
                        <CallerLink digits={digits} title={tCalls("callerHistoryHint")} className={c.customerName ? "" : "font-mono text-xs"} showIcon>
                          {c.customerName || c.fromNumber}
                        </CallerLink>
                      ) : c.customerName ? (
                        c.customerName
                      ) : (
                        <span className="text-gray-400">{tCalls("anonymousCaller")}</span>
                      )}
                    </div>
                    <Link href={callHref} className="flex items-center gap-3 flex-shrink-0">
                      <OutcomeChip outcome={c.outcome} label={outcomeLabel(c.outcome)} />
                      <span className="w-12 text-right text-xs text-gray-400 tabular-nums">{formatDuration(c.durationSeconds)}</span>
                      <span className="w-20 text-right text-sm font-semibold text-gray-900 tabular-nums">
                        {c.total != null ? fmt(c.total) : "—"}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-gray-300" />
                    </Link>
                  </div>
                );
              })}
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
