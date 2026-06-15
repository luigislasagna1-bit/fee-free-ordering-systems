/**
 * Tiny LRU cache for host → tenant slug lookups, used by the edge middleware.
 *
 * The middleware can't reach Prisma directly (edge runtime), so it calls an
 * internal Node API route. Without caching, every page view would round-trip
 * to that route. With this cache, the round-trip happens at most once per
 * (host, TTL) — which is approximately zero for the live traffic on each
 * tenant's site.
 *
 * Capacity: 500 entries. That's ~500 distinct hosts in any 60-second window —
 * comfortably above the natural cardinality of even a 1000-restaurant platform.
 *
 * TTLs:
 *   - Positive (resolved to a slug):  60s — long enough to absorb steady traffic,
 *                                     short enough that an admin domain change is
 *                                     visible within a minute.
 *   - Negative (host not registered):  10s — absorbs bot traffic / typo attacks
 *                                     without holding stale 404s for too long if
 *                                     the admin adds the host right after.
 */

const POSITIVE_TTL_MS = 60_000;
const NEGATIVE_TTL_MS = 10_000;
const MAX_ENTRIES = 500;

export type TenantInfo = {
  slug: string | null;
  /** Whether the restaurant has the `hosted_marketing_page` entitlement.
   *  Cached together with slug so the middleware can branch the root-path
   *  rewrite (hosted-site customers go to /site/<slug>, plain ordering
   *  customers go to /order/<slug>). Always false when slug is null. */
  hasHostedSite: boolean;
  /** When the host matched a reseller's verified+active customDomain
   *  (Full tier white-label), this is the ResellerProfile.id and `slug`
   *  is null. The middleware rewrites all paths on that host to
   *  /login?reseller=<id> for the branded login screen. */
  resellerProfileId?: string | null;
  /** For a CUSTOM-DOMAIN hit: whether the restaurant's Custom Domain
   *  add-on (`custom_domain_routing`) is still active. When false the
   *  domain row still matches (customDomain + verified) but the add-on
   *  has lapsed — the proxy 302-redirects to the free platform link
   *  instead of serving the paid vanity domain. Always true for
   *  subdomain hits (the platform subdomain is free). */
  customDomainActive?: boolean;
  /** The restaurant's free platform subdomain label, if set. Used as the
   *  redirect target (`<subdomain>.<platform>`) when a custom domain has
   *  lapsed; null falls back to `<platform>/order/<slug>`. */
  subdomain?: string | null;
};

type Entry = TenantInfo & { expiresAt: number };

// One Map per module load. JavaScript Maps preserve insertion order, which we
// use to evict the oldest entry when we exceed MAX_ENTRIES.
const cache = new Map<string, Entry>();

export function getCached(host: string): { hit: true; info: TenantInfo } | { hit: false } {
  const e = cache.get(host);
  if (!e) return { hit: false };
  if (e.expiresAt < Date.now()) {
    cache.delete(host);
    return { hit: false };
  }
  // Refresh LRU order: re-insert so this entry becomes "most recent".
  cache.delete(host);
  cache.set(host, e);
  return { hit: true, info: { slug: e.slug, hasHostedSite: e.hasHostedSite, resellerProfileId: e.resellerProfileId ?? null, customDomainActive: e.customDomainActive ?? true, subdomain: e.subdomain ?? null } };
}

export function setCached(host: string, info: TenantInfo): void {
  const ttl = info.slug === null ? NEGATIVE_TTL_MS : POSITIVE_TTL_MS;
  cache.set(host, { ...info, expiresAt: Date.now() + ttl });
  if (cache.size > MAX_ENTRIES) {
    // Evict the oldest (first inserted) entry. Map iteration is insertion-ordered.
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
}

export function invalidateHost(host: string): void {
  cache.delete(host);
}

export function clearCache(): void {
  cache.clear();
}
