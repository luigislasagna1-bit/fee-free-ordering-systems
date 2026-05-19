import Link from "next/link";
import { Sparkles, Check, TrendingUp, Users, Lock } from "lucide-react";

/**
 * Shown on /admin/marketplace when the restaurant doesn't have the
 * `marketplace_listing` entitlement. Marketing copy + pricing math
 * + CTA to the add-ons page.
 *
 * The math hook ($200 = 660 in UberEats commissions ≈ unlimited
 * orders on our marketplace) is the core selling point. Show it
 * BIG. Numbers convert.
 */
export function MarketplaceLockedView() {
  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6">
      <div className="bg-gradient-to-br from-orange-500 to-pink-500 text-white rounded-2xl p-6 sm:p-8 shadow-lg">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-5 h-5" />
          <span className="text-sm font-bold uppercase tracking-wider opacity-90">Add-on</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Get on the Fee Free Marketplace
        </h1>
        <p className="mt-2 text-white/90 text-sm sm:text-base max-w-2xl leading-relaxed">
          List your restaurant on our public marketplace at <code className="bg-white/15 px-1.5 py-0.5 rounded text-xs">/marketplace</code>.
          Local customers discover you. You keep every dollar. Customers pay zero extra fees.
        </p>

        {/* Pricing math */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white/15 backdrop-blur rounded-xl p-4">
            <div className="text-xs uppercase tracking-wider opacity-80">Marketplace</div>
            <div className="text-3xl font-bold mt-1">$199.99</div>
            <div className="text-sm opacity-90">per month — unlimited orders</div>
            <div className="text-xs mt-2 opacity-80 italic">
              Or per-order, whichever is <span className="font-bold not-italic">cheaper</span> that month
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur rounded-xl p-4 border border-white/20">
            <div className="text-xs uppercase tracking-wider opacity-80">UberEats / DoorDash</div>
            <div className="text-3xl font-bold mt-1">$200</div>
            <div className="text-sm opacity-90">in commission on $660 of orders</div>
            <div className="text-xs mt-2 opacity-80 italic">
              30% of every order, forever
            </div>
          </div>
        </div>

        <Link
          href="/admin/billing/add-ons"
          className="inline-flex items-center justify-center gap-2 mt-6 bg-white text-orange-600 hover:bg-orange-50 font-bold px-6 py-3 rounded-xl text-sm shadow-md transition"
        >
          <Lock className="w-4 h-4" /> Subscribe to Marketplace
        </Link>
      </div>

      {/* What you get */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FeatureCard
          icon={<Users className="w-5 h-5" />}
          title="Local discovery"
          body="Customers browsing our marketplace see your restaurant alongside other independents — never competing against 1000s of national chains."
        />
        <FeatureCard
          icon={<TrendingUp className="w-5 h-5" />}
          title="Auto-listed"
          body="Subscribe and you're listed instantly. Your menu, your hours, your prices — we pull everything from your existing admin. Zero extra setup."
        />
        <FeatureCard
          icon={<Check className="w-5 h-5" />}
          title="Driver Pool included"
          body="ShipDay third-party drivers when you need overflow capacity. Normally a $19.99/mo add-on — bundled free with Marketplace."
        />
      </div>

      <div className="mt-6 text-xs text-gray-500 text-center">
        Already on a delivery aggregator? You can stay on both. Most restaurants who switch tell their best
        customers about the marketplace and steer them to it — same food, lower restaurant cost, lower
        customer cost.
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="w-9 h-9 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center mb-3">
        {icon}
      </div>
      <h3 className="font-bold text-gray-900 text-sm mb-1">{title}</h3>
      <p className="text-xs text-gray-600 leading-relaxed">{body}</p>
    </div>
  );
}
