import prisma from "@/lib/db";
import { resolveLocale } from "@/lib/i18n-server";
import { marketingMetadata } from "@/lib/seo";
import { DemoClient } from "./DemoClient";

export const metadata = marketingMetadata({
  title: "Live Demo — Fee Free Ordering",
  description: "See a real branded ordering page, the kitchen order app, and the admin dashboard — or import your own GloriaFood menu and try it live, no signup required.",
  path: "/demo",
});

// The demo slug changes rarely; cache it so /demo doesn't hit the DB on every
// visit (this is a public marketing page that can get traffic).
export const revalidate = 3600;

/**
 * Resolve the LIVE demo restaurant's slug so the "Try the ordering demo" link
 * always points at a real storefront. Previously the link hardcoded
 * `/order/demo-pizza-palace` — a slug that only exists in the local seed, so on
 * production it 404'd (the reseller-reported bug). We look it up by the demo
 * owner email (set by scripts/create-demo-restaurant.ts), and fall back to any
 * published restaurant whose slug starts with "demo" (covers the local seed).
 */
async function getDemoSlug(): Promise<string | null> {
  try {
    const owner = await prisma.user.findFirst({
      where: { email: "demo@feefreeordering.com" },
      select: { restaurantId: true },
    });
    if (owner?.restaurantId) {
      const r = await prisma.restaurant.findFirst({
        // isActive guard: the storefront route (/order/[slug]) only renders
        // ACTIVE restaurants, so without this an inactive/paused demo resolves to
        // a slug whose storefront 404s — the leftmost demo card then dead-ends on
        // a 404 instead of falling back to /marketplace (Fabrizio 2026-06-21).
        where: { id: owner.restaurantId, isActive: true },
        select: { slug: true },
      });
      if (r?.slug) return r.slug;
    }
    const fallback = await prisma.restaurant.findFirst({
      where: { slug: { startsWith: "demo" }, isActive: true },
      select: { slug: true },
      orderBy: { createdAt: "asc" },
    });
    return fallback?.slug ?? null;
  } catch {
    return null;
  }
}

export default async function DemoPage() {
  const [locale, demoSlug] = await Promise.all([resolveLocale(), getDemoSlug()]);
  return <DemoClient locale={locale} demoSlug={demoSlug} />;
}
