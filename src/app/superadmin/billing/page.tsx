import Link from "next/link";
import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { requireSuperadmin } from "@/lib/platform-auth";
import { formatCurrency , PLATFORM_CURRENCY } from "@/lib/utils";
import { Settings, Zap, CheckCircle2, XCircle, Sparkles, Users, AlertTriangle } from "lucide-react";
import { getStripeConfig } from "@/lib/stripe";

/**
 * Superadmin billing dashboard.
 *
 * Rebuilt for the free-base + paid-add-ons business model. The 4-tier
 * subscription plans table is now legacy (every new signup defaults to
 * Free); revenue flows through RestaurantAddOn subscriptions. This page
 * surfaces add-on-level MRR + adoption.
 *
 * Legacy SubscriptionPlan rows are listed at the bottom (collapsed) for
 * historical reference. They can be ignored unless a grandfathered
 * restaurant is still pinned to a non-Free plan.
 */
export const dynamic = "force-dynamic";

export default async function SuperadminBilling() {
  // Billing config — FULL superadmin only. The layout already bounced
  // unauthenticated visitors to /login; a support user lands back on the
  // dashboard.
  const gate = await requireSuperadmin();
  if (!gate) redirect("/superadmin");

  const [stripeCfg, addOns, plans] = await Promise.all([
    getStripeConfig(),
    // Real revenue driver.
    prisma.addOn.findMany({
      orderBy: { displayOrder: "asc" },
      include: {
        restaurantAddOns: {
          where: { status: { in: ["active", "trialing", "past_due"] } },
          select: {
            id: true,
            status: true,
            restaurant: { select: { id: true, name: true } },
            currentPeriodEnd: true,
          },
        },
      },
    }),
    // Legacy plans — kept for grandfathered restaurants. Don't surface
    // these prominently anymore.
    prisma.subscriptionPlan.findMany({
      include: { _count: { select: { restaurants: true } } },
      orderBy: { price: "asc" },
    }),
  ]);

  // MRR = sum of monthlyPriceCents over RestaurantAddOn rows where status
  // is "active". Trialing is a future-MRR signal — surfaced separately.
  let activeMrrCents = 0;
  let trialingMrrCents = 0;
  let pastDueMrrCents = 0;
  for (const addOn of addOns) {
    for (const sub of addOn.restaurantAddOns) {
      const cents = addOn.monthlyPriceCents ?? 0;
      if (sub.status === "active") activeMrrCents += cents;
      else if (sub.status === "trialing") trialingMrrCents += cents;
      else if (sub.status === "past_due") pastDueMrrCents += cents;
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Billing & Subscriptions</h1>
        <Link
          href="/superadmin/add-ons"
          className="inline-flex items-center gap-1.5 text-sm font-semibold bg-emerald-500 text-white px-4 py-2 rounded-lg hover:bg-emerald-600 transition"
        >
          <Settings className="w-4 h-4" /> Manage Add-On Catalog
        </Link>
      </div>

      {/* Stripe config snapshot */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-500" />
            <h2 className="text-sm font-bold text-gray-900">Stripe configuration</h2>
          </div>
          <Link href="/superadmin/settings/stripe" className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold">
            Configure →
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatusPill label="Enabled" ok={stripeCfg.enabled} />
          <StatusPill label="Secret key" ok={!!stripeCfg.secretKey} />
          <StatusPill label="Publishable key" ok={!!stripeCfg.publishableKey} />
          <StatusPill label="Webhook secret" ok={!!stripeCfg.webhookSecret} />
        </div>
        <div className="mt-3 text-xs text-gray-500">
          Mode: <span className="font-mono">{stripeCfg.mode ?? "—"}</span>
          {" · "}Source: <span className="font-mono">{stripeCfg.source}</span>
          {stripeCfg.source === "env" && " (using env vars — save in Stripe Settings to switch to DB)"}
        </div>
      </div>

      {/* Top-line MRR — split active / trialing / past-due so the operator
          can see real revenue vs. at-risk revenue at a glance. */}
      <div className="grid md:grid-cols-3 gap-5 mb-8">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500 mb-1">Active MRR</div>
          <div className="text-3xl font-bold text-green-600">{formatCurrency(activeMrrCents / 100, PLATFORM_CURRENCY)}</div>
          <div className="text-xs text-gray-400 mt-1">Billing right now</div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500 mb-1">Trialing MRR</div>
          <div className="text-3xl font-bold text-amber-600">{formatCurrency(trialingMrrCents / 100, PLATFORM_CURRENCY)}</div>
          <div className="text-xs text-gray-400 mt-1">Will convert (or not) on trial end</div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500 mb-1">Past-due MRR</div>
          <div className="text-3xl font-bold text-red-600">{formatCurrency(pastDueMrrCents / 100, PLATFORM_CURRENCY)}</div>
          <div className="text-xs text-gray-400 mt-1">At-risk — card failed</div>
        </div>
      </div>

      {/* Add-on adoption */}
      <div className="space-y-5 mb-10">
        {addOns.map((addOn) => {
          const active = addOn.restaurantAddOns.filter((s) => s.status === "active");
          const trialing = addOn.restaurantAddOns.filter((s) => s.status === "trialing");
          const pastDue = addOn.restaurantAddOns.filter((s) => s.status === "past_due");
          const mrrFromThis = active.length * (addOn.monthlyPriceCents ?? 0);
          return (
            <div key={addOn.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between p-5 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <div>
                    <div className="font-bold text-gray-900 text-lg">{addOn.name}</div>
                    <div className="text-sm text-gray-500">{formatCurrency((addOn.monthlyPriceCents ?? 0) / 100, PLATFORM_CURRENCY)}/month</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-green-600 text-lg">{formatCurrency(mrrFromThis / 100, PLATFORM_CURRENCY)}/mo</div>
                  <div className="text-xs text-gray-400">
                    {active.length} active · {trialing.length} trial
                    {pastDue.length > 0 && ` · ${pastDue.length} past-due`}
                  </div>
                </div>
              </div>
              {addOn.restaurantAddOns.length > 0 ? (
                <div className="divide-y divide-gray-50">
                  {addOn.restaurantAddOns.map((sub) => (
                    <div key={sub.id} className="flex items-center justify-between px-5 py-3 text-sm">
                      <Link href={`/superadmin/restaurants/${sub.restaurant.id}`} className="text-gray-800 hover:text-blue-600 hover:underline">
                        {sub.restaurant.name}
                      </Link>
                      <div className="flex items-center gap-3">
                        {sub.currentPeriodEnd && (
                          <span className="text-xs text-gray-400">
                            Renews {new Date(sub.currentPeriodEnd).toLocaleDateString()}
                          </span>
                        )}
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          sub.status === "active" ? "bg-green-100 text-green-700"
                          : sub.status === "trialing" ? "bg-amber-100 text-amber-700"
                          : sub.status === "past_due" ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-600"
                        }`}>
                          {sub.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-5 py-6 text-sm text-gray-400 italic text-center">
                  No restaurants on this add-on yet.
                </div>
              )}
            </div>
          );
        })}
        {addOns.length === 0 && (
          <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center text-sm text-gray-500">
            No add-ons in catalog.{" "}
            <Link href="/superadmin/add-ons" className="text-emerald-600 hover:underline font-semibold">
              Set one up →
            </Link>
          </div>
        )}
      </div>

      {/* Legacy subscription plans — collapsed reference. Every new signup
          defaults to Free; non-Free rows here are grandfathered. */}
      <details className="bg-gray-50 rounded-xl p-5 border border-gray-200">
        <summary className="cursor-pointer text-sm font-semibold text-gray-600 hover:text-gray-900 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-gray-400" />
          Legacy subscription plans (pre-add-ons era)
        </summary>
        <div className="mt-4 text-xs text-gray-500 mb-3">
          New signups default to the Free plan. Non-Free plans below are kept
          only for grandfathered restaurants — they no longer drive billing.
        </div>
        <div className="space-y-2">
          {plans.map((p) => (
            <div key={p.id} className="flex items-center justify-between text-sm py-2 px-3 bg-white rounded border border-gray-100">
              <div className="flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-gray-400" />
                <span className="font-medium text-gray-700">{p.name}</span>
                <span className="text-xs text-gray-500">{formatCurrency(p.price, PLATFORM_CURRENCY)}/mo</span>
              </div>
              <span className="text-xs text-gray-500">{p._count.restaurants} restaurant{p._count.restaurants === 1 ? "" : "s"}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function StatusPill({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className={`rounded-lg border p-2.5 ${ok ? "border-green-200 bg-green-50" : "border-gray-200 bg-gray-50"}`}>
      <div className="text-[10px] font-bold uppercase tracking-wide text-gray-500">{label}</div>
      <div className="flex items-center gap-1.5 mt-0.5">
        {ok ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> : <XCircle className="w-3.5 h-3.5 text-gray-400" />}
        <span className={`text-xs font-semibold ${ok ? "text-green-800" : "text-gray-500"}`}>{ok ? "Set" : "Not set"}</span>
      </div>
    </div>
  );
}
