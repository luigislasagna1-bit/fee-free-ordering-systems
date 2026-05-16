/**
 * Pure host-resolution decision logic, kept separate from middleware/I/O so
 * it can be unit-tested without spinning up Next.js. The middleware just
 * marshals headers in, calls this, and acts on the returned decision.
 */

import { isReservedSubdomain } from "./reserved";

export type RewriteDecision =
  | { kind: "passthrough"; reason: string }
  | { kind: "marketing"; reason: string }
  | { kind: "needs-lookup"; lookupBy: "subdomain" | "customDomain"; value: string };

export interface ResolveContext {
  /** The bare hostname (no port, no protocol). E.g. "luigis.feefreeordering.com". */
  host: string;
  /** The configured platform domain. E.g. "feefreeordering.com" or "localtest.me" in dev. */
  platformDomain: string;
  /** Optional secondary platform suffix(es) we also recognise (e.g. preview deploys). */
  extraPlatformDomains?: string[];
}

/**
 * Decide what to do with a request for `host`. No DB involved here — if the
 * decision needs a tenant lookup, returns `needs-lookup` and the caller does
 * the lookup using the LRU + API resolver.
 */
export function decideHost({ host, platformDomain, extraPlatformDomains = [] }: ResolveContext): RewriteDecision {
  const normalizedHost = host.toLowerCase().split(":")[0].trim();
  if (!normalizedHost) return { kind: "passthrough", reason: "empty-host" };

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
