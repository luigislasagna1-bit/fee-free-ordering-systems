import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { COMPETITORS } from "@/data/competitors";
import { safeJsonLd } from "@/lib/safe-json-ld";
import { ArrowRight, BellRing, Printer, PhoneCall, Zap, Check, ShieldCheck } from "lucide-react";

/**
 * "Never miss an order" — the kitchen-reliability landing page
 * (COMPETITOR-TOWNCLUB-PLAN.md action #5, Luigi 2026-07-06).
 *
 * Our most defensible operational moat: a four-layer chain so a missed order
 * is physically hard to ignore — ring-until-accepted on any device (incl. a
 * locked iPhone) → thermal print → automatic phone call if staff still miss
 * it → auto-accept. NO competitor markets the kitchen at all. Every detail
 * here is a shipped, device-verified fact (Kitchen Order App v2.8; iOS
 * locked-phone ring build 24; Star/Epson/Bixolon/Citizen thermal print;
 * Twilio missed-order auto-call ~90s + cooldown + test button; auto-accept +
 * charge-on-accept).
 *
 * EN-only by design (same convention as /gloriafood-alternative and /vs) —
 * hardcoded strings, zero en.json keys, so the 38-locale parity audit is
 * untouched. Standalone route (not a SOLUTION_PAGES entry) because the
 * 4-layer narrative is richer than the templated shape allows; discovered via
 * sitemap, footer, the homepage S6 teaser, and search.
 *
 * CLAIMS: "Real human support" (never "24/7"); "Built in Canada" OK; the only
 * price literals are $0 core / free first 100 orders/month / the JSON-LD
 * "add-ons from $9.99/mo" precedent. The phone-call carrier caveat is kept
 * deliberately (real Twilio limitation) — honesty strengthens credibility.
 */

