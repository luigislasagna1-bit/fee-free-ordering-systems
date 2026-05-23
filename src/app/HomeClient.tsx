"use client";
import Link from "next/link";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import {
  ArrowRight, Check, Zap, Globe, Smartphone, ShoppingBag, CreditCard,
  Bell, MapPin, ChefHat, Languages, Sparkles, Target, Users,
  TrendingDown, TrendingUp, Award, Phone, Megaphone,
} from "lucide-react";

/**
 * Marketing homepage.
 *
 * Strategic positioning (settled with Luigi 2026-05-23):
 *   We are NOT "the cheaper alternative to UberEats." Restaurants have
 *   heard "stop using UE" 100 times and tuned it out — they need UE for
 *   discoverability. Our angle is sharper: USE UE/DD/Skip as your
 *   marketing budget, then convert those customers to your own
 *   no-commission ordering platform. The first customer order on UE
 *   is the cost of acquiring them; every reorder direct = pure margin.
 *
 * Page structure (GloriaFood-inspired, single-color emerald + neutrals):
 *   1. Hero — laser-focused headline + 1 CTA + visual
 *   2. The Story — 4-step narrative (the new angle)
 *   3. Everything Included — feature grid
 *   4. Long-form sections — each major feature gets its own callout
 *   5. Marketplace teaser (collapsed, link to dedicated page)
 *   6. Reseller program (with link to /partners)
 *   7. Pricing summary (links to /pricing for details)
 *   8. Final CTA
 *
 * Translations: most of this page is hardcoded English on purpose. The
 * old translation keys didn't match the new copy, and rewriting them
 * for en+fr+es+it+pt would block this commit. i18n in a follow-up;
 * for now English is the pre-launch surface anyway.
 */
