import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { NABIL_LANDING_PAGES, getNabilLandingPage } from "@/data/nabil-landing-pages";
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_TEL } from "@/lib/support";
import { safeJsonLd } from "@/lib/safe-json-ld";
import {
  ArrowRight, Phone, PhoneForwarded, Bot, Check, Globe, Headset, LayoutDashboard, Printer,
  ShieldCheck, Sparkles, UserCheck,
} from "lucide-react";

/**
 * Programmatic SEO landing page — "AI phone ordering for {cuisine}".
 *
 * Same SSG + JSON-LD + cross-link engine as /online-ordering-for/[slug],
 * but positioned for the Nabil AI phone ordering add-on rather than the
 * general platform. Each page targets "AI phone ordering for {restaurant
 * type}" search queries and funnels into /signup?addon=phone_ordering.
 *
 * English-only by design (same exception as /vs and /online-ordering-for).
 * Data: src/data/nabil-landing-pages.ts.
 */

export const dynamicParams = false;

export async function generateStaticParams() {
  return NABIL_LANDING_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = getNabilLandingPage(slug);
  if (!p) return { title: "Nabil AI | Fee Free Ordering" };
  return {
    title: p.metaTitle,
    description: p.metaDescription,
    alternates: { canonical: `/ai-phone-ordering-for/${slug}` },
    openGraph: {
      title: p.metaTitle,
      description: p.metaDescription,
      type: "website",
      siteName: "Fee Free Ordering",
      url: `/ai-phone-ordering-for/${slug}`,
      images: [{ url: "/marketing/og-image.png", width: 1200, height: 630, alt: p.h1 }],
    },
    twitter: { card: "summary_large_image", title: p.metaTitle, description: p.metaDescription, images: ["/marketing/og-image.png"] },
  };
}

const NABIL_HIGHLIGHTS: { icon: typeof Phone; title: string; body: string }[] = [
  { icon: Phone, title: "Answers every call", body: "Nabil picks up your phone line and takes orders conversationally — no hold music, no missed calls, no voicemail." },
  { icon: Sparkles, title: "Handles complex orders", body: "Combos, modifier groups, build-your-own items, delivery zones — your full menu, handled correctly by voice." },
  { icon: ShieldCheck, title: "Order accuracy", body: "Server-side cart, read-back confirmation, and a quoted-vs-charged alarm catch mistakes before the order is placed." },
  { icon: Printer, title: "Prints in your kitchen", body: "Every phone order goes through your existing checkout — Kitchen Order App, WiFi thermal printer, one ticket stream." },
  { icon: LayoutDashboard, title: "Dashboard & analytics", body: "Recording, transcript, and timeline for every call. See conversion rates, revenue, and call trends at a glance." },
  { icon: Globe, title: "Multilingual", body: "Nabil detects the caller's language and responds in kind, using your menu's translations." },
  { icon: UserCheck, title: "Knows your regulars", body: "Returning callers are greeted by name with their order history ready for fast reorders." },
  { icon: PhoneForwarded, title: "Transfers to a human", body: "When a caller asks for a person or Nabil can't help, the call transfers to your store instantly." },
];

const HOW_IT_WORKS: { step: number; title: string; body: string; icon: typeof Phone }[] = [
  { step: 1, icon: PhoneForwarded, title: "Connect your phone line", body: "Forward your existing number or get a new one. Setup takes about one business day." },
  { step: 2, icon: Bot, title: "Nabil takes the call", body: "Nabil greets by your restaurant name, takes the order conversationally, and reads back every item for confirmation." },
  { step: 3, icon: Printer, title: "The order prints in your kitchen", body: "Phone orders go through the same checkout as your website — Kitchen Order App, thermal printer, one dashboard." },
];

