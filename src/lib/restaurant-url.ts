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
 * True when `host` (a request `Host` header value, may include a port) is this
 * restaurant's OWN verified custom domain — i.e. the fully white-labeled surface
 * where the customer must see ZERO platform branding (no "Powered by Fee Free
 * Ordering"). A platform subdomain (`<sub>.<platform>`) is branded too, but still
 * carries the platform name in the URL, so it is intentionally NOT treated as a
 * custom domain here — only a bring-your-own domain hides the platform brand.
 *
 * Mirrors the www/apex normalization the host resolver applies
 * (src/app/api/internal/resolve-host/route.ts) so luigis.com and www.luigis.com
 * both match the single canonical value stored in Restaurant.customDomain.
 */
export function isOwnCustomDomainHost(
  r: Pick<RestaurantUrlInfo, "customDomain" | "customDomainStatus">,
  host: string | null | undefined,
): boolean {
  if (!host || !r.customDomain || r.customDomainStatus !== "verified") return false;
  const h = host.toLowerCase().split(":")[0].trim(); // strip any :port
  const bare = r.customDomain.toLowerCase().trim().replace(/^www\./, "");
  return !!bare && (h === bare || h === `www.${bare}`);
}

/**
 * True when `host` is the shared NEUTRAL reseller login domain — the GloriaFood
 * "restaurantlogin.com" equivalent: a de-branded login / admin / kitchen surface carrying ZERO
 * "Fee Free Ordering" branding, given to FREE reseller partners' restaurants to log in through.
 * Paid Branded partners replace it with their OWN custom domain. Defaults to
 * restaurantownerlogin.com; override with NEUTRAL_RESELLER_HOST. Luigi 2026-06-23.
 *
 * Client-safe: NEUTRAL_RESELLER_HOST isn't a NEXT_PUBLIC var, so on the client the literal
 * default is used — fine, since the neutral host is only acted on server-side (proxy + layouts).
 */
export function isNeutralResellerHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const neutral = (process.env.NEUTRAL_RESELLER_HOST || "restaurantownerlogin.com")
    .toLowerCase()
    .trim()
    .replace(/^www\./, "");
  if (!neutral) return false;
  const h = host.toLowerCase().split(":")[0].trim();
  return h === neutral || h === `www.${neutral}`;
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
