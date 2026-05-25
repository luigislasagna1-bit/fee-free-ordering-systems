"use client";
import Link from "next/link";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import {
  ArrowRight, Check, Zap, Globe, Smartphone, ShoppingBag, CreditCard,
  Bell, MapPin, ChefHat, Languages, Sparkles, Target, Users,
  TrendingUp, Award, Phone, Megaphone,
} from "lucide-react";

/**
 * Marketing homepage.
 *
 * Strategic positioning (refined with Luigi 2026-05-23, pivoted same day):
 *   We are NOT "the cheaper alternative to UberEats" — restaurants tuned
 *   that pitch out years ago, and they NEED UE/Skip/DoorDash for
 *   discoverability. We are also NOT "the anti-Uber" — that framing
 *   forces a false either/or choice the owner doesn't actually want.
 *
 *   The real angle: COMBINE. UberEats / Skip / DoorDash are decent at
 *   ONE thing — putting an independent restaurant in front of brand-new
 *   customers. They are terrible at everything else, while taking 30%.
 *   Fee Free is the missing piece: keep using them for reach, then
 *   convert customers to your own no-commission ordering platform for
 *   repeat business. Restaurant keeps more margin, customer pays less,
 *   the middleman is the only loser.
 *
 *   The thesis is bigger than UE. Pair Fee Free with ANY paid channel
 *   the owner already uses — UE, Skip, DoorDash, ChowNow, paid ads,
 *   Google Maps listings, etc. Fee Free is the ownership layer
 *   underneath all of them.
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
              Combine UberEats&apos; reach with{" "}
              <span className="text-emerald-600">Fee Free&apos;s ownership</span>.
            </h1>
            <p className="mt-5 text-lg text-gray-600 leading-relaxed max-w-xl">
              Keep using UberEats, Skip and DoorDash for what they&apos;re actually good at — putting new customers in front of you. Then use <strong>Fee Free</strong> to turn those one-time orders into lifelong direct customers. <strong>You</strong> own the relationship. <strong>You</strong> keep the margin. <strong>The customer</strong> pays less. The middleman is the only loser.
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
              <div className="relative h-72 sm:h-80 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50">
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
              THE STRATEGY — COMBINE, DON&apos;T CHOOSE
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4 leading-tight">
              Pair every paid channel with Fee Free.<br className="hidden md:block" />
              <span className="text-emerald-300">Maximize reach. Keep the margin.</span>
            </h2>
            <p className="text-gray-300 text-lg leading-relaxed">
              UberEats, Skip, DoorDash, ChowNow, paid ads, Google listings — they&apos;re all decent at <em>one</em> thing: putting your name in front of new customers. They&apos;re terrible at everything else, while taking up to 30%. <strong>Fee Free is the ownership layer underneath all of them.</strong> Keep the channels you already use for discovery, then convert customers to your own no-commission ordering platform for every order after the first.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                num: 1,
                title: "Keep using UberEats (and friends)",
                body: "Stay listed on UE/Skip/DoorDash exactly like you do today. Let them spend the marketing budget. Every first-time customer they bring you is a paid lead you didn't pay for upfront.",
                icon: Megaphone,
              },
              {
                num: 2,
                title: "Bridge them with a QR code",
                body: "Slip a thank-you card in every bag: \"Free dessert next time when you order DIRECT at marios.com\". One scan lands them on your Fee Free ordering page — owned by you, not Uber.",
                icon: Target,
              },
              {
                num: 3,
                title: "Repeat orders flow through Fee Free",
                body: "From order #2 onward they order on YOUR site. You keep 100%, no 30% cut. Same food, same prices, way more margin — and you can even pass some savings to the customer.",
                icon: TrendingUp,
              },
              {
                num: 4,
                title: "You own the customer — for life",
                body: "Name, email, phone, order history — yours. Send promos. Run loyalty rewards. Re-engage them whenever you want. Never pay a platform to talk to your own customer again.",
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
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-100 mb-2">DO THE MATH — DIRECT ORDERS</div>
            <p className="text-xl md:text-2xl font-bold text-white leading-tight">
              On a $50 order placed via your own ordering page:<br className="hidden md:block" />
              UberEats keeps $15. Fee Free keeps <span className="underline decoration-white/40">$0</span>.
            </p>
            <p className="text-emerald-50 mt-2 text-sm md:text-base">
              The customer pays the same — or less, if you choose to share the savings. The difference goes straight to <strong>your pocket</strong>, not the middleman&apos;s.
            </p>
          </div>

          {/* Everyone wins — the broader thesis. Luigi: "endless savings and
              benefits for everyone involved, customer, restaurant etc." The
              point isn't just that restaurants save — it's that the middleman
              is the ONLY entity that loses when channels are combined this way. */}
          <div className="mt-10">
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 bg-emerald-500/15 text-emerald-300 rounded-full px-3 py-1.5 text-xs font-semibold mb-3">
                <Users className="w-3.5 h-3.5" />
                EVERYONE WINS — EXCEPT THE MIDDLEMAN
              </div>
              <h3 className="text-2xl md:text-3xl font-bold text-white leading-tight">
                The whole point: combine channels so <em>both</em> sides come out ahead.
              </h3>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="rounded-xl bg-white/5 border border-white/10 p-5">
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-300 mb-2">
                  🏪 The restaurant wins
                </div>
                <ul className="text-sm text-gray-300 space-y-1.5 leading-relaxed">
                  <li>• Keep 100% of every direct order (vs 70%)</li>
                  <li>• Own the customer database forever</li>
                  <li>• Set your own prices, hours, promos</li>
                  <li>• Stay listed on UE/Skip for new-customer reach</li>
                </ul>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-5">
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-300 mb-2">
                  🍕 The customer wins
                </div>
                <ul className="text-sm text-gray-300 space-y-1.5 leading-relaxed">
                  <li>• Same food, lower checkout total (no platform markup)</li>
                  <li>• Direct loyalty rewards from the restaurant</li>
                  <li>• Real support from the actual restaurant — not a chatbot</li>
                  <li>• Money stays in the local community</li>
                </ul>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-5">
                <div className="text-xs font-bold uppercase tracking-wider text-amber-300 mb-2">
                  💸 The middleman loses
                </div>
                <ul className="text-sm text-gray-300 space-y-1.5 leading-relaxed">
                  <li>• Doesn&apos;t cook the food</li>
                  <li>• Doesn&apos;t answer the phone when something goes wrong</li>
                  <li>• Takes up to 30% per order for what — a listing?</li>
                  <li>• Owns your customer until you take them back</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Transparency block — what we actually charge for. Luigi:
              "we should be transparent. we DO charge a little on
              marketplace orders, and some add-ons are mandatory for
              QR ordering like the online payments." */}
          <div className="mt-6 grid md:grid-cols-2 gap-4 text-left">
            <div className="rounded-xl bg-white/5 border border-white/10 p-5">
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-300 mb-2">
                Direct orders (your website / widget)
              </div>
              <div className="text-2xl font-extrabold text-white">$0 forever</div>
              <p className="text-sm text-gray-300 mt-2 leading-relaxed">
                Every order placed through your own ordering page or hosted site. No commission, ever. The only cost is Stripe&apos;s standard card processing fee (2.9% + $0.30) — paid directly to Stripe, not to us.
              </p>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-5">
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-300 mb-2">
                Marketplace orders (feefreefood.com)
              </div>
              <div className="text-2xl font-extrabold text-white">
                $3 max <span className="text-sm text-gray-300 font-medium">or</span> $199.99/mo
              </div>
              <p className="text-sm text-gray-300 mt-2 leading-relaxed">
                Only when a customer finds you on our public marketplace. PAYG: $3 max per order, capped at <strong>$249.99/month</strong> no matter how many orders. Or flat <strong>$199.99/month unlimited</strong> — drops your per-order cost as you scale. Either way: 5× cheaper than UberEats / DoorDash.
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs text-gray-400 text-center max-w-2xl mx-auto leading-relaxed">
            Some optional add-ons cost extra (Online Payments $29.99/mo to accept cards, Hosted Website $19.99/mo, Multi-Location $49.99/mo per child site). Everything else — admin, widget, kitchen app, customer database — is genuinely free forever. <Link href="/pricing" className="text-emerald-300 hover:underline">See full pricing →</Link>
          </p>
        </div>
      </section>

      {/* ─── EVERYTHING INCLUDED — FEATURE GRID ───────────────────────────── */}
      <section className="py-20 px-4 bg-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 rounded-full px-3 py-1.5 text-xs font-semibold mb-4">
              <Check className="w-3.5 h-3.5" />
              CORE PLATFORM FREE FOREVER
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Everything you need, included.</h2>
            <p className="text-gray-600 text-lg">No tiers, no per-order fees on direct orders. The core platform is free forever — paid add-ons (cards, hosted site, multi-location) are optional, only when you need them.</p>
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
                    // Paid add-on — navy treatment (matches GloriaFood's
                    // contrast palette + visually distinguishes from the
                    // green FREE pills at a glance).
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-900 text-white px-2 py-0.5 rounded-full">{f.addon}</span>
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
            Add another discovery channel — at 5× lower cost.
          </h2>
          <p className="text-gray-300 text-base md:text-lg mb-6 max-w-2xl mx-auto leading-relaxed">
            The Fee Free Marketplace at <strong>feefreefood.com</strong> is one more reach channel to stack on top of UE/Skip/DoorDash. A growing directory of independent restaurants — we promote you, customers discover you. PAYG: at most <strong>$3/order</strong> capped at $249.99/month. Or go flat <strong>$199.99/month unlimited</strong>. Either way, still <strong>5× cheaper than UE / DoorDash</strong> — and zero commission on the orders that come through your own site.
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
              If you set up websites, POS systems, or run a restaurant-tech agency — sign up as a partner. Refer restaurants, earn recurring commissions on every paid add-on they subscribe to. <strong>Up to 15% lifetime revenue share</strong>, stacking across your whole portfolio.
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
            <div className="text-4xl font-extrabold text-emerald-600">15%</div>
            <div className="text-sm text-gray-500 mb-3">Lifetime commission (top tier)</div>
            <div className="text-xs text-gray-600 leading-relaxed">
              5% once you hit 5 active paying restaurants. <strong>10% at 26+</strong>, <strong>15% at 50+</strong>. Recurring — for as long as they stay subscribed. Stacks across your whole portfolio.
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
            <div className="text-lg text-gray-600 mb-1">Core platform · forever</div>
            <div className="text-xs text-gray-500 mb-6">No credit card to start. Add paid add-ons only when you need them.</div>
            <div className="grid sm:grid-cols-2 gap-2 text-left max-w-md mx-auto mb-7">
              {[
                "Unlimited orders on your site", "Unlimited menu items",
                "Customer database", "Kitchen + admin apps",
                "Cash + pay-at-store", "Multi-language",
              ].map((p) => (
                <div key={p} className="flex items-center gap-2 text-sm text-gray-700">
                  <Check className="w-4 h-4 text-emerald-500" />
                  {p}
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mb-5 leading-relaxed max-w-sm mx-auto">
              <strong>Need card payments?</strong> Online Payments add-on $29.99/mo unlocks Stripe Connect (you still keep 100% of each order). <strong>Want marketplace discovery?</strong> $3 max per order or $199.99/mo unlimited.
            </p>
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
            Combine your channels.<br />
            Keep your customers. Keep your margin.
          </h2>
          <p className="text-emerald-50 text-lg mb-8">
            Pair Fee Free with UberEats, Skip, DoorDash — whatever you already use. Set up takes 5 minutes. No credit card. No commission on direct orders. No catch.
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