const LAYERS = [
  {
    n: "1",
    Icon: BellRing,
    eyebrow: "LAYER 1",
    heading: "It rings until someone accepts it — not once, until.",
    body: "The Kitchen Order App doesn't ping and give up. When an order lands it rings loudly and keeps ringing until a staff member accepts it. A single chime across a loud kitchen is easy to miss; a phone that won't stop until you deal with it is not.",
    bullets: [
      "Rings with the screen off. The tablet or phone can be locked, dark, and face-down on the pass — it still wakes up and rings. On Android and on iPhone, including a locked iPhone at 2 a.m.",
      "Two independent ring engines. A foreground alarm while the app is open, plus a separate native alarm baked into the app for when the screen is off — so the ring survives even if the app was backgrounded or the phone was asleep.",
      "An accept countdown you can see. Each new order shows a visible countdown, so staff know how long it's been waiting and orders get handled in the order they arrived.",
      "Runs on the hardware you already own. A spare Android tablet or an old iPhone becomes your kitchen terminal — no proprietary $800 box to buy.",
    ],
    note: "One deliberate design choice: only the device that logged in most recently owns the ring. If you sign the app into a second tablet, the first one goes quiet — so a forgotten tablet in a drawer can't ring for orders nobody is watching.",
  },
  {
    n: "2",
    Icon: Printer,
    eyebrow: "LAYER 2",
    heading: "Every accepted order prints a ticket on the line.",
    body: "A ringing screen gets the order accepted. A printed ticket gets it cooked. The moment an order is accepted, a kitchen ticket prints on your thermal printer — the physical artifact your line already runs on, sitting in the rail where it can't be scrolled past or accidentally dismissed.",
    bullets: [
      "WiFi thermal printing, no cables. Prints over your network to Star, Epson, Bixolon and Citizen thermal printers — no USB runs, no extra hardware box between the tablet and the printer.",
      "The receipt format is locked and tested. Item names, sizes, every modifier and special instruction, the order type and the customer's scheduled time — laid out the way a kitchen reads at a glance, verified on real Star TSP143-class hardware.",
      "A paper backup for a digital order. Even if a tablet dies mid-shift, the tickets that already printed are still hanging on the rail. The order doesn't live in only one place.",
    ],
    note: "Most 'online ordering' products treat printing as a paid add-on or a third-party integration. Here it's core, and it's the same pipeline whether the order came from your page, a QR code, or a reservation pre-order.",
  },
  {
    n: "3",
    Icon: PhoneCall,
    eyebrow: "LAYER 3",
    heading: "If an order still sits unaccepted, the system phones the restaurant.",
    body: "This is the layer we've never seen on any other platform. Suppose it's the middle of a rush, the ring got silenced, and the ticket didn't get grabbed. After an order has been waiting too long, Fee Free Ordering places an actual automated phone call to the restaurant — a real ringing telephone, the one thing in a busy kitchen that always gets answered.",
    bullets: [
      "A real voice call, not another app notification. When an order sits unaccepted past the threshold, the platform dials your restaurant line and announces there's an order waiting.",
      "It only calls when it needs to. The call fires only if the earlier layers didn't get the order accepted in time — so it's a genuine 'something's wrong, look now' signal, not noise.",
      "A cooldown so it never becomes a robocall. Once it has alerted, it waits before it will call again about the same situation, so a single stuck order can't spam your line.",
      "Test it yourself before you rely on it. There's a test-call button in the admin Orders screen so you can confirm the whole chain works on your actual phone number before a real order ever needs it.",
    ],
    note: "One real-world gotcha we'll tell you up front: some mobile carriers and international numbers block automated voice calls by default, so the call feature needs to be pointed at a line that accepts them (a landline or a properly configured number works reliably). We help you set this up so it's tested and working, not assumed.",
  },
  {
    n: "4",
    Icon: Zap,
    eyebrow: "LAYER 4",
    heading: "Or skip the scramble entirely: let orders accept themselves.",
    body: "Layers 1–3 are for kitchens that want a human to accept every order. If you'd rather never touch the tablet during a rush, turn on auto-accept: new orders are accepted automatically the instant they arrive, print immediately, and go straight into the queue. The 'missed order' problem disappears because there's no acceptance step to miss.",
    bullets: [
      "Instant accept, instant print. With auto-accept on, an order is confirmed and its ticket prints the moment it lands — the customer gets an immediate confirmation and the kitchen gets the ticket, hands-free.",
      "You choose the mode per your workflow. Run manual-accept when you want control over what you take, or auto-accept when the kitchen is slammed and every order is one you'd accept anyway. It lives in Order Handling, saved with one switch.",
      "Payment is captured the right way. With the online card payments add-on, the customer's card is charged the moment you accept (by hand or automatically) — you're never cooking a card order that didn't pay, and never holding money for an order you can't make.",
    ],
    note: "Auto-accept and the ring/print/call layers aren't either-or. Most restaurants run auto-accept for reliability and keep the ring on so the kitchen still hears every new ticket land.",
  },
];

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "What actually happens the moment a customer places an order?",
    a: "Your Kitchen Order App rings — loudly, and even if the tablet's screen is off — and keeps ringing until a staff member accepts the order. On acceptance, a kitchen ticket prints to your thermal printer, and if the order was paid online the customer's card is charged. If you'd rather not touch the tablet, auto-accept does the accepting and printing automatically the instant the order arrives.",
  },
  {
    q: "Will it really ring if the tablet is locked or asleep?",
    a: "Yes. The app has a native alarm that plays with the screen off, on both Android and iPhone — including a locked iPhone. This is verified on real devices, not just claimed. The one requirement is that the app is signed in on that device; whichever device logged in most recently is the one that rings, so a forgotten tablet can't ring in the background.",
  },
  {
    q: "What if nobody hears the ring during a rush?",
    a: "That's what the automatic phone call is for — and as far as we know, no other ordering platform offers it. If an order sits unaccepted past a set threshold, the system places a real automated voice call to your restaurant line to tell you an order is waiting. A ringing phone in a kitchen always gets answered. There's a cooldown so it can't turn into a robocall, and a test-call button so you can prove it works on your number before you ever need it.",
  },
  {
    q: "Does it work with my printer?",
    a: "It prints over WiFi to Star, Epson, Bixolon and Citizen thermal printers — the common brands independent restaurants already own. No cables and no extra hardware box between your tablet and the printer. The ticket layout is fixed and tested so item names, sizes, modifiers, special instructions and the order time all read cleanly on the line.",
  },
  {
    q: "Do I need to buy special hardware?",
    a: "No. A spare Android tablet or an old iPhone becomes your kitchen terminal, and it prints to a standard WiFi thermal printer. There's no proprietary terminal to buy — a real difference from platforms that lock you into a several-hundred-dollar box plus a setup fee.",
  },
  {
    q: "What does all of this cost?",
    a: "Nothing extra. The ring-until-accepted app, thermal printing, the missed-order phone call and auto-accept are all part of the free core platform — 0% commission on direct orders and free for your first 100 orders a month. Optional add-ons (like online card payments) are à la carte, so you only pay for what you actually use.",
  },
  {
    q: "One honest catch — does the phone call work on any number?",
    a: "Almost. Some mobile carriers and international numbers block automated calls by default, so the missed-order call needs to point at a line that accepts them — a landline or a properly configured number is the reliable choice. We help you set it up and test it end-to-end, so it's confirmed working rather than assumed.",
  },
];

