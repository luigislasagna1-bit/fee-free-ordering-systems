import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { parseDateRange, previousPeriod, eachDay, formatChartDate, formatRangeLabel } from "@/lib/reports/date-range";
import { DateRangePicker } from "@/components/admin/reports/DateRangePicker";
import { ChartTableToggle } from "@/components/admin/reports/ChartTableToggle";
import { ExportMenu } from "@/components/admin/reports/ExportMenu";
import { getTranslations } from "next-intl/server";

/**
 * /admin/reports/sales/trend
 *
 * Two-line revenue/orders chart with optional "previous period" overlay
 * (the dashed line — controlled by `?compare=1`). Matches the GloriaFood
 * Sales Trend screenshot.
 *
 * View modes:
 *   ?view=chart (default) — SVG line chart with hover tooltips
 *   ?view=table — daily breakdown table
 *
 * The "View: Total revenue | Orders | Avg order" dropdown (GloriaFood-style
 * metric switcher) is on `?metric=revenue|orders|avg`. Default = revenue
 * since that's the headline business question.
 */
export default async function SalesTrendPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  const range = parseDateRange(sp);
  const view = sp.view === "table" ? "table" : "chart";
  const metric = pickMetric(sp.metric);
  const compare = sp.compare === "1";

  const t = await getTranslations("admin.reportSalesTrend");

  if (!restaurantId) return <p className="text-sm text-gray-500">{t("noRestaurantContext")}</p>;

  // Fetch the current-period daily orders. Same column-explicit select
  // pattern as Dashboard (avoids pulling new schema columns pre-push).
  const currentOrders = await prisma.order.findMany({
    where: {
      restaurantId,
      status: "completed",
      createdAt: { gte: range.from, lte: range.to },
    },
    select: { total: true, createdAt: true },
  });

  // Previous period — only fetched when comparison overlay is enabled,
  // saving a round-trip on the default view.
  const prev = previousPeriod(range);
  const previousOrders = compare
    ? await prisma.order.findMany({
        where: {
          restaurantId,
          status: "completed",
          createdAt: { gte: prev.from, lte: prev.to },
        },
        select: { total: true, createdAt: true },
      })
    : [];

  // Bucket both periods by day.
  const curBuckets = bucketByDay(currentOrders, eachDay(range));
  const prevBuckets = compare ? bucketByDay(previousOrders, eachDay(prev)) : [];

  // Align the two periods by INDEX (day 0 = first day of each period)
  // so the overlay shows like-for-like comparison (Mon-vs-Mon won't
  // always align, but day-1-vs-day-1 does).
  const rows = curBuckets.map((b, i) => ({
    cur: b,
    prev: compare ? prevBuckets[i] : undefined,
  }));

  const maxVal = Math.max(
    1,
    ...rows.map((r) => valueOf(r.cur, metric)),
    ...rows.map((r) => (r.prev ? valueOf(r.prev, metric) : 0)),
  );

  return (
    <div>
      <header className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("pageTitle")}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {labelForMetric(metric, t)} {t("overTime")} · {formatRangeLabel(range)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <MetricSwitcher current={metric} sp={sp} t={t} />
          <CompareToggle on={compare} sp={sp} t={t} />
          <ChartTableToggle />
          <DateRangePicker />
        </div>
      </header>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 relative">
        {view === "chart" ? (
          <ChartView rows={rows} max={maxVal} metric={metric} compare={compare} t={t} />
        ) : (
          <TableView rows={rows} metric={metric} compare={compare} t={t} />
        )}

        {/* Export menu lives in the bottom-right of the card so it's
            always reachable without crowding the header. */}
        <div className="absolute bottom-3 right-3">
          <ExportMenu
            exportUrl="/api/admin/reports/sales/trend/export"
            currentQuery={buildQuery(sp)}
          />
        </div>
      </div>
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────

type DayBucket = { date: Date; revenue: number; count: number; avg: number };

type Metric = "revenue" | "orders" | "avg";

function pickMetric(raw: string | string[] | undefined): Metric {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "orders" || v === "avg") return v;
  return "revenue";
}

function labelForMetric(m: Metric, t: (k: string) => string): string {
  return m === "revenue" ? t("metricRevenue") : m === "orders" ? t("metricOrders") : t("metricAvg");
}

function valueOf(b: DayBucket, m: Metric): number {
  return m === "revenue" ? b.revenue : m === "orders" ? b.count : b.avg;
}

function formatVal(v: number, m: Metric): string {
  if (m === "orders") return v.toLocaleString();
  return formatCurrency(v);
}

function bucketByDay(orders: { total: number; createdAt: Date }[], days: Date[]): DayBucket[] {
  const map = new Map<string, { revenue: number; count: number }>();
  for (const d of days) map.set(d.toDateString(), { revenue: 0, count: 0 });
  for (const o of orders) {
    const k = new Date(o.createdAt).toDateString();
    const cur = map.get(k);
    if (cur) {
      cur.revenue += o.total;
      cur.count += 1;
    }
  }
  return days.map((d) => {
    const b = map.get(d.toDateString())!;
    return { date: d, revenue: b.revenue, count: b.count, avg: b.count > 0 ? b.revenue / b.count : 0 };
  });
}

