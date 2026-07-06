import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { COMPETITORS } from "@/data/competitors";
import { SUPPORT_PHONE_DISPLAY, SUPPORT_EMAIL } from "@/lib/support";
import { ArrowRight } from "lucide-react";

/**
 * /faq — objection-first FAQ (COMPETITOR-TOWNCLUB-PLAN.md action #6, Luigi
 * 2026-07-06). The whole point of this page vs a competitor's: COMPLETENESS.
 * Town's FAQ (and most competitors') ships empty question shells; ours answers
 * every real buying objection in full, grounded ONLY in the shipped product.
 *
 * EN-only by design (marketing house rule: the 38-locale rule is for product
 * surfaces, not the marketing site). Answers are hardcoded here rather than in
 * src/messages so we don't add English-only keys to en.json and break the
 * 38-locale parity audit. This intentionally supersedes the old i18n-driven
 * FaqClient (marketing.faq.items) for the /faq route.
 *
 * CLAIMS DISCIPLINE (enforced in copy below):
 *  - "Real human support", NOT "24/7" (no staffed phone line yet).
 *  - No specific dollar prices for OUR add-ons. Only publishable core facts:
 *    $0 core, free first 100 orders/month, 0% commission on direct orders,
 *    optional add-ons à la carte. (/pricing pulls add-on $ live from the DB.)
 *  - "Built in Canada" is allowed. No "#1" claims. Pizza builder framed as
 *    "the most powerful pizza builder in online ordering".
 *  - Competitor facts kept factual/defensible (2026-07-05 town.club scan).
 *
 * A FAQPage JSON-LD block is emitted from FAQS below (the old FaqClient had
 * none — this closes that SEO gap).
 */

