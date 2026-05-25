import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { parseDateRange, formatRangeLabel } from "@/lib/reports/date-range";
import { DateRangePicker } from "@/components/admin/reports/DateRangePicker";
import { Info } from "lucide-react";

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
const FUNNEL_STEPS = [
  { id: "visit",          label: "Visited order page",   wired: true },
  { id: "menu_browsed",   label: "Browsed the menu",     wired: false },
  { id: "item_added",     label: "Added an item to cart", wired: false },
  { id: "checkout_open",  label: "Opened checkout",      wired: false },
  { id: "checkout_info",  label: "Filled customer info", wired: false },
  { id: "payment_open",   label: "Reached payment",      wired: false },
  // order_placed is wired via OrderPlacedTracker on the confirmation
  // page — fires once per successful order. The middle steps still
  // need cart/checkout instrumentation (next iteration).
  { id: "order_placed",   label: "Placed an order",      wired: true },
] as const;

export default async function FunnelReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getSessionUser();
  const restaurantId = user?.restaurantId;
  const range = parseDateRange(sp);

  if (!restaurantId) return <p className="text-sm text-gray-500">No restaurant context.</p>;

  // groupBy(step, sessionHash) gives one row per (step, distinct session).
  // Count rows per step → number of distinct sessions at that step.
  const rows = await prisma.websiteFunnelEvent.groupBy({
    by: ["step", "sessionHash"],
    where: { restaurantId, createdAt: { gte: range.from, lte: range.to } },
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
          <h1 className="text-2xl font-bold text-gray-900">Website Funnel</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Where customers drop off · {formatRangeLabel(range)}
          </p>
        </div>
        <DateRangePicker />
      </header>

      {visitCount === 0 ? (
        <EmptyState />
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <FunnelBars steps={stepCounts} />

          <div className="mt-5 pt-4 border-t border-gray-100 bg-amber-50/40 -m-5 mt-5 p-4 rounded-b-xl">
            <div className="flex items-start gap-2 text-xs text-amber-800">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p>
                Visit-to-order conversion is fully tracked. The intermediate
                steps (menu browse, item add, checkout open, info filled,
                payment open) are wired in the order page in the next iteration
                — until then they show as 0.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
      <div className="text-3xl mb-2">🛒</div>
      <p className="text-sm text-gray-700 font-semibold mb-1">No funnel data yet.</p>
      <p className="text-xs text-gray-500 max-w-md mx-auto">
        The funnel needs at least one visit to your order page. Share your order
        link — the analytics beacon fires automatically and this view will populate
        within a few minutes.
      </p>
    </div>
  );
}

function FunnelBars({ steps }: { steps: { id: string; label: string; count: number; wired: boolean }[] }) {
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
                {!s.wired && <span className="ml-2 text-[10px] uppercase tracking-wider text-gray-400">not tracked yet</span>}
              </span>
              <span className="font-semibold text-gray-900">
                {s.count.toLocaleString()}
                {conversion !== null && (
                  <span className="ml-2 text-[10px] font-medium text-gray-500">
                    {conversion >= 100 ? "+" : ""}{conversion.toFixed(0)}% of prev
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
