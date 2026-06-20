"use client";
import Link from "next/link";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import {
  ArrowRight, Target, Users, Tag, QrCode, Store, Pizza, Upload, Repeat,
  CreditCard, Globe, Building2, Infinity as InfinityIcon, Link2, Truck, Smartphone, Monitor, Phone, CalendarCheck,
  BellRing, PhoneCall, RefreshCw, ShieldCheck, Receipt, ScanLine, BarChart3, Database, TrendingUp, Headset,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  MarketingSection, SectionEyebrow, SectionHeading, PrimaryButton, SecondaryButton,
  ScreenshotFrame, StatTrustStrip, AltFeatureRow, IconFeatureGrid,
  NumberedSteps, CTASection, type IconFeature,
} from "@/components/marketing/sections";
import { FunnelGraphic } from "@/components/marketing/FunnelGraphic";
import { GrowthNetShowcase } from "@/components/marketing/GrowthNetShowcase";
import { PizzaSplitGraphic } from "@/components/marketing/PizzaSplitGraphic";
import { AppDownloadBadges } from "@/components/marketing/AppDownloadBadges";

/**
 * Marketing homepage — high-end LIGHT redesign (2026-06-20).
 *
 * Craft over colour: real product screenshots in clean frames, generous
 * whitespace, soft shadows, refined type. EXACT existing palette (emerald-500 +
 * gray/slate; amber/orange only as soft mockup bg). Light throughout — NO dark
 * sections. Hardcoded English (i18n later). "Highlights on the homepage,
 * exhaustive depth on /features."
 *
 * Coverage: this page now showcases the half-and-half pizza builder, the
 * never-miss-an-order kitchen reliability stack, the reports/CRM/promos suite,
 * GloriaFood/PDF menu migration, grouped integrations, and the (true,
 * code-backed) Canadian-built + 24/7 support positioning.
 *
 * SCREENSHOT SLOTS (capture from the polished demo into /public/marketing/screenshots/):
 *   ordering-home (browser,S1) · menu-item (phone,S3) · checkout (phone,S4)
 *   kitchen-tile (phone,S6) · reports-dashboard (browser,S7) · smartlink-analytics (browser,S8)
 *   menu-import (browser,S10) · storefront (browser,S13)
 */

/* À-la-carte add-ons (NOT GrowthNet members). Live first, coming-soon after. Price-light. */
const ADDONS: IconFeature[] = [
  { icon: CreditCard, title: "Online Payments", body: "Accept card payments online — money lands directly in your own Stripe or PayPal account." },
  { icon: Globe, title: "Sales-Optimized Website", body: "A hosted, SEO-ready marketing + ordering site, auto-built from your menu, on your own domain." },
  { icon: Building2, title: "Multi-Location", body: "Run several locations from one account — each with its own menu, orders and payments." },
  { icon: Store, title: "Marketplace listing", body: "Get discovered on the Fee Free marketplace — a low-cost new-customer channel, no 30% fees." },
  { icon: InfinityIcon, title: "Unlimited Orders", body: "Lift the free plan's 100-orders/month cap — unlimited volume, no per-order fees." },
  { icon: Link2, title: "Custom Domain", body: "Point your own domain at your hosted Fee Free site.", comingSoon: true },
  { icon: Truck, title: "Driver Pool", body: "Tap our Shipday driver network when your own drivers are busy.", comingSoon: true },
  { icon: Smartphone, title: "Branded Mobile App", body: "Your own native iOS + Android app in the App Store and Play Store.", comingSoon: true },
  { icon: Monitor, title: "POS Module", body: "In-house POS for staff to ring up dine-in and takeaway from the same admin.", comingSoon: true },
  { icon: Phone, title: "AI Phone Ordering", body: "An AI agent answers the phone and takes orders 24/7, straight to your kitchen.", comingSoon: true },
  { icon: CalendarCheck, title: "Reservation Deposits", body: "Charge a refundable deposit when customers book a table — protects against no-shows.", comingSoon: true },
];

/* "Never miss an order" — kitchen reliability safety-net. */
const RELIABILITY: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: BellRing, title: "Screen-off loud ring", body: "A full-screen alarm wakes the tablet the instant an order lands — even asleep." },
  { icon: PhoneCall, title: "Missed-order phone call", body: "If nobody taps Accept in ~90 seconds, we phone you and read the order aloud." },
  { icon: RefreshCw, title: "Auto-reject + auto-refund", body: "Unanswered orders auto-reject and the customer is refunded automatically." },
  { icon: ShieldCheck, title: "Charged only on accept", body: "Never cook an unpaid order — and never charge a customer for one you decline." },
  { icon: Receipt, title: "Custom branded receipts", body: "Design your own kitchen + customer tickets, reservation and end-of-day slips." },
  { icon: ScanLine, title: "One-tap printer setup", body: "“Find Printers” scans your WiFi and lists your thermal printer — no IP hunting." },
];

