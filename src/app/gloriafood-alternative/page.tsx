import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { PublicNav } from "@/components/layout/PublicNav";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { COMPETITORS } from "@/data/competitors";
import { AlertTriangle, ArrowRight, Check, Clock, Database, ShieldOff } from "lucide-react";

/**
 * GloriaFood-shutdown migration landing page (COMPETITOR-TOWNCLUB-PLAN.md
 * action #1, Luigi 2026-07-05).
 *
 * Oracle has assigned the ENTIRE GloriaFood product line End-of-Life status:
 * last date of service April 30, 2027, no data retention afterwards, no
 * Oracle-provided replacement, 123,000+ restaurants affected (Oracle partner
 * emails + in-app banners; widely reported). Every competitor is running a
 * migration page for this — but almost none of them have an actual automated
 * importer. WE DO (src/lib/menu-import/gloriafood.ts — verified 2026-05-30:
 * 13 categories / 186 items / 219 variants / 501 modifier groups / 12,653
 * options in 1.2s, photos drip-imported by cron), plus the no-signup /import
 * try-it-live flow. This page's whole job: urgency (real, sourced) → proof
 * (real numbers) → one low-friction action (paste your link at /import).
 *
 * EN-only by design, same convention as /vs/[slug] and /online-ordering-for
 * (organic-search surfaces, hidden from main nav). Discovered via sitemap,
 * search, and a notice banner on /vs/gloriafood.
 *
 * KEEP HONEST: every number on this page is real. The import benchmark is
 * from a verified production import; the shutdown facts mirror Oracle's EOL
 * notice. If Oracle changes the date, update THIS file + /vs/gloriafood.
 */

const DEADLINE = "April 30, 2027";

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "Is GloriaFood really shutting down?",
    a: `Yes. Oracle (GloriaFood's owner) has assigned the entire GloriaFood product line End-of-Life status, with a last date of service of ${DEADLINE}. Oracle is notifying restaurants through in-app banners and partner emails, has said it will not offer a replacement product, and will not retain restaurant data after the shutdown date. Over 123,000 restaurants are affected.`,
  },
  {
    q: "What happens to my menu, photos and customer data after the deadline?",
    a: `Oracle has stated there is no data retention beyond ${DEADLINE}. Anything you haven't moved by then — menu, photos, customer history — is gone. That's the single best reason to migrate early rather than in the final weeks, when every platform's migration queue will be full.`,
  },
  {
    q: "Do I have to retype my whole menu somewhere else?",
    a: "Not here. Fee Free Ordering has an automated GloriaFood importer: paste your GloriaFood ordering link and it recreates your categories, items, prices, size variants and every modifier group and option. In a verified production import it moved 13 categories, 186 items, 219 size variants, 501 modifier groups and 12,653 modifier options in 1.2 seconds. Your food photos are imported automatically as well (they arrive over the following hours — GloriaFood's image servers throttle bulk downloads, so we pace them to make sure every photo lands).",
  },
  {
    q: "Can I see my restaurant on Fee Free Ordering before creating an account?",
    a: "Yes — that's exactly what the import preview is for. Paste your GloriaFood menu link and you get a live, working preview of your own ordering page with your real menu on it, no signup required. If you like it, you claim it when you create your free account and it becomes your live page.",
  },
  {
    q: "What does Fee Free Ordering cost compared to GloriaFood?",
    a: "The core platform is free, like GloriaFood's free plan: branded ordering page, kitchen order app, thermal printing, reservations and your customer database, with 0% commission on direct orders. Optional paid add-ons (online card payments, hosted website, SMS and similar) are à la carte, so you only pay for what you actually use.",
  },
  {
    q: "I take orders on a tablet and print tickets. Does that still work?",
    a: "Yes. Fee Free Ordering has a native Kitchen Order App (Android and iOS) that rings loudly until an order is accepted — even with the screen off — and prints to WiFi thermal printers (Star, Epson, Bixolon, Citizen). If an order ever sits unaccepted, the system can even place an automated phone call to the restaurant so nothing slips through.",
  },
  {
    q: "When should I switch?",
    a: `Before the rush. ${DEADLINE} sounds far away, but 123,000+ restaurants are migrating somewhere, and Oracle deletes all data at the deadline. Moving now costs you an afternoon; moving in April 2027 means doing it during everyone else's emergency. The import takes seconds and running both systems in parallel while you get comfortable costs nothing.`,
  },
];

