import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { requireSuperadmin } from "@/lib/platform-auth";
import { formatCurrency } from "@/lib/utils";
import { deliveryWeekEnd, DELIVERY_WEEK_TZ } from "@/lib/feefree-delivery";
import { Bike, CheckCircle2, Clock } from "lucide-react";
import { BuildWeekButton } from "./BuildWeekButton";
import { MarkPaidButton } from "./MarkPaidButton";

/**
 * /superadmin/driver-payouts — the FeeFreeDelivery driver payout ledger.
 *
 * Fee Free pays drivers MANUALLY (hourly + tips, Sat→Fri America/Toronto week).
 * This is the record of who is owed and who has been paid. "Build week"
 * materializes the pending rows from frozen deliveries + closed shifts; "Mark
 * paid" records a manual payout (the money moves outside the system). Full
 * superadmin only (platform money-ops). English-only by convention.
 */
export const dynamic = "force-dynamic";

function hoursLabel(seconds: number): string {
  const m = Math.round(seconds / 60);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

function weekLabel(weekStart: Date): string {
  const friday = new Date(deliveryWeekEnd(weekStart).getTime() - 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: DELIVERY_WEEK_TZ });
  return `${fmt(weekStart)} – ${fmt(friday)}`;
}

export default async function DriverPayoutsPage() {
  const gate = await requireSuperadmin();
  if (!gate) redirect("/superadmin");

  const rows = await prisma.driverPayout.findMany({
    orderBy: [{ weekStart: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: { driver: { select: { id: true, name: true, email: true } } },
  });

  const pending = rows.filter((r) => r.status === "pending");
  const pendingCents = pending.reduce((n, r) => n + r.totalCents, 0);
  const paidCount = rows.length - pending.length;
  const money = (cents: number, currency: string | null) => formatCurrency(cents / 100, currency ?? "cad");

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bike className="w-5 h-5 text-emerald-500" />
            Driver payouts
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manual weekly driver pay — hourly wage + tips, Saturday→Friday
            (America/Toronto). Fee Free pays drivers directly; this ledger is the
            record. Restaurants are billed separately for the fees + tips.
          </p>
        </div>
        <BuildWeekButton />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Owed (pending)</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{money(pendingCents, pending[0]?.currency ?? "cad")}</div>
          <div className="text-xs text-gray-500 mt-1">{pending.length} pending payout{pending.length === 1 ? "" : "s"}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">Paid</div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">{paidCount}</div>
          <div className="text-xs text-gray-500 mt-1">payouts marked paid</div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Week", "Driver", "Deliveries", "Hours", "Hourly pay", "Tips", "Adj.", "Total", "Status", "Action"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center px-4 py-12 text-gray-500 text-sm">
                    No payouts yet. Click <strong>Build week</strong> to roll up the week that just closed.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs whitespace-nowrap text-gray-700">{weekLabel(r.weekStart)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{r.driver.name}</div>
                      <div className="text-[11px] text-gray-400">{r.driver.email}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{r.deliveries}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{hoursLabel(r.workedSeconds)}</td>
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{money(r.hourlyPayCents, r.currency)}</td>
                    <td className="px-4 py-3 text-amber-600 whitespace-nowrap">{money(r.tipsCents, r.currency)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">{r.adjustmentCents !== 0 ? money(r.adjustmentCents, r.currency) : "—"}</td>
                    <td className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">{money(r.totalCents, r.currency)}</td>
                    <td className="px-4 py-3">
                      {r.status === "paid" ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 uppercase tracking-wider bg-emerald-100 text-emerald-700">
                          <CheckCircle2 className="w-3 h-3" /> paid
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 uppercase tracking-wider bg-amber-100 text-amber-700">
                          <Clock className="w-3 h-3" /> pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.status === "pending" ? (
                        <MarkPaidButton id={r.id} />
                      ) : (
                        <span className="text-[11px] text-gray-400 whitespace-nowrap">
                          {r.paidAt ? r.paidAt.toLocaleDateString() : ""}
                          {r.payoutReference ? ` · ${r.payoutReference}` : ""}
                        </span>
                      )}
                    </td>
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
