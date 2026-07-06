import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { SEGMENT_PAGES, getSegmentPage } from "@/data/segment-pages";
import { SOLUTION_PAGES } from "@/data/solution-pages";
import { safeJsonLd } from "@/lib/safe-json-ld";
import { Upload, Check, Percent, ChefHat, Printer, CalendarCheck, Megaphone, Globe, Headset } from "lucide-react";

/**
 * Segment marketing pages — /for/restaurant-groups, /for/virtual-brands
 * (COMPETITOR-TOWNCLUB-PLAN.md action #8, Luigi 2026-07-06). Near-verbatim clone
 * of the solution engine (src/app/[slug]/page.tsx) with three deliberate
 * deviations: (1) 2×2 benefits grid (4 benefits, richer than solution pages'
 * 3); (2) PRODUCT_HIGHLIGHTS uses "Real human support" — NOT "24/7" (no staffed
 * phone line yet); (3) the final CTA's second button is "Start free" → /signup
 * (no tel: link). `dynamicParams = false` → only the SEGMENT_PAGES slugs render.
 * ENGLISH-only by design. Data + content: src/data/segment-pages.ts.
 */

export const dynamicParams = false;

export async function generateStaticParams() {
  return SEGMENT_PAGES.map((p) => ({ segment: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ segment: string }> }): Promise<Metadata> {
  const { segment } = await params;
  const p = getSegmentPage(segment);
  if (!p) return { title: "Fee Free Ordering" };
  return {
    title: p.metaTitle,
    description: p.metaDescription,
    alternates: { canonical: `/for/${segment}` },
    openGraph: {
      title: p.metaTitle,
      description: p.metaDescription,
      type: "website",
      siteName: "Fee Free Ordering",
      url: `/for/${segment}`,
      images: [{ url: "/marketing/og-image.png", width: 1200, height: 630, alt: p.h1 }],
    },
    twitter: { card: "summary_large_image", title: p.metaTitle, description: p.metaDescription, images: ["/marketing/og-image.png"] },
  };
}

// Shared "what you get" product band. One deviation from the solution-page
// clone: "Real human support" instead of "24/7 Canadian support" (marketing
// house rule — no staffed phone line yet). Every other line maps to a shipped feature.
const PRODUCT_HIGHLIGHTS: { icon: typeof Percent; title: string; body: string }[] = [
  { icon: Percent, title: "0% commission", body: "Keep 100% of every direct order. Free for your first 100 orders each month." },
  { icon: Upload, title: "Import in seconds", body: "Paste your GloriaFood link — items, sizes, modifier groups, and photos rebuild on a live page." },
  { icon: ChefHat, title: "Kitchen Order App", body: "Orders ring instantly on iOS & Android — even screen-off — with a missed-order phone alert." },
  { icon: Printer, title: "WiFi thermal printing", body: "Print tickets straight from the tablet to Star, Epson, Bixolon, and Citizen receipt printers." },
  { icon: CalendarCheck, title: "Reservations", body: "Take table bookings and reserve-then-order pre-orders from the same branded page." },
  { icon: Megaphone, title: "GrowthNet marketing", body: "Smart Links, QR codes, Autopilot win-backs, and SMS turn one-time customers into regulars." },
  { icon: Globe, title: "38 languages", body: "Your ordering page, kitchen app, and emails — all localised for your customers." },
  { icon: Headset, title: "Real human support", body: "Talk to a real person who knows restaurants — no bots, no ticket-queue limbo." },
];

// Solution pages a segment reader is most likely to want next.
const RELATED_SOLUTION_SLUGS = ["online-ordering-system", "restaurant-ordering-system"];

export default async function SegmentLandingPage({ params }: { params: Promise<{ segment: string }> }) {
  const { segment } = await params;
  const p = getSegmentPage(segment);
  if (!p) notFound();

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://feefreeordering.com";
  const softwareApplication = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Fee Free Ordering",
    description: p.metaDescription,
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

  // Cross-links: the OTHER segment page(s) first, then a couple of solution pages.
  const relatedSegments = SEGMENT_PAGES.filter((o) => o.slug !== p.slug);
  const relatedSolutions = SOLUTION_PAGES.filter((o) => RELATED_SOLUTION_SLUGS.includes(o.slug));

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav currentLocale="en" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(softwareApplication) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqPage) }} />

      <main className="flex-1">
        {/* HERO */}
        <section className="bg-gradient-to-br from-emerald-50 to-white border-b border-gray-100">
          <div className="max-w-5xl mx-auto px-4 py-16 sm:py-20 text-center">
            <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 rounded-full px-3 py-1.5 text-xs font-semibold mb-5 uppercase tracking-wider">
              {p.eyebrow}
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold text-gray-900 leading-tight tracking-tight">{p.h1}</h1>
            <p className="mt-5 text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto">{p.intro}</p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/import" className="inline-flex items-center justify-center gap-2 bg-emerald-500 text-white font-bold px-7 py-3.5 rounded-xl text-base hover:bg-emerald-600 transition shadow-md">
                <Upload className="w-4 h-4" /> Import your GloriaFood menu
              </Link>
              <Link href="/signup" className="inline-flex items-center justify-center gap-2 text-emerald-700 font-bold px-7 py-3.5 rounded-xl text-base hover:bg-emerald-50 transition border-2 border-emerald-200">
                Start free
              </Link>
            </div>
            <p className="mt-6 text-xs text-gray-500">No account needed to try it · No credit card · 0% commission on direct orders</p>
          </div>
        </section>

        {/* PAIN POINT */}
        <section className="py-14 px-4 bg-white">
          <div className="max-w-3xl mx-auto rounded-2xl border-2 border-emerald-200 bg-emerald-50/60 p-7">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">{p.painPoint.title}</h2>
            <p className="text-gray-700 leading-relaxed">{p.painPoint.body}</p>
          </div>
        </section>

        {/* BENEFITS (page-specific, 2×2) */}
        <section className="py-14 px-4 bg-gray-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-10">Why operators choose Fee Free Ordering</h2>
            <div className="grid md:grid-cols-2 gap-5">
              {p.benefits.map((b, i) => (
                <div key={i} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-[0_8px_30px_-12px_rgba(16,24,40,0.10)]">
                  <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3"><Check className="w-5 h-5" /></div>
                  <h3 className="font-bold text-gray-900 mb-2">{b.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{b.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* EVERYTHING YOU GET (shared product band) */}
        <section className="py-16 px-4 bg-white">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-3">Everything you get</h2>
            <p className="text-gray-600 text-center mb-10 max-w-2xl mx-auto">One free platform — add only the paid extras you actually want.</p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {PRODUCT_HIGHLIGHTS.map((h, i) => (
                <div key={i} className="rounded-2xl border border-gray-200 p-5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3 ring-1 ring-emerald-100"><h.icon className="w-4 h-4" /></div>
                  <h3 className="font-bold text-gray-900 text-sm mb-1">{h.title}</h3>
                  <p className="text-xs text-gray-600 leading-relaxed">{h.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ (AI-answer-engine block) */}
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

        {/* FINAL CTA */}
        <section className="py-16 px-4 bg-gradient-to-br from-emerald-500 to-emerald-700 text-white">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 leading-tight">See your menu live in seconds</h2>
            <p className="text-emerald-50 text-base sm:text-lg mb-7">Paste your existing menu and watch it rebuild on a real ordering page — no account, no risk. Like it? Claim it and you&apos;re live. Adding more locations or brands takes minutes from there.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href="/import" className="inline-flex items-center justify-center gap-2 bg-white text-emerald-700 font-bold px-7 py-3.5 rounded-xl text-base hover:bg-emerald-50 transition shadow-md">
                <Upload className="w-4 h-4" /> Import your menu free
              </Link>
              <Link href="/signup" className="inline-flex items-center justify-center gap-2 text-white font-bold px-7 py-3.5 rounded-xl text-base hover:bg-white/10 transition border-2 border-white/40">
                Start free
              </Link>
            </div>
          </div>
        </section>

        {/* CROSS-LINKS (internal SEO graph) */}
        <section className="py-12 px-4 bg-white border-t border-gray-100">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4 text-center">More ways to use Fee Free Ordering</h2>
            <div className="flex flex-wrap justify-center gap-2 text-xs">
              {relatedSegments.map((other) => (
                <Link key={other.slug} href={`/for/${other.slug}`} className="inline-flex items-center gap-1 bg-gray-100 hover:bg-emerald-50 hover:text-emerald-800 text-gray-700 rounded-full px-3 py-1.5 transition">
                  {other.label}
                </Link>
              ))}
              {relatedSolutions.map((other) => (
                <Link key={other.slug} href={`/${other.slug}`} className="inline-flex items-center gap-1 bg-gray-100 hover:bg-emerald-50 hover:text-emerald-800 text-gray-700 rounded-full px-3 py-1.5 transition">
                  {other.h1}
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
