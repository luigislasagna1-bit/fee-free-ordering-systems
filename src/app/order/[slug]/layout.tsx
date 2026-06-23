import type { Metadata, Viewport } from "next";
import prisma from "@/lib/db";
import { parseTheme, DEFAULT_THEME } from "@/lib/theme";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

/**
 * Per-restaurant browser-tab branding for the WHOLE order flow. This lives on the
 * LAYOUT (not just page.tsx) so EVERY sub-page — confirmation, status, info, account,
 * reservation, payment, paypal — inherits the restaurant's name + favicon instead of
 * falling back to the platform default ("Fee Free Ordering Systems" + our icon).
 * Critical for custom-domain white-label: a customer on luigispizzapastawings.com must
 * see "Luigi's Lasagna…" + the restaurant favicon in the tab, never our brand.
 * Luigi 2026-06-22.
 *
 * It also carries the PWA manifest + appleWebApp (Add-to-Home-Screen) and the sandbox
 * noindex, all from ONE lightweight metadata query (replaces the old page.tsx copy, so
 * the hot main-menu path keeps a single metadata lookup — not two). FUTURE: the
 * restaurant-by-slug lookup is a prime cache seam (read on every order render).
 */
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const r = await prisma.restaurant.findUnique({
    where: { slug, isActive: true },
    select: { name: true, faviconUrl: true, logoUrl: true, bannerUrl: true, sandbox: { select: { id: true } } },
  });
  const name = r?.name ?? "Order";
  // Prefer the dedicated square favicon; fall back to the web logo so a custom-domain
  // storefront still shows ITS mark, not the platform icon. Only the platform default
  // remains when a restaurant has uploaded neither. `apple` mirrors `icon` so iOS
  // Add-to-Home-Screen uses the restaurant's mark too (replaces the deleted static
  // platform apple-icon route that branded ALL /order pages with our pizza glyph).
  const icon = r?.faviconUrl ?? r?.logoUrl ?? null;
  // Social-share preview image (banner → web logo → favicon, all absolute Blob URLs).
  // null = omit images so the link unfurls with no platform-branded fallback.
  const ogImage = r?.bannerUrl ?? r?.logoUrl ?? r?.faviconUrl ?? null;
  return {
    // `default` brands tab titles for sub-pages that set none; `template` lets a
    // sub-page prepend its own label (e.g. "Order Confirmed · Luigi's Lasagna").
    title: { default: name, template: `%s · ${name}` },
    ...(icon ? { icons: { icon, apple: icon } } : {}),
    // Per-restaurant PWA manifest (src/app/order/[slug]/manifest.webmanifest/route.ts) so
    // "Add to Home Screen" installs the restaurant's own name/icon/theme, not the platform
    // default. Under /order/<slug> so the proxy serves it on branded hosts too.
    manifest: `/order/${slug}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: name, statusBarStyle: "default" },
    // Per-restaurant link preview so a shared order URL unfurls with the storefront's
    // own name/banner — never the platform brand. `description` reuses the restaurant
    // name (no new translatable string).
    openGraph: {
      title: name,
      description: `Order online from ${name}`,
      type: "website",
      siteName: name,
      ...(ogImage ? { images: [{ url: ogImage, alt: name }] } : {}),
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title: name,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    // Import-to-try sandbox storefronts are anonymous throwaway trial menus — keep them
    // OUT of Google so we don't index a stranger's unclaimed demo. Claiming deletes the
    // SandboxRestaurant row, so the real restaurant becomes indexable automatically.
    ...(r?.sandbox ? { robots: { index: false, follow: false } } : {}),
  };
}

/**
 * Browser theme-color (mobile chrome / status bar tint) follows the restaurant's
 * own primary color from its saved theme, so a custom-domain storefront tints to
 * ITS brand — not the platform emerald. Falls back to DEFAULT_THEME.primaryColor
 * (#10b981, the same value the static export used) when no theme is saved.
 */
export async function generateViewport(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Viewport> {
  const { slug } = await params;
  const r = await prisma.restaurant.findUnique({
    where: { slug, isActive: true },
    select: { themeSettings: true },
  });
  const themeColor = parseTheme(r?.themeSettings).primaryColor ?? DEFAULT_THEME.primaryColor;
  return {
    themeColor,
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
  };
}

export default function OrderLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ServiceWorkerRegister />
      {children}
    </>
  );
}
