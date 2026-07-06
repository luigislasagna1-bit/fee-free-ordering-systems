/**
 * Multi-tenant sitemap.xml emitter.
 *
 * Same code serves three host shapes:
 *   1. `feefreeordering.com/sitemap.xml`       — platform marketing pages
 *      (/, /pricing, /features, /faq, /partners, etc.)
 *   2. `feefreefood.com/sitemap.xml`           — marketplace landing pages
 *      (the grid + every individual restaurant)
 *   3. `<slug>.feefreeordering.com/sitemap.xml` — hosted site sitemap for
 *      that specific restaurant. Lists / + all programmatic-SEO landing
 *      pages (every cuisine × city × delivery|takeout combo).
 *
 * Search engines fetch the sitemap on first crawl and use it as a hint
 * for which URLs to index. Without this, our ~80 programmatic landing
 * pages per restaurant could take weeks to discover via link-following.
 * With it, Google typically indexes within days.
 *
 * The proxy matcher already excludes /sitemap.xml so this handler runs
 * directly on whichever host the request lands on. We read req.headers
 * to detect the shape and branch.
 */
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { hasFeature } from "@/lib/entitlements";
import { buildSeoLinks } from "@/lib/hosted-site-seo";
import { COMPETITORS } from "@/data/competitors";
import { LANDING_PAGES } from "@/data/landing-pages";
import { SOLUTION_PAGES } from "@/data/solution-pages";
import { SEGMENT_PAGES } from "@/data/segment-pages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN || "feefreeordering.com";
const MARKETPLACE_DOMAIN = process.env.MARKETPLACE_DOMAIN || "feefreefood.com";

type UrlEntry = {
  loc: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number; // 0.0 to 1.0
  lastmod?: string;  // ISO date
};

