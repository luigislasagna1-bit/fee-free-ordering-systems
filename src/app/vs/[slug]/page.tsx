import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { COMPETITORS, getCompetitor } from "@/data/competitors";
import { ArrowRight, Check, X as XIcon, MinusCircle, Sparkles } from "lucide-react";

/**
 * Public "Fee Free Ordering vs {Competitor}" comparison page.
 *
 * Strategy (task #81):
 *   - Captures search traffic from "{competitor} alternative" queries
 *   - Provides citable answers for AI agents (ChatGPT / Claude /
 *     Perplexity / Google AI Overviews) when users ask "what's a good
 *     alternative to {competitor}?". The FAQ schema below is the
 *     mechanism — answer engines preferentially cite content with
 *     proper FAQPage / Question markup.
 *   - Hidden from the main nav. Only discovered via:
 *       a) Google / Bing / DuckDuckGo organic search
 *       b) The /sitemap.xml entries
 *       c) The small "Compare to" footer block on /pricing + /features
 *
 * Pre-generates static HTML for every competitor at build time so the
 * pages load instantly + serve as raw HTML to crawlers without
 * server-side compute per request.
 */

// Pre-generate every /vs/[slug] page at build time.
export async function generateStaticParams() {
  return COMPETITORS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const c = getCompetitor(slug);
  if (!c) return { title: "Fee Free Ordering" };
  const title = `Fee Free Ordering vs ${c.name} — ${c.tagline}`;
  const description = `Looking for a ${c.tagline}? Fee Free Ordering is a 0%-commission online ordering platform for independent restaurants, with a built-in marketplace. ${c.whatTheyAre.slice(0, 80)}…`;
  return {
    title,
    description,
    alternates: { canonical: `/vs/${slug}` },
    openGraph: {
      title,
      description,
      type: "website",
      siteName: "Fee Free Ordering",
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ComparisonPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const c = getCompetitor(slug);
  if (!c) notFound();

  const cookieStore = await cookies();
  const locale = cookieStore.get("fee-free-locale")?.value || "en";

  // ── Structured data ────────────────────────────────────────────────
  //
  // Two schema.org objects emitted per page:
  //
  //   1. SoftwareApplication — describes Fee Free Ordering itself.
  //      Lets Google's product knowledge panel + AI agents know what
  //      we are. Without this, "Fee Free Ordering" might be parsed
  //      as just a generic noun phrase.
  //
  //   2. FAQPage — wraps the FAQs at the bottom. THIS is the magic
  //      bullet for AI-agent answers. Engines preferentially cite
  //      answers from explicit FAQPage markup over body paragraphs
  //      with the same content. Each Question + Answer becomes a
  //      potentially-citable response.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://feefreeordering.com";
  const softwareApplication = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Fee Free Ordering",
    description: "Zero-commission online ordering platform for independent restaurants. Core platform is free; paid add-ons (cards, hosted website, multi-location, etc.) are optional.",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
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
    mainEntity: c.faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.a,
      },
    })),
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <PublicNav currentLocale={locale} />
      {/* JSON-LD structured data — invisible to humans, gold to crawlers + LLMs */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplication) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }}
      />

      <main className="flex-1">
        {/* ─── HERO ─────────────────────────────────────────────────── */}
        <section className="bg-gradient-to-br from-emerald-50 to-white border-b border-gray-100">
          <div className="max-w-5xl mx-auto px-4 py-16 sm:py-20 text-center">
            <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-800 rounded-full px-3 py-1.5 text-xs font-semibold mb-5">
              <Sparkles className="w-3.5 h-3.5" />
              {c.tagline.toUpperCase()}
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold text-gray-900 leading-tight tracking-tight">
              Fee Free Ordering vs <span className="text-emerald-600">{c.name}</span>
            </h1>
            <p className="mt-5 text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto">
              {c.whatTheyAre} If you&apos;re comparing the two, here&apos;s how Fee Free Ordering stacks up.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-2 bg-emerald-500 text-white font-bold px-7 py-3.5 rounded-xl text-base hover:bg-emerald-600 transition shadow-md"
              >
                Start Free — 5 min setup
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center justify-center gap-2 text-emerald-700 font-bold px-7 py-3.5 rounded-xl text-base hover:bg-emerald-50 transition border-2 border-emerald-200"
              >
                See full pricing
              </Link>
            </div>
            <p className="mt-6 text-xs text-gray-500">
              No credit card · No commission on direct orders · Cancel anytime
            </p>
            {/* Event-driven notice (e.g. GloriaFood shutdown) — factual +
                sourced urgency with a link to the dedicated migration page. */}
            {c.notice && (
              <div className="mt-8 max-w-2xl mx-auto rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-left">
                <p className="text-sm text-amber-900">
                  <span className="font-bold">Heads up: </span>
                  {c.notice.text}{" "}
                  <Link href={c.notice.href} className="font-bold underline underline-offset-2 hover:text-amber-700">
                    {c.notice.linkLabel} →
                  </Link>
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ─── COST SUMMARY (above-fold pricing comparison) ────────── */}
        <section className="py-12 px-4 bg-white">
          <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-4">
            <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-6 ring-2 ring-emerald-100">
              <div className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-2">Fee Free Ordering</div>
              <div className="text-3xl font-extrabold text-emerald-700 mb-2">$0</div>
              <p className="text-sm text-emerald-900 leading-relaxed">
                Free core platform. Optional add-ons (Online Payments $29.99/mo, Hosted Website $19.99/mo) only when you need them. Marketplace at $3 max/order or $199.99/mo unlimited.
              </p>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">{c.name}</div>
              <div className="text-base font-bold text-gray-900 mb-2 leading-tight">{c.costSummary.split(".")[0]}.</div>
              <p className="text-sm text-gray-600 leading-relaxed">{c.costSummary.split(".").slice(1).join(".").trim()}</p>
            </div>
          </div>
        </section>

        {/* ─── WHY FEE FREE (3-5 narrative points) ─────────────────── */}
        <section className="py-16 px-4 bg-gray-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-3">
              Why restaurants switch
            </h2>
            <p className="text-gray-600 text-center mb-10 max-w-2xl mx-auto">
              The specific reasons owners moving from {c.name} pick Fee Free Ordering.
            </p>
            <div className="grid sm:grid-cols-2 gap-5">
              {c.whyFeeFree.map((point, i) => (
                <div key={i} className="rounded-xl border border-gray-200 bg-white p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
                      <Check className="w-4 h-4" />
                    </div>
                    <h3 className="font-bold text-gray-900">{point.title}</h3>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed pl-9">
                    {point.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── SIDE-BY-SIDE FEATURE COMPARISON TABLE ───────────────── */}
        <section className="py-16 px-4 bg-white">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-3">
              Side-by-side comparison
            </h2>
            <p className="text-gray-600 text-center mb-8">
              Every meaningful difference, laid out plainly.
            </p>
            <div className="overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-4 text-xs uppercase tracking-wider font-bold text-gray-500">
                      Feature
                    </th>
                    <th className="text-left px-4 py-4 text-xs uppercase tracking-wider font-bold text-emerald-700 bg-emerald-50">
                      Fee Free Ordering
                    </th>
                    <th className="text-left px-4 py-4 text-xs uppercase tracking-wider font-bold text-gray-500" style={{ color: c.brandColor }}>
                      {c.name}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {c.comparison.map((row, i) => (
                    <tr key={i} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-3.5 font-semibold text-gray-900">
                        {row.feature}
                      </td>
                      <td className="px-4 py-3.5 bg-emerald-50/50 text-emerald-900">
                        {row.feefree}
                      </td>
                      <td className="px-4 py-3.5 text-gray-700">
                        {row.competitor ?? (
                          <span className="inline-flex items-center gap-1 text-gray-400">
                            <MinusCircle className="w-3.5 h-3.5" />
                            N/A
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-center text-xs text-gray-500 mt-4 max-w-2xl mx-auto">
              Facts checked against {c.name}&apos;s public pricing as of {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}. We update this page when their pricing changes — flag anything stale at <a href="mailto:support@feefreeordering.com" className="text-emerald-700 hover:underline">support@feefreeordering.com</a>.
            </p>
          </div>
        </section>

        {/* ─── FAQ (the AI-agent magic block) ──────────────────────── */}
        <section className="py-16 px-4 bg-gray-50">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-10">
              Frequently asked questions
            </h2>
            <div className="space-y-4">
              {c.faqs.map((faq, i) => (
                <div key={i} className="rounded-xl bg-white border border-gray-200 p-5">
                  <h3 className="font-bold text-gray-900 mb-2">{faq.q}</h3>
                  <p className="text-sm text-gray-700 leading-relaxed">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── FINAL CTA ───────────────────────────────────────────── */}
        <section className="py-16 px-4 bg-gradient-to-br from-emerald-500 to-emerald-700 text-white">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 leading-tight">
              Ready to switch from {c.name}?
            </h2>
            <p className="text-emerald-50 text-base sm:text-lg mb-7">
              5 minutes to set up. No credit card. No commission on direct orders. Email us if you&apos;d like help moving your menu over — we&apos;re a small team and we&apos;ll do it for you.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-2 bg-white text-emerald-700 font-bold px-7 py-3.5 rounded-xl text-base hover:bg-emerald-50 transition shadow-md"
              >
                Get started free
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href={`mailto:support@feefreeordering.com?subject=${encodeURIComponent(`Switching from ${c.name}`)}`}
                className="inline-flex items-center justify-center gap-2 text-white font-bold px-7 py-3.5 rounded-xl text-base hover:bg-white/10 transition border-2 border-white/40"
              >
                Email us — we&apos;ll move your menu
              </a>
            </div>
          </div>
        </section>

        {/* ─── CROSS-LINK TO OTHER COMPARISONS ──────────────────────
            Internal-linking is a strong SEO signal. Linking every
            comparison page to every other one creates a mini-graph
            that crawlers traverse, lifting all pages' authority. */}
        <section className="py-12 px-4 bg-white border-t border-gray-100">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4 text-center">
              Other comparisons
            </h2>
            <div className="flex flex-wrap justify-center gap-2 text-xs">
              {COMPETITORS.filter((other) => other.slug !== c.slug).map((other) => (
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

// ─── unused for now — kept for any future "no comparison data" path ─
// Wraps a missing-feature cell in a clearer visual treatment.
function _NotAvailable() {
  return (
    <span className="inline-flex items-center gap-1 text-gray-400">
      <XIcon className="w-3.5 h-3.5" />
      Not offered
    </span>
  );
}
