"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DollarSign, Loader2, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/utils";
import { HelpTip } from "@/components/HelpTip";

/**
 * Driver Earnings tab (v1.1 plan §3.4): Today / This week / Last week pill
 * switcher over ONE aggregate read (/api/driver/earnings), stat tiles
 * (Deliveries · Tips · Active time) and a per-day breakdown on the week
 * views.
 *
 * Same activation contract as History/Profile (5a0d9860 gate rule): the
 * shell keeps this mounted forever and CSS-hides it, so we refetch EVERY
 * time the tab becomes active (and on every pill switch). One indexed
 * aggregate per tap — NO polling; the 8s queue poll and 30s heartbeat in
 * DriverQueue stay the app's only intervals.
 *
 * Money (plan §3.4, non-negotiable): tips are STACKED PER CURRENCY — one
 * line per currency via formatCurrency(amount, currency), NEVER summed
 * across currencies (multi-store drivers can span currencies; the Fabrizio
 * euro/$ bug class). Nothing here reads or multiplies hourlyRateCents — no
 * fake payroll; "Active time" is honestly accepted→delivered time (HelpTip
 * says so) because no DriverShift clock model exists (plan §9).
 *
 * Periods are DEVICE-LOCAL day boundaries. Weeks run SATURDAY→FRIDAY — the
 * FeeFreeDelivery billing/payout week (Luigi 2026-07-24) — on the device's clock
 * (all drivers are Milton/America-Toronto, so device-local ≈ the Toronto payout
 * week). The tz offset sent is the raw `new Date().getTimezoneOffset()` (JS
 * convention: UTC − local, positive WEST of UTC — Toronto EDT +240, Tokyo
 * −540); the server consumes the raw value, so nothing is negated on either
 * end. It is the device's CURRENT offset applied to the whole range — across
 * a DST switch inside a week, near-midnight deliveries can bucket into the
 * neighbouring day (documented server-side, accepted).
 */

type EarningsRow = {
  /** Local day "YYYY-MM-DD". */
  day: string;
  currency: string;
  deliveries: number;
  /** Tips in `currency` dollars for this (day, currency) group. */
  tips: number;
  /** accepted→delivered seconds for this group. */
  activeSeconds: number;
  late: number;
};

type Period = "today" | "thisWeek" | "lastWeek";

const PERIODS: Period[] = ["today", "thisWeek", "lastWeek"];

/** Local calendar date → "YYYY-MM-DD" (device-local getters by design). */
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Inclusive local-date range for a pill. Saturday-start weeks (Sat→Fri, the
 * FeeFreeDelivery billing/payout week, on the device's clock). "This week" ends
 * at today — no empty future days in the breakdown. Date component arithmetic
 * (new Date(y, m, d±n)) normalizes across month/DST boundaries safely.
 */
function rangeFor(period: Period): { from: string; to: string } {
  const now = new Date();
  if (period === "today") {
    const s = localDateStr(now);
    return { from: s, to: s };
  }
  const dowFromSaturday = (now.getDay() + 1) % 7; // Sat=0, Sun=1 … Fri=6
  const saturday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dowFromSaturday);
  if (period === "thisWeek") {
    return { from: localDateStr(saturday), to: localDateStr(now) };
  }
  const lastSaturday = new Date(saturday.getFullYear(), saturday.getMonth(), saturday.getDate() - 7);
  const lastFriday = new Date(saturday.getFullYear(), saturday.getMonth(), saturday.getDate() - 1);
  return { from: localDateStr(lastSaturday), to: localDateStr(lastFriday) };
}

/** "YYYY-MM-DD" → localized weekday label, parsed as LOCAL components (a
 *  bare `new Date("YYYY-MM-DD")` would parse UTC and shift a day west of
 *  Greenwich). */
function dayLabel(day: string, locale: string): string {
  const [y = 1970, m = 1, d = 1] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" });
}