export const metadata: Metadata = {
  title: "Never Miss an Order — The Restaurant Ordering System That Rings Until You Answer | Fee Free Ordering",
  description:
    "Most online ordering fails at one moment: the order nobody saw. Fee Free Ordering has four layers of backup — a kitchen app that rings until accepted (even on a locked iPhone), thermal ticket printing, an automatic phone call if staff still miss it, and auto-accept. Built in Canada. 0% commission.",
  alternates: { canonical: "/never-miss-an-order" },
  openGraph: {
    title: "Never Miss an Order — Four Layers So No Ticket Ever Slips Through",
    description:
      "Ring-until-accepted on any device, thermal printing, an automatic phone call if it's still missed, and auto-accept. The reliability layer nobody else markets.",
    type: "website",
    siteName: "Fee Free Ordering",
  },
  twitter: {
    card: "summary_large_image",
    title: "Never Miss an Order",
    description: "The kitchen ordering system with four layers of backup so no order is ever silently dropped.",
  },
};

export default async function NeverMissAnOrderPage() {
  const cookieStore = await cookies();
  const locale = cookieStore.get("fee-free-locale")?.value || "en";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://feefreeordering.com";

  const softwareApplication = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Fee Free Ordering",
    description:
      "Zero-commission restaurant ordering platform with a kitchen order app that rings until accepted, WiFi thermal printing, an automatic missed-order phone call, and auto-accept.",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, iOS, Android",
    url: baseUrl,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Core platform free forever. Optional add-ons from $9.99/mo.",
    },
  };
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
        dangerouslySetInnerHTML={{ __html: safeJsonLd(softwareApplication) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqPage) }}
      />

      <main className="flex-1">
        {/* ─── HERO ──────────────────────────────────────────────────── */}
        <section className="bg-gradient-to-br from-emerald-50 to-white border-b border-gray-100">
          <div className="max-w-5xl mx-auto px-4 py-16 sm:py-20 text-center">
            <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 rounded-full px-3 py-1.5 text-xs font-semibold mb-5">
              <BellRing className="w-3.5 h-3.5" />
              THE RELIABILITY LAYER NOBODY ELSE MARKETS
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold text-gray-900 leading-tight tracking-tight">
              The order you <span className="text-emerald-600">never saw</span> is the one that
              costs you a customer.
            </h1>
            <p className="mt-5 text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto">
              A muted tablet. A notification nobody heard. A delivery order accepted ten minutes too
              late. That&apos;s a refund, a one-star review, and a regular who doesn&apos;t come back.
              Fee Free Ordering was built from the kitchen backwards, with four layers of backup so a
              missed order is physically impossible to ignore.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-2 bg-emerald-500 text-white font-bold px-7 py-3.5 rounded-xl text-base hover:bg-emerald-600 transition shadow-md"
              >
                Start free — 0% commission
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/demo"
                className="inline-flex items-center justify-center gap-2 text-emerald-700 font-bold px-7 py-3.5 rounded-xl text-base hover:bg-emerald-50 transition border-2 border-emerald-200"
              >
                See a live demo
              </Link>
            </div>
            <p className="mt-6 text-xs text-gray-500">
              No credit card · 0% commission on direct orders · Built in Canada
            </p>
          </div>
        </section>

        {/* ─── INTRO STRIP — the 4-layer chain at a glance ──────────────── */}
        <section className="py-14 px-4 bg-white">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">
              Four layers. An order has to defeat all of them to get missed.
            </h2>
            <p className="mt-4 text-gray-600 max-w-2xl mx-auto">
              Every other platform stops at one alert. If your staff don&apos;t see it, the order is
              gone. We assume the alert will sometimes be missed — and we build for what happens
              next.
            </p>
            <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ["1", "Rings until accepted"],
                ["2", "Prints to the line"],
                ["3", "Calls your phone"],
                ["4", "Accepts on its own"],
              ].map(([n, label]) => (
                <div key={n} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 text-white font-extrabold text-sm flex items-center justify-center mx-auto mb-2">
                    {n}
                  </div>
                  <div className="text-sm font-semibold text-gray-800">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── THE 4 LAYERS (alternating) ──────────────────────────────── */}
        {LAYERS.map((layer, i) => (
          <section key={layer.n} className={`py-16 px-4 ${i % 2 === 0 ? "bg-gray-50" : "bg-white"}`}>
            <div className="max-w-5xl mx-auto">
              <div className={`grid lg:grid-cols-2 gap-10 lg:gap-16 items-center ${i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""}`}>
                <div>
                  <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-600 mb-3">
                    <layer.Icon className="w-4 h-4" />
                    {layer.eyebrow}
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight mb-4">
                    {layer.heading}
                  </h2>
                  <p className="text-gray-600 leading-relaxed">{layer.body}</p>
                </div>
                <div>
                  <ul className="space-y-3">
                    {layer.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-3">
                        <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-sm text-gray-700 leading-relaxed">{b}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-5 text-xs text-gray-500 leading-relaxed border-l-2 border-emerald-200 pl-3">
                    {layer.note}
                  </p>
                </div>
              </div>
            </div>
          </section>
        ))}

        {/* ─── PROOF / CONFIDENCE STRIP ─────────────────────────────────── */}
        <section className="py-16 px-4 bg-white border-t border-gray-100">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-10">
              This isn&apos;t a spec sheet. It&apos;s tested on the hardware in real kitchens.
            </h2>
            <div className="grid sm:grid-cols-3 gap-5">
              {[
                {
                  Icon: ShieldCheck,
                  title: "Device-verified",
                  body: "The ring-until-accepted, screen-off, and print behavior is confirmed on real Android tablets and phones and on iPhone, not just described in a doc.",
                },
                {
                  Icon: Check,
                  title: "0% commission",
                  body: "Every one of these layers is part of the free core platform. Reliability isn't an upsell tier — direct orders carry no commission, and you're free for your first 100 orders a month.",
                },
                {
                  Icon: BellRing,
                  title: "Built in Canada",
                  body: "Designed and built in Canada for independent restaurants, with real human support from people who understand a Friday-night rush.",
                },
              ].map((c) => (
                <div key={c.title} className="rounded-2xl border border-gray-200 bg-white p-6">
                  <div className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                    <c.Icon className="w-5 h-5" />
                  </div>
                  <div className="font-bold text-gray-900 mb-1.5">{c.title}</div>
                  <p className="text-sm text-gray-600 leading-relaxed">{c.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── FAQ (FAQPage JSON-LD above) ──────────────────────────────── */}
        <section className="py-16 px-4 bg-gray-50">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-10">
              Never miss an order — the questions restaurants ask
            </h2>
            <div className="space-y-4">
              {FAQS.map((faq) => (
                <div key={faq.q} className="rounded-xl bg-white border border-gray-200 p-5">
                  <h3 className="font-bold text-gray-900 mb-2">{faq.q}</h3>
                  <p className="text-sm text-gray-700 leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── FINAL CTA ────────────────────────────────────────────────── */}
        <section className="py-16 px-4 bg-gradient-to-br from-emerald-500 to-emerald-700 text-white">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 leading-tight">
              Stop losing orders you never even saw.
            </h2>
            <p className="text-emerald-50 text-base sm:text-lg mb-7">
              Four layers of backup, all in the free core platform, all built in Canada. Start free —
              no credit card, 0% commission on direct orders — or watch it work in a live demo first.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-2 bg-white text-emerald-700 font-bold px-7 py-3.5 rounded-xl text-base hover:bg-emerald-50 transition shadow-md"
              >
                Start free
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/demo"
                className="inline-flex items-center justify-center gap-2 text-white font-bold px-7 py-3.5 rounded-xl text-base hover:bg-white/10 transition border-2 border-white/40"
              >
                See the live demo
              </Link>
            </div>
            <p className="mt-6 text-emerald-100 text-xs">
              Questions about your kitchen setup?{" "}
              <a
                href={`mailto:support@feefreeordering.com?subject=${encodeURIComponent("Kitchen setup question")}`}
                className="underline hover:text-white"
              >
                Email support@feefreeordering.com
              </a>{" "}
              and a real person will answer.
            </p>
          </div>
        </section>

        {/* ─── CROSS-LINKS (internal SEO graph) ─────────────────────────── */}
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
              <Link
                href="/gloriafood-alternative"
                className="inline-flex items-center gap-1 bg-gray-100 hover:bg-emerald-50 hover:text-emerald-800 text-gray-700 rounded-full px-3 py-1.5 transition"
              >
                GloriaFood is shutting down
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-1 bg-gray-100 hover:bg-emerald-50 hover:text-emerald-800 text-gray-700 rounded-full px-3 py-1.5 transition"
              >
                Pricing
              </Link>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
