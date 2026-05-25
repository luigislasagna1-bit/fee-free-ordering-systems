import Link from "next/link";
import { Megaphone, TrendingUp, Users, Building2, Wallet, ArrowRight } from "lucide-react";

/**
 * /reseller/sales/preamble
 *
 * Welcome / intro page for the Sales & Marketing section. Sets the
 * mental frame for the rest of the section (Way to go playbook,
 * Partner Resources, Restaurant Resources). Loosely mirrors GloriaFood
 * PartnerNet's Preamble layout — keeps the structure familiar to
 * partners coming from there.
 */
export default function ResellerSalesPreamblePage() {
  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome to the program</h1>
        <p className="text-sm text-gray-500">
          What it is, why it exists, and how to get the most out of it.
        </p>
      </div>

      <div className="bg-gradient-to-br from-emerald-600 to-slate-900 rounded-2xl p-6 text-white mb-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-bold text-emerald-100 mb-3">
          <Megaphone className="w-4 h-4" /> Partner program
        </div>
        <h2 className="text-2xl font-bold mb-2 leading-tight">
          Sell software restaurants actually want, and earn from it every month.
        </h2>
        <p className="text-emerald-50 text-sm leading-relaxed">
          Fee Free Ordering replaces what restaurants currently pay UberEats / DoorDash 25-30%
          commissions on. You bring them on board, they keep more of their revenue, and you earn
          recurring commission on every paid add-on they subscribe to — for as long as they stay
          on the platform.
        </p>
      </div>

      <h2 className="text-lg font-bold text-gray-900 mb-3">How the program works</h2>
      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        <Card
          icon={<Users className="w-5 h-5 text-emerald-600" />}
          title="You sign restaurants up"
          body="Use your referral link, or invite them directly from your dashboard. Every restaurant attributed to you is yours for the lifetime of their subscription."
        />
        <Card
          icon={<Wallet className="w-5 h-5 text-emerald-600" />}
          title="They activate paid services"
          body="Online Payments, Sales Optimized Website, Custom Domain, Branded Mobile App, etc. Each paid add-on a restaurant subscribes to becomes recurring revenue for you."
        />
        <Card
          icon={<TrendingUp className="w-5 h-5 text-emerald-600" />}
          title="Commission scales with you"
          body="0% under 5 restaurants. 5% at 5+. 10% at 26+. 15% at 50+. When you cross a threshold, the rate kicks in retroactively across your whole roster."
        />
        <Card
          icon={<Building2 className="w-5 h-5 text-emerald-600" />}
          title="You manage everything from here"
          body="Per-restaurant performance, commission ledger, payout requests, and (soon) white-label branding — all from this dashboard."
        />
      </div>

      <h2 className="text-lg font-bold text-gray-900 mb-3">What to do next</h2>
      <div className="space-y-2 mb-6">
        <NextStep
          n={1}
          title="Read the Way to Go playbook"
          body="Four short sections covering the sales conversation, where to start, and how to scale past the 5-restaurant threshold."
          href="/reseller/sales/way-to-go"
        />
        <NextStep
          n={2}
          title="Grab your Partner Resources"
          body="Pitch one-pager, comparison sheet against UberEats / DoorDash / GloriaFood, and an ROI calculator you can use in restaurant conversations."
          href="/reseller/sales/partner-resources"
        />
        <NextStep
          n={3}
          title="Share Restaurant Resources"
          body="Materials to send TO restaurants you're pitching — demo videos, customer testimonials, FAQs about Fee Free for owners."
          href="/reseller/sales/restaurant-resources"
        />
        <NextStep
          n={4}
          title="Copy your referral link"
          body="From the Profile & Referral page, grab your unique signup URL. Every restaurant that signs up through it is attributed to you automatically."
          href="/reseller/profile"
        />
      </div>

      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
        <strong>Heads up:</strong> commissions only apply to restaurants with at least one paid
        add-on each. A restaurant on the free starter plan doesn&apos;t count toward your tier
        until they activate Online Payments or another paid service. The Way to Go playbook
        covers how to make that conversation natural.
      </div>
    </div>
  );
}

function Card({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center">{icon}</div>
        <h3 className="text-sm font-bold text-gray-900">{title}</h3>
      </div>
      <p className="text-xs text-gray-600 leading-relaxed">{body}</p>
    </div>
  );
}

function NextStep({ n, title, body, href }: { n: number; title: string; body: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:border-emerald-300 hover:shadow-md transition group"
    >
      <div className="w-7 h-7 bg-emerald-500 text-white rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0">
        {n}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-bold text-gray-900 mb-0.5">{title}</h3>
        <p className="text-xs text-gray-600 leading-relaxed">{body}</p>
      </div>
      <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-emerald-600 group-hover:translate-x-1 transition flex-shrink-0 mt-1" />
    </Link>
  );
}