/* "Run the business" — reports + CRM + promos (free core). */
const RUN_BUSINESS: IconFeature[] = [
  { icon: BarChart3, title: "Reports dashboard", body: "Revenue, orders, average ticket and customers — with day-over-day trends." },
  { icon: Database, title: "Your customer list (CRM)", body: "Every customer, total spend, segments and CSV export. You own them — not an aggregator." },
  { icon: Tag, title: "Promotions engine", body: "13 promo types — BOGO, bundles, free items, coupons, timed deals. 5 free, guided wizard." },
  { icon: TrendingUp, title: "Sales insights & funnel", body: "Best and worst sellers, your online-ordering conversion funnel, a delivery heatmap." },
  { icon: Repeat, title: "One-click reorder", body: "Returning customers reorder their usual in a tap — more repeat orders, bigger tickets." },
  { icon: Users, title: "Customer accounts", body: "Saved addresses, order history and personal coupons keep diners coming back." },
];

const INTEGRATION_GROUPS: { group: string; logos: string[] }[] = [
  { group: "Payments", logos: ["Stripe", "PayPal"] },
  { group: "Printers", logos: ["Star Micronics", "Epson", "Bixolon", "Citizen"] },
  { group: "Delivery", logos: ["Shipday"] },
  { group: "Analytics & Ads", logos: ["Google Analytics", "Facebook Pixel"] },
  { group: "Migration", logos: ["GloriaFood", "PDF import"] },
  { group: "Voice", logos: ["Twilio"] },
];
const INTEGRATIONS_ROADMAP = ["Uber Eats", "DoorDash", "Tookan", "Lalamove"];

