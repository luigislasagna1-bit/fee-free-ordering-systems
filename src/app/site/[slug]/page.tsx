import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { MapPin, Phone, Mail, Globe, Clock, ShoppingBag } from "lucide-react";
import { loadHostedSite } from "@/lib/hosted-site";
import { buildSeoLinks } from "@/lib/hosted-site-seo";
import { VisitTracker } from "@/components/order/VisitTracker";

/**
 * Force this route dynamic on every request — restaurant owners expect
 * changes made in /admin/website/editor (banner photo, logo, hours,
 * theme color, etc.) to show up on the live hosted site immediately.
 * Without this, Next.js's full-route cache could serve a stale render
 * for minutes after an upload. Luigi flagged this during UAT —
 * uploaded a new banner, didn't see it on the live site.
 *
 * Cost is trivial since the DB queries are small and the page is
 * server-rendered on a request that's already roundtripping anyway.
 */
export const dynamic = "force-dynamic";
import {
  liveOpenStatus,
  formatHour,
  dateKeyInTimezone,
  type LiveOpenStatus,
} from "@/lib/restaurant-hours";
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
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-white p-8">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-5">
            <Clock className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900">Coming soon</h1>
          <p className="text-gray-600 mt-3 leading-relaxed">
            This restaurant is putting the finishing touches on their site. Check back shortly — they&apos;ll be ready to take your order soon.
          </p>
          <div className="mt-8 text-[11px] text-gray-400 uppercase tracking-wider">
            Powered by Fee Free Ordering
          </div>
        </div>
      </main>
    );
  }

  if (result.kind === "upgrade_required") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-amber-50 p-8">
        <div className="max-w-lg text-center bg-white rounded-3xl shadow-sm border border-gray-100 p-10">
          <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-5">
            <Globe className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900">
            {result.restaurantName}
          </h1>
          <p className="text-gray-600 mt-3 leading-relaxed">
            This restaurant accepts orders directly through their own website. Use their ordering link or visit them in person.
          </p>
          <div className="mt-6 pt-6 border-t border-gray-100 text-xs text-gray-500 leading-relaxed">
            <strong className="text-gray-700">Restaurant owner?</strong> Subscribe to the Sales Optimized Website add-on inside your admin to unlock a full hosted marketing page at this URL.
          </div>
        </div>
      </main>
    );
  }

  const r = result.data;
  // Default theme color: emerald (matches the platform brand). Was red
  // (#ef4444) which clashed with the rest of the Fee Free identity for
  // restaurants who hadn't set their own theme color yet.
  const themeColor = (r.themeSettings?.primaryColor as string) || "#10b981";

  // ── Open-now status calculation ────────────────────────────────────
  // Used in the hero badge ("Open now" / "Opens at 11:00" / "Closed
  // today") and to highlight today's row in the hours table.
  //
  // Centralized in src/lib/restaurant-hours so the order page and the
  // hosted site agree on overnight handling + holidays + 12h/24h
  // formatting. Pure server-side computation — no client JS needed,
  // the page re-renders on every request anyway.
  const now = new Date();
  const todayKey = dateKeyInTimezone(now, r.timezone);
  const todayHoliday = r.holidays.find((h) => h.date === todayKey);
  const openStatus: LiveOpenStatus = liveOpenStatus(
    r.hours,
    now,
    r.hoursFormat,
    todayHoliday ? { name: todayHoliday.name ?? undefined } : undefined,
    // Project to the restaurant's local tz so overnight windows
    // (e.g. Friday 11 AM → Saturday 2 AM) classify correctly even
    // when the server runs in UTC and the restaurant doesn't.
    r.timezone,
  );
  // Highlight today's row in the hours table — must also use local tz.
  const todayDow = (() => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: r.timezone,
      weekday: "short",
    }).formatToParts(now);
    const wk = parts.find((p) => p.type === "weekday")?.value ?? "";
    const map: Record<string, number> = {
      Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
    };
    return map[wk] ?? now.getDay();
  })();
  // ?from=hosted tells the ordering page to render a "Back to <Restaurant>"
  // breadcrumb at the top so customers who arrived from the marketing site
  // can return to it. Without this they hit a dead-end on /order with no
  // way back to the hero/about/etc. they were browsing.
  const orderUrl = `/order/${r.slug}?from=hosted`;
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
  // Direct-land the customer on the standalone reservation page —
  // GloriaFood UX (Luigi 2026-06-01 "should not need another click").
  // Used to route through /order/<slug>?service=reservation which
  // opened the ordering page first and required the customer to tap
  // again to enter the reservation flow.
  const reservationDirectUrl = `/order/${r.slug}/reservation?from=hosted`;
  const secondaryCta = secondaryCtaEnabled
    ? {
        label: (s.cta.secondary.label || "Book a Table").trim(),
        href: (s.cta.secondary.href || reservationDirectUrl).trim() || reservationDirectUrl,
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

  // Sticky-nav anchor link list — only emit links for sections that will
  // actually render so the nav doesn't promise a destination we don't
  // deliver. Order matches expected user scroll path. "Menu" always
  // points at /order (the real menu lives there, not on the marketing
  // page); the rest are #anchor scrolls on the marketing page itself.
  const navLinks: Array<{ label: string; href: string }> = [
    { label: "Menu", href: `${orderUrl}` },
  ];
  if (s.sections.specialOffers && r.specialOffers.length > 0) {
    navLinks.push({ label: "Offers", href: "#special-offers" });
  }
  if (s.sections.featuredMenu && r.featuredItems.length > 0) {
    navLinks.push({ label: "Featured", href: "#featured-menu" });
  }
  if (s.sections.about && r.description) {
    navLinks.push({ label: "About", href: "#about" });
  }
  if (s.sections.visit) {
    // Hours + Contact both live inside the "Visit" section so one anchor
    // covers both. We use "Contact" as the label because that's what
    // GloriaFood-style nav conventions use and it tests better with
    // restaurant customers than "Hours" or "Visit".
    navLinks.push({ label: "Contact", href: "#contact" });
  }

  // Service-summary card copy — assembled from the restaurant's enabled
  // services. Matches "We offer Takeout and Food Delivery" (GloriaFood
  // style) pattern Luigi flagged. Skips dine-in/reservations from the
  // copy line (they're not "order online" oriented) but the underlying
  // pills below the visit section still list them.
  const serviceCopy = (() => {
    const parts: string[] = [];
    if (r.acceptsPickup) parts.push("Takeout");
    if (r.acceptsDelivery) parts.push("Food Delivery");
    if (parts.length === 0) return null; // no online services → skip the card
    if (parts.length === 1) return `We offer ${parts[0]}`;
    return `We offer ${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  })();

  return (
    <main className="min-h-screen bg-white">
      {/* Reports — fire the visit beacon on the hosted marketing site
          too, not just /order/<slug>. Hosted-site visitors who never
          progress to the ordering page still count as "visits" in
          Reports → Website Visits + the funnel's top step. */}
      <VisitTracker restaurantId={r.id} />

      {/* JSON-LD structured data for Google's knowledge panel + rich snippets. */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(cleanJsonLd) }}
      />

      {/* ── Sticky top nav ───────────────────────────────────────────────
          Logo on left, anchor links in middle (desktop only), Order CTA
          on right. Pure CSS sticky — no JS. backdrop-blur + slight
          opacity so it doesn't feel like a hard band when scrolled over
          the photo hero. */}
      {s.header.stickyNav && (
        // Transparent-over-hero nav (Luigi 2026-05-30). The grey bar
        // is gone — `bg-transparent` keeps the food photo behind the
        // logo / links / CTA visible on first paint. A scroll-aware
        // class swap (`scrolled:` is the tiny inline-script approach
        // below) restores a dark backdrop once the customer scrolls
        // past the hero so the white nav text stays readable on the
        // white content sections. Tailwind doesn't ship a `scrolled:`
        // variant; we use a CSS variable + class toggled by the
        // inline-script at the bottom of this nav (no React state =
        // works in this server component).
        <nav
          id="ff-hosted-nav"
          className="sticky top-0 z-40 transition-colors duration-200 border-b border-transparent ff-nav-transparent"
          aria-label="Site navigation"
        >
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
            {/* Left: logo (image OR name fallback) */}
            <a href="#top" className="flex items-center gap-3 min-w-0">
              {s.header.showLogo && r.logoUrl ? (
                <Image
                  src={r.logoUrl}
                  alt={`${r.name} logo`}
                  width={44}
                  height={44}
                  className="rounded-md object-contain bg-white/10 p-0.5 flex-shrink-0 drop-shadow-md"
                />
              ) : (
                <span className="text-white font-bold truncate text-base sm:text-lg drop-shadow-md">{r.name}</span>
              )}
            </a>
            {/* Middle: anchor links (hidden on mobile to save space).
                drop-shadow keeps the white text readable over the photo
                hero where there's no nav backdrop. */}
            <div className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="px-3 py-1.5 text-sm font-semibold uppercase tracking-wider text-white hover:bg-white/15 rounded transition drop-shadow-md"
                >
                  {link.label}
                </a>
              ))}
            </div>
            {/* Right: Order CTA — keeps its own theme background so
                it's visible regardless of nav backdrop. */}
            {primaryCta && (
              <Link
                href={primaryCta.href}
                className="inline-flex items-center justify-center px-4 sm:px-5 py-2 rounded-md font-bold text-xs sm:text-sm shadow text-white transition hover:brightness-110"
                style={{ background: themeColor }}
              >
                {primaryCta.label}
              </Link>
            )}
          </div>
          {/* CSS + inline scroll listener — no React state needed.
              Once the customer scrolls > 60px, swap the transparent
              class for the dark-translucent one so the nav stays
              readable over the white content below the hero.
              Plain <style> (NOT `style jsx`) — this file is a server
              component, and styled-jsx requires a client component. */}
          <style
            dangerouslySetInnerHTML={{
              __html: `
                #ff-hosted-nav.ff-nav-transparent { background-color: transparent; }
                #ff-hosted-nav.ff-nav-scrolled    { background-color: rgba(0,0,0,0.85); border-bottom-color: rgba(255,255,255,0.10); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px); }
              `,
            }}
          />
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function(){
                  var nav = document.getElementById('ff-hosted-nav');
                  if (!nav) return;
                  function onScroll() {
                    if (window.scrollY > 60) {
                      nav.classList.remove('ff-nav-transparent');
                      nav.classList.add('ff-nav-scrolled');
                    } else {
                      nav.classList.add('ff-nav-transparent');
                      nav.classList.remove('ff-nav-scrolled');
                    }
                  }
                  window.addEventListener('scroll', onScroll, { passive: true });
                  onScroll();
                })();
              `,
            }}
          />
        </nav>
      )}

      {/* Anchor target for the logo "back to top" link */}
      <div id="top" />

      {/* Hero — TWO layouts based on s.header.fullScreenHero:
       *
       * 1. fullScreenHero=true (default — GloriaFood-style): full-viewport
       *    photo hero with centered title + subtitle over a darkening
       *    overlay. CTAs are intentionally NOT in the hero — they live
       *    in the service-summary card directly below where they're
       *    easier to find than another button competing with the title.
       *
       * 2. fullScreenHero=false: contained banner strip on top with a
       *    theme-color hero block below holding the title + CTAs.
       *    Logo-style banners (text-in-image logos) need this so the
       *    overlay doesn't fight the embedded logo text.
       */}
      {s.header.fullScreenHero && s.sections.banner && r.bannerUrl ? (
        <section
          // Hero shortened from 88vh → ~62vh (Luigi 2026-05-30) so the
          // "See MENU & Order" CTA card directly below sits in the
          // initial viewport on first paint — matches GloriaFood's
          // layout where the order button never requires a scroll on
          // a typical desktop. The food photo still dominates the
          // visible area; the title sits in the upper-middle band.
          //
          // -mt-16 pulls the hero UP under the (now transparent-by-
          // default) sticky nav so the food photo extends to the very
          // top of the viewport. pt-16 inside the inner div re-adds
          // the safe-area below the nav so the title doesn't collide
          // with it.
          className="relative text-white min-h-[62vh] md:min-h-[68vh] flex items-center justify-center text-center -mt-16"
          style={{
            // Configurable overlay opacity. Lower = food photo shows
            // through more clearly. Default 0.4 vs GloriaFood's ~0.35.
            backgroundImage: `linear-gradient(rgba(0,0,0,${s.header.heroOverlayOpacity}), rgba(0,0,0,${s.header.heroOverlayOpacity})), url(${r.bannerUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          <div className="max-w-4xl mx-auto px-6 pt-28 pb-12 md:pt-32 md:pb-16 w-full">
            {s.header.showLogo && r.logoUrl && (
              <div className="mb-6 inline-block">
                <Image
                  src={r.logoUrl}
                  alt={`${r.name} logo`}
                  width={140}
                  height={140}
                  className="rounded-xl bg-white/10 backdrop-blur shadow-xl p-2 object-contain"
                />
              </div>
            )}
            {/* Open-now badge moved out of the hero (Luigi 2026-05-30) —
                it used to sit above the title and visually compete with
                the restaurant name. Now lives in the white service-
                summary card below for the GloriaFood-parity layout. */}
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold leading-tight drop-shadow-lg">
              {heroTitle}
            </h1>
            {heroSlogan && (
              <p className="mt-5 text-lg md:text-xl lg:text-2xl text-white/95 drop-shadow-md max-w-2xl mx-auto">
                {heroSlogan}
              </p>
            )}
            {showCuisine && (
              <p className="mt-3 text-sm uppercase tracking-[0.25em] text-white/80">
                {r.cuisineType}
              </p>
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
              <div className="mb-3">
                <OpenNowBadge status={openStatus} />
              </div>
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

      {/* ── Service summary CTA card ──────────────────────────────────
          Big, centered, white card with "We offer X" + a prominent
          theme-colored "See MENU & Order" button. Positioned to overlap
          slightly with the hero (-mt) so it feels visually anchored to
          it, like the GloriaFood pattern. Only renders when there's a
          service to advertise (pickup/delivery enabled). */}
      {s.sections.serviceSummary && serviceCopy && primaryCta && (
        // Bigger overlap with the hero so the entire CTA card sits in
        // the initial viewport (Luigi 2026-05-30 — GloriaFood parity).
        // Inner padding tightened too so the button sits closer to the
        // "We offer …" copy and the whole block feels compact.
        <section className="relative -mt-16 md:-mt-24 z-10 max-w-3xl mx-auto px-4 sm:px-6">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-100 px-6 py-6 md:py-8 text-center">
            {/* Open-now / closed / opens-at badge — moved here from the
                hero (Luigi 2026-05-30) so it sits just above the
                "We offer …" headline on the same airy white card,
                matching GloriaFood's layout. */}
            <div className="mb-3 flex justify-center">
              <OpenNowBadge status={openStatus} />
            </div>
            <p className="text-lg md:text-xl font-semibold text-gray-900">
              {serviceCopy}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <Link
                href={primaryCta.href}
                className="inline-flex items-center justify-center px-8 py-3.5 rounded-md font-bold text-base md:text-lg shadow-lg hover:shadow-xl transition text-white"
                style={{ background: themeColor }}
              >
                {primaryCta.label}
              </Link>
              {secondaryCta && (
                <Link
                  href={secondaryCta.href}
                  className="inline-flex items-center justify-center px-8 py-3.5 rounded-md font-bold text-base md:text-lg border-2 text-gray-800 hover:bg-gray-50 transition"
                  style={{ borderColor: themeColor, color: themeColor }}
                >
                  {secondaryCta.label}
                </Link>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Custom sections positioned after "banner" — rendered right after
          the hero block, before About. */}
      <CustomSectionsAt position="banner" sections={s.customSections} themeColor={themeColor} />

      {/* About — owner can toggle off in the editor. Content always pulled
          from Restaurant.description (no override). Section hidden when
          description is empty OR owner disabled it. */}
      {s.sections.about && r.description && (
        <section id="about" className="max-w-3xl mx-auto px-6 py-12 scroll-mt-20">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 text-center">About</h2>
          <div className="mt-2 flex justify-center">
            <span className="inline-block w-12 h-1 rounded" style={{ background: themeColor }} />
          </div>
          <p className="mt-6 text-gray-700 leading-relaxed whitespace-pre-line text-center md:text-left">
            {r.description}
          </p>
        </section>
      )}
      <CustomSectionsAt position="about" sections={s.customSections} themeColor={themeColor} />

      {/* ── Special Offers ───────────────────────────────────────────────
          Auto-pulled from active Promotion rows (autoApply=true, within
          their startsAt/endsAt window). Rendered as a grid of cards
          with a CTA pointing to /order — promos auto-apply so customers
          don't need to type a code. Section hidden when no active
          auto-apply promos. Matches the GloriaFood "Special Offers"
          card pattern Luigi flagged in UAT. */}
      {s.sections.specialOffers && r.specialOffers.length > 0 && (
        <section id="special-offers" className="bg-gray-50 scroll-mt-20">
          <div className="max-w-5xl mx-auto px-6 py-14">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 text-center">
              Special Offers
            </h2>
            <div className="mt-2 flex justify-center">
              <span className="inline-block w-12 h-1 rounded" style={{ background: themeColor }} />
            </div>
            <div className={`mt-8 grid gap-5 ${
              r.specialOffers.length === 1
                ? "grid-cols-1 max-w-md mx-auto"
                : r.specialOffers.length === 2
                ? "grid-cols-1 sm:grid-cols-2 max-w-3xl mx-auto"
                : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
            }`}>
              {r.specialOffers.map((promo) => (
                <Link
                  key={promo.id}
                  href={orderUrl}
                  className="group bg-white rounded-xl shadow-sm hover:shadow-lg transition overflow-hidden border border-gray-100 p-5 block"
                >
                  {/* Theme-colored "deal" tag at top of card */}
                  <div className="flex items-center gap-1.5 mb-3">
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full text-white"
                      style={{ background: themeColor }}
                    >
                      Special Offer
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 group-hover:underline">
                    {promo.name}
                  </h3>
                  {promo.description && (
                    <p className="mt-2 text-sm text-gray-600 leading-relaxed line-clamp-3">
                      {promo.description}
                    </p>
                  )}
                  <p
                    className="mt-4 text-sm font-bold inline-flex items-center gap-1"
                    style={{ color: themeColor }}
                  >
                    Order now <span aria-hidden>→</span>
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Featured menu — owner toggle. Items pulled from isFeatured menu rows. */}
      {s.sections.featuredMenu && r.featuredItems.length > 0 && (
        <section id="featured-menu" className="bg-gray-50 scroll-mt-20">
          <div className="max-w-5xl mx-auto px-6 py-14">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 text-center">
              Featured menu
            </h2>
            <div className="mt-2 flex justify-center">
              <span className="inline-block w-12 h-1 rounded" style={{ background: themeColor }} />
            </div>
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
      <section id="contact" className="max-w-5xl mx-auto px-6 py-14 scroll-mt-20">
        <h2 className="sr-only">Contact and hours</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div>
            <h3 className="text-2xl md:text-3xl font-bold text-gray-900">Visit</h3>
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
            {/* Social links — circular brand-icon buttons (Lucide's
                Facebook/Instagram/Twitter/Youtube/Globe). Owner toggle
                + skipped entirely when no links are set. */}
            {s.sections.social && socials.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {socials.map((sl) => (
                  <SocialIconLink key={sl.key} url={sl.url} kind={sl.key} />
                ))}
              </div>
            )}
          </div>
          <div>
            <h3 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-2">
              Hours
              <OpenNowBadge status={openStatus} />
            </h3>
            {/* Today's row is highlighted with the theme color + "Today"
                pill so visitors can instantly see when this restaurant
                is open relative to now. */}
            <ul className="mt-4 divide-y divide-gray-100 border-t border-b border-gray-100">
              {r.hours.map((h) => {
                const isToday = h.dayOfWeek === todayDow;
                return (
                  <li
                    key={h.dayOfWeek}
                    className={`flex justify-between items-center py-2.5 text-sm ${isToday ? "bg-emerald-50/60 -mx-3 px-3 rounded-md" : ""}`}
                  >
                    <span className={`font-medium ${isToday ? "text-emerald-900 font-bold" : "text-gray-800"}`}>
                      {dayName(h.dayOfWeek)}
                      {isToday && (
                        <span className="ml-2 text-[10px] font-bold uppercase tracking-wider bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                          Today
                        </span>
                      )}
                    </span>
                    <span className={isToday ? "text-emerald-900 font-semibold" : "text-gray-600"}>
                      {h.isOpen && h.openTime && h.closeTime
                        ? `${formatHour(h.openTime, r.hoursFormat)} – ${formatHour(h.closeTime, r.hoursFormat)}${h.closesNextDay ? " (next day)" : ""}`
                        : "Closed"}
                    </span>
                  </li>
                );
              })}
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

      <footer className="bg-gray-900 text-gray-300 py-8 pb-24 md:pb-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-wrap items-center justify-between gap-4">
          <p>&copy; {new Date().getFullYear()} {r.name}</p>
          <p className="text-xs text-gray-500">
            Powered by Fee Free Ordering
          </p>
        </div>
      </footer>

      {/* Sticky mobile "Order Online" CTA — appears once the user scrolls
          past the hero. Only renders when there's a primary CTA. Footer
          gets extra bottom padding (pb-24 md:pb-8) so the sticky bar
          doesn't cover the copyright on mobile. */}
      {primaryCta && (
        <StickyOrderCta
          href={primaryCta.href}
          label={primaryCta.label}
          themeColor={themeColor}
        />
      )}
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

/**
 * Computes today's open-now status for the hero badge + today-highlighted
 * hours row. Pure-function — no side effects, takes `now` so tests/SSR
 * stay deterministic.
 *
 * Returns:
 *   - "open"          currently open (between openTime and closeTime today)
 *   - "opens_at"      closed now but opens later today (e.g. opens at 17:00)
 *   - "closed_today"  not open at all today (isOpen=false OR past closing)
 *
 * Times are compared as HH:MM strings — works because input format is
 * always 24-hour HH:MM (validated server-side at save).
 */
/**
 * Open-now status pill. Shown in the hero so visitors instantly see if
 * the restaurant is taking orders right now. The label uses the
 * restaurant-set theme color when open (positive signal) and a neutral
 * slate when closed (no need to alarm — just informative).
 *
 * Receives the four-state LiveOpenStatus from src/lib/restaurant-hours;
 * the computation lives there so the order page + hosted site agree.
 */
function OpenNowBadge({ status }: { status: LiveOpenStatus }) {
  if (status.kind === "open") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500 text-white text-xs font-bold shadow-sm">
        <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
        Open now · until {status.closesAt}
        {status.spansMidnight && (
          <span className="text-emerald-100 font-normal">(next day)</span>
        )}
      </span>
    );
  }
  if (status.kind === "opens_at") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500 text-white text-xs font-bold shadow-sm">
        <Clock className="w-3 h-3" />
        Opens at {status.opensAt}
      </span>
    );
  }
  if (status.kind === "holiday") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-700 text-white text-xs font-bold shadow-sm">
        Closed · {status.name || "Holiday"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-white text-xs font-bold shadow-sm">
      Closed today
    </span>
  );
}

/**
 * Sticky "Order Online" bar that pins to the bottom of the viewport on
 * mobile once the user has scrolled past the hero. Massive conversion
 * win on phones — the primary CTA stays in reach no matter how far they
 * scroll down the menu/visit/hours sections.
 *
 * Hidden by default (translate-y-full) and revealed via a small inline
 * script that flips a CSS class when window.scrollY > 600px. We avoid
 * a full client component because that would add a useEffect + state
 * + hydration roundtrip just for a single CSS class toggle.
 *
 * Hidden on tablet+ since the hero CTA stays visible there.
 */
function StickyOrderCta({ href, label, themeColor }: { href: string; label: string; themeColor: string }) {
  return (
    <>
      <div
        id="sticky-order-cta"
        className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 shadow-lg p-3 md:hidden translate-y-full transition-transform duration-300"
        // Padding-bottom adapts to iOS home-bar safe area.
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <Link
          href={href}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-white shadow-md"
          style={{ background: themeColor }}
        >
          <ShoppingBag className="w-4 h-4" />
          {label}
        </Link>
      </div>
      <script
        // Toggle the sticky CTA via scroll position. Inline because shipping a
        // full client component for one classList flip is overkill.
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: `
            (function () {
              var bar = document.getElementById('sticky-order-cta');
              if (!bar) return;
              function update() {
                if (window.scrollY > 500) bar.classList.remove('translate-y-full');
                else bar.classList.add('translate-y-full');
              }
              window.addEventListener('scroll', update, { passive: true });
              update();
            })();
          `,
        }}
      />
    </>
  );
}

/**
 * Brand-themed monogram button for a social link.
 *
 * Lucide-react removed the actual brand glyphs (Facebook/Instagram/Twitter/
 * YouTube) in v0.474+ for trademark reasons, and depending on a separate
 * @lucide/lab package just for these is overkill. Instead we render a
 * circular badge with the platform's recognizable color + a monogram
 * letter (f for Facebook, Ig for Instagram, X for Twitter, YT for
 * YouTube). Website uses the Lucide Globe (no trademark).
 *
 * Works visually because the colors carry the brand recognition:
 * everyone knows Facebook blue + IG gradient + Twitter/X dark + YouTube
 * red on sight.
 */
function SocialIconLink({ url, kind }: { url: string; kind: "facebook" | "instagram" | "twitter" | "youtube" | "website" }) {
  const labels: Record<typeof kind, string> = {
    facebook: "Facebook",
    instagram: "Instagram",
    twitter: "Twitter / X",
    youtube: "YouTube",
    website: "Website",
  };
  // Per-platform recognizable styling. Background colors mirror each
  // brand's primary color so the badges are instantly identifiable
  // without literal logos.
  const style: Record<typeof kind, { bg: string; fg: string; label: React.ReactNode }> = {
    facebook:  { bg: "#1877F2", fg: "#ffffff", label: <span className="font-extrabold text-[15px]" style={{ fontFamily: "Georgia, serif" }}>f</span> },
    instagram: { bg: "linear-gradient(135deg,#FCAF45 0%,#E1306C 50%,#833AB4 100%)", fg: "#ffffff", label: <span className="font-bold text-[10px] tracking-tight">IG</span> },
    twitter:   { bg: "#0F1419", fg: "#ffffff", label: <span className="font-extrabold text-[14px]">𝕏</span> },
    youtube:   { bg: "#FF0000", fg: "#ffffff", label: <span className="font-bold text-[10px] tracking-tight">▶</span> },
    website:   { bg: "#1F2937", fg: "#ffffff", label: <Globe className="w-4 h-4" /> },
  };
  const s = style[kind];
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${labels[kind]} link`}
      title={labels[kind]}
      className="inline-flex items-center justify-center w-10 h-10 rounded-full hover:scale-110 transition-transform shadow-sm"
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </a>
  );
}
