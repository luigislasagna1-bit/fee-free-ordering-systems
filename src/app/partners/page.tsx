import Link from "next/link";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { cookies } from "next/headers";
import {
  ArrowRight, TrendingUp, Users, Wallet, Zap, CheckCircle2,
  Calculator, DollarSign, Sparkles, Globe, ShieldCheck,
  Rocket, Package, Hammer,
} from "lucide-react";
import { marketingMetadata } from "@/lib/seo";

export const metadata = marketingMetadata({
  title: "Partner & Reseller Program — Fee Free Ordering",
  description: "Earn up to 15% recurring commission reselling 0% commission online ordering to restaurants. Live partner dashboard, your own referral link, and white-label options.",
  path: "/partners",
});

/**
 * /partners — public marketing landing page for the Reseller Partner Program.
 * The actual application form lives at /partners/apply.
 */
export default async function PartnersPage() {
  const cookieStore = await cookies();
  const locale = cookieStore.get("fee-free-locale")?.value || "en";

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav currentLocale={locale} />

      {/* Hero */}
      <section className="bg-gradient-to-br from-emerald-600 via-emerald-600 to-slate-900 text-white py-24 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-4 py-2 text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" /> Partner Program
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
            Earn recurring revenue<br />by bringing restaurants on board.
          </h1>
          <p className="text-xl text-emerald-100 mb-10 max-w-2xl mx-auto">
            Every restaurant you sign up pays a monthly subscription. You earn up to
            15% of that — every month, for as long as they're active.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/partners/apply"
              className="bg-white text-emerald-600 font-bold px-8 py-4 rounded-xl text-lg hover:bg-emerald-50 transition flex items-center justify-center gap-2"
            >
              Apply now <ArrowRight className="w-5 h-5" />
            </Link>
            <a
              href="#how-it-works"
              className="border-2 border-white text-white font-bold px-8 py-4 rounded-xl text-lg hover:bg-white/10 transition"
            >
              How it works
            </a>
          </div>
        </div>
      </section>

      {/* Tier breakdown */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
              The more you sell, the more you earn.
            </h2>
            <p className="text-gray-600">
              Hit 5 active paying restaurants and every one of them starts earning you commission — retroactively. Scale to 50+ and you triple your rate to 15%.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <TierCard rate="0%" range="0–4 active" tone="gray" body="Building your portfolio. You're growing — keep going." />
            <TierCard
              rate="5%"
              range="5–25 active"
              tone="orange"
              highlight
              body="Hit 5 restaurants (each with at least one paid add-on) and you start earning commission on every one of them — retroactively."
            />
            <TierCard
              rate="10%"
              range="26–50 active"
              tone="green"
              body="At 26 restaurants your rate doubles to 10%. Real recurring revenue territory."
            />
            <TierCard
              rate="15%"
              range="50+ active"
              tone="green"
              body="Cross 50 active paying restaurants and you unlock our top tier. Power-partner status."
            />
          </div>
        </div>
      </section>

      {/* Earnings matrix — shows commission across both axes the partner
          actually controls: how many restaurants they bring + how many
          paid add-ons each restaurant ends up subscribing to. Luigi
          flagged that a single $99/mo sample was misleading — partners
          want to see "what if my restaurants only buy 1 add-on?" and
          "what if they go all-in?" both. So we show 3 spend tiers and
          3 portfolio sizes, all 9 cells visible at once.

          Spend tiers (per restaurant per month):
            - 1 add-on   = ~$29.99 (Online Payments alone — the most-common
                                    first add-on, required for card orders)
            - 3 add-ons  = ~$59.97 (OP $29.99 + Hosted Website $19.99 +
                                    Custom Domain $9.99 — typical sweet spot)
            - All add-ons = ~$149.95 (the above + Multi-Location $49.99 +
                                    Advanced Promos $29.99 + Reservation
                                    Deposits $9.99 — power user) */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-700 rounded-full px-4 py-1.5 text-xs uppercase tracking-wider font-bold mb-4">
              <Calculator className="w-3.5 h-3.5" /> Real numbers
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
              What does this actually pay?
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Your commission depends on two things: how many active restaurants you&apos;ve referred, and how many paid add-ons each one subscribes to. Here&apos;s how the math works out across realistic scenarios.
            </p>
          </div>

          {/* Restaurant-count tier headers */}
          <div className="grid md:grid-cols-3 gap-4 mb-8">
            <EarningsTierCard
              count="10 restaurants"
              rate="5%"
              note="Once you cross the 5-restaurant threshold, your commission rate kicks in retroactively across your whole roster."
            />
            <EarningsTierCard
              count="30 restaurants"
              rate="10%"
              note="Cross 26 active restaurants and your rate doubles to 10%. Now you're scaling."
              highlight
            />
            <EarningsTierCard
              count="50+ restaurants"
              rate="15%"
              note="At 50+ active paying restaurants you unlock the top 15% tier. Power-partner territory."
            />
          </div>

          {/* The actual scenarios matrix. 3 spend tiers × 3 portfolio sizes. */}
          <div className="overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
            <table className="w-full text-sm border-collapse bg-white">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 text-xs uppercase tracking-wider font-bold text-gray-500">
                    Per-restaurant add-on spend
                  </th>
                  <th className="text-right px-4 py-3 text-xs uppercase tracking-wider font-bold text-gray-500">
                    10 restaurants<br /><span className="font-normal text-gray-400">(5%)</span>
                  </th>
                  <th className="text-right px-4 py-3 text-xs uppercase tracking-wider font-bold text-emerald-700 bg-emerald-50">
                    30 restaurants<br /><span className="font-normal text-emerald-600">(10%)</span>
                  </th>
                  <th className="text-right px-4 py-3 text-xs uppercase tracking-wider font-bold text-gray-500">
                    50+ restaurants<br /><span className="font-normal text-gray-400">(15%)</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <EarningsRow
                  scenario="1 add-on"
                  scenarioDetail="e.g. just Online Payments — $29.99/mo per restaurant"
                  perRestaurant={29.99}
                />
                <EarningsRow
                  scenario="3 add-ons"
                  scenarioDetail="e.g. Online Payments + Hosted Website + Custom Domain — $59.97/mo per restaurant"
                  perRestaurant={59.97}
                  highlightMid
                />
                <EarningsRow
                  scenario="All paid add-ons"
                  scenarioDetail="OP + Hosted Site + Custom Domain + Multi-Location + Promos + Reservations — $149.95/mo per restaurant"
                  perRestaurant={149.95}
                />
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-1">Best case in the table</div>
              {/* 50 × $149.95/mo × 15% = $1,124.625/mo → $13,495.50/yr */}
              <div className="text-2xl font-extrabold text-emerald-700">$1,124.62/mo</div>
              <div className="text-xs text-emerald-800 mt-1">50 restaurants × all add-ons × 15% = <strong>$13,495.50/year</strong> recurring.</div>
            </div>
            <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-gray-600 mb-1">Common scenario</div>
              {/* 30 × $59.97/mo × 10% = $179.91/mo → $2,158.92/yr */}
              <div className="text-2xl font-extrabold text-gray-900">$179.91/mo</div>
              <div className="text-xs text-gray-700 mt-1">30 restaurants × 3 add-ons × 10% = <strong>$2,158.92/year</strong>, on autopilot.</div>
            </div>
          </div>

          <p className="text-center text-xs text-gray-500 mt-6 max-w-2xl mx-auto">
            Commission is paid only on net <strong>add-on subscription revenue</strong> (excluding taxes, Stripe
            fees, refunds, and chargebacks). Per-order fees that restaurants pay (Marketplace orders, payment
            processing, etc.) are <strong>not</strong> commissionable — only the monthly add-on subscriptions are.{" "}
            <strong>Below 5 active paying restaurants, commission is 0%</strong> — once you cross the threshold
            (and each restaurant has at least one paid add-on), it kicks in retroactively across your whole roster.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-20 px-4 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">How it works</h2>
            <p className="text-gray-600">Four steps from application to payout.</p>
          </div>
          <div className="grid md:grid-cols-4 gap-4">
            <Step
              n={1}
              icon={<Users className="w-5 h-5" />}
              title="Apply"
              body="Tell us about yourself. We review within 1–2 business days."
            />
            <Step
              n={2}
              icon={<Globe className="w-5 h-5" />}
              title="Get your link"
              body="On approval, you get a personal referral URL and an invite tool. Both attribute restaurants to your account automatically."
            />
            <Step
              n={3}
              icon={<TrendingUp className="w-5 h-5" />}
              title="Sign up restaurants"
              body="Send the link, or invite restaurants by email. They run their own account — you can also log in as them to help with setup."
            />
            <Step
              n={4}
              icon={<Wallet className="w-5 h-5" />}
              title="Get paid"
              body="When your balance hits $50, request a payout. We send it within a few business days via PayPal, bank transfer, or your preferred method."
            />
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
              Everything you need to grow a book of business
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            <Feature
              icon={<Zap className="w-5 h-5 text-emerald-500" />}
              title="Live partner dashboard"
              body="See active restaurants, MRR, commission balance, and your tier in real time."
            />
            <Feature
              icon={<Globe className="w-5 h-5 text-emerald-500" />}
              title="Your own referral link"
              body="Personal signup URL automatically attributes restaurants to you when they sign up."
            />
            <Feature
              icon={<Users className="w-5 h-5 text-emerald-500" />}
              title="Direct restaurant invites"
              body="Skip the link — invite restaurants by email. They get an account, you get the attribution."
            />
            <Feature
              icon={<ShieldCheck className="w-5 h-5 text-emerald-500" />}
              title="Log in as your restaurants"
              body="Help your restaurants set up, troubleshoot, or just check on them — without sharing passwords."
            />
            <Feature
              icon={<DollarSign className="w-5 h-5 text-emerald-500" />}
              title="Transparent commissions"
              body="Every commission row shows which restaurant, which invoice, what rate, and what amount. No black boxes."
            />
            <Feature
              icon={<TrendingUp className="w-5 h-5 text-emerald-500" />}
              title="Retroactive at every tier"
              body="Hit 5 restaurants — every restaurant under you starts earning 5%, not just the new one. Same retroactive jump at 26 (10%) and 50 (15%)."
            />
          </div>
        </div>
      </section>

      {/* Growing platform = growing commissions.
          Luigi 2026-05-28: a major selling point partners need to hear is
          that the platform isn't static. New paid add-ons ship constantly,
          and every new add-on is one more attach-revenue lever — meaning
          the same roster of restaurants generates MORE commission over
          time without partners having to re-sell anything.
          Designed to set expectations: "your earning ceiling rises faster
          than your effort does." */}
      <section className="py-20 px-4 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 text-white">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-emerald-500/20 text-emerald-200 rounded-full px-4 py-1.5 text-xs uppercase tracking-wider font-bold mb-4">
              <Rocket className="w-3.5 h-3.5" /> Built for compounding partners
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Your commission ceiling keeps rising.
            </h2>
            <p className="text-emerald-100 max-w-3xl mx-auto text-lg leading-relaxed">
              We&apos;re shipping new paid features constantly — based on what restaurants actually
              ask for. Every add-on we launch is one more thing your restaurants can subscribe to,
              and one more commission line on your monthly statement. <strong className="text-white">Same roster, more revenue
              — automatically.</strong>
            </p>
          </div>

          {/* Three-column timeline: shipped / in-progress / planned.
              Numbers are deliberate — we want partners to see the
              trajectory: ~6 today, ~12 by year-end. Doubling the
              attach surface roughly doubles the per-restaurant ceiling. */}
          <div className="grid md:grid-cols-3 gap-5 mb-10">
            <GrowthCard
              tone="emerald"
              icon={<CheckCircle2 className="w-5 h-5" />}
              label="Live today"
              count="6+ paid add-ons"
              body="Online Payments, Hosted Website, Custom Domain, Multi-Location, Advanced Promotions, Reservation Deposits, Marketplace, Driver Pool, Unlimited Orders, and more. Every one of them attaches commission to your name."
            />
            <GrowthCard
              tone="amber"
              icon={<Hammer className="w-5 h-5" />}
              label="In development"
              count="3 more shipping soon"
              body="Loyalty + rewards, advanced kitchen display (Toast/Square-style KDS), SMS marketing automation. Currently being built — your restaurants get them automatically when they launch."
              highlight
            />
            <GrowthCard
              tone="slate"
              icon={<Package className="w-5 h-5" />}
              label="On the roadmap"
              count="6+ more requested"
              body="Online catering portal, gift cards, inventory tracking, table-management upgrades, POS integrations, AI menu optimization. Restaurants ask, we build, you earn."
            />
          </div>

          {/* Bottom-line stat — gives partners a tangible number to anchor on */}
          <div className="rounded-2xl bg-white/5 border border-white/10 backdrop-blur p-6 max-w-3xl mx-auto">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-6 h-6 text-emerald-300" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider font-bold text-emerald-300 mb-1">
                  The compounding effect
                </div>
                <p className="text-sm md:text-base text-emerald-50 leading-relaxed">
                  Today, a restaurant on all paid add-ons spends ~$150/mo. By the time we&apos;ve
                  doubled our add-on catalog (planned by end of 2026), that same restaurant&apos;s
                  add-on ceiling roughly <strong className="text-white">doubles</strong> — and
                  so does your commission per account.{" "}
                  <strong className="text-white">
                    Sell once. Earn more every year as we ship.
                  </strong>
                </p>
              </div>
            </div>
          </div>

          {/* Reinforces the sales angle */}
          <p className="text-center text-xs text-emerald-200/70 mt-6 max-w-2xl mx-auto leading-relaxed">
            Easy to sell, easier to retain: restaurants stay because we&apos;re always
            shipping the next thing they need. You don&apos;t need to re-sell — you just
            keep collecting on the same roster as it grows.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4 bg-gray-50">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-10 text-center">
            Frequently asked questions
          </h2>
          <div className="space-y-3">
            <Faq q="What counts as an 'active paying' restaurant?">
              A restaurant that has paid at least one invoice (plan or paid add-on) in the
              last 35 days. Restaurants on the FREE plan don&apos;t count toward your tier
              until they upgrade to FREE Unlimited Orders or subscribe to at least one
              paid add-on.
            </Faq>
            <Faq q="How do the tiers work?">
              Four tiers: <strong>0% (0–4 active)</strong>, <strong>5% (5–25)</strong>, <strong>10% (26–50)</strong>,
              <strong> 15% (51+)</strong>. Each restaurant needs at least one paid add-on to count toward your tier.
              When you cross a threshold, the new rate applies retroactively to every restaurant in your roster — not
              just the new one.
            </Faq>
            <Faq q="When do I start earning?">
              Commissions are calculated on each paid subscription invoice your restaurants generate. There's a 7-day
              hold per invoice (in case of refund or chargeback), then it becomes available for payout.
            </Faq>
            <Faq q="What if a restaurant cancels?">
              Commissions you've already earned stay yours (after the 7-day hold). You just stop earning on that
              restaurant going forward. If they come back, commission resumes.
            </Faq>
            <Faq q="How do payouts work?">
              When your available balance reaches $50, you request a payout from your dashboard. We approve and send
              it manually via PayPal, bank transfer, or whatever method you prefer.
            </Faq>
            <Faq q="Is there a contract or commitment?">
              No fixed-term contract. You can stop bringing on restaurants whenever — your existing commission tail
              keeps paying as long as those restaurants remain active.
            </Faq>
            <Faq q="Can I be both a reseller and a restaurant owner?">
              Yes. Use <strong>different email addresses</strong> for each account — one for your restaurant,
              one for your reseller account. Log in with whichever email matches what you want to do. Your own
              restaurant <strong>doesn't count</strong> toward your reseller tier (no self-referrals — we flag and
              remove any). This mirrors how other partner programs handle the same case.
            </Faq>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 bg-gradient-to-r from-emerald-500 to-emerald-700 text-white text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to start earning?</h2>
        <p className="text-emerald-100 text-lg mb-8 max-w-xl mx-auto">
          Application takes 2 minutes. Review takes 1–2 business days. After that, you're live.
        </p>
        <Link
          href="/partners/apply"
          className="bg-white text-emerald-600 font-bold px-10 py-4 rounded-xl text-lg hover:bg-emerald-50 transition inline-flex items-center gap-2"
        >
          Apply now <ArrowRight className="w-5 h-5" />
        </Link>
      </section>

      <PublicFooter />
    </div>
  );
}

