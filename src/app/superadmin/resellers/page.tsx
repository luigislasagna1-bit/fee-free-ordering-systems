import Link from "next/link";
import prisma from "@/lib/db";
import { formatCurrency } from "@/lib/utils";

export default async function SuperadminResellersPage() {
  const profiles = await prisma.resellerProfile.findMany({
    include: {
      user: { select: { email: true, name: true } },
      _count: { select: { restaurants: true, commissions: true, payouts: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const buckets = {
    pending: profiles.filter((p) => p.status === "pending"),
    approved: profiles.filter((p) => p.status === "approved"),
    suspended: profiles.filter((p) => p.status === "suspended"),
    rejected: profiles.filter((p) => p.status === "rejected"),
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Resellers</h1>
      <p className="text-sm text-gray-500 mb-6">All Partner Program applicants and active resellers.</p>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <Stat label="Pending review" value={buckets.pending.length} highlight={buckets.pending.length > 0} />
        <Stat label="Active" value={buckets.approved.length} />
        <Stat label="Suspended" value={buckets.suspended.length} />
        <Stat label="Rejected" value={buckets.rejected.length} />
      </div>

      <Section title="Pending review" profiles={buckets.pending} emptyText="No pending applications." />
      <Section title="Active" profiles={buckets.approved} emptyText="No active resellers yet." />
      {buckets.suspended.length > 0 && <Section title="Suspended" profiles={buckets.suspended} emptyText="" />}
      {buckets.rejected.length > 0 && <Section title="Rejected" profiles={buckets.rejected} emptyText="" />}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className={`rounded-xl p-4 border ${
        highlight ? "bg-orange-50 border-orange-200" : "bg-white border-gray-100"
      } shadow-sm`}
    >
      <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${highlight ? "text-orange-700" : "text-gray-900"}`}>{value}</div>
    </div>
  );
}

function Section({
  title,
  profiles,
  emptyText,
}: {
  title: string;
  profiles: Array<any>;
  emptyText: string;
}) {
  if (profiles.length === 0 && emptyText) {
    return (
      <div className="mb-6">
        <h2 className="text-sm font-bold text-gray-900 mb-2">{title}</h2>
        <div className="bg-white rounded-xl border border-gray-100 p-6 text-sm text-gray-500">{emptyText}</div>
      </div>
    );
  }
  return (
    <div className="mb-6">
      <h2 className="text-sm font-bold text-gray-900 mb-2">{title}</h2>
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">Reseller</th>
              <th className="px-4 py-3 text-left">Company</th>
              <th className="px-4 py-3 text-right">Restaurants</th>
              <th className="px-4 py-3 text-right">Lifetime earned</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id} className="border-t border-gray-100">
                <td className="px-4 py-3">
                  <div className="font-semibold text-gray-900">{p.user.name ?? p.user.email}</div>
                  <div className="text-xs text-gray-500">{p.user.email}</div>
                </td>
                <td className="px-4 py-3 text-gray-700">{p.companyName ?? "—"}</td>
                <td className="px-4 py-3 text-right text-gray-900">{p._count.restaurants}</td>
                <td className="px-4 py-3 text-right text-gray-900">
                  {formatCurrency(p.totalEarnedCents / 100)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/superadmin/resellers/${p.id}`}
                    className="text-xs text-orange-600 font-semibold hover:text-orange-700"
                  >
                    Review →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
