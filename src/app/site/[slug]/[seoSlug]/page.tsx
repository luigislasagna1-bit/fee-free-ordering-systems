import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { MapPin, Phone, ArrowRight } from "lucide-react";
import { loadHostedSite } from "@/lib/hosted-site";
import { buildSeoLinks, parseSeoSlug } from "@/lib/hosted-site-seo";
import { resolvePoweredByCredit } from "@/lib/white-label";
import { safeJsonLd } from "@/lib/safe-json-ld";
import { PoweredByCredit } from "@/components/PoweredByFeeFree";
import { VisitTracker } from "@/components/order/VisitTracker";

/**
 * Programmatic-SEO landing page. Reached when a customer (or search
 * engine crawler) visits e.g. /italian-food-delivery-mississauga on a
 * restaurant's subdomain. The seoSlug is parsed back into cuisine +
 * city + service-type and used to tune the H1, <title>, meta
 * description, and intro paragraph for that exact search query.
 *
 * Content is intentionally LEANER than the main hosted page — strong
 * H1, key restaurant info, prominent CTA. Heavy interactive sections
 * (map, hours table) live on the main /site/<slug> page; this page
 * links there for visitors who want more info. Search engines get
 * exactly the keyword density they need without us duplicating 200
 * lines of JSX from the main page.
 *
 * Validation: if the seoSlug doesn't match any of the keyword
 * combinations we'd actually generate for this restaurant, 404.
 * Prevents bots from probing arbitrary keywords and getting indexed.
 */

