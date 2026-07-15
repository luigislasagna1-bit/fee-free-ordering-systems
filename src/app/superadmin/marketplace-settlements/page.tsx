import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { requireSuperadmin } from "@/lib/platform-auth";
import { formatCurrency , PLATFORM_CURRENCY } from "@/lib/utils";
import { Sparkles, AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";
import { RunSettlementButton } from "./RunSettlementButton";

/**
 * /superadmin/marketplace-settlements — audit trail + manual rerun for the
 * monthly marketplace billing cron.
 *
 * Shows every MarketplaceSettlement row, grouped by month (most recent
 * first). Each row tells the operator: who, how many orders, what we
 * billed, what Stripe is doing about it, and any failure reason.
 *
 * The "Run settlement now" button lets the operator manually fire the
 * cron — useful for: catching up after a missed schedule, testing in a
 * dev/staging Neon branch, or settling a half-finished month manually
 * after fixing a config issue (e.g. a restaurant just connected Stripe).
 */
export const dynamic = "force-dynamic";

export default async function SettlementsPage() {
  // Money (marketplace billing + manual settlement rerun) — FULL superadmin
  // only. The layout already bounced unauthenticated visitors to /login; a
  // support user lands back on the dashboard.
  const gate = await requireSuperadmin();
  if (!gate) redirect("/superadmin");

  const rows = await prisma.marketplaceSettlement.findMany({
    orderBy: [{ monthStart: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: { restaurant: { select: { id: true, name: true, slug: true } } },
  });

  // Roll up by month for the headline summary.
  const byMonth = new Map<string, { total: number; paid: number; invoiced: number; failed: number; void: number; pending: number; cents: number }>();
  for (const r of rows) {
    const key = r.monthStart.toISOString().slice(0, 7);
    const bucket = byMonth.get(key) ?? { total: 0, paid: 0, invoiced: 0, failed: 0, void: 0, pending: 0, cents: 0 };
    bucket.total += 1;
    bucket.cents += r.invoicedCents;
    if (r.status === "paid") bucket.paid += 1;
    else if (r.status === "invoiced") bucket.invoiced += 1;
    else if (r.status === "failed") bucket.failed += 1;
    else if (r.status === "void") bucket.void += 1;
    else bucket.pending += 1;
    byMonth.set(key, bucket);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-500" />
            Marketplace settlements
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Monthly per-order billing for the marketplace add-on. Cron fires
            at <code className="bg-gray-100 px-1 rounded text-xs">00:05 UTC on the 1st</code> of each
            month and settles the month that just closed.
          </p>
        </div>
        <RunSettlementButton />
      </div>

      {/* Month-level summary cards */}
      {byMonth.size > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {Array.from(byMonth.entries()).slice(0, 3).map(([month, b]) => (
            <div key={month} className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">
                {monthLabel(month)}
              </div>
              <div className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(b.cents / 100, PLATFORM_CURRENCY)}</div>
              <div className="text-[10px] uppercase tracking-wider text-gray-400 mt-0.5">pre-tax · USD</div>
              <div className="text-xs text-gray-500 mt-1">{b.total} settlement{b.total === 1 ? "" : "s"}</div>
              <div className="flex flex-wrap gap-1.5 mt-3 text-[10px]">
                {b.paid > 0 && <Pill tone="emerald">{b.paid} paid</Pill>}
                {b.invoiced > 0 && <Pill tone="blue">{b.invoiced} invoiced</Pill>}
                {b.failed > 0 && <Pill tone="red">{b.failed} failed</Pill>}
                {b.void > 0 && <Pill tone="gray">{b.void} void</Pill>}
                {b.pending > 0 && <Pill tone="amber">{b.pending} pending</Pill>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Month", "Restaurant", "Orders", "Accrued", "Invoiced", "Status", "Stripe invoice", "Created"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center px-4 py-12 text-gray-500 text-sm">
                    No settlements yet. Settlements appear here automatically once the monthly cron runs (or after a manual trigger above).
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs whitespace-nowrap text-gray-700">{monthLabel(r.monthStart.toISOString().slice(0, 7))}</td>
                    <td className="px-4 py-3">
                      <Link href={`/superadmin/restaurants/${r.restaurant.id}`} className="text-blue-600 hover:underline font-medium">
                        {r.restaurant.name}
                      </Link>
                      <div className="text-[11px] text-gray-400">{r.restaurant.slug}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{r.ordersInMonth}</td>
                    <td className="px-4 py-3 text-gray-700">{formatCurrency(r.accruedCents / 100, PLATFORM_CURRENCY)}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{formatCurrency(r.invoicedCents / 100, PLATFORM_CURRENCY)}</td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3">
                      {r.stripeInvoiceId ? (
                        <code className="text-[10px] text-gray-500">{r.stripeInvoiceId.slice(0, 14)}…</code>
                      ) : r.failureReason ? (
                        <span className="text-[11px] text-red-600">{r.failureReason}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-gray-500 whitespace-nowrap">{r.createdAt.toLocaleDateString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: "emerald" | "blue" | "red" | "gray" | "amber"; icon: React.ReactNode }> = {
    paid:     { tone: "emerald", icon: <CheckCircle2 className="w-3 h-3" /> },
    invoiced: { tone: "blue",    icon: <Clock className="w-3 h-3" /> },
    pending:  { tone: "amber",   icon: <Clock className="w-3 h-3" /> },
    failed:   { tone: "red",     icon: <AlertTriangle className="w-3 h-3" /> },
    void:     { tone: "gray",    icon: <XCircle className="w-3 h-3" /> },
  };
  const cfg = map[status] ?? map.pending;
  return <Pill tone={cfg.tone} icon={cfg.icon}>{status}</Pill>;
}

function Pill({ tone, icon, children }: { tone: "emerald" | "blue" | "red" | "gray" | "amber"; icon?: React.ReactNode; children: React.ReactNode }) {
  const classes: Record<string, string> = {
    emerald: "bg-emerald-100 text-emerald-700",
    blue:    "bg-blue-100 text-blue-700",
    red:     "bg-red-100 text-red-700",
    gray:    "bg-gray-100 text-gray-600",
    amber:   "bg-amber-100 text-amber-700",
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 uppercase tracking-wider ${classes[tone]}`}>
      {icon}
      {children}
    </span>
  );
}

function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-");
  const d = new Date(Date.UTC(parseInt(y, 10), parseInt(m, 10) - 1, 1));
  return d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
