import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { parseDateRange, previousPeriod, formatRangeLabel } from "@/lib/reports/date-range";
import { DateRangePicker } from "@/components/admin/reports/DateRangePicker";
import { ExportMenu } from "@/components/admin/reports/ExportMenu";

/**
 * /admin/reports/sales/summary
 *
 * Roll-up table matching the GloriaFood Sales Summary screenshot:
 * one big "totals" row at the top followed by a breakdown grouped by
 * the chosen pivot — Payment Type / Order Type / Category / Channel.
 *
 * Pivot lives in `?by=` (default `paymentMethod`). Date range from
 * the picker; comparison toggle adds vs-prev columns.
 */
export default async function SalesSummaryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  const range = parseDateRange(sp);
  const by = pickBy(sp.by);
  const compare = sp.compare === "1";

  if (!restaurantId) return <p className="text-sm text-gray-500">No restaurant context.</p>;

  // Group by the chosen dimension. `prisma.order.groupBy` does the work
  // server-side — no row-level loop on Node.
  const cur = await prisma.order.groupBy({
    by: [by],
    where: { restaurantId, status: "completed", createdAt: { gte: range.from, lte: range.to } },
    _count: true,
    _sum: { total: true },
    orderBy: { _sum: { total: "desc" } },
  });

  const prev = previousPeriod(range);
  const previous = compare
    ? await prisma.order.groupBy({
        by: [by],
        where: { restaurantId, status: "completed", createdAt: { gte: prev.from, lte: prev.to } },
        _count: true,
        _sum: { total: true },
      })
    : [];
  const prevByKey = new Map(previous.map((r) => [String(r[by] ?? "—"), r]));

  const totalRevenue = cur.reduce((s, r) => s + (r._sum.total ?? 0), 0);
  const totalCount = cur.reduce((s, r) => s + r._count, 0);
  const totalAvg = totalCount > 0 ? totalRevenue / totalCount : 0;

  return (
    <div>
      <header className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Summary</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Breakdown by {labelByDim(by)} · {formatRangeLabel(range)}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PivotSwitcher current={by} sp={sp} />
          <CompareToggle on={compare} sp={sp} />
          <DateRangePicker />
        </div>
      </header>

      {/* Headline totals — one row, three numbers. */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <Totals label="Revenue"        value={formatCurrency(totalRevenue)} />
        <Totals label="Completed orders" value={totalCount.toLocaleString()} />
        <Totals label="Average order"  value={formatCurrency(totalAvg)} />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden relative">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-100 bg-gray-50">
              <th className="py-2.5 px-4 font-semibold">{labelByDim(by)}</th>
              <th className="py-2.5 px-4 font-semibold text-right">Orders</th>
              <th className="py-2.5 px-4 font-semibold text-right">Revenue</th>
              <th className="py-2.5 px-4 font-semibold text-right">Avg order</th>
              {compare && <th className="py-2.5 px-4 font-semibold text-right">vs prev revenue</th>}
            </tr>
          </thead>
          <tbody>
            {cur.length === 0 && (
              <tr><td colSpan={compare ? 5 : 4} className="py-6 px-4 text-center text-gray-400 italic">No completed orders in this range.</td></tr>
            )}
            {cur.map((r) => {
              const key = String(r[by] ?? "—");
              const revenue = r._sum.total ?? 0;
              const avg = r._count > 0 ? revenue / r._count : 0;
              const prevRow = prevByKey.get(key);
              const prevRev = prevRow?._sum.total ?? 0;
              const delta = compare && prevRev > 0 ? ((revenue - prevRev) / prevRev) * 100 : null;
              return (
                <tr key={key} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-2.5 px-4 font-medium text-gray-800">{prettyLabel(by, key)}</td>
                  <td className="py-2.5 px-4 text-right text-gray-700">{r._count.toLocaleString()}</td>
                  <td className="py-2.5 px-4 text-right font-semibold text-gray-900">{formatCurrency(revenue)}</td>
                  <td className="py-2.5 px-4 text-right text-gray-600">{formatCurrency(avg)}</td>
                  {compare && (
                    <td className={`py-2.5 px-4 text-right font-medium ${delta === null ? "text-gray-400" : delta >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {delta === null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="absolute bottom-3 right-3">
          <ExportMenu
            exportUrl="/api/admin/reports/sales/summary/export"
            currentQuery={buildQuery(sp)}
          />
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────

type Pivot = "paymentMethod" | "type" | "status";

function pickBy(raw: string | string[] | undefined): Pivot {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "type" || v === "status") return v;
  return "paymentMethod";
}

function labelByDim(d: Pivot): string {
  return d === "paymentMethod" ? "Payment method" : d === "type" ? "Order type" : "Status";
}

function prettyLabel(d: Pivot, raw: string): string {
  if (raw === "—" || !raw) return "—";
  if (d === "type") return raw === "dine_in" ? "Dine-in" : raw.charAt(0).toUpperCase() + raw.slice(1);
  if (d === "status") return raw.charAt(0).toUpperCase() + raw.slice(1);
  // paymentMethod values: "cash" / "card" / "online" etc.
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function Totals({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
    </div>
  );
}

function PivotSwitcher({ current, sp }: { current: Pivot; sp: Record<string, string | string[] | undefined> }) {
  const mk = (p: Pivot) => { const u = new URLSearchParams(buildQuery(sp)); u.set("by", p); return `?${u.toString()}`; };
  const opts: Pivot[] = ["paymentMethod", "type", "status"];
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
      {opts.map((p) => (
        <a key={p} href={mk(p)} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${current === p ? "bg-emerald-50 text-emerald-700" : "text-gray-500 hover:text-gray-800"}`}>
          {labelByDim(p)}
        </a>
      ))}
    </div>
  );
}

function CompareToggle({ on, sp }: { on: boolean; sp: Record<string, string | string[] | undefined> }) {
  const u = new URLSearchParams(buildQuery(sp));
  if (on) u.delete("compare"); else u.set("compare", "1");
  return (
    <a href={`?${u.toString()}`} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${on ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}>
      <span className={`w-2 h-2 rounded-full ${on ? "bg-purple-500" : "bg-gray-300"}`} /> Show previous period
    </a>
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