async function resolveLandingPage(slug: string, seoSlug: string) {
  const result = await loadHostedSite(slug);
  if (result.kind !== "ok") return null;
  const r = result.data;
  const parsed = parseSeoSlug(seoSlug);
  if (!parsed) return null;
  // Verify the parsed combination is one we'd actually generate for
  // this restaurant. Without this guard, /pizza-delivery-tokyo would
  // be valid HTML — bad for SEO (Google penalizes thin/spammy pages)
  // and bad UX (links to the wrong area).
  const allLinks = buildSeoLinks({
    city: r.city,
    cuisineType: r.cuisineType,
    menuKeywords: r.seoKeywords,
  });
  const matches = allLinks.some((l) => l.slug === seoSlug);
  if (!matches) return null;
  return { r, parsed };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; seoSlug: string }>;
}): Promise<Metadata> {
  const { slug, seoSlug } = await params;
  const data = await resolveLandingPage(slug, seoSlug);
  if (!data) return { title: "Page not found" };
  const { r, parsed } = data;
  const title = `${parsed.label} — ${r.name}`;
  const description = `Order ${parsed.cuisine.toLowerCase()} ${parsed.type} from ${r.name}${
    parsed.city ? ` to ${parsed.city}` : ""
  }. Direct ordering — no third-party fees, no surge pricing. Fresh, fast, local.`;
  const ogImage = r.bannerUrl || r.logoUrl || undefined;
  // Browser tab icon: owner favicon, else the web logo so a custom-domain
  // landing page never shows the platform default. Platform default remains
  // only when neither exists (last resort).
  const icon = r.faviconUrl ?? r.logoUrl ?? undefined;
  return {
    title,
    description,
    ...(icon ? { icons: { icon } } : {}),
    openGraph: {
      title,
      description,
      type: "website",
      siteName: r.name,
      images: ogImage ? [{ url: ogImage, alt: r.name }] : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
  };
}

export default async function SeoLandingPage({
  params,
}: {
  params: Promise<{ slug: string; seoSlug: string }>;
}) {
  const { slug, seoSlug } = await params;
  const data = await resolveLandingPage(slug, seoSlug);
  if (!data) notFound();
  const { r, parsed } = data;
  const themeColor = (r.themeSettings?.primaryColor as string) || "#ef4444";
  const orderUrl = `/order/${r.slug}?from=hosted`;
  const homeUrl = `/`; // back to the main hosted page on the same subdomain

  // JSON-LD focused on the keyword combo.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: r.name,
    image: r.bannerUrl || r.logoUrl || undefined,
    servesCuisine: parsed.cuisine,
    areaServed: parsed.city,
    telephone: r.phone || undefined,
    address:
      r.address || r.city
        ? {
            "@type": "PostalAddress",
            streetAddress: r.address || undefined,
            addressLocality: r.city || undefined,
            addressRegion: r.state || undefined,
            postalCode: r.zip || undefined,
            addressCountry: r.country || undefined,
          }
        : undefined,
  };
  const cleanJsonLd = JSON.parse(JSON.stringify(jsonLd));

  // Build the SEO-link footer for cross-navigation between landing pages.
  const allLinks = buildSeoLinks({
    city: r.city,
    cuisineType: r.cuisineType,
    menuKeywords: r.seoKeywords,
  });

  return (
    <main className="min-h-screen bg-white">
      {/* Visit beacon — SEO landing pages count as visits too. */}
      <VisitTracker restaurantId={r.id} />

      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: safeJsonLd(cleanJsonLd) }}
      />

      {/* Hero — focused on the keyword */}
      <section
        className="relative text-white"
        style={{ background: `linear-gradient(135deg, ${themeColor}, ${darkenHex(themeColor, 0.3)})` }}
      >
        <div className="max-w-4xl mx-auto px-6 py-16 md:py-24">
          {r.logoUrl && (
            <div className="mb-6 inline-block">
              <Image
                src={r.logoUrl}
                alt={`${r.name} logo`}
                width={88}
                height={88}
                className="rounded-xl bg-white shadow-lg p-2 object-contain"
              />
            </div>
          )}
          <p className="text-xs uppercase tracking-widest text-white/70 font-semibold">
            {r.name}
          </p>
          <h1 className="mt-2 text-3xl md:text-5xl font-extrabold leading-tight">
            {parsed.label}
          </h1>
          <p className="mt-4 text-base md:text-lg text-white/90 max-w-2xl leading-relaxed">
            Looking for <strong>{parsed.cuisine.toLowerCase()} {parsed.type}</strong>
            {parsed.city ? <> in <strong>{parsed.city}</strong></> : null}? {r.name}
            {r.address || r.city ? (
              <> serves {parsed.cuisine.toLowerCase()} direct{r.city ? ` from ${r.city}` : ""} — </>
            ) : (
              <> serves {parsed.cuisine.toLowerCase()} direct — </>
            )}
            no third-party app fees, no surge pricing, just{" "}
            {parsed.type === "delivery" ? "fast delivery" : "easy pickup"} of the food you actually want.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={orderUrl}
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full font-bold text-base shadow-lg hover:shadow-xl transition bg-white text-gray-900 hover:bg-gray-100"
            >
              Order online <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href={homeUrl}
              className="inline-flex items-center justify-center px-7 py-3.5 rounded-full font-bold text-base bg-white/15 hover:bg-white/25 border-2 border-white/40 text-white transition"
            >
              Full menu &amp; hours
            </Link>
          </div>
        </div>
      </section>

      {/* Restaurant card */}
      <section className="max-w-3xl mx-auto px-6 py-10">
        <div className="bg-gray-50 rounded-2xl border border-gray-100 p-6">
          <h2 className="text-xl font-bold text-gray-900">About {r.name}</h2>
          {r.description ? (
            <p className="mt-2 text-gray-700 leading-relaxed">{r.description}</p>
          ) : r.slogan ? (
            <p className="mt-2 text-gray-700 leading-relaxed italic">{r.slogan}</p>
          ) : (
            <p className="mt-2 text-gray-700 leading-relaxed">
              Family-owned {parsed.cuisine.toLowerCase()} restaurant serving{" "}
              {parsed.city || "the local area"} with fresh, made-to-order food.
            </p>
          )}

          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {r.address && (
              <div className="flex items-start gap-2 text-gray-700">
                <MapPin className="w-4 h-4 mt-1 flex-shrink-0 text-gray-400" />
                <span>
                  {r.address}
                  {r.city && `, ${r.city}`}
                  {r.state && `, ${r.state}`}
                  {r.zip && ` ${r.zip}`}
                </span>
              </div>
            )}
            {r.phone && (
              <div className="flex items-center gap-2 text-gray-700">
                <Phone className="w-4 h-4 flex-shrink-0 text-gray-400" />
                <a href={`tel:${r.phone}`} className="hover:underline">{r.phone}</a>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Featured items — pulled from the restaurant's menu */}
      {r.featuredItems.length > 0 && (
        <section className="bg-gray-50 py-12">
          <div className="max-w-4xl mx-auto px-6">
            <h2 className="text-2xl font-bold text-gray-900 text-center">
              Popular {parsed.cuisine} dishes
            </h2>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {r.featuredItems.slice(0, 6).map((item) => (
                <div key={item.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                  {item.imageUrl && (
                    <div className="aspect-video bg-gray-100">
                      <Image
                        src={item.imageUrl}
                        alt={item.name}
                        width={400}
                        height={225}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold text-gray-900">{item.name}</h3>
                      <span className="font-bold" style={{ color: themeColor }}>
                        ${item.price.toFixed(2)}
                      </span>
                    </div>
                    {item.description && (
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">{item.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 text-center">
              <Link
                href={orderUrl}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full font-semibold text-white shadow"
                style={{ background: themeColor }}
              >
                Order from {r.name} <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Cross-link footer — same SEO links so search engines + users
          can navigate to neighboring landing pages */}
      <section aria-label="More service areas" className="bg-gray-950 border-t border-gray-800 py-6">
        <div className="max-w-5xl mx-auto px-6">
          <h2 className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold mb-3">
            Also serving
          </h2>
          <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-1">
            {allLinks
              .filter((l) => l.slug !== seoSlug)
              .map((l) => (
                <li key={l.slug}>
                  <a href={`/${l.slug}`} className="text-[11px] text-gray-500 hover:text-gray-300 transition">
                    {l.label}
                  </a>
                </li>
              ))}
          </ul>
        </div>
      </section>

      <footer className="bg-gray-900 text-gray-300 py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-wrap items-center justify-between gap-4">
          <p>&copy; {new Date().getFullYear()} {r.name}</p>
          <PoweredByCredit
            credit={resolvePoweredByCredit(r.resellerProfile)}
            className="text-xs text-gray-500"
          />
        </div>
      </footer>
    </main>
  );
}

/** Darken a #rrggbb hex by a 0–1 fraction. Mirror of the helper on the
 *  main hosted page so the two pages can stay visually consistent
 *  without each importing the other. */
function darkenHex(hex: string, fraction: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return "#1f2937";
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - fraction))));
  const r = clamp(parseInt(m[1], 16));
  const g = clamp(parseInt(m[2], 16));
  const b = clamp(parseInt(m[3], 16));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
