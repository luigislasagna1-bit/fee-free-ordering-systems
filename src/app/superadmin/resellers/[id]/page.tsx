import { notFound } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { ResellerDetailClient } from "./ResellerDetailClient";

export default async function ResellerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await prisma.resellerProfile.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, name: true } },
      restaurants: {
        select: { id: true, name: true, slug: true, subscriptionStatus: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
      payouts: { orderBy: { requestedAt: "desc" } },
    },
  });
  if (!profile) notFound();

  return (
    <div className="max-w-5xl">
      <Link
        href="/superadmin/resellers"
        className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-block"
      >
        ← All resellers
      </Link>

      <ResellerDetailClient
        initial={JSON.parse(JSON.stringify(profile))}
      />

      <div className="mt-8 grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-bold text-gray-900 mb-3">
            Restaurants ({profile.restaurants.length})
          </h2>
          {profile.restaurants.length === 0 ? (
            <p className="text-sm text-gray-500">No restaurants linked.</p>
          ) : (
            <ul className="text-sm divide-y divide-gray-100">
              {profile.restaurants.map((r) => (
                <li key={r.id} className="py-2 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{r.name}</div>
                    <div className="text-xs text-gray-500">{r.subscriptionStatus}</div>
                  </div>
                  <Link href={`/order/${r.slug}`} target="_blank" className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold">
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-bold text-gray-900 mb-3">
            Payouts ({profile.payouts.length})
          </h2>
          {profile.payouts.length === 0 ? (
            <p className="text-sm text-gray-500">No payouts yet.</p>
          ) : (
            <ul className="text-sm divide-y divide-gray-100">
              {profile.payouts.map((p) => (
                <li key={p.id} className="py-2 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{formatCurrency(p.amountCents / 100)}</div>
                    <div className="text-xs text-gray-500">
                      {new Date(p.requestedAt).toLocaleDateString()} · {p.status}
                    </div>
                  </div>
                  <Link href="/superadmin/payouts" className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold">
                    Manage
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
