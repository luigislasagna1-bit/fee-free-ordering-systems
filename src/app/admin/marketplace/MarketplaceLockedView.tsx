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
          No 30% commission, no extra fees for customers. Pick the plan that fits your volume —
          you can switch any time.
        </p>

        {/* Two billing modes side-by-side. Monthly is the predictable
            high-volume choice (includes Driver Pool); PAYG is the no-
            commitment opt-in. Both list you on /marketplace identically. */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white/20 backdrop-blur rounded-xl p-4 border-2 border-white/50">
            <div className="text-xs uppercase tracking-wider opacity-80 font-bold">Monthly plan</div>
            <div className="text-3xl font-bold mt-1">$199.99<span className="text-lg">/mo</span></div>
            <div className="text-sm opacity-90">unlimited orders</div>
            <ul className="mt-3 space-y-1 text-xs opacity-90">
              <li className="flex items-center gap-1.5"><Check className="w-3 h-3" /> No per-order fees</li>
              <li className="flex items-center gap-1.5"><Check className="w-3 h-3" /> Driver Pool included free</li>
              <li className="flex items-center gap-1.5"><Check className="w-3 h-3" /> Predictable, fixed bill</li>
            </ul>
            <div className="text-[10px] opacity-70 mt-2">USD · CA tax by province · US/intl exempt</div>
          </div>
          <div className="bg-white/15 backdrop-blur rounded-xl p-4">
            <div className="text-xs uppercase tracking-wider opacity-80 font-bold">Pay-as-you-go</div>
            <div className="text-3xl font-bold mt-1">$3<span className="text-lg">/order</span></div>
            <div className="text-sm opacity-90">capped at $249.99/month</div>
            <ul className="mt-3 space-y-1 text-xs opacity-90">
              <li className="flex items-center gap-1.5"><Check className="w-3 h-3" /> No subscription, opt out any time</li>
              <li className="flex items-center gap-1.5"><Check className="w-3 h-3" /> Above ~83 orders/mo = free</li>
              <li className="flex items-center gap-1.5 opacity-60"><span className="w-3 h-3 text-center leading-3">×</span> Driver Pool sold separately</li>
            </ul>
            <div className="text-[10px] opacity-70 mt-2">USD · CA tax by province · US/intl exempt</div>
          </div>
        </div>

        <div className="mt-4 bg-white/15 backdrop-blur rounded-lg p-3 text-xs leading-relaxed border border-white/30">
          <strong className="block mb-1">💡 Our recommendation:</strong>
          Start with <strong>Pay-As-You-Go</strong> until you&apos;re consistently
          getting <strong>60–70 marketplace orders per month</strong>. At that
          volume the Monthly plan ($199.99) starts saving you money vs. PAYG
          ($3/order × 70 = $210). Below 60 orders, PAYG is the cheaper choice
          and you can switch any time.
        </div>

        <div className="mt-3 bg-white/10 backdrop-blur rounded-lg p-3 text-xs leading-relaxed">
          <strong className="block mb-0.5">Compare to UberEats / DoorDash:</strong>
          30% of every order, forever. On a $700 sales day that&apos;s $210 — almost our
          entire <strong>monthly</strong> bill, gone in one day.
        </div>

        <div className="mt-5 flex gap-3 flex-wrap">
          <Link
            href="/admin/billing/add-ons"
            className="inline-flex items-center justify-center gap-2 bg-white text-orange-600 hover:bg-orange-50 font-bold px-5 py-2.5 rounded-xl text-sm shadow-md transition"
          >
            <Lock className="w-4 h-4" /> Subscribe to Monthly Plan
          </Link>
          <Link
            href="/admin/marketplace/payg-opt-in"
            className="inline-flex items-center justify-center gap-2 bg-white/15 hover:bg-white/25 backdrop-blur text-white font-bold px-5 py-2.5 rounded-xl text-sm transition border border-white/30"
          >
            <Sparkles className="w-4 h-4" /> Start Pay-As-You-Go
          </Link>
        </div>
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