export function HomeClient({ locale }: { locale: string }) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav currentLocale={locale} />

      {/* ── S1 · HERO ─────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden bg-white"
        style={{ background: "radial-gradient(80% 90% at 12% 0%, #ecfdf5 0%, rgba(236,253,245,0) 55%), #ffffff" }}
      >
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <SectionEyebrow icon={Target}>For restaurant owners</SectionEyebrow>
            <h1 className="mt-5 text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-[1.05] tracking-tight">
              Your own ordering page.{" "}
              <span className="text-emerald-600">0% commission.</span>
            </h1>
            <p className="mt-5 text-lg text-gray-600 leading-relaxed max-w-xl">
              Branded online ordering for pickup, delivery, dine-in &amp; catering — in 38 languages, free forever. Keep 100% of every direct order.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <PrimaryButton href="/signup">Start free<ArrowRight className="w-4 h-4" /></PrimaryButton>
              <SecondaryButton href="/demo">See a live storefront</SecondaryButton>
            </div>
            <StatTrustStrip
              className="mt-7"
              items={["No credit card", "0% on direct orders", "38 languages", "Built in Canada 🍁"]}
            />
          </div>

          <div className="relative">
            <ScreenshotFrame variant="browser" glow url="luigis.feefreeordering.com" alt="Luigi's Lasagna — a real branded ordering page" src="/marketing/screenshots/luigis-order-top-desktop.png" />
            <div className="absolute -top-3 -right-3 bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg rotate-3">
              0% commission
            </div>
          </div>
        </div>
      </section>

      {/* ── S2 · FUNNEL ───────────────────────────────────────────────────── */}
      <MarketingSection tone="emeraldTint">
        <div className="grid lg:grid-cols-2 gap-14 lg:gap-16 items-center">
          <SectionHeading
            eyebrow="The growth angle"
            title={<>Catch the traffic. <span className="text-emerald-600">Keep the repeat.</span></>}
            subtitle="Marketplaces are great at one thing — sending you a first-time customer. Give every one of them a reason to come back and order direct, on your brand, at 0% commission."
          />
          <FunnelGraphic />
        </div>
      </MarketingSection>

      {/* ── S3 · FREE CORE — ordering page ────────────────────────────────── */}
      <MarketingSection tone="light">
        <AltFeatureRow
          reverse
          eyebrow="Free forever"
          title="A branded ordering page customers love."
          body="Your menu, photos, modifiers and prices — beautiful on every phone, in 38 languages, with your logo and colors."
          bullets={["Pickup, delivery, dine-in & catering", "Scheduling & pre-orders", "Embeds into your existing website"]}
          cta={{ href: "/signup", label: "Start free" }}
          image={<ScreenshotFrame variant="phone" alt="Menu & item options" src="/marketing/screenshots/luigis-menu-mobile.png" />}
        />
      </MarketingSection>

      {/* ── S4 · FREE CORE — checkout & reservations ──────────────────────── */}
      <MarketingSection tone="emeraldTint">
        <AltFeatureRow
          eyebrow="Free forever"
          title="Checkout your way. Get paid your way."
          body="Take cash and card-at-counter for free, or add online card payments. Reservations and reserve-then-order are built in."
          bullets={["Cash & card-at-counter — free", "Built-in tipping, taxes & service fees", "Reservations + reserve-then-order"]}
          image={<ScreenshotFrame variant="phone" alt="Cart & checkout" />}
        />
      </MarketingSection>

      {/* ── S5 · BUILT FOR PIZZA SHOPS (half-and-half) ────────────────────── */}
      <MarketingSection tone="light">
        <AltFeatureRow
          reverse
          eyebrow="Built for pizza shops"
          title="A half-and-half builder customers actually enjoy."
          body="Let customers design a one-of-a-kind pie — different toppings on each half, placed left, right or whole, light, normal or extra."
          bullets={[
            "Split any pizza into halves — different toppings each side",
            "Fair half-topping pricing (two halves count as one whole)",
            "Combos & meal deals that open the full builder",
          ]}
          image={<PizzaSplitGraphic />}
        />
      </MarketingSection>

      {/* ── S6 · NEVER MISS AN ORDER (kitchen reliability) ────────────────── */}
      <MarketingSection tone="emeraldTint">
        <div className="mb-12">
          <SectionHeading
            center
            eyebrow="Free · iOS + Android"
            title="Never miss a paying order."
            subtitle="The native Kitchen Order App turns any iPhone, iPad or Android tablet into a bulletproof order station — with a safety net so a busy night never costs you a sale."
          />
        </div>
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <ScreenshotFrame variant="phone" alt="Kitchen Order App — incoming order" />
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-6">
            {RELIABILITY.map((r) => (
              <div key={r.title} className="flex items-start gap-3">
                <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-white text-emerald-600 ring-1 ring-emerald-100 flex-shrink-0 shadow-sm">
                  <r.icon className="w-5 h-5" />
                </span>
                <div>
                  <div className="font-bold text-gray-900 text-sm leading-tight">{r.title}</div>
                  <p className="text-sm text-gray-600 leading-relaxed mt-0.5">{r.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-14 text-center">
          <p className="text-sm font-semibold text-gray-700 mb-4">Get the free Kitchen Order App on your tablet</p>
          <div className="flex justify-center"><AppDownloadBadges /></div>
        </div>
      </MarketingSection>

      {/* ── S7 · RUN THE BUSINESS (reports + CRM + promos) ────────────────── */}
      <MarketingSection tone="light">
        <div className="mb-12">
          <SectionHeading
            center
            eyebrow="Run the business"
            title="Know your numbers. Own your customers."
            subtitle="A full analytics, customer and promotions suite is built in — free. The relationship with your diners is yours, not locked inside an aggregator."
          />
        </div>
        <div className="mb-12 max-w-4xl mx-auto">
          <ScreenshotFrame variant="browser" url="app.feefreeordering.com/reports" alt="Reports dashboard — revenue, orders & customer trends" />
        </div>
        <IconFeatureGrid items={RUN_BUSINESS} />
      </MarketingSection>

      {/* ── S8 · GROWTHNET BUNDLE ─────────────────────────────────────────── */}
      <MarketingSection tone="emeraldTint">
        <div className="mb-12">
          <SectionHeading
            center
            eyebrow="GrowthNet — the growth bundle"
            title="Turn first orders into regulars."
            subtitle="Marketing, retention and customer-acquisition tools that bring people back — bundled at one discounted price, or added one at a time."
          />
        </div>
        <GrowthNetShowcase />
      </MarketingSection>

      {/* ── S9 · À-LA-CARTE ADD-ONS (no tiers) ────────────────────────────── */}
      <MarketingSection tone="light">
        <div className="mb-12">
          <SectionHeading
            center
            eyebrow="Add-ons — no tiers"
            title="Start free. Add only what you value."
            subtitle="Every add-on is separately subscribable. Pick one, pick a few, pick all — or stay free forever."
          />
        </div>
        <IconFeatureGrid items={ADDONS} />
        <div className="mt-10 text-center">
          <p className="text-sm text-gray-500">
            The free plan includes <span className="font-semibold text-gray-700">100 orders/month</span>. Any paid add-on lifts the cap.
          </p>
          <Link href="/pricing" className="mt-3 inline-flex items-center gap-1.5 text-emerald-700 font-bold hover:gap-2.5 transition-all">
            See full pricing <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </MarketingSection>

      {/* ── S10 · SWITCH IN MINUTES (migration) ───────────────────────────── */}
      <MarketingSection tone="emeraldTint">
        <AltFeatureRow
          reverse
          eyebrow="Switch in minutes"
          title="Bring your whole menu — without retyping it."
          body="Coming from GloriaFood, FoodBooking or a printed PDF? Import your entire menu — photos and all — in a few clicks."
          bullets={[
            "Import directly from GloriaFood",
            "Upload a PDF menu — our AI builds it for you",
            "Item photos import automatically in the background",
          ]}
          cta={{ href: "/signup", label: "Start your import" }}
          image={<ScreenshotFrame variant="browser" url="app.feefreeordering.com/menu/import" alt="Menu import wizard" />}
        />
      </MarketingSection>

      {/* ── S11 · HOW IT WORKS + INTEGRATIONS ─────────────────────────────── */}
      <MarketingSection tone="light">
        <div className="mb-12">
          <SectionHeading center title="Live in three steps." />
        </div>
        <NumberedSteps
          steps={[
            { title: "Add your menu", body: "Build it, or import from GloriaFood or a PDF in a few clicks.", icon: Upload },
            { title: "Share your link & QR", body: "Drop the order button on your site, or share your Fee Free page and QR code.", icon: QrCode },
            { title: "Take orders, keep 100%", body: "Orders hit your kitchen app and print. No commission on direct orders.", icon: Store },
          ]}
        />

        {/* Integrations — grouped */}
        <div className="mt-16 border-t border-gray-100 pt-12">
          <div className="text-center text-xs font-bold uppercase tracking-wider text-gray-400 mb-7">Plays nice with your stack</div>
          <div className="flex flex-wrap items-start justify-center gap-x-10 gap-y-6">
            {INTEGRATION_GROUPS.map((g) => (
              <div key={g.group} className="text-center">
                <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 mb-2">{g.group}</div>
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
                  {g.logos.map((l) => (
                    <span key={l} className="text-sm font-semibold text-gray-500">{l}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-7 text-center text-xs text-gray-400">
            On the roadmap:{" "}
            {INTEGRATIONS_ROADMAP.map((r, i) => (
              <span key={r} className="font-medium text-gray-400">{r}{i < INTEGRATIONS_ROADMAP.length - 1 ? " · " : ""}</span>
            ))}
          </div>
        </div>
      </MarketingSection>

      {/* ── S12 · PROUDLY CANADIAN + 24/7 SUPPORT (slim band) ─────────────── */}
      <section className="bg-emerald-50/40 border-y border-emerald-100/70">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white ring-1 ring-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-700">
              <span aria-hidden>🍁</span> Proudly Canadian
            </div>
            <h2 className="mt-4 text-2xl md:text-3xl font-bold text-gray-900 tracking-tight leading-tight">
              Built &amp; operated in Ontario, Canada.
            </h2>
            <p className="mt-2 text-gray-600 leading-relaxed max-w-lg">
              A Canadian company — not a faceless overseas aggregator. Your fees, data and customers stay yours.
            </p>
          </div>
          <div className="md:justify-self-end flex items-start gap-3 rounded-2xl bg-white border border-gray-200/80 p-5 shadow-[0_8px_30px_-12px_rgba(16,24,40,0.12)] max-w-sm">
            <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 flex-shrink-0">
              <Headset className="w-5 h-5" />
            </span>
            <div>
              <div className="font-bold text-gray-900">24/7 Canadian support</div>
              <p className="text-sm text-gray-600 leading-relaxed mt-0.5">
                Call or live-chat the people who actually built it — any time, day or night.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── S13 · DEMO SHOWCASE ───────────────────────────────────────────── */}
      <MarketingSection tone="gray">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <SectionHeading
              title="See a real storefront."
              subtitle="Take a live demo for a spin — order like a customer and watch it land on the kitchen app."
            />
            <div className="mt-8">
              <PrimaryButton href="/demo" className="!px-6 !py-3">Open the live demo<ArrowRight className="w-4 h-4" /></PrimaryButton>
            </div>
          </div>
          <ScreenshotFrame variant="browser" url="luigis.feefreeordering.com" alt="A live Fee Free storefront" src="/marketing/screenshots/luigis-root-desktop.png" />
        </div>
      </MarketingSection>

      {/* ── S14 · RESELLER STRIP (slim) ───────────────────────────────────── */}
      <section className="bg-white border-t border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-center gap-3 text-center">
          <span className="flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 flex-shrink-0">
            <Users className="w-5 h-5" />
          </span>
          <span className="text-gray-700">
            Set up restaurants for a living? Earn <strong>recurring commission</strong> as a Fee Free partner.
          </span>
          <Link href="/partners" className="text-emerald-700 font-bold hover:underline whitespace-nowrap">
            Partner program →
          </Link>
        </div>
      </section>

      {/* ── S15 · FINAL CTA ───────────────────────────────────────────────── */}
      <CTASection
        title="Start taking your own orders today."
        body="Free core. 0% commission on direct orders. 5-minute setup. No credit card."
        primary={{ href: "/signup", label: "Start free" }}
        secondary={{ href: "/demo", label: "See it live" }}
      />

      <PublicFooter />
    </div>
  );
}
