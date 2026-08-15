import type { Metadata } from "next";
import { resolveLocale } from "@/lib/i18n-server";
import { SUPPORT_PHONE_TEL } from "@/lib/support";
import { safeJsonLd } from "@/lib/safe-json-ld";
import { APP_LINKS } from "@/lib/app-links";
import { HomeClient } from "./HomeClient";

// Homepage-specific SEO metadata (overrides the layout default). Targets the
// brand name + the high-intent terms a restaurant owner searches ("0% commission
// online ordering", "online ordering for restaurants"). Luigi flagged 2026-06-21
// that we don't rank yet — this + Search Console + the landing pages are the fix.
export const metadata: Metadata = {
  title: "Fee Free Ordering — 0% Commission Online Ordering for Restaurants",
  description:
    "Your own branded ordering page for pickup, delivery, dine-in & catering — 0% commission, zero per-order fees. Free for your first 100 orders every month, in 38 languages. Built in Canada.",
  keywords: [
    "online ordering system",
    "fee free ordering",
    "0% commission online ordering",
    "commission-free online ordering",
    "restaurant online ordering",
    "online ordering for restaurants",
    "GloriaFood alternative",
    "restaurant ordering app",
    // The Fee Free Order App shipped on both stores (Play 2026-07-22, App
    // Store 2026-08-15) — commercial-intent terms for the native app, which
    // is now a headline feature rather than a footnote.
    "restaurant order taking app",
    "kitchen order app",
    "iOS restaurant order app",
    "Android restaurant order app",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    title: "Fee Free Ordering — 0% Commission Online Ordering for Restaurants",
    description:
      "Your own branded ordering page for pickup, delivery, dine-in & catering. 0% commission, free for your first 100 orders/month, 38 languages.",
    type: "website",
    siteName: "Fee Free Ordering",
    url: "/",
    images: [{ url: "/marketing/og-image.png", width: 1200, height: 630, alt: "Fee Free Ordering — 0% commission online ordering for restaurants" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Fee Free Ordering — 0% Commission Online Ordering for Restaurants",
    description: "Your own branded ordering page for pickup, delivery, dine-in & catering. 0% commission, free to start, 38 languages.",
    images: ["/marketing/og-image.png"],
  },
};

// JSON-LD structured data — invisible to humans, gold to crawlers + AI answer
// engines. Organization establishes the brand entity (so "Fee Free Ordering"
// reads as a company, not a generic phrase); SoftwareApplication describes the
// product. Mirrors the pattern proven on the /vs/[slug] pages.
const ORG_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Fee Free Ordering",
  url: "https://feefreeordering.com",
  logo: "https://feefreeordering.com/marketing/og-image.png",
  description:
    "Zero-commission online ordering platform for independent restaurants — pickup, delivery, dine-in & catering on your own branded page. Free core platform; optional paid add-ons.",
  contactPoint: {
    "@type": "ContactPoint",
    telephone: SUPPORT_PHONE_TEL,
    contactType: "customer service",
    areaServed: "CA",
    availableLanguage: ["English", "French"],
  },
};
const APP_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Fee Free Ordering",
  description:
    "Zero-commission online ordering system for restaurants: a branded ordering page for pickup, delivery, dine-in & catering, a native order-taking app for iOS and Android, marketing tools, and a free customer marketplace listing. Core platform free; optional add-ons.",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web, iOS, Android",
  url: "https://feefreeordering.com",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    description: "Free for your first 100 orders every month. Optional add-ons from $9.99/mo.",
  },
};
/**
 * The Fee Free Order App as its own entity, so a search for "restaurant order
 * taking app for iPhone" can surface the real store listings rather than only
 * the web platform. Emitted only while a listing is actually LIVE
 * (app-links.ts) — we never point structured data at a store page that
 * doesn't exist. Both live since 2026-08-15.
 */
const ORDER_APP_LD = {
  "@context": "https://schema.org",
  "@type": "MobileApplication",
  name: "Fee Free Order App",
  alternateName: "Kitchen Order App",
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Restaurant order-taking app",
  operatingSystem: [APP_LINKS.kitchen.ios && "iOS", APP_LINKS.kitchen.play && "Android"].filter(Boolean).join(", "),
  description:
    "The free native restaurant order-taking app from Fee Free Ordering. New orders ring on an iPhone, iPad or Android tablet even with the screen off; staff accept, manage and complete orders and print kitchen tickets to a WiFi thermal printer.",
  installUrl: [APP_LINKS.kitchen.ios, APP_LINKS.kitchen.play].filter(Boolean) as string[],
  downloadUrl: [APP_LINKS.kitchen.ios, APP_LINKS.kitchen.play].filter(Boolean) as string[],
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  publisher: { "@type": "Organization", name: "Fee Free Ordering Inc.", url: "https://feefreeordering.com" },
};

export default async function HomePage() {
  const locale = await resolveLocale();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(ORG_LD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(APP_LD) }} />
      {(APP_LINKS.kitchen.ios || APP_LINKS.kitchen.play) && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(ORDER_APP_LD) }} />
      )}
      <HomeClient locale={locale} />
    </>
  );
}
