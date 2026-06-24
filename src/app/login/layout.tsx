import type { Metadata } from "next";
import { headers } from "next/headers";
import { isNeutralResellerHost } from "@/lib/restaurant-url";

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
