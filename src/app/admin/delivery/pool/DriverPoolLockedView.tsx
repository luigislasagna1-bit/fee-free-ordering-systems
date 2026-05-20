import Link from "next/link";
import { Truck, Lock, Sparkles, Check } from "lucide-react";

/**
 * Shown on /admin/delivery/pool when the restaurant doesn't have the
 * `driver_pool` entitlement. Two ways to unlock: the standalone
 * Driver Pool add-on ($19.99/mo) OR the Marketplace add-on (free to
 * join, includes Driver Pool).
 */
export function DriverPoolLockedView() {
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      <div className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-2xl p-6 sm:p-8 shadow-lg">
        <div className="flex items-center gap-2 mb-3">
          <Truck className="w-5 h-5" />
          <span className="text-sm font-bold uppercase tracking-wider opacity-90">Add-on</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          ShipDay Driver Pool
        </h1>
        <p className="mt-2 text-white/90 text-sm sm:text-base max-w-2xl leading-relaxed">
          Overflow delivery capacity when your own drivers are busy or you don&apos;t
          have any. ShipDay&apos;s third-party drivers pick up from you and deliver
          to your customer. You pay per delivery; you decide how much customers see.
        </p>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white/15 backdrop-blur rounded-xl p-4">
            <div className="text-xs uppercase tracking-wider opacity-80">Driver Pool</div>
            <div className="text-3xl font-bold mt-1">$19.99<span className="text-lg">/mo</span></div>
            <div className="text-sm opacity-90">standalone — plus per-delivery fees</div>
            <div className="text-[10px] opacity-70 mt-1">USD · CA tax by province</div>
          </div>
          <div className="bg-white/15 backdrop-blur rounded-xl p-4 border-2 border-white/40">
            <div className="text-xs uppercase tracking-wider opacity-80">Or get it free</div>
            <div className="text-3xl font-bold mt-1">$0</div>
            <div className="text-sm opacity-90">included with Marketplace (monthly plan)</div>
            <div className="text-[10px] opacity-70 mt-1">PAYG marketplace ≠ included</div>
          </div>
        </div>

        <div className="mt-6 flex gap-3 flex-wrap">
          <Link
            href="/admin/billing/add-ons"
            className="inline-flex items-center justify-center gap-2 bg-white text-blue-600 hover:bg-blue-50 font-bold px-5 py-2.5 rounded-xl text-sm shadow-md transition"
          >
            <Lock className="w-4 h-4" /> Get Driver Pool ($19.99/mo)
          </Link>
          <Link
            href="/admin/marketplace"
            className="inline-flex items-center justify-center gap-2 bg-white/15 hover:bg-white/25 backdrop-blur text-white font-bold px-5 py-2.5 rounded-xl text-sm transition border border-white/30"
          >
            <Sparkles className="w-4 h-4" /> Or get Marketplace Monthly ($199.99/mo)
          </Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FeatureCard
          icon={<Truck className="w-5 h-5" />}
          title="Overflow capacity"
          body="When your own driver is mid-route and a new delivery comes in, route it to ShipDay's pool. No more 'sorry we're not delivering right now'."
        />
        <FeatureCard
          icon={<Check className="w-5 h-5" />}
          title="You set customer pricing"
          body="Pass-through (customer pays full ShipDay fee), flat (you absorb the gap), or tiered (e.g. free over $50). Total control."
        />
        <FeatureCard
          icon={<Sparkles className="w-5 h-5" />}
          title="Switch per order"
          body="Mix your own drivers with ShipDay. The kitchen sees a picker for each delivery: in-house or pool. Your call, every time."
        />
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center mb-3">
        {icon}
      </div>
      <h3 className="font-bold text-gray-900 text-sm mb-1">{title}</h3>
      <p className="text-xs text-gray-600 leading-relaxed">{body}</p>
    </div>
  );
}