function TierCard({
  rate,
  range,
  tone,
  body,
  highlight,
}: {
  rate: string;
  range: string;
  tone: "gray" | "orange" | "green";
  body: string;
  highlight?: boolean;
}) {
  const tones: Record<string, string> = {
    gray: "bg-white border-gray-200",
    orange: "bg-emerald-50 border-emerald-300",
    green: "bg-green-50 border-green-300",
  };
  const accent: Record<string, string> = {
    gray: "text-gray-700",
    orange: "text-emerald-700",
    green: "text-green-700",
  };
  return (
    <div
      className={`rounded-2xl border p-6 ${tones[tone]} ${
        highlight ? "ring-2 ring-emerald-400 ring-offset-2 shadow-md" : ""
      }`}
    >
      <div className={`text-5xl font-bold mb-2 ${accent[tone]}`}>{rate}</div>
      <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">{range}</div>
      <p className="text-sm text-gray-600">{body}</p>
    </div>
  );
}

/**
 * Restaurant-count tier card. Shown above the earnings matrix to set
 * expectations for what commission rate applies at each portfolio size.
 */
function EarningsTierCard({
  count, rate, note, highlight,
}: {
  count: string;
  rate: string;
  note: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-6 ${
        highlight
          ? "bg-gradient-to-br from-emerald-600 to-slate-900 text-white border-transparent shadow-lg"
          : "bg-white border-gray-200"
      }`}
    >
      <div className={`text-xs uppercase tracking-wider font-bold mb-2 ${highlight ? "text-emerald-100" : "text-gray-500"}`}>
        {count}
      </div>
      <div className={`text-4xl font-extrabold mb-1 ${highlight ? "text-white" : "text-emerald-600"}`}>
        {rate}
      </div>
      <div className={`text-xs ${highlight ? "text-emerald-100" : "text-gray-500"} mb-3`}>
        commission rate
      </div>
      <p className={`text-xs leading-relaxed ${highlight ? "text-emerald-50" : "text-gray-600"}`}>{note}</p>
    </div>
  );
}

/**
 * Single row of the earnings matrix. Computes monthly commission across
 * three portfolio sizes given per-restaurant add-on spend.
 *
 * Column rates mirror the 4-tier system but only 3 columns are shown
 * (10 / 30 / 50+ restaurants) — 10 falls in tier1 (5%), 30 in tier2
 * (10%), 50+ in tier3 (15%). The 0% tier (0-4 restaurants) isn't shown
 * since those resellers don't earn commission yet.
 */
function EarningsRow({
  scenario, scenarioDetail, perRestaurant, highlightMid,
}: {
  scenario: string;
  scenarioDetail: string;
  perRestaurant: number;
  highlightMid?: boolean;
}) {
  const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const row = (n: number, rate: number) => fmt(perRestaurant * n * rate);
  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="px-4 py-4 align-top">
        <div className="font-bold text-gray-900">{scenario}</div>
        <div className="text-xs text-gray-500 mt-1 leading-relaxed">{scenarioDetail}</div>
      </td>
      <td className="px-4 py-4 text-right align-top text-gray-900">
        <div className="text-lg font-bold">{row(10, 0.05)}<span className="text-xs font-normal text-gray-500">/mo</span></div>
        <div className="text-xs text-gray-400">{fmt(perRestaurant * 10 * 0.05 * 12)}/yr</div>
      </td>
      <td className={`px-4 py-4 text-right align-top ${highlightMid ? "bg-emerald-50" : ""}`}>
        <div className={`text-lg font-bold ${highlightMid ? "text-emerald-700" : "text-gray-900"}`}>
          {row(30, 0.10)}<span className="text-xs font-normal text-gray-500">/mo</span>
        </div>
        <div className={`text-xs ${highlightMid ? "text-emerald-600" : "text-gray-400"}`}>
          {fmt(perRestaurant * 30 * 0.10 * 12)}/yr
        </div>
      </td>
      <td className="px-4 py-4 text-right align-top">
        <div className="text-lg font-bold text-emerald-700">{row(50, 0.15)}<span className="text-xs font-normal text-gray-500">/mo</span></div>
        <div className="text-xs text-emerald-600">{fmt(perRestaurant * 50 * 0.15 * 12)}/yr</div>
      </td>
    </tr>
  );
}

function Step({
  n,
  icon,
  title,
  body,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm relative">
      <div className="absolute -top-3 -left-3 w-8 h-8 bg-emerald-500 text-white rounded-full flex items-center justify-center font-bold text-sm shadow">
        {n}
      </div>
      <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center mb-3 mt-1">
        {icon}
      </div>
      <h3 className="font-bold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-600">{body}</p>
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="font-bold text-gray-900 mb-1">{title}</h3>
        <p className="text-sm text-gray-600">{body}</p>
      </div>
    </div>
  );
}

/**
 * Card for the "your commission ceiling keeps rising" section.
 * Dark-themed (sits on slate-900 background) with a small icon, status
 * label, headline count, and supporting copy. The `highlight` variant
 * adds a glowing border to draw the eye to "in development" — the
 * tense partners care most about (what's coming soon).
 */
function GrowthCard({
  tone, icon, label, count, body, highlight,
}: {
  tone: "emerald" | "amber" | "slate";
  icon: React.ReactNode;
  label: string;
  count: string;
  body: string;
  highlight?: boolean;
}) {
  const tones: Record<string, { bg: string; iconBg: string; iconText: string; labelText: string; countText: string }> = {
    emerald: {
      bg: "bg-emerald-500/10 border-emerald-400/30",
      iconBg: "bg-emerald-500/20",
      iconText: "text-emerald-300",
      labelText: "text-emerald-300",
      countText: "text-white",
    },
    amber: {
      bg: "bg-amber-500/10 border-amber-400/40",
      iconBg: "bg-amber-500/20",
      iconText: "text-amber-300",
      labelText: "text-amber-300",
      countText: "text-white",
    },
    slate: {
      bg: "bg-white/5 border-white/10",
      iconBg: "bg-white/10",
      iconText: "text-slate-200",
      labelText: "text-slate-300",
      countText: "text-white",
    },
  };
  const t = tones[tone];
  return (
    <div
      className={`rounded-2xl border p-6 backdrop-blur transition ${t.bg} ${
        highlight ? "ring-2 ring-amber-300/40 shadow-lg shadow-amber-500/10" : ""
      }`}
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 ${t.iconBg} ${t.iconText}`}>
        {icon}
      </div>
      <div className={`text-xs uppercase tracking-wider font-bold mb-1 ${t.labelText}`}>{label}</div>
      <div className={`text-2xl font-extrabold mb-3 ${t.countText}`}>{count}</div>
      <p className="text-sm text-slate-200 leading-relaxed">{body}</p>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="bg-white rounded-xl border border-gray-100 shadow-sm group">
      <summary className="px-5 py-4 cursor-pointer font-semibold text-gray-900 list-none flex items-center justify-between">
        <span>{q}</span>
        <span className="text-gray-400 group-open:rotate-45 transition-transform text-xl leading-none">+</span>
      </summary>
      <div className="px-5 pb-4 text-sm text-gray-600">{children}</div>
    </details>
  );
}