export function HomeClient({ locale }: { locale: string }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav currentLocale={locale} />

      {/* ─── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-white">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-white to-white pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-4 py-16 md:py-24 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 rounded-full px-3 py-1.5 text-xs font-semibold mb-5">
              <Target className="w-3.5 h-3.5" />
              FOR RESTAURANT OWNERS
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-[1.05] tracking-tight">
              Stop letting Uber take <span className="text-emerald-600">30%</span>.{" "}
              Use them to grow your business instead.
            </h1>
            <p className="mt-5 text-lg text-gray-600 leading-relaxed max-w-xl">
              Fee Free Ordering turns the platforms taking your margin into a customer-acquisition channel. Get your own ordering site, keep <strong>100% of repeat orders</strong>, and build a customer database that&apos;s actually yours.
            </p>
            <div className="mt-7 flex flex-col sm:flex-row gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-2 bg-emerald-500 text-white font-bold px-7 py-3.5 rounded-xl text-base hover:bg-emerald-600 transition shadow-md hover:shadow-lg"
              >
                Start Free — 5 min setup
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/demo"
                className="inline-flex items-center justify-center gap-2 text-emerald-700 font-bold px-7 py-3.5 rounded-xl text-base hover:bg-emerald-50 transition border-2 border-emerald-200"
              >
                See it in action
              </Link>
            </div>
            <div className="mt-6 flex items-center gap-6 text-xs text-gray-500">
              <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500" />No credit card</div>
              <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500" />No commission</div>
              <div className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500" />Cancel anytime</div>
            </div>
          </div>

          {/* Hero visual — mock browser frame showing the order widget on a restaurant site */}
          <div className="relative">
            <div className="rounded-2xl border-2 border-gray-200 bg-white shadow-2xl overflow-hidden">
              <div className="flex items-center gap-1.5 px-3 py-2 bg-gray-100 border-b border-gray-200">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <div className="ml-2 text-[10px] text-gray-400 truncate">marioslittleitaly.com</div>
              </div>
              <div className="relative h-72 sm:h-80 bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50">
                <div className="absolute inset-0 p-5 text-gray-300">
                  <div className="h-3 w-32 bg-gray-200 rounded mb-2" />
                  <div className="h-2 w-48 bg-gray-100 rounded mb-1" />
                  <div className="h-2 w-40 bg-gray-100 rounded mb-1" />
                  <div className="h-2 w-44 bg-gray-100 rounded mb-3" />
                  <div className="h-24 w-full bg-gray-100 rounded mb-2" />
                  <div className="h-2 w-32 bg-gray-100 rounded" />
                </div>
                <div className="absolute bottom-5 right-5">
                  <button
                    type="button"
                    disabled
                    className="text-white font-bold shadow-2xl"
                    style={{
                      background: "#10b981",
                      padding: "16px 32px",
                      fontSize: "16px",
                      borderRadius: "10px",
                      border: 0,
                      minWidth: "180px",
                      letterSpacing: "0.02em",
                    }}
                  >
                    See MENU &amp; Order
                  </button>
                </div>
              </div>
            </div>
            <div className="absolute -top-3 -right-3 bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg rotate-3">
              0% commission
            </div>
          </div>
        </div>
      </section>

      {/* ─── THE PITCH (4-step narrative) ─────────────────────────────────── */}
      <section className="bg-gray-900 text-white py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="max-w-3xl mb-12">
            <div className="inline-flex items-center gap-2 bg-emerald-500/15 text-emerald-300 rounded-full px-3 py-1.5 text-xs font-semibold mb-4">
              <Sparkles className="w-3.5 h-3.5" />
              THE STRATEGY
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 leading-tight">
              Turn UberEats into your $0 marketing department.
            </h2>
            <p className="text-gray-300 text-lg leading-relaxed">
              Restaurants HATE losing 30% to UE/Skip/DoorDash. But those platforms are also how new customers find you. The smart play: let them bring you customers — then convert those customers to your own platform where you keep <strong>everything</strong>.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                num: 1,
                title: "Customer discovers you on Uber",
                body: "First order comes in via UberEats. UE keeps 30%, you keep 70%. Treat this like a paid ad — the cost of customer acquisition.",
                icon: TrendingDown,
              },
              {
                num: 2,
                title: "Slip a QR code in the bag",
                body: "Custom-printed thank-you card: \"Free dessert next time when you order DIRECT at marios.com\". Customer scans → lands on your Fee Free ordering page.",
                icon: Megaphone,
              },
              {
                num: 3,
                title: "They reorder direct",
                body: "Customer orders again — but this time on YOUR site via Fee Free. You keep 100%. No commission, no markup, no middleman.",
                icon: TrendingUp,
              },
              {
                num: 4,
                title: "You own the relationship",
                body: "Email, phone, order history — yours. Send promos directly. Build loyalty. Never pay another platform to talk to your own customer.",
                icon: Award,
              },
            ].map((step) => (
              <div key={step.num} className="rounded-xl bg-white/5 border border-white/10 p-6">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500 text-gray-900 font-extrabold flex items-center justify-center text-lg">
                    {step.num}
                  </div>
                  <step.icon className="w-5 h-5 text-emerald-300" />
                </div>
                <h3 className="font-bold text-white text-base mb-2">{step.title}</h3>
                <p className="text-sm text-gray-300 leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>

          {/* The math callout */}
          <div className="mt-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 md:p-8 text-center">
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-100 mb-2">DO THE MATH</div>
            <p className="text-xl md:text-2xl font-bold text-white leading-tight">
              On a $50 order: UberEats keeps $15. Fee Free keeps <span className="underline decoration-white/40">$0</span>.
            </p>
            <p className="text-emerald-50 mt-2 text-sm md:text-base">
              The customer pays the same either way. The difference goes straight to your pocket.
            </p>
          </div>
        </div>
      </section>

      {/* ─── EVERYTHING INCLUDED — FEATURE GRID ───────────────────────────── */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 rounded-full px-3 py-1.5 text-xs font-semibold mb-4">
              <Check className="w-3.5 h-3.5" />
              ALL FREE FOREVER
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Everything you need, included.</h2>
            <p className="text-gray-600 text-lg">No tiers, no per-order fees, no hidden charges. The whole platform is free forever — paid add-ons are optional.</p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: ShoppingBag, title: "Ordering Widget", body: "Drop a snippet on your existing site. Customers click, order, you collect.", free: true },
              { icon: Globe,       title: "Hosted Website",   body: "Don't have a site? Auto-generated marketing page at your-name.feefreeordering.com.", free: false, addon: "$19.99/mo" },
              { icon: ChefHat,     title: "Kitchen App",      body: "Touch-friendly order display. Print receipts, accept/reject orders, manage prep times.", free: true },
              { icon: CreditCard,  title: "Online Payments",  body: "Stripe Connect. Money lands in YOUR account directly. We never touch it.", free: false, addon: "$29.99/mo" },
              { icon: Bell,        title: "Notifications",    body: "Email + browser notifications for every new order. Never miss a sale.", free: true },
              { icon: MapPin,      title: "Delivery Zones",   body: "Define your own delivery radius + fees. Auto-calculated at checkout.", free: true },
              { icon: Smartphone,  title: "Mobile Friendly",  body: "The whole platform works on phones — customer ordering, kitchen display, admin.", free: true },
              { icon: Languages,   title: "Multi-Language",   body: "Customer ordering page in 5 languages — English, French, Spanish, Italian, Portuguese.", free: true },
              { icon: Users,       title: "Customer Database", body: "Every order builds your customer list. Names, emails, order history — yours forever.", free: true },
            ].map((f) => (
              <div key={f.title} className="rounded-xl border border-gray-200 bg-white p-5 hover:border-emerald-200 hover:shadow-md transition">
                <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center mb-3">
                  <f.icon className="w-5 h-5" />
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-gray-900">{f.title}</h3>
                  {f.free ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">FREE</span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full">{f.addon}</span>
                  )}
                </div>
                <p className="text-sm text-gray-600 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-10">
            <Link href="/features" className="inline-flex items-center gap-1.5 text-emerald-700 font-bold hover:underline">
              See all features
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ─── LONG-FORM SECTION: ORDERING WIDGET ───────────────────────────── */}
      <section className="py-20 px-4 bg-emerald-50/40">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-3">YOUR EXISTING WEBSITE</div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 leading-tight">
              Already have a website? Add one line of code.
            </h2>
            <p className="text-lg text-gray-600 mb-6 leading-relaxed">
              Paste our snippet into your Wix, Squarespace, WordPress, Shopify, or plain HTML site. A polished &quot;See MENU &amp; Order&quot; button appears — click it and your full ordering experience opens in a beautiful modal. Customer never leaves your site.
            </p>
            <ul className="space-y-3 mb-7">
              {[
                "Customize button text, color, and position",
                "Works on every major website builder",
                "Customers stay on YOUR domain",
                "Mobile-friendly, no app to install",
              ].map((b) => (
                <li key={b} className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-3 h-3" />
                  </div>
                  <span className="text-gray-700">{b}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 bg-emerald-500 text-white font-bold px-6 py-3 rounded-xl hover:bg-emerald-600 transition"
            >
              Try it free <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          {/* Visual: code snippet preview */}
          <div className="rounded-xl bg-gray-900 overflow-hidden border border-gray-800 shadow-xl">
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-800 border-b border-gray-700">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              </div>
              <span className="text-xs text-gray-400 font-mono">paste-into-your-site.html</span>
            </div>
            <pre className="p-5 text-xs text-emerald-300 font-mono leading-relaxed overflow-x-auto">
{`<!-- Fee Free Ordering widget -->
<script src="https://feefreeordering.com/embed/widget.js"
        data-restaurant="wgt_yourID"
        async defer></script>

<!-- That's it. -->`}
            </pre>
          </div>
        </div>
      </section>

      {/* ─── LONG-FORM SECTION: KITCHEN APP ───────────────────────────────── */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div className="lg:order-2">
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-3">KITCHEN OPERATIONS</div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 leading-tight">
              Touch-friendly order display, built for the rush.
            </h2>
            <p className="text-lg text-gray-600 mb-6 leading-relaxed">
              Mount a tablet in your kitchen. Orders show up the moment a customer pays. Accept, set prep time, print receipt — all without taking your gloves off.
            </p>
            <ul className="space-y-3 mb-7">
              {[
                "Loud bell + visual alert on every new order",
                "Star + Epson receipt printer support",
                "Auto-reject stale orders + auto-refund cards",
                "Multi-station mode for big kitchens",
              ].map((b) => (
                <li key={b} className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Check className="w-3 h-3" />
                  </div>
                  <span className="text-gray-700">{b}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Visual: kitchen display mockup */}
          <div className="lg:order-1 rounded-2xl bg-gray-900 p-4 shadow-xl border border-gray-800">
            <div className="rounded-xl bg-gray-950 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400 font-bold">
                  <ChefHat className="w-5 h-5" />
                  Kitchen Display
                </div>
                <div className="text-xs text-gray-500">2 new orders</div>
              </div>
              <div className="p-3 space-y-2">
                {[
                  { num: "#ORD-839442", name: "Sarah K.", total: "$24.50", status: "PENDING", urgent: true },
                  { num: "#ORD-839438", name: "Mike P.", total: "$18.99", status: "ACCEPTED", urgent: false },
                  { num: "#ORD-839429", name: "Jenny T.", total: "$32.00", status: "PREPARING", urgent: false },
                ].map((o) => (
                  <div key={o.num} className={`rounded-lg p-3 ${o.urgent ? "bg-emerald-500/15 border border-emerald-500/30" : "bg-gray-800/50"}`}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className={`font-bold ${o.urgent ? "text-emerald-300" : "text-gray-300"}`}>{o.num}</span>
                      <span className="text-gray-400">{o.total}</span>
                    </div>
                    <div className="text-xs text-gray-400">{o.name} · <span className={o.urgent ? "text-emerald-400 font-semibold" : ""}>{o.status}</span></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── MARKETPLACE TEASER (collapsed, link to dedicated page) ───────── */}
      <section className="py-16 px-4 bg-gray-900 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-500/15 text-emerald-300 rounded-full px-3 py-1.5 text-xs font-semibold mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            DISCOVERABILITY
          </div>
          <h2 className="text-2xl md:text-3xl font-bold mb-3 leading-tight">
            Want even more customers? List on the Fee Free Marketplace.
          </h2>
          <p className="text-gray-300 text-base md:text-lg mb-6 max-w-2xl mx-auto leading-relaxed">
            A growing directory of fee-free restaurants. We promote you on feefreefood.com — customers discover you, you keep <strong>99%</strong> of every order (we take just $3/order to cover infrastructure). No 30% commission. Ever.
          </p>
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 bg-emerald-500 text-white font-bold px-6 py-3 rounded-xl hover:bg-emerald-600 transition"
          >
            See how the marketplace works
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* ─── RESELLER PROGRAM ─────────────────────────────────────────────── */}
      <section className="py-16 px-4 bg-emerald-50/40">
        <div className="max-w-5xl mx-auto grid md:grid-cols-[2fr_1fr] gap-8 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 rounded-full px-3 py-1.5 text-xs font-semibold mb-4">
              <Users className="w-3.5 h-3.5" />
              PARTNER PROGRAM
            </div>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3 leading-tight">
              Already help restaurants with their tech?
            </h2>
            <p className="text-gray-600 text-base md:text-lg leading-relaxed mb-5">
              If you set up websites, POS systems, or run a restaurant-tech agency — sign up as a partner. Refer restaurants, earn recurring commissions on every paid add-on they subscribe to. Up to 30% lifetime revenue share.
            </p>
            <Link
              href="/partners"
              className="inline-flex items-center gap-2 text-emerald-700 font-bold hover:underline"
            >
              Learn about the partner program
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="bg-white rounded-2xl border-2 border-emerald-200 p-6 shadow-md">
            <div className="text-4xl font-extrabold text-emerald-600">30%</div>
            <div className="text-sm text-gray-500 mb-3">Lifetime commission</div>
            <div className="text-xs text-gray-600 leading-relaxed">
              On every paying restaurant you refer — for as long as they stay subscribed. Stacks across your whole portfolio.
            </div>
          </div>
        </div>
      </section>

      {/* ─── PRICING SUMMARY ──────────────────────────────────────────────── */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 rounded-full px-3 py-1.5 text-xs font-semibold mb-4">
            <Zap className="w-3.5 h-3.5" />
            PRICING
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3 leading-tight">
            Free to start. Pay only for what you actually use.
          </h2>
          <p className="text-gray-600 text-lg mb-10">
            The core platform — admin, ordering widget, kitchen app, customer accounts — is free forever. Add paid add-ons only when you need them.
          </p>
          <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-white to-emerald-50 p-8 md:p-10 shadow-md">
            <div className="text-5xl md:text-6xl font-extrabold text-emerald-600 mb-2">$0</div>
            <div className="text-lg text-gray-600 mb-6">Forever. No credit card required.</div>
            <div className="grid sm:grid-cols-2 gap-2 text-left max-w-md mx-auto mb-7">
              {[
                "Unlimited orders", "Unlimited menu items",
                "Customer database", "Kitchen + admin apps",
                "Cash + pay-at-store", "Multi-language",
              ].map((p) => (
                <div key={p} className="flex items-center gap-2 text-sm text-gray-700">
                  <Check className="w-4 h-4 text-emerald-500" />
                  {p}
                </div>
              ))}
            </div>
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 bg-emerald-500 text-white font-bold px-7 py-3.5 rounded-xl hover:bg-emerald-600 transition shadow-md"
            >
              Start free <ArrowRight className="w-4 h-4" />
            </Link>
            <div className="mt-5">
              <Link href="/pricing" className="text-sm text-emerald-700 hover:underline">
                See all add-ons + pricing
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA ────────────────────────────────────────────────────── */}
      <section className="py-20 px-4 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4 leading-tight">
            Your customers found you on Uber.<br />
            Now keep them for yourself.
          </h2>
          <p className="text-emerald-50 text-lg mb-8">
            Set up takes 5 minutes. No credit card. No commission. No catch.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 bg-white text-emerald-700 font-bold px-8 py-3.5 rounded-xl text-base hover:bg-emerald-50 transition shadow-md"
            >
              Start Free <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/demo"
              className="inline-flex items-center justify-center gap-2 text-white font-bold px-8 py-3.5 rounded-xl text-base hover:bg-white/10 transition border-2 border-white/40"
            >
              <Phone className="w-4 h-4" />
              Book a 15 min demo
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
