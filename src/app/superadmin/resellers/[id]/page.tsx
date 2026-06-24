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
  // White-label state is included on the ResellerProfile model itself
  // (not a relation) so it comes back inside `profile` automatically —
  // no extra query needed. The panel below reads:
  //   profile.whiteLabelTier / Status / StripeSubscriptionId /
  //   CurrentPeriodEnd / CancelAtPeriodEnd /
  //   customDomain / customDomainStatus / customDomainAddedAt / customDomainError
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

      {/* White-Label audit panel — visible to superadmin only. Shows
          tier, status, Stripe sub, custom domain, and verification
          timeline. Used during pre-launch + ongoing audits to spot
          stuck verifications or lapsed subs that the reseller hasn't
          fixed yet. */}
      <div className="mt-8 bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-sm font-bold text-gray-900 mb-3">White-Label</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          <Kv label="Tier" value={profile.whiteLabelTier === "full" ? "Branded ($19.99)" : profile.whiteLabelTier === "basic" ? "Basic (legacy)" : "Free"} />
          <Kv label="Subscription" value={profile.whiteLabelStatus ?? "—"} highlight={profile.whiteLabelStatus === "past_due" ? "danger" : profile.whiteLabelStatus === "active" ? "good" : null} />
          <Kv label="Renews / ends" value={profile.whiteLabelCurrentPeriodEnd ? `${profile.whiteLabelCancelAtPeriodEnd ? "Ends" : "Renews"} ${new Date(profile.whiteLabelCurrentPeriodEnd).toLocaleDateString()}` : "—"} />
          <Kv label="Stripe sub ID" mono value={profile.whiteLabelStripeSubscriptionId ?? "—"} />
          <Kv label="Stripe customer ID" mono value={profile.stripeCustomerId ?? "—"} />
          <Kv label="Custom domain" mono value={profile.customDomain ?? "—"} />
          <Kv label="Domain status" value={profile.customDomainStatus} highlight={profile.customDomainStatus === "error" ? "danger" : profile.customDomainStatus === "verified" ? "good" : null} />
          <Kv label="Domain added" value={profile.customDomainAddedAt ? new Date(profile.customDomainAddedAt).toLocaleString() : "—"} />
          {profile.customDomainError && (
            <Kv label="Domain error" value={profile.customDomainError} highlight="danger" />
          )}
          <Kv label="Imprint" value={profile.imprint ?? "—"} />
          <Kv label="Logo" value={profile.brandLogoUrl ? "Uploaded" : "—"} />
        </div>
      </div>

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

/** Compact key/value pair used inside the White-Label audit panel.
 *  Highlight variants colour the value chip so anomalies (error /
 *  past_due) catch the superadmin's eye during a scan. */
function Kv({ label, value, mono, highlight }: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: "good" | "danger" | null;
}) {
  const valueCls = [
    mono ? "font-mono" : "",
    "break-all",
    highlight === "danger" ? "text-red-700 font-semibold" :
    highlight === "good"   ? "text-emerald-700 font-semibold" :
    "text-gray-800",
  ].join(" ");
  return (
    <div className="bg-gray-50 rounded p-2">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-0.5">{label}</div>
      <div className={valueCls}>{value}</div>
    </div>
  );
}