export const metadata: Metadata = {
  title: `GloriaFood Is Shutting Down (${DEADLINE}) — Migrate Your Menu Free | Fee Free Ordering`,
  description:
    `Oracle is shutting GloriaFood down on ${DEADLINE} with no data retention and no replacement. Fee Free Ordering imports your full GloriaFood menu — items, sizes, modifiers and photos — automatically, free, with 0% commission.`,
  alternates: { canonical: "/gloriafood-alternative" },
  openGraph: {
    title: `GloriaFood Is Shutting Down (${DEADLINE}) — Don't Retype Your Menu`,
    description:
      "Paste your GloriaFood link, get your full menu — photos included — on a 0%-commission ordering page in seconds. Free migration, free core platform.",
    type: "website",
    siteName: "Fee Free Ordering",
  },
  twitter: {
    card: "summary_large_image",
    title: `GloriaFood Is Shutting Down (${DEADLINE})`,
    description: "Automated menu migration to a 0%-commission platform. Paste your link — no signup needed to preview.",
  },
};

export default async function GloriaFoodAlternativePage() {
  const cookieStore = await cookies();
  const locale = cookieStore.get("fee-free-locale")?.value || "en";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://feefreeordering.com";

  const softwareApplication = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Fee Free Ordering",
    description:
      "Zero-commission online ordering platform for independent restaurants with an automated GloriaFood menu importer. Core platform is free; paid add-ons are optional.",
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplication) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }}
      />

      <main className="flex-1">
        {/* ─── HERO — real, sourced urgency ─────────────────────────── */}
        <section className="bg-gradient-to-br from-emerald-50 to-white border-b border-gray-100">
          <div className="max-w-5xl mx-auto px-4 py-16 sm:py-20 text-center">
            <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-900 rounded-full px-3 py-1.5 text-xs font-semibold mb-5">
              <AlertTriangle className="w-3.5 h-3.5" />
              CONFIRMED: ORACLE IS SHUTTING GLORIAFOOD DOWN
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold text-gray-900 leading-tight tracking-tight">
              GloriaFood shuts down <span className="text-emerald-600">{DEADLINE}</span>.
              <br className="hidden sm:block" /> Your menu doesn&apos;t have to die with it.
            </h1>
            <p className="mt-5 text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto">
              Oracle has ended the entire GloriaFood product line — no replacement, and no data
              retention after the deadline. 123,000+ restaurants need a new home. Yours can move in
              minutes: paste your GloriaFood link and we import your whole menu — sizes, toppings,
              photos, everything — automatically.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/import"
                className="inline-flex items-center justify-center gap-2 bg-emerald-500 text-white font-bold px-7 py-3.5 rounded-xl text-base hover:bg-emerald-600 transition shadow-md"
              >
                Import my GloriaFood menu — free
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/vs/gloriafood"
                className="inline-flex items-center justify-center gap-2 text-emerald-700 font-bold px-7 py-3.5 rounded-xl text-base hover:bg-emerald-50 transition border-2 border-emerald-200"
              >
                Full GloriaFood comparison
              </Link>
            </div>
            <p className="mt-6 text-xs text-gray-500">
              No signup needed to preview · No credit card · 0% commission on direct orders
            </p>
          </div>
        </section>

        {/* ─── THE FACTS (what Oracle announced) ────────────────────── */}
        <section className="py-12 px-4 bg-white">
          <div className="max-w-4xl mx-auto">
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center">
                <Clock className="w-6 h-6 text-amber-600 mx-auto mb-3" />
                <div className="font-extrabold text-gray-900">Last day of service</div>
                <p className="text-sm text-gray-600 mt-1">
                  {DEADLINE}. Every GloriaFood product — free and paid plans, POS, payments and
                  partner programs — reaches End-of-Life.
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center">
                <Database className="w-6 h-6 text-amber-600 mx-auto mb-3" />
                <div className="font-extrabold text-gray-900">No data retention</div>
                <p className="text-sm text-gray-600 mt-1">
                  Oracle has confirmed nothing is kept after the shutdown. Menus, photos and
                  customer history that haven&apos;t moved are deleted.
                </p>
              </div>
              <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center">
                <ShieldOff className="w-6 h-6 text-amber-600 mx-auto mb-3" />
                <div className="font-extrabold text-gray-900">No replacement</div>
                <p className="text-sm text-gray-600 mt-1">
                  Oracle says it will not offer a successor product and will not recommend one.
                  Choosing the next platform is on you — and 123,000 others.
                </p>
              </div>
            </div>
            <p className="text-center text-xs text-gray-500 mt-4 max-w-2xl mx-auto">
              Source: Oracle&apos;s End-of-Life notice for the GloriaFood (Oracle Restaurants eStore)
              product line, communicated via in-app banners and partner emails and widely reported
              across the industry.
            </p>
          </div>
        </section>

        {/* ─── THE IMPORTER (real numbers as proof) ─────────────────── */}
        <section className="py-16 px-4 bg-gray-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-3">
              Don&apos;t retype 186 items. Paste one link.
            </h2>
            <p className="text-gray-600 text-center mb-10 max-w-2xl mx-auto">
              Our GloriaFood importer rebuilds your entire menu automatically. These are the real
              numbers from one production import — a full pizzeria menu:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
              {[
                ["13", "categories"],
                ["186", "menu items"],
                ["219", "size variants"],
                ["501", "modifier groups"],
                ["12,653", "modifier options"],
                ["1.2s", "import time"],
              ].map(([n, label]) => (
                <div key={label} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-2xl font-extrabold text-emerald-600">{n}</div>
                  <div className="text-xs text-gray-500 mt-1">{label}</div>
                </div>
              ))}
            </div>
            <p className="text-center text-sm text-gray-600 mt-6 max-w-2xl mx-auto">
              Food photos come along too — they&apos;re imported automatically in the background over
              the following hours (GloriaFood&apos;s image servers throttle bulk downloads, so we pace
              the transfer to make sure <em>every</em> photo lands).
            </p>
          </div>
        </section>

        {/* ─── 3 STEPS ──────────────────────────────────────────────── */}
        <section className="py-16 px-4 bg-white">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-10">
              The whole migration, in three steps
            </h2>
            <div className="grid sm:grid-cols-3 gap-5">
              {[
                {
                  n: "1",
                  title: "Paste your GloriaFood link",
                  body: "Your ordering-page link or embed snippet is all we need. No account required — the preview is instant.",
                },
                {
                  n: "2",
                  title: "See your restaurant live",
                  body: "Your real menu, categories, sizes and toppings on your own branded ordering page. Poke around, place a test order, show the kitchen.",
                },
                {
                  n: "3",
                  title: "Claim it and go live",
                  body: "Create your free account and the preview becomes your page. Keep GloriaFood running in parallel while you settle in — retiring it can wait until you're ready.",
                },
              ].map((s) => (
                <div key={s.n} className="rounded-xl border border-gray-200 bg-white p-6">
                  <div className="w-9 h-9 rounded-full bg-emerald-500 text-white font-extrabold flex items-center justify-center mb-3">
                    {s.n}
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2">{s.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{s.body}</p>
                </div>
              ))}
            </div>
            <div className="text-center mt-8">
              <Link
                href="/import"
                className="inline-flex items-center justify-center gap-2 bg-emerald-500 text-white font-bold px-7 py-3.5 rounded-xl text-base hover:bg-emerald-600 transition shadow-md"
              >
                Start step 1 now
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* ─── WHAT YOU KEEP + WHAT YOU GAIN ────────────────────────── */}
        <section className="py-16 px-4 bg-gray-50">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-3">
              Everything you had — and the things GloriaFood never gave you
            </h2>
            <p className="text-gray-600 text-center mb-10 max-w-2xl mx-auto">
              Moving platforms shouldn&apos;t mean giving anything up. It should be an upgrade.
            </p>
            <div className="grid sm:grid-cols-2 gap-5">
              {[
                {
                  title: "Free core platform, 0% commission",
                  body: "Like GloriaFood's free plan — branded ordering page, order taking, reservations and your customer database cost nothing, and direct orders carry no commission. Optional add-ons are à la carte.",
                },
                {
                  title: "A kitchen that never misses an order",
                  body: "Native Kitchen Order App (Android + iOS) that rings continuously until an order is accepted — even locked, even overnight — with WiFi thermal printing (Star, Epson, Bixolon, Citizen) and an automated phone call to the restaurant if an order ever sits unattended.",
                },
                {
                  title: "Customers can order in 38 languages",
                  body: "Your ordering page speaks your customers' language — all 38 of them — automatically. GloriaFood never did that.",
                },
                {
                  title: "A promotions engine that sells for you",
                  body: "BOGOs, bundles, combo builders, hidden codes, personal offers, store-credit reward dollars and scheduled automations — not just a coupon field.",
                },
                {
                  title: "Reservations that take orders",
                  body: "Guests can book a table and pre-order their food in one checkout — with an optional deposit. The kitchen sees one clean booking-with-order.",
                },
                {
                  title: "Your own domain, zero platform branding",
                  body: "Run your ordering page on your own domain with your name on everything. White-label is built in, not an enterprise upsell.",
                },
              ].map((point) => (
                <div key={point.title} className="rounded-xl border border-gray-200 bg-white p-5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0">
                      <Check className="w-4 h-4" />
                    </div>
                    <h3 className="font-bold text-gray-900">{point.title}</h3>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed pl-9">{point.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── FAQ (FAQPage JSON-LD above) ──────────────────────────── */}
        <section className="py-16 px-4 bg-white">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mb-10">
              GloriaFood shutdown — questions restaurants are asking
            </h2>
            <div className="space-y-4">
              {FAQS.map((faq) => (
                <div key={faq.q} className="rounded-xl bg-gray-50 border border-gray-200 p-5">
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
            <h2 className="text-2xl sm:text-3xl font-bold mb-4 leading-tight">
              {DEADLINE} is coming either way.
            </h2>
            <p className="text-emerald-50 text-base sm:text-lg mb-7">
              Migrating today costs an afternoon. Migrating with 123,000 other restaurants in the
              final weeks costs a lot more. Paste your link, see your menu live, and decide with
              your own eyes — and if you&apos;d rather have a human do it, email us and we&apos;ll move
              your menu for you.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/import"
                className="inline-flex items-center justify-center gap-2 bg-white text-emerald-700 font-bold px-7 py-3.5 rounded-xl text-base hover:bg-emerald-50 transition shadow-md"
              >
                Import my menu free
                <ArrowRight className="w-4 h-4" />
              </Link>
              <a
                href={`mailto:support@feefreeordering.com?subject=${encodeURIComponent("Migrating from GloriaFood")}`}
                className="inline-flex items-center justify-center gap-2 text-white font-bold px-7 py-3.5 rounded-xl text-base hover:bg-white/10 transition border-2 border-white/40"
              >
                Email us — we&apos;ll do it for you
              </a>
            </div>
          </div>
        </section>

        {/* ─── CROSS-LINKS (internal SEO graph) ─────────────────────── */}
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
