import Link from "next/link";
import prisma from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { Settings, Zap, CheckCircle2, XCircle } from "lucide-react";
import { getStripeConfig } from "@/lib/stripe";

export default async function SuperadminBilling() {
  const stripeCfg = await getStripeConfig();
  const plans = await prisma.subscriptionPlan.findMany({
    include: {
      restaurants: {
        select: { id: true, name: true, subscriptionStatus: true, trialEndsAt: true },
      },
    },
    orderBy: { price: "asc" },
  });

  const totalMRR = plans.reduce((sum, p) => {
    const activeCount = p.restaurants.filter((r) => r.subscriptionStatus === "active").length;
    return sum + p.price * activeCount;
  }, 0);

  const trialMRR = plans.reduce((sum, p) => {
    const trialCount = p.restaurants.filter((r) => r.subscriptionStatus === "trialing").length;
    return sum + p.price * trialCount;
  }, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Billing & Subscriptions</h1>
        <Link
          href="/superadmin/billing/plans"
          className="inline-flex items-center gap-1.5 text-sm font-semibold bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 transition"
        >
          <Settings className="w-4 h-4" /> Manage Plans
        </Link>
      </div>

      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-orange-500" />
            <h2 className="text-sm font-bold text-gray-900">Stripe configuration</h2>
          </div>
          <Link href="/superadmin/settings/stripe" className="text-xs text-orange-600 hover:text-orange-700 font-semibold">
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

      <div className="grid md:grid-cols-3 gap-5 mb-8">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500 mb-1">Current MRR</div>
          <div className="text-3xl font-bold text-green-600">{formatCurrency(totalMRR)}</div>
          <div className="text-xs text-gray-400 mt-1">Active subscriptions only</div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500 mb-1">Potential MRR (trials)</div>
          <div className="text-3xl font-bold text-yellow-600">{formatCurrency(trialMRR)}</div>
          <div className="text-xs text-gray-400 mt-1">If all trials convert</div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <div className="text-sm text-gray-500 mb-1">Total MRR Potential</div>
          <div className="text-3xl font-bold text-blue-600">{formatCurrency(totalMRR + trialMRR)}</div>
          <div className="text-xs text-gray-400 mt-1">Active + trials</div>
        </div>
      </div>

      <div className="space-y-5">
        {plans.map((plan) => {
          const active = plan.restaurants.filter((r) => r.subscriptionStatus === "active");
          const trial = plan.restaurants.filter((r) => r.subscriptionStatus === "trial");
          return (
            <div key={plan.id} className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between p-5 border-b border-gray-100">
                <div>
                  <div className="font-bold text-gray-900 text-lg">{plan.name}</div>
                  <div className="text-sm text-gray-500">{formatCurrency(plan.price)}/month</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-green-600 text-lg">{formatCurrency(plan.price * active.length)}/mo</div>
                  <div className="text-xs text-gray-400">{active.length} active · {trial.length} trial</div>
                </div>
              </div>
              {plan.restaurants.length > 0 && (
                <div className="divide-y divide-gray-50">
                  {plan.restaurants.map((r) => (
                    <div key={r.id} className="flex items-center justify-between px-5 py-3 text-sm">
                      <span className="text-gray-800">{r.name}</span>
                      <div className="flex items-center gap-3">
                        {r.trialEndsAt && r.subscriptionStatus === "trialing" && (
                          <span className="text-xs text-gray-400">Trial ends {new Date(r.trialEndsAt).toLocaleDateString()}</span>
                        )}
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          r.subscriptionStatus === "active" ? "bg-green-100 text-green-700"
                          : r.subscriptionStatus === "trialing" ? "bg-yellow-100 text-yellow-700"
                          : r.subscriptionStatus === "past_due" ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-600"
                        }`}>
                          {r.subscriptionStatus}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
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
