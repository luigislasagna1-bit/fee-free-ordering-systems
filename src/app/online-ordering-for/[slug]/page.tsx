import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { LANDING_PAGES, getLandingPage } from "@/data/landing-pages";
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_TEL } from "@/lib/support";
import { safeJsonLd } from "@/lib/safe-json-ld";
import {
  ArrowRight, Upload, Check, Percent, ChefHat, Printer, CalendarCheck, Megaphone, Globe, Headset,
} from "lucide-react";

/**
 * Programmatic SEO landing page — "Online ordering for {cuisine}".
 *
 * Clones the proven /vs/[slug] engine: statically generated per slug at build
 * time, keyword-targeted metadata, SoftwareApplication + FAQPage JSON-LD (the
 * AI-answer-engine magic), and a cross-link graph between all pages. The hero
 * leads with the import-to-try wedge (/import) — paste your GloriaFood menu and
 * see it live, no signup — which is our strongest conversion path.
 *
 * English-only by design (same exception as /vs). Data: src/data/landing-pages.ts.
 */

export async function generateStaticParams() {
  return LANDING_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = getLandingPage(slug);
  if (!p) return { title: "Fee Free Ordering" };
  return {
    title: p.metaTitle,
    description: p.metaDescription,
    alternates: { canonical: `/online-ordering-for/${slug}` },
    openGraph: {
      title: p.metaTitle,
      description: p.metaDescription,
      type: "website",
      siteName: "Fee Free Ordering",
      url: `/online-ordering-for/${slug}`,
      images: [{ url: "/marketing/og-image.png", width: 1200, height: 630, alt: p.h1 }],
    },
    twitter: { card: "summary_large_image", title: p.metaTitle, description: p.metaDescription, images: ["/marketing/og-image.png"] },
  };
}

// The shared "what you get" product band. Same across pages by design (it's the
// product overview) — the cuisine-specific hero/pain/benefits/FAQ above + below
// are what make each page unique. Every line maps to a shipped feature.
const PRODUCT_HIGHLIGHTS: { icon: typeof Percent; title: string; body: string }[] = [
  { icon: Percent, title: "0% commission", body: "Keep 100% of every direct order. Free for your first 100 orders each month." },
  { icon: Upload, title: "Import in seconds", body: "Paste your GloriaFood link — items, sizes, modifier groups, and photos rebuild on a live page." },
  { icon: ChefHat, title: "Kitchen Order App", body: "Orders ring instantly on iOS & Android — even screen-off — with a missed-order phone alert." },
  { icon: Printer, title: "WiFi thermal printing", body: "Print tickets straight from the tablet to Star, Epson, and Bixolon receipt printers." },
  { icon: CalendarCheck, title: "Reservations", body: "Take table bookings and reserve-then-order pre-orders from the same branded page." },
  { icon: Megaphone, title: "GrowthNet marketing", body: "Smart Links, QR codes, Autopilot win-backs, and SMS turn one-time customers into regulars." },
  { icon: Globe, title: "38 languages", body: "Your ordering page, kitchen app, and emails — all localised for your customers." },
  { icon: Headset, title: "24/7 Canadian support", body: `Real humans, day or night, at ${SUPPORT_PHONE_DISPLAY}.` },
];

export default async function LandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = getLandingPage(slug);
  if (!p) notFound();

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://feefreeordering.com";
  const softwareApplication = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Fee Free Ordering",
    description: `Zero-commission online ordering system for ${p.nounPlural}. Branded ordering page, kitchen app, WiFi thermal printing, reservations, and marketing tools. Core platform free.`,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, iOS, Android",
    url: baseUrl,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Free for your first 100 orders every month. Optional à-la-carte add-ons — pay only for what you use." },
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
          <div className="max-w-5xl mx-auto px-4 py-16 sm:py-20 text-center">
            <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 rounded-full px-3 py-1.5 text-xs font-semibold mb-5 uppercase tracking-wider">
              {p.eyebrow}
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold text-gray-900 leading-tight tracking-tight">
              {p.h1} — <span className="text-emerald-600">0% commission</span>
            </h1>
            <p className="mt-5 text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto">{p.intro}</p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/import"
                className="inline-flex items-center justify-center gap-2 bg-emerald-500 text-white font-bold px-7 py-3.5 rounded-xl text-base hover:bg-emerald-600 transition shadow-md"
              >
                <Upload className="w-4 h-4" /> Import your GloriaFood menu
              </Link>
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-2 text-emerald-700 font-bold px-7 py-3.5 rounded-xl text-base hover:bg-emerald-50 transition border-2 border-emerald-200"
              >
                Start free
              </Link>
            </div>
            <p className="mt-6 text-xs text-gray-500">No account needed to try it · No credit card · 0% commission on direct orders</p>
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
              Why {p.nounPlural} choose Fee Free Ordering
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

        {/* ─── EVERYTHING YOU GET (shared product band) ─────────────── */}
        <section className="py-16 px-4 bg-white">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-3">Everything your {p.noun} gets</h2>
            <p className="text-gray-600 text-center mb-10 max-w-2xl mx-auto">One free platform — add only the paid extras you actually want.</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {PRODUCT_HIGHLIGHTS.map((h, i) => (
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

        {/* ─── FAQ (AI-answer-engine block) ─────────────────────────── */}
        <section className="py-16 px-4 bg-gray-50">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-10">Frequently asked questions</h2>
            <div className="space-y-4">
              {p.faqs.map((faq, i) => (
                <div key={i} className="rounded-xl bg-white border border-gray-200 p-5">
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
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 leading-tight">See your {p.food === "order" ? "menu" : p.food + " menu"} live in seconds</h2>
            <p className="text-emerald-50 text-base sm:text-lg mb-7">
              Paste your GloriaFood link and watch your full menu rebuild on a real ordering page — no account, no risk. Like it? Claim it and you&apos;re live.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/import"
                className="inline-flex items-center justify-center gap-2 bg-white text-emerald-700 font-bold px-7 py-3.5 rounded-xl text-base hover:bg-emerald-50 transition shadow-md"
              >
                <Upload className="w-4 h-4" /> Import your menu free
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
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4 text-center">Online ordering for every kind of restaurant</h2>
            <div className="flex flex-wrap justify-center gap-2 text-xs">
              {LANDING_PAGES.filter((other) => other.slug !== p.slug).map((other) => (
                <Link
                  key={other.slug}
                  href={`/online-ordering-for/${other.slug}`}
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