function urlsetXml(urls: UrlEntry[]): string {
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  for (const u of urls) {
    lines.push("  <url>");
    lines.push(`    <loc>${escapeXml(u.loc)}</loc>`);
    if (u.lastmod) lines.push(`    <lastmod>${u.lastmod}</lastmod>`);
    if (u.changefreq) lines.push(`    <changefreq>${u.changefreq}</changefreq>`);
    if (u.priority != null) lines.push(`    <priority>${u.priority.toFixed(1)}</priority>`);
    lines.push("  </url>");
  }
  lines.push("</urlset>");
  return lines.join("\n");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xmlResponse(body: string): NextResponse {
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Sitemaps don't change often — let Vercel cache for an hour, but
      // allow stale-while-revalidate so live updates still propagate.
      "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

export async function GET(req: NextRequest) {
  const rawHost = (req.headers.get("host") || "").toLowerCase().split(":")[0].trim();

  // ── 1. Marketplace domain (feefreefood.com)
  if (rawHost === MARKETPLACE_DOMAIN || rawHost === `www.${MARKETPLACE_DOMAIN}`) {
    return xmlResponse(await buildMarketplaceSitemap(MARKETPLACE_DOMAIN));
  }

  // ── 2. Platform apex (feefreeordering.com) — marketing pages only
  if (rawHost === PLATFORM_DOMAIN || rawHost === `www.${PLATFORM_DOMAIN}`) {
    return xmlResponse(buildPlatformSitemap(PLATFORM_DOMAIN));
  }

  // ── 3. Tenant subdomain (<slug>.feefreeordering.com)
  if (rawHost.endsWith(`.${PLATFORM_DOMAIN}`)) {
    const sub = rawHost.slice(0, rawHost.length - PLATFORM_DOMAIN.length - 1);
    if (sub && !sub.includes(".")) {
      return xmlResponse(await buildTenantSitemap(rawHost, sub));
    }
  }

  // Unknown host — empty sitemap so crawlers don't error out.
  return xmlResponse(urlsetXml([]));
}

/** Platform marketing sitemap. Static-ish list + every /vs/{competitor}
 *  page so search engines discover them on first crawl. */
function buildPlatformSitemap(host: string): string {
  const base = `https://${host}`;
  const urls: UrlEntry[] = [
    { loc: `${base}/`, changefreq: "weekly", priority: 1.0 },
    { loc: `${base}/pricing`, changefreq: "weekly", priority: 0.8 },
    // GloriaFood-shutdown migration page (Oracle EOL Apr 30 2027) — timely,
    // high-intent organic target; priority above the /vs pages while the
    // migration wave lasts. COMPETITOR-TOWNCLUB-PLAN.md action #1.
    { loc: `${base}/gloriafood-alternative`, changefreq: "weekly", priority: 0.8 },
    // Flagship kitchen-reliability landing page (ring→print→call→auto-accept) —
    // our most defensible operational moat. COMPETITOR-TOWNCLUB-PLAN.md action #5.
    { loc: `${base}/never-miss-an-order`, changefreq: "monthly", priority: 0.8 },
    { loc: `${base}/features`, changefreq: "weekly", priority: 0.7 },
    { loc: `${base}/faq`, changefreq: "monthly", priority: 0.5 },
    { loc: `${base}/partners`, changefreq: "monthly", priority: 0.5 },
    { loc: `${base}/signup`, changefreq: "monthly", priority: 0.6 },
    { loc: `${base}/login`, changefreq: "yearly", priority: 0.3 },
    { loc: `${base}/privacy`, changefreq: "yearly", priority: 0.3 },
    { loc: `${base}/terms`, changefreq: "yearly", priority: 0.3 },
    { loc: `${base}/refund`, changefreq: "yearly", priority: 0.3 },
  ];
  // SEO comparison pages — high-value organic + AI-agent targets
  // ("X alternative" searches, ChatGPT answers, etc.). Priority 0.6
  // — below the marketing chrome but above utility pages.
  for (const c of COMPETITORS) {
    urls.push({ loc: `${base}/vs/${c.slug}`, changefreq: "monthly", priority: 0.6 });
  }
  // Programmatic "online ordering for {cuisine}" SEO landing pages — high-intent
  // organic targets that funnel into the import-to-try flow. Priority 0.7 (above
  // the comparison pages — these target broader, higher-volume queries).
  for (const p of LANDING_PAGES) {
    urls.push({ loc: `${base}/online-ordering-for/${p.slug}`, changefreq: "monthly", priority: 0.7 });
  }
  // Root-level programmatic "solution" SEO pages (use-case/feature, CMS/platform, city) —
  // e.g. /online-ordering-system, /wordpress-restaurant-ordering-plugin. Same SSG + JSON-LD engine.
  for (const p of SOLUTION_PAGES) {
    urls.push({ loc: `${base}/${p.slug}`, changefreq: "monthly", priority: 0.6 });
  }
  // Segment pages (/for/restaurant-groups, /for/virtual-brands) — same SEO
  // engine, priority 0.6. COMPETITOR-TOWNCLUB-PLAN.md action #8.
  for (const p of SEGMENT_PAGES) {
    urls.push({ loc: `${base}/for/${p.slug}`, changefreq: "monthly", priority: 0.6 });
  }
  // Also surface /demo + /import (the conversion entry points) so crawlers index them.
  urls.push({ loc: `${base}/demo`, changefreq: "monthly", priority: 0.6 });
  urls.push({ loc: `${base}/import`, changefreq: "monthly", priority: 0.6 });
  // HTML sitemap / link hub — the footer links the full landing-page list here,
  // so crawlers reaching it follow descriptive anchors to every SEO page.
  urls.push({ loc: `${base}/sitemap`, changefreq: "monthly", priority: 0.3 });
  return urlsetXml(urls);
}

/** Marketplace sitemap — grid + each published+listed restaurant. */
async function buildMarketplaceSitemap(host: string): Promise<string> {
  const base = `https://${host}`;
  const listings = await prisma.marketplaceListing.findMany({
    where: {
      isListed: true,
      restaurant: {
        isActive: true,
        publishedAt: { not: null },
        stripeChargesEnabled: true,
      },
    },
    include: { restaurant: { select: { slug: true, updatedAt: true } } },
  });
  const urls: UrlEntry[] = [
    { loc: `${base}/`, changefreq: "daily", priority: 1.0 },
  ];
  for (const l of listings) {
    urls.push({
      loc: `${base}/marketplace/${l.restaurant.slug}`,
      changefreq: "weekly",
      priority: 0.7,
      lastmod: l.restaurant.updatedAt.toISOString().slice(0, 10),
    });
  }
  return urlsetXml(urls);
}

/** Tenant sitemap — hosted homepage + every SEO landing page. */
async function buildTenantSitemap(host: string, subdomain: string): Promise<string> {
  const base = `https://${host}`;
  // Look up the restaurant. Sitemap only emitted for hosted-site
  // customers (with the hosted_marketing_page entitlement). For
  // ordering-only tenants we just emit the order page.
  const restaurant = await prisma.restaurant.findFirst({
    where: {
      OR: [{ subdomain }, { slug: subdomain }],
      isActive: true,
      publishedAt: { not: null },
    },
    select: {
      id: true,
      slug: true,
      city: true,
      cuisineType: true,
      updatedAt: true,
    },
  });
  if (!restaurant) return urlsetXml([]);

  const lastmod = restaurant.updatedAt.toISOString().slice(0, 10);
  const urls: UrlEntry[] = [];

  const hostedEntitled = await hasFeature(restaurant.id, "hosted_marketing_page");
  if (hostedEntitled) {
    // Hosted homepage gets top priority on the tenant sitemap.
    urls.push({ loc: `${base}/`, changefreq: "weekly", priority: 1.0, lastmod });

    // Pull menu-derived keywords the same way the page does so the
    // sitemap matches what we actually render.
    const [categories, items] = await Promise.all([
      prisma.menuCategory.findMany({
        where: { restaurantId: restaurant.id, isActive: true, isHidden: false },
        orderBy: { sortOrder: "asc" },
        take: 12,
        select: { name: true },
      }),
      prisma.menuItem.findMany({
        where: { restaurantId: restaurant.id, isAvailable: true, isFeatured: true },
        orderBy: { sortOrder: "asc" },
        take: 8,
        select: { name: true },
      }),
    ]);
    const seen = new Set<string>();
    const menuKeywords: string[] = [];
    const add = (name: string) => {
      const t = name.trim();
      if (!t || t.split(/\s+/).length > 3) return;
      const k = t.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      menuKeywords.push(t);
    };
    for (const c of categories) add(c.name);
    for (const it of items) add(it.name);

    const seoLinks = buildSeoLinks({
      city: restaurant.city,
      cuisineType: restaurant.cuisineType,
      menuKeywords,
    });
    for (const l of seoLinks) {
      urls.push({
        loc: `${base}/${l.slug}`,
        changefreq: "weekly",
        priority: 0.6,
        lastmod,
      });
    }
  } else {
    // Ordering-only tenant — single page sitemap so search engines at
    // least know they exist.
    urls.push({ loc: `${base}/order/${restaurant.slug}`, changefreq: "weekly", priority: 0.8, lastmod });
  }

  return urlsetXml(urls);
}
