import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView } from "@/lib/session";
import { formatCurrency } from "@/lib/utils";

export default async function ResellerCommissionsPage() {
  const user = await getSessionUser();
  if (!user || !isResellerView(user) || !user.resellerProfileId) {
    redirect("/reseller/holding");
  }

  const commissions = await prisma.commissionTransaction.findMany({
    where: { resellerProfileId: user.resellerProfileId },
    include: {
      restaurant: { select: { name: true, slug: true } },
      subscriptionInvoice: {
        select: { amountPaid: true, paidAt: true, periodStart: true, periodEnd: true, hostedInvoiceUrl: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const totals = commissions.reduce(
    (acc, c) => {
      acc.allCents += c.commissionCents;
      acc[c.status] = (acc[c.status] ?? 0) + c.commissionCents;
      return acc;
    },
    { allCents: 0 } as Record<string, number>
  );

  return (
    <div className="max-w-6xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Commissions</h1>
      <p className="text-sm text-gray-500 mb-6">
        One row per paid restaurant subscription invoice you've earned on.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Pending (hold)" cents={totals["pending"] ?? 0} note="Becomes payable after 7-day hold" />
        <Stat label="Available" cents={totals["available"] ?? 0} note="Ready for next payout" highlight />
        <Stat label="Paid" cents={totals["paid"] ?? 0} note="Already sent to you" />
        <Stat label="Reversed" cents={totals["reversed"] ?? 0} note="Refund / chargeback" />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Restaurant</th>
              <th className="px-4 py-3 text-right">Net rev</th>
              <th className="px-4 py-3 text-right">Rate</th>
              <th className="px-4 py-3 text-right">Commission</th>
              <th className="px-4 py-3 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {commissions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-500 text-sm">
                  No commissions yet. You'll earn on each restaurant's paid subscription invoice once you have
                  5 or more active paying restaurants (each with at least one paid add-on).
                </td>
              </tr>
            )}
            {commissions.map((c) => (
              <tr key={c.id} className="border-t border-gray-100">
                <td className="px-4 py-3 text-gray-700">
                  {c.subscriptionInvoice.paidAt
                    ? new Date(c.subscriptionInvoice.paidAt).toLocaleDateString()
                    : new Date(c.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-gray-900 font-medium">{c.restaurant.name}</td>
                <td className="px-4 py-3 text-right text-gray-700">
                  {formatCurrency(c.netRevenueCents / 100)}
                </td>
                <td className="px-4 py-3 text-right text-gray-700">
                  {c.ratePercent}%
                  <div className="text-[10px] text-gray-400">@ {c.activePayingCount} active</div>
                </td>
                <td className="px-4 py-3 text-right font-bold text-gray-900">
                  {formatCurrency(c.commissionCents / 100)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={c.status} />
                  {c.reversedReason && (
                    <div className="text-[10px] text-gray-400 mt-0.5">{c.reversedReason}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({
  label,
  cents,
  note,
  highlight,
}: {
  label: string;
  cents: number;
  note: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-4 border ${
        highlight ? "bg-emerald-50 border-emerald-200" : "bg-white border-gray-100"
      } shadow-sm`}
    >
      <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">{label}</div>
      <div className={`text-xl font-bold ${highlight ? "text-emerald-700" : "text-gray-900"}`}>
        {formatCurrency(cents / 100)}
      </div>
      <div className="text-[11px] text-gray-500 mt-1">{note}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    available: "bg-blue-100 text-blue-700",
    paid: "bg-green-100 text-green-700",
    reversed: "bg-red-100 text-red-700",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}
