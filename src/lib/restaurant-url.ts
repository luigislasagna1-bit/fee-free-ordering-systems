/**
 * Build absolute, customer-facing order-flow URLs on a restaurant's MOST-BRANDED
 * domain, so a customer who started on the restaurant's own domain (a verified
 * custom domain, or its <subdomain>.<platform> link) is kept there through order
 * tracking, payment returns, and email links — instead of being bounced to the
 * platform apex (feefreeordering.com). Luigi 2026-06-22.
 *
 * KEY: the proxy (src/proxy.ts) rewrites EVERY path on a branded host to
 * /order/<slug>/<path>. So on a branded host the order-flow paths are ROOT-relative
 * (no /order/<slug> prefix — the proxy adds it); only the platform apex carries the
 * explicit /order/<slug> prefix. This helper handles that difference so callers just
 * pass the sub-path under the order root (e.g. "/status/<id>").
 *
 * NOT for smart links (/m/<code>) — those must stay on the platform apex (a branded
 * host would rewrite /m/<code> to /order/<slug>/m/<code> and 404). See marketing-studio.ts.
 */
const PLATFORM_BASE = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001").replace(/\/+$/, "");

function platformHost(): string {
  try {
    return new URL(PLATFORM_BASE).host;
  } catch {
    return "feefreeordering.com";
  }
}

export interface RestaurantUrlInfo {
  slug: string;
  subdomain?: string | null;
  customDomain?: string | null;
  /** "verified" means the custom domain is live + routable (see Restaurant.customDomainStatus). */
  customDomainStatus?: string | null;
}

/**
 * The origin a restaurant's customer pages live on + whether that origin serves the
 * order pages at its ROOT (branded hosts, via the proxy rewrite) vs under an explicit
 * /order/<slug> path (platform apex). Preference: verified custom domain → platform
 * subdomain → platform apex.
 */
export function restaurantOrigin(r: RestaurantUrlInfo): { origin: string; rooted: boolean } {
  if (r.customDomain && r.customDomainStatus === "verified") {
    return { origin: `https://${r.customDomain}`, rooted: true };
  }
  if (r.subdomain) {
    return { origin: `https://${r.subdomain}.${platformHost()}`, rooted: true };
  }
  return { origin: PLATFORM_BASE, rooted: false };
}

/**
 * Absolute URL to a path under a restaurant's order flow, on its most-branded domain.
 * `subpath` is relative to the order root, e.g. "/status/<id>",
 * "/paypal/return?orderId=x", or "" for the storefront.
 */
export function restaurantOrderUrl(r: RestaurantUrlInfo, subpath = ""): string {
  const { origin, rooted } = restaurantOrigin(r);
  const sub = subpath && !subpath.startsWith("/") ? `/${subpath}` : subpath;
  return rooted ? `${origin}${sub}` : `${origin}/order/${r.slug}${sub}`;
}