const FAQS: Array<{ q: string; a: string }> = [
  // ── Money: the #1 objection ────────────────────────────────────────────
  {
    q: "What does it actually cost? Is there really no commission?",
    a: "The core platform is free — $0/month — and your first 100 orders every month are free. On direct orders (anything a customer places through your own ordering page, QR code or link) we take 0% commission, forever. That's the whole model: unlike a marketplace that skims 15–30% off every order, we don't take a cut of your food sales. Optional add-ons (things like online card payments, a hosted website, or SMS marketing) are à la carte, so you only pay for the extras you actually turn on. You can run a complete, working ordering operation without paying us anything.",
  },
  {
    q: "Am I locked into a contract? How do I cancel?",
    a: "No contract, no lock-in. There's nothing to sign and no minimum term — you can start free without even entering a card. If you add a paid add-on later it's month-to-month, and you can turn it off whenever you like. Your menu, your customer list and your data are yours the entire time, so leaving is never held hostage.",
  },
  {
    q: "Are there hidden fees — setup, onboarding, or a percentage on top?",
    a: "No. We don't charge a setup fee, an onboarding fee, or a per-order \"service\" or \"support\" fee on top of orders. This matters because hidden fees are common in this space: ChowNow, for example, adds a 7% \"Support Local Fee\" that lands on your diners at checkout, and several platforms quote a low monthly number but attach a four-figure setup charge. With us, the free core is genuinely free and every paid add-on is a plain, published monthly price you opt into — nothing bolted onto each order.",
  },
  {
    q: "Do you charge extra on top of Stripe's payment processing fees?",
    a: "No — and we want to be completely honest about how this works. If you turn on online card payments, cards are processed by Stripe, and Stripe charges its own standard processing fee per transaction (that fee goes to Stripe, not to us). We do not add any percentage or markup on top of that. Compared to a marketplace taking 15–30% commission, standard card-processing fees are a fraction of the cost — and they're the same fees you'd pay with almost any modern checkout.",
  },

  // ── Who owns what ──────────────────────────────────────────────────────
  {
    q: "Who owns my customer data?",
    a: "You do. Every customer who orders through your page becomes part of your customer database — names, contact details, order history — and it belongs to your restaurant, not to us and not to a marketplace. This is the core difference from ordering through a delivery app: there, the customer is the app's customer and you never see who they are. Here, you own the relationship, which is what lets you bring people back with your own promotions and loyalty.",
  },
  {
    q: "Can I use my own domain and my own branding?",
    a: "Yes — true white-label is built in, not an enterprise upsell. On a verified custom domain your ordering page shows zero \"Fee Free Ordering\" branding: your name, your logo, your colors in the page title, the favicon, the share previews and the \"powered by\" line (which is simply hidden). Contrast that with platforms like Town, whose storefronts live on shared *.town.club subdomains with a visible \"Powered by\" badge. Here, customers only ever see your brand.",
  },

  // ── Reliability: the operational objection ─────────────────────────────
  {
    q: "What happens if my internet goes down in the kitchen?",
    a: "Orders are placed and paid on your customer's connection, and they land in our system regardless of what your kitchen WiFi is doing at that instant. The Kitchen Order App on your tablet reconnects and pulls any orders it missed as soon as it's back online, so a brief drop doesn't lose an order. And because we can also place an automated phone call to the restaurant if an order is sitting unaccepted, you get a second, connection-independent alert if the tablet ever goes quiet.",
  },
  {
    q: "How do I make sure I never miss an order during a rush?",
    a: "This is what the Kitchen Order App is built for. It rings loudly and keeps ringing until someone accepts the order — even with the phone or tablet screen off and locked, even overnight (verified on both Android and iOS). You can turn on auto-accept so orders are taken automatically, and if an order still sits unattended, the system places an automatic phone call to the restaurant as a last-resort alert. Between the continuous ring and the fallback call, orders don't slip through during a rush.",
  },
  {
    q: "What hardware do I need? Do I have to buy a special POS?",
    a: "Almost none. You need an Android or iOS phone or tablet to run the free Kitchen Order App — most restaurants already have one. If you want printed tickets, we print directly to common WiFi thermal printers (Star, Epson, Bixolon and Citizen) over your local network, so you can use a printer you likely already own. There's no proprietary terminal to buy and no expensive locked-down POS hardware required to start taking orders.",
  },

  // ── Migration ──────────────────────────────────────────────────────────
  {
    q: "I'm on GloriaFood — how hard is it to move over? (And isn't GloriaFood shutting down?)",
    a: "Moving is fast, and yes — Oracle has set GloriaFood's product line for shutdown on April 30, 2027, with no data retention after that date, so migrating early is the smart move. Our automated importer rebuilds your whole GloriaFood menu — categories, items, prices, size variants and every modifier group and option — from a single link; food photos import automatically in the background too. You can even paste your GloriaFood link and see a live preview of your own ordering page before you create an account. See our GloriaFood migration guide for the full walkthrough.",
  },

  // ── Feature-set objections ─────────────────────────────────────────────
  {
    q: "Can my customers order in their own language?",
    a: "Yes. Your ordering page is available in 38 languages and shows each customer their own language automatically — no extra setup and no per-language fee. This is a real gap for many competitors, several of which are English-only (Town, for example, is English-only and US-only today). If you serve a multilingual neighborhood, your customers can order comfortably in the language they think in.",
  },
  {
    q: "Do you handle delivery? What if I don't have my own drivers?",
    a: "Both ways work. If you have your own drivers, in-house delivery is free — we never involve a third party. If you'd rather not run drivers, you can dispatch delivery orders to ShipDay's third-party driver pool (an optional add-on): when you accept a delivery order, it's automatically sent to a driver. You can even mix the two — a simple ON/OFF switch in the kitchen decides whether a given order goes to your drivers or the pool.",
  },
  {
    q: "Can customers book a table and pre-order at the same time?",
    a: "Yes — this is one of our favorite features, and most platforms can't do it. A guest can reserve a table and pre-order their food in a single checkout, with an optional deposit collected up front. The kitchen sees one clean booking-with-order, so front-of-house and the kitchen are on the same page before the guest walks in. Standalone reservations (with no pre-order) work too.",
  },
  {
    q: "Do you have loyalty and promotions, or just a basic coupon field?",
    a: "A full engine, not a coupon box. You get visible and hidden promotions, BOGOs and bundles, a combo builder, discount codes, offers you can assign to specific customers or VIPs, store-credit \"Reward Dollars\" that customers earn and spend at checkout, sign-up bonuses, and scheduled automations that run promotions for you. And because you own your customer list, these actually bring people back — which is the entire point of moving diners off marketplaces and onto your own page. (Some competitors gate loyalty behind a pricey add-on; ours is part of the platform.)",
  },
  {
    q: "Can I build custom pizzas — half-and-half, per-topping pricing?",
    a: "Yes. We ship what we consider the most powerful pizza builder in online ordering: true half-and-half pizzas, size variants, per-topping and per-half pricing, and deep modifier groups. If pizza is your business, customers can build exactly the pie they want and see the right price for it, including split toppings across each half.",
  },

  // ── Setup / who does the work ──────────────────────────────────────────
  {
    q: "Who builds my ordering page — do I need a developer or a designer?",
    a: "You don't need either. Sign-up is self-serve — no demo call required to get started, unlike platforms that funnel every prospect through a sales demo before you can even see the product. You add your menu (or import it), pick your colors and logo, and your branded ordering page is ready. You can embed the ordering widget into a website you already have, or use an optional hosted-website add-on if you don't have one. And if you'd like a hand, real people will help you get set up.",
  },

  // ── Support / origin / taxes ───────────────────────────────────────────
  {
    q: "What kind of support do I get, and where are you based?",
    a: `Real human support — actual people, not just a bot. You can reach us by live chat on any page or by phone at ${SUPPORT_PHONE_DISPLAY}, and we'll even help you import your menu and get set up. Fee Free Ordering is proudly built in Canada. If you'd rather email, we're at ${SUPPORT_EMAIL}.`,
  },
  {
    q: "Does this work for a Canadian restaurant — taxes, currency, all of it?",
    a: "Yes. The platform is built in Canada and handles your local currency and tax setup, so prices, taxes and receipts show correctly for your region. It's not a US-only tool bolted on for other markets — several competitors are US-only today (Town, for instance). Whether you're in Canada or elsewhere, your money and taxes display in the format your customers expect.",
  },

  // ── Reseller ───────────────────────────────────────────────────────────
  {
    q: "Can I resell or white-label this to my own restaurant clients?",
    a: "Yes — there's a full reseller program. If you're an agency, POS dealer or consultant serving restaurants, you can bring restaurants onto the platform under your own branding, with a branded login and self-serve signup at your own reseller address, and earn commission on what they pay. See our partners page for how the reseller tiers and white-label branding work.",
  },
];