export function DriverEarnings({ active = true }: { active?: boolean }) {
  const t = useTranslations("driver");
  const tShared = useTranslations("feefreeShared");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [period, setPeriod] = useState<Period>("today");
  const [rows, setRows] = useState<EarningsRow[]>([]);
  // Clocked hours + hourly pay for the period (B0/B3). Paid by Fee Free, in the
  // platform operating currency (Milton = CAD), distinct from per-currency tips.
  const [workedSeconds, setWorkedSeconds] = useState(0);
  const [payCents, setPayCents] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  // Bumps on every load so a slow response for an old period/refresh can't
  // overwrite the newer one (same guard as DriverHistory).
  const seqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++seqRef.current;
    setLoading(true);
    setFailed(false);
    try {
      const { from, to } = rangeFor(period);
      // Raw JS sign convention, sent as-is (see header comment).
      const tz = new Date().getTimezoneOffset();
      const res = await fetch(`/api/driver/earnings?from=${from}&to=${to}&tz=${tz}`, { cache: "no-store" });
      if (res.status === 401) {
        // Same superseded-session rule as every other driver surface.
        window.location.assign("/driver/login");
        return;
      }
      if (!res.ok) {
        if (seq === seqRef.current) setFailed(true);
        return;
      }
      const data = await res.json();
      if (seq !== seqRef.current) return;
      if (Array.isArray(data?.rows)) {
        setRows(data.rows as EarningsRow[]);
        setWorkedSeconds(typeof data.workedSeconds === "number" ? data.workedSeconds : 0);
        setPayCents(typeof data.payCents === "number" ? data.payCents : 0);
      } else setFailed(true);
    } catch {
      if (seq === seqRef.current) setFailed(true);
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [period]);

  // Refetch EVERY time the tab becomes active (shell keeps it mounted +
  // CSS-hidden — mount-only fetches go stale, the 2026-07-17 gate finding)
  // and on every pill switch (load's identity changes with `period`).
  useEffect(() => {
    if (active) load();
  }, [active, load]);

  // ── Derived aggregates (rows are tiny: ≤ days × currencies) ──
  const totalDeliveries = rows.reduce((n, r) => n + r.deliveries, 0);
  const totalActiveSeconds = rows.reduce((n, r) => n + r.activeSeconds, 0);
  // Per-currency tip totals — kept SEPARATE per currency, never summed across.
  const tipsByCurrency = new Map<string, number>();
  for (const r of rows) tipsByCurrency.set(r.currency, (tipsByCurrency.get(r.currency) ?? 0) + r.tips);
  const tipLines = [...tipsByCurrency.entries()].sort(([a], [b]) => a.localeCompare(b));

  // Active time in the shared h/m convention (same rule as StageTimeline).
  const activeMinutes = Math.round(totalActiveSeconds / 60);
  const activeLabel =
    activeMinutes < 60
      ? tShared("minutesOnly", { m: activeMinutes })
      : tShared("hoursMinutes", { h: Math.floor(activeMinutes / 60), m: activeMinutes % 60 });

  // Clocked hours (shift time) — the hourly-pay basis, and the pay itself.
  const workedMinutes = Math.round(workedSeconds / 60);
  const workedLabel =
    workedMinutes < 60
      ? tShared("minutesOnly", { m: workedMinutes })
      : tShared("hoursMinutes", { h: Math.floor(workedMinutes / 60), m: workedMinutes % 60 });
  // Hourly pay is in the platform operating currency (Milton = CAD) — separate
  // from per-currency tips (never blended).
  const payLabel = formatCurrency(payCents / 100, "cad");

  // Daily breakdown for the week views — newest day first (the app's list
  // convention), tips per currency inside each day.
  const isWeekView = period !== "today";
  const byDay = new Map<string, { deliveries: number; tips: Map<string, number> }>();
  for (const r of rows) {
    const g = byDay.get(r.day) ?? { deliveries: 0, tips: new Map<string, number>() };
    g.deliveries += r.deliveries;
    g.tips.set(r.currency, (g.tips.get(r.currency) ?? 0) + r.tips);
    byDay.set(r.day, g);
  }
  const dayGroups = [...byDay.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, g]) => ({
      day,
      deliveries: g.deliveries,
      tips: [...g.tips.entries()].sort(([a], [b]) => a.localeCompare(b)),
    }));

  return (
    <main className="px-4 py-4 pb-24 max-w-lg mx-auto space-y-3">
      {/* Period pills + manual refresh (no polling on this tab) */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              onClick={() => {
                if (p === period) return;
                // Clear immediately so the previous period's numbers never
                // sit under the newly-selected pill while the fetch runs.
                setPeriod(p);
                setRows([]);
                setWorkedSeconds(0);
                setPayCents(0);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                period === p
                  ? "bg-emerald-600 text-white"
                  : "bg-gray-800 border border-gray-700 text-gray-300 hover:border-gray-600"
              }`}
            >
              {p === "today" ? tCommon("today") : p === "thisWeek" ? t("earnThisWeek") : t("earnLastWeek")}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => load()}
          disabled={loading}
          className="text-gray-400 hover:text-white disabled:opacity-50"
          title={t("refresh")}
          aria-label={t("refresh")}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading && rows.length === 0 && !failed ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        </div>
      ) : failed && rows.length === 0 ? (
        <div className="py-10 text-center space-y-4">
          <p className="text-sm text-gray-400">{t("earningsLoadFailed")}</p>
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold px-4 py-2.5 rounded-xl"
          >
            <RefreshCw className="w-4 h-4" /> {t("refresh")}
          </button>
        </div>
      ) : (
        <>
          {/* Stat tiles: Deliveries · Hours · Pay · Active time · Tips */}
          <section className="grid grid-cols-2 gap-2">
            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4">
              <div className="text-2xl font-bold text-white">{totalDeliveries}</div>
              <div className="text-[11px] text-gray-500 mt-0.5">{t("earnDeliveries")}</div>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4">
              <div className="text-2xl font-bold text-white">{workedLabel}</div>
              <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1">
                {t("earnHours")}
                {/* Clocked shift hours — the hourly-pay basis (paid by Fee Free). */}
                <HelpTip text={t("earnHoursHelp")} tone="dark" />
              </div>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4">
              <div className="text-2xl font-bold text-emerald-400">{payLabel}</div>
              <div className="text-[11px] text-gray-500 mt-0.5">{t("earnPay")}</div>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-2xl p-4">
              <div className="text-2xl font-bold text-white">{activeLabel}</div>
              <div className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1">
                {t("earnActiveTime")}
                {/* Honest-labeling tooltip — this is job time, not shift hours. */}
                <HelpTip text={t("earnActiveTimeHelp")} tone="dark" />
              </div>
            </div>
            <div className="col-span-2 bg-gray-800 border border-gray-700 rounded-2xl p-4">
              {/* One line PER CURRENCY — never a cross-currency sum. */}
              {tipLines.length === 0 ? (
                <div className="text-2xl font-bold text-gray-500">—</div>
              ) : (
                <div className="space-y-0.5">
                  {tipLines.map(([currency, amount]) => (
                    <div key={currency} className="text-2xl font-bold text-amber-400">
                      {formatCurrency(amount, currency)}
                    </div>
                  ))}
                </div>
              )}
              <div className="text-[11px] text-gray-500 mt-0.5">{t("earnTips")}</div>
              {/* Conservative footnote: tips = what customers added at
                  checkout; payout handling is unmodeled and unpromised. */}
              <p className="text-[11px] text-gray-500 mt-2">{t("earnTipsFootnote")}</p>
            </div>
          </section>

          {rows.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <DollarSign className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">{t("earningsEmpty")}</p>
            </div>
          )}

          {/* Daily breakdown — week views only */}
          {isWeekView && dayGroups.length > 0 && (
            <section className="space-y-2">
              {dayGroups.map((g) => (
                <div
                  key={g.day}
                  className="bg-gray-800 border border-gray-700 rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-200">{dayLabel(g.day, locale)}</div>
                    <div className="text-[11px] text-gray-500">{t("earnDeliveriesCount", { n: g.deliveries })}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {g.tips.map(([currency, amount]) => (
                      <div key={currency} className="text-sm font-semibold text-amber-400">
                        {formatCurrency(amount, currency)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </main>
  );
}
