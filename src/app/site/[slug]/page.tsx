import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ExternalLink, MapPin, Phone, Mail } from "lucide-react";
import { loadHostedSite } from "@/lib/hosted-site";
import { buildSeoLinks } from "@/lib/hosted-site-seo";
// Hosted-page map uses the same component as /order/[slug]/info. The
// dynamic import (ssr:false) lives in the client wrapper because Next 16
// doesn't allow ssr:false on next/dynamic inside server components.
import { HostedDeliveryZonesMap } from "./HostedDeliveryZonesMap";

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
  const s = r.settings;

  // Resolve hero text — owner can override the title/slogan; cuisine label
  // can be hidden entirely. Falls back to canonical restaurant fields.
  const heroTitle = s.header.customTitle?.trim() || r.name;
  const heroSlogan = (s.header.customSlogan ?? r.slogan ?? "").trim();
  const showCuisine = s.header.showCuisineLabel && !!r.cuisineType;

  // Resolve CTA URLs. Owner can override href; default routes to /order.
  const primaryCta = s.cta.primary.enabled
    ? {
        label: (s.cta.primary.label || "Order Online").trim(),
        href: (s.cta.primary.href || orderUrl).trim() || orderUrl,
      }
    : null;
  const secondaryCtaEnabled = s.cta.secondary.enabled && r.acceptsReservations;
  const secondaryCta = secondaryCtaEnabled
    ? {
        label: (s.cta.secondary.label || "Book a Table").trim(),
        href: (s.cta.secondary.href || `${orderUrl}?service=reservation`).trim() || `${orderUrl}?service=reservation`,
      }
    : null;

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

      {/* Hero — TWO layouts based on s.header.fullScreenHero:
       *
       * 1. fullScreenHero=true (GloriaFood-style): the banner image fills
       *    a full-viewport hero with a dark gradient overlay. The title,
       *    CTAs, etc. sit centered over the image. Photographic banners
       *    (food shots, restaurant interior) look much better this way.
       *
       * 2. fullScreenHero=false (default — what we shipped first): the
       *    banner shows as a contained strip on top, with a separate
       *    theme-color hero block below holding the title + CTAs.
       *    Logo-style banners (Luigi's case) need this — the text
       *    overlay would compete with the embedded logo text otherwise.
       */}
      {s.header.fullScreenHero && s.sections.banner && r.bannerUrl ? (
        <section
          className="relative text-white min-h-[75vh] flex items-center"
          style={{
            backgroundImage: `linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url(${r.bannerUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="max-w-5xl mx-auto px-6 py-20 md:py-28 w-full">
            {s.header.showLogo && r.logoUrl && (
              <div className="mb-6 inline-block">
                <Image
                  src={r.logoUrl}
                  alt={`${r.name} logo`}
                  width={120}
                  height={120}
                  className="rounded-xl bg-white/10 backdrop-blur shadow-xl p-2 object-contain"
                />
              </div>
            )}
            <h1 className="text-4xl md:text-6xl font-extrabold leading-tight drop-shadow-md">{heroTitle}</h1>
            {heroSlogan && <p className="mt-3 text-lg md:text-xl text-white/90 drop-shadow">{heroSlogan}</p>}
            {showCuisine && (
              <p className="mt-2 text-sm uppercase tracking-wider text-white/75">
                {r.cuisineType}
              </p>
            )}
            {(primaryCta || secondaryCta) && (
              <div className="mt-8 flex flex-wrap gap-3">
                {primaryCta && (
                  <Link
                    href={primaryCta.href}
                    className="inline-flex items-center justify-center px-7 py-3.5 rounded-full font-bold text-base shadow-lg hover:shadow-xl transition text-white"
                    style={{ background: themeColor }}
                  >
                    {primaryCta.label}
                  </Link>
                )}
                {secondaryCta && (
                  <Link
                    href={secondaryCta.href}
                    className="inline-flex items-center justify-center px-7 py-3.5 rounded-full font-bold text-base bg-white/15 hover:bg-white/25 border-2 border-white/40 text-white transition backdrop-blur"
                  >
                    {secondaryCta.label}
                  </Link>
                )}
              </div>
            )}
          </div>
        </section>
      ) : (
        <>
          {s.sections.banner && r.bannerUrl && (
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

          <section
            className="relative text-white"
            style={{
              background: `linear-gradient(135deg, ${themeColor}, ${darkenHex(themeColor, 0.25)})`,
            }}
          >
            <div className="max-w-5xl mx-auto px-6 pt-12 pb-14 md:pt-16 md:pb-20">
              {s.header.showLogo && r.logoUrl && (
                <div className={`${s.sections.banner && r.bannerUrl ? "-mt-20 md:-mt-24" : ""} mb-5 inline-block`}>
                  <Image
                    src={r.logoUrl}
                    alt={`${r.name} logo`}
                    width={120}
                    height={120}
                    className="rounded-xl bg-white shadow-xl p-2 border-4 border-white object-contain"
                  />
                </div>
              )}
              <h1 className="text-4xl md:text-6xl font-extrabold leading-tight">{heroTitle}</h1>
              {heroSlogan && <p className="mt-3 text-lg md:text-xl text-white/90">{heroSlogan}</p>}
              {showCuisine && (
                <p className="mt-2 text-sm uppercase tracking-wider text-white/75">
                  {r.cuisineType}
                </p>
              )}
              {(primaryCta || secondaryCta) && (
                <div className="mt-8 flex flex-wrap gap-3">
                  {primaryCta && (
                    <Link
                      href={primaryCta.href}
                      className="inline-flex items-center justify-center px-7 py-3.5 rounded-full font-bold text-base shadow-lg hover:shadow-xl transition bg-white text-gray-900 hover:bg-gray-100"
                    >
                      {primaryCta.label}
                    </Link>
                  )}
                  {secondaryCta && (
                    <Link
                      href={secondaryCta.href}
                      className="inline-flex items-center justify-center px-7 py-3.5 rounded-full font-bold text-base bg-white/15 hover:bg-white/25 border-2 border-white/40 text-white transition"
                    >
                      {secondaryCta.label}
                    </Link>
                  )}
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {/* Custom sections positioned after "banner" — rendered right after
          the hero block, before About. */}
      <CustomSectionsAt position="banner" sections={s.customSections} themeColor={themeColor} />

      {/* About — owner can toggle off in the editor. Content always pulled
          from Restaurant.description (no override). Section hidden when
          description is empty OR owner disabled it. */}
      {s.sections.about && r.description && (
        <section className="max-w-3xl mx-auto px-6 py-12">
          <h2 className="text-2xl font-bold text-gray-900">About</h2>
          <p className="mt-3 text-gray-700 leading-relaxed whitespace-pre-line">
            {r.description}
          </p>
        </section>
      )}
      <CustomSectionsAt position="about" sections={s.customSections} themeColor={themeColor} />

      {/* Featured menu — owner toggle. Items pulled from isFeatured menu rows. */}
      {s.sections.featuredMenu && r.featuredItems.length > 0 && (
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

      <CustomSectionsAt position="featuredMenu" sections={s.customSections} themeColor={themeColor} />

      {/* Visit + Hours — owner toggle on Visit; Hours are always shown when
          the restaurant has any open day (Hours block has its own check). */}
      {s.sections.visit && (
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
            {/* Social links — owner toggle. Skips entirely when no links
                are set OR when the owner has hidden the section. */}
            {s.sections.social && socials.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {socials.map((sl) => (
                  <a
                    key={sl.key}
                    href={sl.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${sl.key} link`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-xs font-semibold text-gray-700 capitalize transition"
                  >
                    {sl.key}
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

        {/* Map — two modes:
              a) Has lat/lng + zones → render the SAME DeliveryZonesMap
                 component that /order/[slug]/info uses. Concentric zone
                 circles centered on the restaurant pin, with hover
                 tooltips showing fee/minimum/ETA. Honors the restaurant's
                 mapProvider preference (Leaflet free, or Google Maps if
                 they've added an API key in /admin/website/map-settings).
              b) No zones → simple keyless Google iframe for "find us"
                 on a pickup-only or zones-not-configured restaurant. */}
        {s.sections.map && r.lat != null && r.lng != null && r.deliveryZones.length > 0 && (
          <div className="mt-10">
            <HostedDeliveryZonesMap
              restaurantLat={r.lat}
              restaurantLng={r.lng}
              zones={r.deliveryZones}
              provider={r.mapProvider}
              googleMapsApiKey={r.googleMapsApiKey ?? undefined}
            />
            <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {r.deliveryZones.map((z) => (
                <li
                  key={z.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 border border-gray-100"
                >
                  <span
                    aria-hidden
                    className="w-3 h-3 rounded-full flex-shrink-0 border border-gray-200"
                    style={{ background: z.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 text-sm truncate">{z.name}</div>
                    <div className="text-[11px] text-gray-500">
                      {z.deliveryFee > 0 ? `$${z.deliveryFee.toFixed(2)} fee` : "Free delivery"}
                      {z.minimumOrder > 0 ? ` · $${z.minimumOrder.toFixed(0)} min` : ""}
                      {z.estimatedMinutes > 0 ? ` · ~${z.estimatedMinutes} min` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {s.sections.map && r.deliveryZones.length === 0 && mapEmbedUrl && (
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
      )}

      <CustomSectionsAt position="visit" sections={s.customSections} themeColor={themeColor} />
      <CustomSectionsAt position="map" sections={s.customSections} themeColor={themeColor} />
      <CustomSectionsAt position="social" sections={s.customSections} themeColor={themeColor} />

      <SeoLinksFooter
        restaurantCity={r.city}
        restaurantCuisine={r.cuisineType}
        restaurantSlug={r.slug}
        menuKeywords={r.seoKeywords}
      />

      <footer className="bg-gray-900 text-gray-300 py-8">
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

/**
 * Programmatic-SEO footer. Renders an "Areas we deliver to" block with
 * dozens of <a href> links — one per (cuisine × city × delivery|takeout)
 * combination. Visually de-emphasized (small grey text, multi-column) so
 * it doesn't clutter the real UX, but search engines crawl every link
 * and the restaurant ranks for "italian food delivery {nearby city}"
 * style queries.
 *
 * Each link points at the same hosted page rendered with that specific
 * keyword in the H1/title/meta (see /site/[slug]/[seoSlug]/page.tsx).
 */
/** Visible link count on the main homepage. The rest go inside an
 *  HTML <details> so the page stays clean but search engines still
 *  crawl + index every link (Google explicitly supports indexing
 *  inside <details> — content is in the DOM, just not visible until
 *  the user expands). Sitemap.xml separately lists 100% of them. */
const VISIBLE_LINKS_ON_HOMEPAGE = 10;

function SeoLinksFooter({
  restaurantCity,
  restaurantCuisine,
  restaurantSlug,
  menuKeywords,
}: {
  restaurantCity: string | null;
  restaurantCuisine: string | null;
  restaurantSlug: string;
  menuKeywords: string[];
}) {
  const links = buildSeoLinks({
    city: restaurantCity,
    cuisineType: restaurantCuisine,
    menuKeywords,
  });
  if (links.length === 0) return null;

  // Split visible vs hidden. Order from buildSeoLinks already puts
  // the restaurant's own city + primary cuisine first, so the top N
  // are the most relevant for a casual visitor.
  const visible = links.slice(0, VISIBLE_LINKS_ON_HOMEPAGE);
  const hidden = links.slice(VISIBLE_LINKS_ON_HOMEPAGE);

  // The bare `href` here is intentionally relative — when this page is
  // served via the <slug>.feefreeordering.com subdomain, /italian-...
  // resolves correctly through the proxy → /site/<slug>/italian-... .
  // On a direct /site/<slug> URL (preview), Next's relative resolution
  // does the same thing.
  return (
    <section
      aria-label="Service areas"
      className="bg-gray-950 border-t border-gray-800 py-6"
    >
      <div className="max-w-5xl mx-auto px-6">
        <h2 className="text-[10px] uppercase tracking-widest text-gray-500 font-semibold mb-3">
          Service areas
        </h2>
        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-1">
          {visible.map((l) => (
            <li key={l.slug}>
              <a
                href={`/${l.slug}`}
                className="text-[11px] text-gray-500 hover:text-gray-300 transition"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        {hidden.length > 0 && (
          <details className="mt-3 group">
            <summary className="text-[10px] uppercase tracking-widest text-gray-500 hover:text-gray-300 cursor-pointer select-none transition list-none">
              <span className="inline-flex items-center gap-1">
                <span className="group-open:hidden">Show {hidden.length} more areas</span>
                <span className="hidden group-open:inline">Show fewer</span>
              </span>
            </summary>
            <ul className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-1">
              {hidden.map((l) => (
                <li key={l.slug}>
                  <a
                    href={`/${l.slug}`}
                    className="text-[11px] text-gray-500 hover:text-gray-300 transition"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}

function dayName(d: number) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d] || `Day ${d}`;
}

/**
 * Renders all owner-defined custom sections positioned AFTER a given
 * built-in section. Used as `<CustomSectionsAt position="banner" .../>`
 * etc. interleaved between the built-in section markup, so custom
 * content can land in any of 6 slots without needing array splicing.
 *
 * v1 renders plain-text bodies with `whitespace: pre-line` (newlines
 * preserved). No HTML / markdown to keep XSS surface zero and the
 * editor simple.
 */
function CustomSectionsAt({
  position,
  sections,
  themeColor,
}: {
  position: string;
  sections: Array<{ id: string; title: string; body: string; position: string }>;
  themeColor: string;
}) {
  const matches = sections.filter((s) => s.position === position);
  if (matches.length === 0) return null;
  return (
    <>
      {matches.map((sec, idx) => (
        <section
          key={sec.id}
          className={idx % 2 === 0 ? "bg-white" : "bg-gray-50"}
        >
          <div className="max-w-3xl mx-auto px-6 py-12">
            <h2
              className="text-2xl font-bold text-gray-900"
              style={{ borderLeft: `4px solid ${themeColor}`, paddingLeft: "0.75rem" }}
            >
              {sec.title}
            </h2>
            <p className="mt-4 text-gray-700 leading-relaxed whitespace-pre-line">
              {sec.body}
            </p>
          </div>
        </section>
      ))}
    </>
  );
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