export default async function NabilLandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = getNabilLandingPage(slug);
  if (!p) notFound();

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://feefreeordering.com";
  const startHref = "/signup?addon=phone_ordering";

  const softwareApplication = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Nabil AI",
    description: `AI phone ordering agent for ${p.nounPlural} by Fee Free Ordering: takes orders by phone and places them through the restaurant's own online-ordering checkout. Recordings, transcripts, and per-call analytics.`,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: `${baseUrl}/nabil-ai`,
    offers: {
      "@type": "Offer",
      price: "249.99",
      priceCurrency: "USD",
      description: "US$249.99 per month base plan includes about 499 call-minutes; extra time billed at US$0.50/min by the second with no per-call rounding.",
    },
    provider: { "@type": "Organization", name: "Fee Free Ordering", url: baseUrl },
  };
  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: p.faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav currentLocale="en" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(softwareApplication) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqPage) }} />

      <main className="flex-1">
        {/* ─── HERO ─────────────────────────────────────────────────── */}
        <section className="bg-gradient-to-br from-emerald-50 to-white border-b border-gray-100">
          <div className="max-w-6xl mx-auto px-4 py-16 sm:py-20 grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 rounded-full px-3 py-1.5 text-xs font-semibold mb-5 uppercase tracking-wider">
                <Phone className="w-3.5 h-3.5" /> {p.eyebrow}
              </div>
              <h1 className="text-3xl sm:text-5xl font-extrabold text-gray-900 leading-tight tracking-tight">
                {p.h1} — <span className="text-emerald-600">Nabil AI</span>
              </h1>
              <p className="mt-5 text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto lg:mx-0">{p.intro}</p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
                <Link
                  href={startHref}
                  className="inline-flex items-center justify-center gap-2 bg-emerald-500 text-white font-bold px-7 py-3.5 rounded-xl text-base hover:bg-emerald-600 transition shadow-md"
                >
                  Get started <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/nabil-ai"
                  className="inline-flex items-center justify-center gap-2 text-emerald-700 font-bold px-7 py-3.5 rounded-xl text-base hover:bg-emerald-50 transition border-2 border-emerald-200"
                >
                  Learn more about Nabil AI
                </Link>
              </div>
              <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1.5 justify-center lg:justify-start text-xs text-gray-500">
                {["US$0.50/min", "Recordings & transcripts", "Same checkout as your website", "Built by restaurant owners"].map((t) => (
                  <span key={t} className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-emerald-500" />{t}</span>
                ))}
              </div>
            </div>

            {/* Sample exchange — shows a realistic Nabil call for this cuisine */}
            <div className="relative">
              <div
                className="pointer-events-none absolute -inset-8 -z-10"
                style={{ background: "radial-gradient(50% 50% at 50% 50%, rgba(16,185,129,0.14) 0%, rgba(16,185,129,0) 70%)" }}
              />
              <div className="rounded-3xl border border-gray-200/80 bg-white p-5 sm:p-6 shadow-[0_24px_60px_-20px_rgba(16,24,40,0.18),0_8px_24px_-12px_rgba(16,24,40,0.10)]">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-4">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                  </span>
                  Sample call
                </div>
                <div className="space-y-3">
                  <Bubble who="caller">{p.sampleExchange.caller1}</Bubble>
                  <Bubble who="nabil">{p.sampleExchange.nabil1}</Bubble>
                  <Bubble who="caller">{p.sampleExchange.caller2}</Bubble>
                  <Bubble who="nabil">{p.sampleExchange.nabil2}</Bubble>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── PAIN POINT ───────────────────────────────────────────── */}
        <section className="py-14 px-4 bg-white">
          <div className="max-w-3xl mx-auto rounded-2xl border-2 border-emerald-200 bg-emerald-50/60 p-7">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">{p.painPoint.title}</h2>
            <p className="text-gray-700 leading-relaxed">{p.painPoint.body}</p>
          </div>
        </section>

        {/* ─── BENEFITS (cuisine-specific) ──────────────────────────── */}
        <section className="py-14 px-4 bg-gray-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-10">
              Why {p.nounPlural} use Nabil AI for phone orders
            </h2>
            <div className="grid md:grid-cols-3 gap-5">
              {p.benefits.map((b, i) => (
                <div key={i} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-[0_8px_30px_-12px_rgba(16,24,40,0.10)]">
                  <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3">
                    <Check className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2">{b.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{b.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── NABIL AI PRODUCT BAND (shared) ──────────────────────── */}
        <section className="py-16 px-4 bg-white">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-3">What Nabil AI does for your {p.noun}</h2>
            <p className="text-gray-600 text-center mb-10 max-w-2xl mx-auto">An AI voice agent that takes phone orders through the same checkout as your website.</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {NABIL_HIGHLIGHTS.map((h, i) => (
                <div key={i} className="rounded-2xl border border-gray-200 p-5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3 ring-1 ring-emerald-100">
                    <h.icon className="w-4 h-4" />
                  </div>
                  <h3 className="font-bold text-gray-900 text-sm mb-1">{h.title}</h3>
                  <p className="text-xs text-gray-600 leading-relaxed">{h.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── HOW IT WORKS ─────────────────────────────────────────── */}
        <section className="py-16 px-4 bg-gray-50">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-10">How it works</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {HOW_IT_WORKS.map((s) => (
                <div key={s.step} className="text-center">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100 flex items-center justify-center mx-auto mb-4">
                    <s.icon className="w-5 h-5" />
                  </div>
                  <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">Step {s.step}</div>
                  <h3 className="font-bold text-gray-900 mb-2">{s.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── FAQ (AI-answer-engine block) ─────────────────────────── */}
        <section className="py-16 px-4 bg-white">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-10">Frequently asked questions</h2>
            <div className="space-y-4">
              {p.faqs.map((faq, i) => (
                <div key={i} className="rounded-xl bg-white border border-gray-200 p-5 shadow-[0_8px_30px_-14px_rgba(16,24,40,0.06)]">
                  <h3 className="font-bold text-gray-900 mb-2">{faq.q}</h3>
                  <p className="text-sm text-gray-700 leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── FINAL CTA ────────────────────────────────────────────── */}
        <section className="py-16 px-4 bg-gradient-to-br from-emerald-500 to-emerald-700 text-white">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 leading-tight">Ready to let Nabil answer your {p.noun}&apos;s phone?</h2>
            <p className="text-emerald-50 text-base sm:text-lg mb-7">
              Every missed call is a missed order. Nabil AI picks up, takes the order, and sends it to your kitchen — so your team stays focused on cooking.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href={startHref}
                className="inline-flex items-center justify-center gap-2 bg-white text-emerald-700 font-bold px-7 py-3.5 rounded-xl text-base hover:bg-emerald-50 transition shadow-md"
              >
                Get started <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href={`tel:${SUPPORT_PHONE_TEL}`}
                className="inline-flex items-center justify-center gap-2 text-white font-bold px-7 py-3.5 rounded-xl text-base hover:bg-white/10 transition border-2 border-white/40"
              >
                <Headset className="w-4 h-4" /> {SUPPORT_PHONE_DISPLAY}
              </a>
            </div>
          </div>
        </section>

        {/* ─── CROSS-LINKS (internal SEO graph) ─────────────────────── */}
        <section className="py-12 px-4 bg-white border-t border-gray-100">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4 text-center">AI phone ordering for every kind of restaurant</h2>
            <div className="flex flex-wrap justify-center gap-2 text-xs">
              <Link
                href="/nabil-ai"
                className="inline-flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-full px-3 py-1.5 transition font-semibold"
              >
                About Nabil AI
              </Link>
              {NABIL_LANDING_PAGES.filter((other) => other.slug !== p.slug).map((other) => (
                <Link
                  key={other.slug}
                  href={`/ai-phone-ordering-for/${other.slug}`}
                  className="inline-flex items-center gap-1 bg-gray-100 hover:bg-emerald-50 hover:text-emerald-800 text-gray-700 rounded-full px-3 py-1.5 transition"
                >
                  {other.nounPlural}
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

function Bubble({ who, children }: { who: "caller" | "nabil"; children: React.ReactNode }) {
  const caller = who === "caller";
  return (
    <div className={`flex ${caller ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          caller ? "bg-gray-100 text-gray-800 rounded-bl-sm" : "bg-emerald-50 text-emerald-950 ring-1 ring-emerald-100 rounded-br-sm"
        }`}
      >
        <div className={`text-[10px] font-bold uppercase tracking-wide mb-0.5 ${caller ? "text-gray-400" : "text-emerald-600"}`}>
          {caller ? "Caller" : "Nabil"}
        </div>
        {children}
      </div>
    </div>
  );
}
