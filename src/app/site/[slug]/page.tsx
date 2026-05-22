import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ExternalLink, MapPin, Phone, Mail } from "lucide-react";
import { loadHostedSite } from "@/lib/hosted-site";

/**
 * Public hosted marketing page. Reached two ways:
 *   1. <slug>.feefreeordering.com → middleware rewrites to /site/[slug]
 *   2. /site/<slug> directly (preview, no DNS needed)
 *
 * Gated on the hosted_marketing_page feature; restaurants without the
 * "Sales Optimized Website" add-on get a friendly "owner-only" page
 * pointing them at /admin/billing/add-ons.
 */

/**
 * Per-restaurant SEO + Open Graph metadata. Without this, every hosted site
 * would render as "Fee Free Ordering" in search results / shared link
 * previews — terrible for a restaurant whose hosted site is their primary
 * web presence. With it: rich link previews on iMessage/Facebook/Twitter,
 * Google indexes the page with the restaurant name + slogan + cuisine.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await loadHostedSite(slug);
  if (result.kind !== "ok") {
    return { title: "Fee Free Ordering" };
  }
  const r = result.data;
  const titleParts = [r.name];
  if (r.cuisineType) titleParts.push(r.cuisineType);
  if (r.city) titleParts.push(r.city);
  const title = titleParts.join(" — ");
  const description =
    r.slogan ||
    r.description?.slice(0, 160) ||
    `${r.name}${r.cuisineType ? ` · ${r.cuisineType}` : ""}${r.city ? ` · ${r.city}` : ""}. Order online directly — no delivery-app fees.`;
  const ogImage = r.bannerUrl || r.logoUrl || undefined;
  return {
    title,
    description,
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

export default async function HostedSitePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await loadHostedSite(slug);

  if (result.kind === "not_found") notFound();

  if (result.kind === "not_published") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 p-8">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold text-gray-900">Coming soon</h1>
          <p className="text-gray-600 mt-2">
            This restaurant hasn't launched yet. Check back shortly.
          </p>
        </div>
      </main>
    );
  }

  if (result.kind === "upgrade_required") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-amber-50 p-8">
        <div className="max-w-lg text-center">
          <h1 className="text-2xl font-bold text-gray-900">
            {result.restaurantName}
          </h1>
          <p className="text-gray-600 mt-3">
            This restaurant accepts orders directly through their existing
            website. Use their ordering link or visit them in person.
          </p>
          <div className="mt-6 text-xs text-gray-400">
            Restaurant owner? Upgrade to the Sales Optimized Website add-on to
            unlock this page.
          </div>
        </div>
      </main>
    );
  }

  const r = result.data;
  const themeColor = (r.themeSettings?.primaryColor as string) || "#ef4444";
  const orderUrl = `/order/${r.slug}`;

  // Build JSON-LD structured data so Google understands this page as a
  // local business / restaurant. Powers the knowledge panel, hours table,
  // address card, etc. in search results. Only fields we actually have
  // are emitted — incomplete data is worse than no data for Google.
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: r.name,
    image: r.bannerUrl || r.logoUrl || undefined,
    description: r.description || r.slogan || undefined,
    telephone: r.phone || undefined,
    email: r.email || undefined,
    servesCuisine: r.cuisineType || undefined,
    priceRange: undefined, // we don't capture this yet
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
    openingHoursSpecification: r.hours
      .filter((h) => h.isOpen && h.openTime && h.closeTime)
      .map((h) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: [
          "https://schema.org/Sunday",
          "https://schema.org/Monday",
          "https://schema.org/Tuesday",
          "https://schema.org/Wednesday",
          "https://schema.org/Thursday",
          "https://schema.org/Friday",
          "https://schema.org/Saturday",
        ][h.dayOfWeek],
        opens: h.openTime,
        closes: h.closeTime,
      })),
    sameAs: r.socialLinks
      ? Object.values(r.socialLinks).filter((v): v is string => typeof v === "string" && v.length > 0)
      : undefined,
  };

  // Strip undefined recursively so the emitted JSON doesn't have "null"
  // properties (Google ignores them but they bloat the markup).
  const cleanJsonLd = JSON.parse(JSON.stringify(jsonLd));

  // Best-effort map embed using Google Maps' free embed URL (no API key
  // needed). Falls back to nothing if we don't have an address to query.
  const mapQuery = [r.name, r.address, r.city, r.state, r.zip, r.country]
    .filter((x): x is string => !!x && x.length > 0)
    .join(", ");
  const mapEmbedUrl = mapQuery
    ? `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`
    : null;

  // Social link entries the page should render. Skip any with empty/null URLs
  // so we don't emit empty buttons.
  const socials = r.socialLinks
    ? (["facebook", "instagram", "twitter", "youtube", "website"] as const)
        .map((key) => ({ key, url: (r.socialLinks as Record<string, unknown>)?.[key] }))
        .filter((s): s is { key: typeof s.key; url: string } => typeof s.url === "string" && s.url.length > 0)
    : [];

  return (
    <main className="min-h-screen bg-white">
      {/* JSON-LD structured data for Google's knowledge panel + rich snippets. */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(cleanJsonLd) }}
      />

      {/* Banner — shown as its own contained image when one exists. Used to
          render this as a darkened hero-background, but that competed badly
          with logo-style banners that already had text/branding baked in
          (Luigi's banner is exactly that case). Showing it cleanly above
          the title block works for BOTH photo and logo banners. */}
      {r.bannerUrl && (
        <div className="w-full bg-gray-100">
          <div className="relative w-full aspect-[3/1] md:aspect-[4/1] max-h-[420px] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={r.bannerUrl}
              alt={`${r.name} banner`}
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      )}

      {/* Hero — solid theme-color block with logo + name + CTAs. The logo
          straddles the banner/hero junction when both exist, giving the
          standard restaurant-site visual (think OpenTable / Yelp). */}
      <section
        className="relative text-white"
        style={{
          background: `linear-gradient(135deg, ${themeColor}, ${darkenHex(themeColor, 0.25)})`,
        }}
      >
        <div className="max-w-5xl mx-auto px-6 pt-12 pb-14 md:pt-16 md:pb-20">
          {r.logoUrl && (
            <div className={`${r.bannerUrl ? "-mt-20 md:-mt-24" : ""} mb-5 inline-block`}>
              <Image
                src={r.logoUrl}
                alt={`${r.name} logo`}
                width={120}
                height={120}
                className="rounded-xl bg-white shadow-xl p-2 border-4 border-white object-contain"
              />
            </div>
          )}
          <h1 className="text-4xl md:text-6xl font-extrabold leading-tight">{r.name}</h1>
          {r.slogan && <p className="mt-3 text-lg md:text-xl text-white/90">{r.slogan}</p>}
          {r.cuisineType && (
            <p className="mt-2 text-sm uppercase tracking-wider text-white/75">
              {r.cuisineType}
            </p>
          )}
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={orderUrl}
              className="inline-flex items-center justify-center px-7 py-3.5 rounded-full font-bold text-base shadow-lg hover:shadow-xl transition bg-white text-gray-900 hover:bg-gray-100"
            >
              Order Online
            </Link>
            {r.acceptsReservations && (
              <Link
                href={`${orderUrl}?service=reservation`}
                className="inline-flex items-center justify-center px-7 py-3.5 rounded-full font-bold text-base bg-white/15 hover:bg-white/25 border-2 border-white/40 text-white transition"
              >
                Book a Table
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* About */}
      {r.description && (
        <section className="max-w-3xl mx-auto px-6 py-12">
          <h2 className="text-2xl font-bold text-gray-900">About</h2>
          <p className="mt-3 text-gray-700 leading-relaxed whitespace-pre-line">
            {r.description}
          </p>
        </section>
      )}

      {/* Featured menu */}
      {r.featuredItems.length > 0 && (
        <section className="bg-gray-50">
          <div className="max-w-5xl mx-auto px-6 py-14">
            <h2 className="text-2xl font-bold text-gray-900 text-center">
              Featured menu
            </h2>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {r.featuredItems.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-xl shadow-sm hover:shadow-md transition overflow-hidden"
                >
                  {item.imageUrl && (
                    <div className="aspect-video bg-gray-100 overflow-hidden">
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
                      <p className="text-sm text-gray-600 mt-1 line-clamp-2">
                        {item.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-8 text-center">
              <Link
                href={orderUrl}
                className="inline-block px-6 py-3 rounded-full font-semibold text-white shadow"
                style={{ background: themeColor }}
              >
                View full menu &rarr;
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Visit + Hours */}
      <section className="max-w-5xl mx-auto px-6 py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Visit</h2>
            <div className="mt-4 space-y-2 text-gray-700">
              {r.address && (
                <p className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 mt-1 flex-shrink-0 text-gray-400" />
                  <span>
                    {r.address}
                    {r.city && `, ${r.city}`}
                    {r.state && `, ${r.state}`}
                    {r.zip && ` ${r.zip}`}
                  </span>
                </p>
              )}
              {r.phone && (
                <p className="flex items-center gap-2">
                  <Phone className="w-4 h-4 flex-shrink-0 text-gray-400" />
                  <a href={`tel:${r.phone}`} className="hover:underline">
                    {r.phone}
                  </a>
                </p>
              )}
              {r.email && (
                <p className="flex items-center gap-2">
                  <Mail className="w-4 h-4 flex-shrink-0 text-gray-400" />
                  <a href={`mailto:${r.email}`} className="hover:underline">
                    {r.email}
                  </a>
                </p>
              )}
            </div>
            {/* Services */}
            <div className="mt-6 flex flex-wrap gap-2">
              {r.acceptsPickup && <Pill color={themeColor}>Pickup</Pill>}
              {r.acceptsDelivery && <Pill color={themeColor}>Delivery</Pill>}
              {r.acceptsDineIn && <Pill color={themeColor}>Dine-in</Pill>}
              {r.acceptsReservations && <Pill color={themeColor}>Reservations</Pill>}
            </div>
            {/* Social links */}
            {socials.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {socials.map((s) => (
                  <a
                    key={s.key}
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${s.key} link`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-xs font-semibold text-gray-700 capitalize transition"
                  >
                    {s.key}
                    <ExternalLink className="w-3 h-3 opacity-60" />
                  </a>
                ))}
              </div>
            )}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Hours</h2>
            <ul className="mt-4 divide-y divide-gray-100 border-t border-b border-gray-100">
              {r.hours.map((h) => (
                <li key={h.dayOfWeek} className="flex justify-between py-2 text-sm">
                  <span className="font-medium text-gray-800">{dayName(h.dayOfWeek)}</span>
                  <span className="text-gray-600">
                    {h.isOpen && h.openTime && h.closeTime
                      ? `${h.openTime} – ${h.closeTime}`
                      : "Closed"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Embedded map — appears only when we have enough address to query. */}
        {mapEmbedUrl && (
          <div className="mt-10 rounded-2xl overflow-hidden border border-gray-200 shadow-sm">
            <iframe
              src={mapEmbedUrl}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title={`Map to ${r.name}`}
              className="w-full h-64 md:h-80 border-0"
              allowFullScreen
            />
          </div>
        )}
      </section>

      <footer className="bg-gray-900 text-gray-300 py-8 mt-10">
        <div className="max-w-5xl mx-auto px-6 flex flex-wrap items-center justify-between gap-4">
          <p>&copy; {new Date().getFullYear()} {r.name}</p>
          <p className="text-xs text-gray-500">
            Powered by Fee Free Ordering
          </p>
        </div>
      </footer>
    </main>
  );
}

function dayName(d: number) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d] || `Day ${d}`;
}

/** Darken a #rrggbb hex by a 0–1 fraction (0.25 = 25% darker).
 *  Used to build the hero gradient from a single theme color. Falls back
 *  to a deep slate if the input isn't parseable, so a bad theme value
 *  doesn't break the page. */
function darkenHex(hex: string, fraction: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return "#1f2937";
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - fraction))));
  const r = clamp(parseInt(m[1], 16));
  const g = clamp(parseInt(m[2], 16));
  const b = clamp(parseInt(m[3], 16));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function Pill({ children, color }: { children: React.ReactNode; color: string }) {
  return (
    <span
      className="text-xs font-medium px-3 py-1 rounded-full text-white"
      style={{ background: color }}
    >
      {children}
    </span>
  );
}
