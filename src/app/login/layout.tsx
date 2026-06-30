import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { isNeutralResellerHost } from "@/lib/restaurant-url";

/**
 * `viewportFit: "cover"` lets the login page read `env(safe-area-inset-*)` so
 * the top-right language switcher can clear a phone's notch / status bar instead
 * of tucking under it (kitchen staff sign in on phones). Luigi 2026-06-30.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Login segment layout — metadata only.
 *
 * On the NEUTRAL reseller login host (restaurantownerlogin.com — the shared
 * GloriaFood-style "restaurantlogin.com" equivalent given to FREE reseller
 * partners) the browser tab must read a de-branded "Restaurant Login", NOT
 * "Sign in · Fee Free Ordering". The page-segment generateMetadata defers the
 * title to here on the neutral host (a page title would otherwise override the
 * layout), so this is the single source of the neutral title.
 *
 * On every other host we return {} so the page's own `title: "Sign in"` (and
 * the inherited Fee Free Ordering title template) apply unchanged.
 *
 * robots noindex is kept consistent with the page metadata — a shared login
 * host should never be indexed (duplicate-content + brand confusion).
 */
export async function generateMetadata(): Promise<Metadata> {
  const host = (await headers()).get("host");
  if (isNeutralResellerHost(host)) {
    return {
      title: "Restaurant Login",
      robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
    };
  }
  return {};
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
