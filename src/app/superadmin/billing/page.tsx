import prisma from "@/lib/db";
import { formatCurrency } from "@/lib/utils";
import { CreditCard, AlertCircle } from "lucide-react";

export default async function SuperadminBilling() {
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
    const trialCount = p.restaurants.filter((r) => r.subscriptionStatus === "trial").length;
    return sum + p.price * trialCount;
  }, 0);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Billing & Subscriptions</h1>

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

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold text-blue-800">Stripe Integration Placeholder</div>
          <div className="text-sm text-blue-600 mt-1">
            In production, this page connects to Stripe to manage subscription billing, view invoice history, handle failed payments, and trigger plan upgrades. The Stripe Connect flow for restaurant payouts is also managed here.
          </div>
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
                        {r.trialEndsAt && r.subscriptionStatus === "trial" && (
                          <span className="text-xs text-gray-400">Trial ends {new Date(r.trialEndsAt).toLocaleDateString()}</span>
                        )}
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.subscriptionStatus === "active" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
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
