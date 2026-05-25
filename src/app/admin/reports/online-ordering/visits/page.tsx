import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { parseDateRange, eachDay, formatChartDate, formatRangeLabel } from "@/lib/reports/date-range";
import { DateRangePicker } from "@/components/admin/reports/DateRangePicker";
import { ChartTableToggle } from "@/components/admin/reports/ChartTableToggle";
import { CHANNELS, getChannel, type ChannelSlug } from "@/lib/reports/channels";

/**
 * /admin/reports/online-ordering/visits
 *
 * Stacked bar chart of website visits per day, segmented by acquisition
 * channel. Matches the GloriaFood Website Visits screenshot.
 *
 * Data path: WebsiteVisit rows in the date range, bucketed (in-process)
 * by (day × channel). Prisma's groupBy can't bucket a date column to
 * the day, so we fetch the slim (channel, createdAt) tuples and reduce
 * — capped by the (restaurantId, createdAt) index so even Last 28 days
 * is a single index scan.
 *
 * Empty state: when no visits exist (e.g. the beacon was just shipped
 * and nothing's accrued yet), we show a "no data yet" copy with a hint
 * to share the order page link.
 */
export default async function VisitsReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  const range = parseDateRange(sp);
  const view = sp.view === "table" ? "table" : "chart";

  if (!restaurantId) return <p className="text-sm text-gray-500">No restaurant context.</p>;

  const visits = await prisma.websiteVisit.findMany({
    where: { restaurantId, createdAt: { gte: range.from, lte: range.to } },
    select: { channel: true, createdAt: true },
  });

  // Two-level bucket: day → channel → count. Zero-fill every (day,
  // channel) cell so the stacked chart doesn't have visual gaps.
  const days = eachDay(range);
  const buckets = new Map<string, Map<ChannelSlug, number>>();
  for (const d of days) {
    const m = new Map<ChannelSlug, number>();
    for (const c of CHANNELS) m.set(c.slug, 0);
    buckets.set(d.toDateString(), m);
  }
  for (const v of visits) {
    const k = new Date(v.createdAt).toDateString();
    const m = buckets.get(k);
    if (!m) continue;
    const slug = (v.channel as ChannelSlug) || "direct";
    m.set(slug, (m.get(slug) ?? 0) + 1);
  }
  const totals = new Map<ChannelSlug, number>();
  for (const c of CHANNELS) totals.set(c.slug, 0);
  for (const m of buckets.values()) {
    for (const [k, v] of m.entries()) totals.set(k, (totals.get(k) ?? 0) + v);
  }
  // Channels with zero visits are dropped from the legend to keep it
  // tight; the (CHANNELS in display order, filtered) array is what
  // the chart + table iterate over.
  const activeChannels = CHANNELS.filter((c) => (totals.get(c.slug) ?? 0) > 0);
  const totalVisits = visits.length;

  return (
    <div>
      <header className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Website Visits</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {totalVisits.toLocaleString()} visits · {formatRangeLabel(range)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ChartTableToggle />
          <DateRangePicker />
        </div>
      </header>

      {totalVisits === 0 ? (
        <EmptyState />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          {view === "chart" ? (
            <StackedBarChart days={days} buckets={buckets} activeChannels={activeChannels} />
          ) : (
            <Table days={days} buckets={buckets} activeChannels={activeChannels} totals={totals} />
          )}

          <Legend channels={activeChannels} totals={totals} />
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
      <div className="text-3xl mb-2">📈</div>
      <p className="text-sm text-gray-700 font-semibold mb-1">No visits yet in this range.</p>
      <p className="text-xs text-gray-500 max-w-md mx-auto">
        Once customers land on your order page, this chart will show where
        they came from — direct, organic search, social media, paid ads,
        and more. Share your order link to start collecting data.
      </p>
    </div>
  );
}

function StackedBarChart({
  days, buckets, activeChannels,
}: {
  days: Date[];
  buckets: Map<string, Map<ChannelSlug, number>>;
  activeChannels: typeof CHANNELS;
}) {
  const dailyTotals = days.map((d) => {
    const m = buckets.get(d.toDateString())!;
    return Array.from(m.values()).reduce((s, v) => s + v, 0);
  });
  const maxDaily = Math.max(...dailyTotals, 1);

  // SVG stacked bars — no chart library. ~25 bars at 7 days × 9
  // channels is trivial to render in raw SVG. Each bar = one day,
  // each rectangle stack = one channel.
  const width = 800;
  const height = 280;
  const padX = 40;
  const padY = 20;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;
  const barW = (innerW / days.length) * 0.7;
  const barGap = (innerW / days.length) * 0.3;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[600px]" role="img" aria-label="Website visits by channel">
        <line x1={padX} y1={padY + innerH} x2={padX + innerW} y2={padY + innerH} stroke="#e5e7eb" strokeWidth="1" />

        {days.map((d, i) => {
          const x = padX + i * (barW + barGap) + barGap / 2;
          const m = buckets.get(d.toDateString())!;
          let runningY = padY + innerH;
          return (
            <g key={i}>
              {activeChannels.map((c) => {
                const v = m.get(c.slug) ?? 0;
                if (v === 0) return null;
                const h = (v / maxDaily) * innerH;
                runningY -= h;
                return (
                  <rect
                    key={c.slug}
                    x={x}
                    y={runningY}
                    width={barW}
                    height={h}
                    fill={c.hex}
                  >
                    <title>{formatChartDate(d)} · {c.label}: {v}</title>
                  </rect>
                );
              })}
              {/* X-axis label, sparse */}
              {(i % Math.max(1, Math.floor(days.length / 6)) === 0 || i === days.length - 1) && (
                <text x={x + barW / 2} y={padY + innerH + 14} fontSize="10" textAnchor="middle" fill="#6b7280">
                  {formatChartDate(d)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Table({
  days, buckets, activeChannels, totals,
}: {
  days: Date[];
  buckets: Map<string, Map<ChannelSlug, number>>;
  activeChannels: typeof CHANNELS;
  totals: Map<ChannelSlug, number>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100">
            <th className="py-2 px-3 font-semibold">Date</th>
            {activeChannels.map((c) => (
              <th key={c.slug} className="py-2 px-3 font-semibold text-right whitespace-nowrap">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.hex }} />
                  {c.label}
                </span>
              </th>
            ))}
            <th className="py-2 px-3 font-semibold text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const m = buckets.get(d.toDateString())!;
            const dayTotal = Array.from(m.values()).reduce((s, v) => s + v, 0);
            return (
              <tr key={d.toISOString()} className="border-b border-gray-50">
                <td className="py-2 px-3 text-gray-700">{formatChartDate(d)}</td>
                {activeChannels.map((c) => (
                  <td key={c.slug} className="py-2 px-3 text-right text-gray-700">{m.get(c.slug) ?? 0}</td>
                ))}
                <td className="py-2 px-3 text-right font-semibold text-gray-900">{dayTotal}</td>
              </tr>
            );
          })}
          <tr className="font-semibold bg-gray-50">
            <td className="py-2 px-3 text-gray-900">Total</td>
            {activeChannels.map((c) => (
              <td key={c.slug} className="py-2 px-3 text-right text-gray-900">{totals.get(c.slug) ?? 0}</td>
            ))}
            <td className="py-2 px-3 text-right text-gray-900">
              {Array.from(totals.values()).reduce((s, v) => s + v, 0)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Legend({ channels, totals }: { channels: typeof CHANNELS; totals: Map<ChannelSlug, number> }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4 pt-3 border-t border-gray-100">
      {channels.map((c) => (
        <div key={c.slug} className="inline-flex items-center gap-1.5 text-xs" title={c.description}>
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.hex }} />
          <span className="text-gray-700">{c.label}</span>
          <span className="text-gray-400">({totals.get(c.slug) ?? 0})</span>
        </div>
      ))}
    </div>
  );
}