function ChartView({
  rows, max, metric, compare, t,
}: {
  rows: { cur: DayBucket; prev?: DayBucket }[];
  max: number;
  metric: Metric;
  compare: boolean;
  t: (k: string) => string;
}) {
  // Hand-drawn SVG line chart — no Recharts dependency. At our data
  // scale (≤90 points for Last 90, typically 7-28) this is plenty
  // performant + leaves us total control of styling.
  const width = 800;
  const height = 280;
  const padX = 40;
  const padY = 20;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const stepX = rows.length > 1 ? innerW / (rows.length - 1) : 0;
  const yFor = (v: number) => padY + innerH - (v / max) * innerH;
  const xFor = (i: number) => padX + i * stepX;

  const curPath = rows.map((r, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(valueOf(r.cur, metric))}`).join(" ");
  const prevPath = compare
    ? rows.map((r, i) => {
        if (!r.prev) return null;
        return `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(valueOf(r.prev, metric))}`;
      }).filter(Boolean).join(" ")
    : "";

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[600px]" role="img" aria-label={t("chartAriaLabel")}>
        {/* Grid baseline */}
        <line x1={padX} y1={padY + innerH} x2={padX + innerW} y2={padY + innerH} stroke="#e5e7eb" strokeWidth="1" />

        {/* Previous-period line (dashed, lighter) when compare on */}
        {compare && prevPath && (
          <path d={prevPath} fill="none" stroke="#a855f7" strokeWidth="2" strokeDasharray="6 4" opacity="0.6" />
        )}

        {/* Current-period line */}
        <path d={curPath} fill="none" stroke="#a855f7" strokeWidth="2.5" />

        {/* Data dots with tooltips */}
        {rows.map((r, i) => (
          <g key={i}>
            <circle cx={xFor(i)} cy={yFor(valueOf(r.cur, metric))} r="3.5" fill="#a855f7" />
            <title>
              {formatChartDate(r.cur.date)}: {formatVal(valueOf(r.cur, metric), metric)}
              {r.prev !== undefined && ` · ${t("tooltipPrev")}: ${formatVal(valueOf(r.prev, metric), metric)}`}
            </title>
          </g>
        ))}

        {/* X-axis labels — sparse to avoid crowding (every Nth point) */}
        {rows.map((r, i) => {
          const step = Math.max(1, Math.floor(rows.length / 6));
          if (i % step !== 0 && i !== rows.length - 1) return null;
          return (
            <text
              key={i}
              x={xFor(i)}
              y={padY + innerH + 14}
              fontSize="10"
              textAnchor="middle"
              fill="#6b7280"
            >
              {formatChartDate(r.cur.date)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function TableView({
  rows, metric, compare, t,
}: {
  rows: { cur: DayBucket; prev?: DayBucket }[];
  metric: Metric;
  compare: boolean;
  t: (k: string) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100">
            <th className="py-2 px-3 font-semibold">{t("colDate")}</th>
            <th className="py-2 px-3 font-semibold text-right">{labelForMetric(metric, t)}</th>
            {compare && <th className="py-2 px-3 font-semibold text-right">{t("colPreviousPeriod")}</th>}
            {compare && <th className="py-2 px-3 font-semibold text-right">Δ</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const cur = valueOf(r.cur, metric);
            const prv = r.prev ? valueOf(r.prev, metric) : 0;
            const delta = compare && r.prev ? (prv === 0 ? null : ((cur - prv) / prv) * 100) : null;
            return (
              <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="py-2 px-3 text-gray-700">{formatChartDate(r.cur.date)}</td>
                <td className="py-2 px-3 text-right font-semibold text-gray-900">{formatVal(cur, metric)}</td>
                {compare && <td className="py-2 px-3 text-right text-gray-500">{r.prev ? formatVal(prv, metric) : "—"}</td>}
                {compare && (
                  <td className={`py-2 px-3 text-right font-medium ${delta === null ? "text-gray-400" : delta >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {delta === null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MetricSwitcher({ current, sp, t }: { current: Metric; sp: Record<string, string | string[] | undefined>; t: (k: string) => string }) {
  // Server-rendered set of links — no client JS needed for a 3-choice
  // pill. Each link preserves the other query params via buildQuery().
  const mkHref = (m: Metric) => {
    const u = new URLSearchParams(buildQuery(sp));
    u.set("metric", m);
    return `?${u.toString()}`;
  };
  const opts: Metric[] = ["revenue", "orders", "avg"];
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
      {opts.map((m) => (
        <a
          key={m}
          href={mkHref(m)}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
            current === m ? "bg-emerald-50 text-emerald-700" : "text-gray-500 hover:text-gray-800"
          }`}
        >
          {labelForMetric(m, t)}
        </a>
      ))}
    </div>
  );
}

function CompareToggle({ on, sp, t }: { on: boolean; sp: Record<string, string | string[] | undefined>; t: (k: string) => string }) {
  const u = new URLSearchParams(buildQuery(sp));
  if (on) u.delete("compare"); else u.set("compare", "1");
  return (
    <a
      href={`?${u.toString()}`}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
        on
          ? "bg-purple-50 border-purple-200 text-purple-700"
          : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
      }`}
    >
      <span className={`w-2 h-2 rounded-full ${on ? "bg-purple-500" : "bg-gray-300"}`} />
      {t("showPreviousPeriod")}
    </a>
  );
}

/** Re-stringify the searchParams object into a URLSearchParams-safe
 *  query string. Used by every link that preserves the active filters. */
function buildQuery(sp: Record<string, string | string[] | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => u.append(k, x));
    else u.set(k, v);
  }
  return u.toString();
}
