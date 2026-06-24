/**
 * Pure host-resolution decision logic, kept separate from middleware/I/O so
 * it can be unit-tested without spinning up Next.js. The middleware just
 * marshals headers in, calls this, and acts on the returned decision.
 */

import { isReservedSubdomain } from "./reserved";

export type RewriteDecision =
  | { kind: "passthrough"; reason: string }
  | { kind: "marketing"; reason: string }
  | { kind: "marketplace"; reason: string }
  | { kind: "neutral-reseller"; reason: string }
  | { kind: "needs-lookup"; lookupBy: "subdomain" | "customDomain"; value: string };

export interface ResolveContext {
  /** The bare hostname (no port, no protocol). E.g. "luigis.feefreeordering.com". */
  host: string;
  /** The configured platform domain. E.g. "feefreeordering.com" or "localtest.me" in dev. */
  platformDomain: string;
  /** Optional secondary platform suffix(es) we also recognise (e.g. preview deploys). */
  extraPlatformDomains?: string[];
  /** Optional marketplace domain — if set, host = this domain (apex or www) returns
   *  `kind: "marketplace"`. The proxy uses that to rewrite "/" → "/marketplace" and
   *  redirect admin/kitchen paths back to the primary platform. */
  marketplaceDomain?: string;
}

/**
 * Decide what to do with a request for `host`. No DB involved here — if the
 * decision needs a tenant lookup, returns `needs-lookup` and the caller does
 * the lookup using the LRU + API resolver.
 */
export function decideHost({ host, platformDomain, extraPlatformDomains = [], marketplaceDomain }: ResolveContext): RewriteDecision {
  const normalizedHost = host.toLowerCase().split(":")[0].trim();
  if (!normalizedHost) return { kind: "passthrough", reason: "empty-host" };

  // Neutral reseller login host (apex or www) — the shared GloriaFood-style
  // "restaurantownerlogin.com" given to FREE reseller partners. It serves
  // /login + /admin + /kitchen DE-BRANDED (no Fee Free Ordering chrome) and
  // is NEVER a tenant. Checked FIRST (before marketplace / platform / custom-
  // domain fallthrough) so it can't be mis-classified as a custom-domain
  // lookup. Mirrors the env/default used by isNeutralResellerHost() in
  // src/lib/restaurant-url.ts, with the same www normalization.
  const neutralResellerHost = (process.env.NEUTRAL_RESELLER_HOST || "restaurantownerlogin.com")
    .toLowerCase()
    .trim()
    .replace(/^www\./, "");
  if (
    neutralResellerHost &&
    (normalizedHost === neutralResellerHost || normalizedHost === `www.${neutralResellerHost}`)
  ) {
    return { kind: "neutral-reseller", reason: "neutral-reseller-host" };
  }

  // Marketplace domain (apex or www) — proxy then handles path-level routing.
  // Checked BEFORE platform-domain matching so feefreefood.com never gets
  // mis-classified as a tenant lookup. www → apex is handled at the Vercel
  // domain config level (apex is canonical), so we treat both the same here.
  if (marketplaceDomain) {
    const mp = marketplaceDomain.toLowerCase();
    if (normalizedHost === mp || normalizedHost === `www.${mp}`) {
      return { kind: "marketplace", reason: "marketplace-domain" };
    }
  }

  // Treat any common dev / preview / tunnel host as passthrough so /admin etc.
  // work exactly as today. Includes ngrok / cloudflared / localtunnel so
  // testing on a real phone from a dev machine doesn't 404 the customer flow.
  if (
    normalizedHost === "localhost" ||
    normalizedHost === "127.0.0.1" ||
    normalizedHost.endsWith(".vercel.app") ||
    normalizedHost.endsWith(".ngrok-free.dev") ||
    normalizedHost.endsWith(".ngrok-free.app") ||
    normalizedHost.endsWith(".ngrok.io") ||
    normalizedHost.endsWith(".ngrok.app") ||
    normalizedHost.endsWith(".trycloudflare.com") ||
    normalizedHost.endsWith(".loca.lt") ||
    normalizedHost.endsWith(".ts.net")
  ) {
    return { kind: "passthrough", reason: "dev-or-preview-host" };
  }

  const platformDomains = [platformDomain, ...extraPlatformDomains]
    .map((d) => d.toLowerCase())
    .filter(Boolean);

  for (const platform of platformDomains) {
    // Apex or www → marketing root
    if (normalizedHost === platform || normalizedHost === `www.${platform}`) {
      return { kind: "marketing", reason: "apex-or-www" };
    }
    // app.<platform> → admin/kitchen console; passes through to the existing tree
    if (normalizedHost === `app.${platform}`) {
      return { kind: "passthrough", reason: "console-subdomain" };
    }
    // <something>.<platform> → tenant subdomain (single label only — no <a.b.platform> nesting)
    if (normalizedHost.endsWith(`.${platform}`)) {
      const label = normalizedHost.slice(0, normalizedHost.length - platform.length - 1);
      if (!label.includes(".")) {
        // Reject reserved labels at this stage so we never even hit the LRU.
        if (isReservedSubdomain(label)) {
          return { kind: "marketing", reason: "reserved-label" };
        }
        return { kind: "needs-lookup", lookupBy: "subdomain", value: label };
      }
      // Nested deeper than one label under the platform — treat as misroute,
      // fall through to marketing.
      return { kind: "marketing", reason: "deep-nested-subdomain" };
    }
  }

  // Not a platform host at all → must be a tenant's custom domain.
  return { kind: "needs-lookup", lookupBy: "customDomain", value: normalizedHost };
}
