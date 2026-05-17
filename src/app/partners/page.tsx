import Link from "next/link";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { cookies } from "next/headers";
import {
  ArrowRight, TrendingUp, Users, Wallet, Zap, CheckCircle2,
  Calculator, DollarSign, Sparkles, Globe, ShieldCheck,
} from "lucide-react";

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
      <section className="bg-gradient-to-br from-orange-500 via-orange-500 to-red-600 text-white py-24 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-4 py-2 text-sm font-medium mb-6">
            <Sparkles className="w-4 h-4" /> Partner Program
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
            Earn recurring revenue<br />by bringing restaurants on board.
          </h1>
          <p className="text-xl text-orange-100 mb-10 max-w-2xl mx-auto">
            Every restaurant you sign up pays a monthly subscription. You earn up to
            10% of that — every month, for as long as they're active.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/partners/apply"
              className="bg-white text-orange-600 font-bold px-8 py-4 rounded-xl text-lg hover:bg-orange-50 transition flex items-center justify-center gap-2"
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
              Hit 6 active paying restaurants and every one of them starts earning you commission — retroactively.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <TierCard rate="0%" range="0–5 active" tone="gray" body="Building your portfolio. You're growing — keep going." />
            <TierCard
              rate="5%"
              range="6–49 active"
              tone="orange"
              highlight
              body="Hit 6 restaurants and you start earning commission on every one of them — including the first 5 retroactively."
            />
            <TierCard rate="10%" range="50+ active" tone="green" body="Hit 50 active restaurants and your rate doubles. Power-partner tier." />
          </div>
        </div>
      </section>

      {/* Earnings example */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-orange-100 text-orange-700 rounded-full px-4 py-1.5 text-xs uppercase tracking-wider font-bold mb-4">
              <Calculator className="w-3.5 h-3.5" /> Real numbers
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
              What does this actually pay?
            </h2>
            <p className="text-gray-600">Sample math at our $99/mo Pro plan.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <EarningsCard
              count={6}
              mrr={594}
              monthly={30}
              annual={357}
              rate={5}
            />
            <EarningsCard
              count={20}
              mrr={1980}
              monthly={99}
              annual={1188}
              rate={5}
              highlight
            />
            <EarningsCard
              count={50}
              mrr={4950}
              monthly={495}
              annual={5940}
              rate={10}
            />
          </div>
          <p className="text-center text-xs text-gray-500 mt-6">
            Commission is paid on net subscription revenue (excluding taxes, Stripe fees, refunds, and chargebacks).
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
              icon={<Zap className="w-5 h-5 text-orange-500" />}
              title="Live partner dashboard"
              body="See active restaurants, MRR, commission balance, and your tier in real time."
            />
            <Feature
              icon={<Globe className="w-5 h-5 text-orange-500" />}
              title="Your own referral link"
              body="Personal signup URL automatically attributes restaurants to you when they sign up."
            />
            <Feature
              icon={<Users className="w-5 h-5 text-orange-500" />}
              title="Direct restaurant invites"
              body="Skip the link — invite restaurants by email. They get an account, you get the attribution."
            />
            <Feature
              icon={<ShieldCheck className="w-5 h-5 text-orange-500" />}
              title="Log in as your restaurants"
              body="Help your restaurants set up, troubleshoot, or just check on them — without sharing passwords."
            />
            <Feature
              icon={<DollarSign className="w-5 h-5 text-orange-500" />}
              title="Transparent commissions"
              body="Every commission row shows which restaurant, which invoice, what rate, and what amount. No black boxes."
            />
            <Feature
              icon={<TrendingUp className="w-5 h-5 text-orange-500" />}
              title="Retroactive 5% on restaurant #6"
              body="Once you hit 6 active paying restaurants, every restaurant under you starts earning 5%, not just the new one."
            />
          </div>
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
              A restaurant whose subscription is currently <strong>active</strong> AND has paid at least one invoice in
              the last 35 days. Trials don't count until they convert to a paid subscription.
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
      <section className="py-20 px-4 bg-gradient-to-r from-orange-500 to-red-500 text-white text-center">
        <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to start earning?</h2>
        <p className="text-orange-100 text-lg mb-8 max-w-xl mx-auto">
          Application takes 2 minutes. Review takes 1–2 business days. After that, you're live.
        </p>
        <Link
          href="/partners/apply"
          className="bg-white text-orange-600 font-bold px-10 py-4 rounded-xl text-lg hover:bg-orange-50 transition inline-flex items-center gap-2"
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
    orange: "bg-orange-50 border-orange-300",
    green: "bg-green-50 border-green-300",
  };
  const accent: Record<string, string> = {
    gray: "text-gray-700",
    orange: "text-orange-700",
    green: "text-green-700",
  };
  return (
    <div
      className={`rounded-2xl border p-6 ${tones[tone]} ${
        highlight ? "ring-2 ring-orange-400 ring-offset-2 shadow-md" : ""
      }`}
    >
      <div className={`text-5xl font-bold mb-2 ${accent[tone]}`}>{rate}</div>
      <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">{range}</div>
      <p className="text-sm text-gray-600">{body}</p>
    </div>
  );
}

function EarningsCard({
  count,
  mrr,
  monthly,
  annual,
  rate,
  highlight,
}: {
  count: number;
  mrr: number;
  monthly: number;
  annual: number;
  rate: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-6 ${
        highlight
          ? "bg-gradient-to-br from-orange-500 to-red-500 text-white border-transparent shadow-lg"
          : "bg-white border-gray-200"
      }`}
    >
      <div className={`text-xs uppercase tracking-wider font-bold mb-2 ${highlight ? "text-orange-100" : "text-gray-500"}`}>
        {count} restaurants
      </div>
      <div className={`text-3xl font-bold mb-1 ${highlight ? "text-white" : "text-gray-900"}`}>
        ${monthly.toLocaleString()}<span className={`text-base font-normal ${highlight ? "text-orange-100" : "text-gray-500"}`}>/mo</span>
      </div>
      <div className={`text-xs mb-4 ${highlight ? "text-orange-100" : "text-gray-500"}`}>
        ${annual.toLocaleString()}/year at {rate}% on ${mrr.toLocaleString()} MRR
      </div>
      <div className={`flex items-center gap-1.5 text-xs ${highlight ? "text-orange-100" : "text-gray-500"}`}>
        <CheckCircle2 className="w-3.5 h-3.5" /> Recurring monthly
      </div>
    </div>
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
      <div className="absolute -top-3 -left-3 w-8 h-8 bg-orange-500 text-white rounded-full flex items-center justify-center font-bold text-sm shadow">
        {n}
      </div>
      <div className="w-10 h-10 bg-orange-100 text-orange-600 rounded-lg flex items-center justify-center mb-3 mt-1">
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
      <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="font-bold text-gray-900 mb-1">{title}</h3>
        <p className="text-sm text-gray-600">{body}</p>
      </div>
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
