import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { parseTheme, DEFAULT_THEME } from "@/lib/theme";

export const runtime = "nodejs";

/**
 * Per-restaurant PWA manifest. When a customer taps "Add to Home Screen" / "Install
 * app" on the order page, the OS reads THIS — so the installed app's NAME, ICON and
 * THEME are the restaurant's, not the platform default ("Order Online" / orange glyph
 * from the old static public/manifest-order.webmanifest). Critical for custom-domain
 * white-label: a customer on luigispizzapastawings.com installs "Luigi's Lasagna…",
 * never "Fee Free Ordering". Wired from src/app/order/[slug]/layout.tsx. Luigi 2026-06-23.
 *
 * Served at /order/<slug>/manifest.webmanifest — under /order/<slug>, so the proxy's
 * order-path passthrough serves it on branded hosts with no rewrite. start_url + scope
 * use the absolute /order/<slug> path, which resolves to whatever host (branded or apex)
 * loads the manifest. icons/theme reuse the same restaurant fields as the layout metadata.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const r = await prisma.restaurant.findUnique({
    where: { slug, isActive: true },
    select: { name: true, faviconUrl: true, logoUrl: true, themeSettings: true },
  });

  const name = r?.name ?? "Order";
  // Short label for the home-screen icon: the full name if it's already short, else the
  // first word (the OS truncates anyway, but a clean word beats a mid-word cut).
  const shortName = name.length <= 12 ? name : (name.split(/\s+/)[0] || name).slice(0, 12);
  const themeColor = parseTheme(r?.themeSettings).primaryColor ?? DEFAULT_THEME.primaryColor;
  // Prefer the restaurant's uploaded mark (declared at the install-required sizes so
  // browsers accept + scale it); fall back to the platform glyph only when none exists.
  const icon = r?.faviconUrl ?? r?.logoUrl ?? null;
  const icons = icon
    ? [
        { src: icon, sizes: "192x192", purpose: "any" },
        { src: icon, sizes: "512x512", purpose: "any" },
      ]
    : [
        { src: "/icons/order-icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        { src: "/icons/order-icon.svg", sizes: "192x192 512x512", type: "image/svg+xml", purpose: "maskable" },
      ];

  const manifest = {
    name,
    short_name: shortName,
    description: `Order online from ${name}`,
    start_url: `/order/${slug}`,
    scope: `/order/${slug}`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: themeColor,
    icons,
  };

  return new NextResponse(JSON.stringify(manifest), {
    status: 200,
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      // Per-restaurant but changes rarely — short CDN/browser cache.
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