export const metadata: Metadata = {
  title: "FAQ — Fee Free Ordering",
  description:
    "Straight answers about 0% commission online ordering: real costs and hidden fees, contracts, who owns your customer data, kitchen reliability, hardware, Stripe payment fees, GloriaFood migration, languages, white-label, delivery, reservations, loyalty and support.",
  alternates: { canonical: "/faq" },
  openGraph: {
    title: "Fee Free Ordering — Frequently Asked Questions",
    description:
      "Complete, honest answers to every real question about switching to 0% commission online ordering: fees, contracts, data ownership, reliability, migration and more.",
    type: "website",
    siteName: "Fee Free Ordering",
  },
  twitter: {
    card: "summary_large_image",
    title: "Fee Free Ordering — FAQ",
    description:
      "0% commission online ordering, answered in full: real costs, no hidden fees, your data stays yours, kitchen that never misses an order.",
  },
};

export default async function FaqPage() {
  const cookieStore = await cookies();
  const locale = cookieStore.get("fee-free-locale")?.value || "en";

  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav currentLocale={locale} />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }}
      />

      <main className="flex-1">
        {/* ─── Hero ─────────────────────────────────────────────────── */}
        <section
          className="relative overflow-hidden bg-white"
          style={{ background: "radial-gradient(80% 80% at 50% 0%, #ecfdf5 0%, rgba(236,253,245,0) 60%), #ffffff" }}
        >
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20 text-center">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 tracking-tight leading-[1.05]">
              Questions, answered in full.
            </h1>
            <p className="mt-5 text-lg md:text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
              The real objections restaurant owners raise before switching — fees, contracts,
              data, reliability — with honest, complete answers. No empty shells, no runaround.
            </p>
          </div>
        </section>

        {/* ─── FAQ list (FAQPage JSON-LD above) ─────────────────────── */}
        <section className="px-4 sm:px-6 lg:px-8 py-12">
          <div className="max-w-3xl mx-auto space-y-4">
            {FAQS.map((faq) => (
              <div
                key={faq.q}
                className="rounded-2xl border border-gray-200/80 bg-white p-6 md:p-7 shadow-[0_8px_30px_-14px_rgba(16,24,40,0.12)]"
              >
                <h2 className="font-bold text-gray-900 text-lg md:text-xl leading-snug">{faq.q}</h2>
                <p className="mt-3 text-gray-600 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Still-have-a-question band ───────────────────────────── */}
        <section className="px-4 sm:px-6 lg:px-8 pb-4">
          <div className="max-w-3xl mx-auto rounded-3xl border border-emerald-100/70 bg-emerald-50/40 p-8 text-center">
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Still have a question?</h2>
            <p className="mt-2 text-gray-600 leading-relaxed max-w-xl mx-auto">
              Real people, not just a bot. Use the live chat on any page, email{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-emerald-700 font-semibold hover:underline">
                {SUPPORT_EMAIL}
              </a>
              , or call{" "}
              <a href="tel:+18886188765" className="text-emerald-700 font-semibold hover:underline">
                {SUPPORT_PHONE_DISPLAY}
              </a>
              . We&apos;ll even help you import your menu and get set up.
            </p>
          </div>
        </section>

        {/* ─── Final CTA ────────────────────────────────────────────── */}
        <section className="py-16 px-4 bg-gradient-to-br from-emerald-500 to-emerald-700 text-white">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 leading-tight">
              Start taking 0% commission orders today.
            </h2>
            <p className="text-emerald-50 text-base sm:text-lg mb-7 max-w-xl mx-auto">
              Free core platform, your first 100 orders every month free, no credit card, no
              contract. See your own branded page live in minutes.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-2 bg-white text-emerald-700 font-bold px-7 py-3.5 rounded-xl text-base hover:bg-emerald-50 transition shadow-md"
              >
                Get started free
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center gap-2 text-white font-bold px-7 py-3.5 rounded-xl text-base hover:bg-white/10 transition border-2 border-white/40"
              >
                See pricing
              </Link>
            </div>
          </div>
        </section>

        {/* ─── Cross-links (internal SEO graph) ─────────────────────── */}
        <section className="py-12 px-4 bg-white border-t border-gray-100">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4 text-center">
              Compare Fee Free Ordering
            </h2>
            <div className="flex flex-wrap justify-center gap-2 text-xs">
              {COMPETITORS.map((other) => (
                <Link
                  key={other.slug}
                  href={`/vs/${other.slug}`}
                  className="inline-flex items-center gap-1 bg-gray-100 hover:bg-emerald-50 hover:text-emerald-800 text-gray-700 rounded-full px-3 py-1.5 transition"
                >
                  vs {other.name}
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
