import { describe, it, expect, beforeEach } from "vitest";
import { getCached, setCached, invalidateHost, clearCache, type TenantInfo } from "./lru";

beforeEach(() => clearCache());

/** Every field of TenantInfo, all non-default so a dropped one is visible. */
const FULL: TenantInfo = {
  slug: "luigis-lasagna-pizzeria",
  hasHostedSite: true,
  resellerProfileId: "res_123",
  customDomainActive: false,
  subdomain: "luigis",
  redirectToHost: "www.luigislasagna.com",
  resellerLapsedRef: "ref_abc123",
};

describe("tenant LRU round-trip", () => {
  it("REGRESSION (2026-07-30): returns EVERY field it was given", () => {
    // The getter used to rebuild TenantInfo field-by-field and silently omit
    // redirectToHost, so a post-cutover domain redirected on a cold cache and
    // 404'd on a warm one — an intermittent-looking outage. Compare the whole
    // object so ANY future field added to TenantInfo but forgotten in
    // getCached() fails here instead of in production.
    setCached("customDomain:old.com", FULL);
    const got = getCached("customDomain:old.com");
    expect(got.hit).toBe(true);
    if (!got.hit) return;
    expect(got.info).toEqual(FULL);
  });

  it("caches a lapsed-reseller answer for the POSITIVE ttl (it is a real resolution)", () => {
    // The host IS ours, it just isn't entitled today. Treating it as a miss would
    // re-query the resolver every 10s for a partner who may stay lapsed for months.
    setCached("customDomain:acme.com", { slug: null, hasHostedSite: false, resellerLapsedRef: "ref_abc" });
    const got = getCached("customDomain:acme.com");
    expect(got.hit).toBe(true);
    if (!got.hit) return;
    expect(got.info.resellerLapsedRef).toBe("ref_abc");
  });

  it("carries redirectToHost specifically (the field that broke)", () => {
    setCached("customDomain:old.com", { slug: null, hasHostedSite: false, redirectToHost: "new.com" });
    const got = getCached("customDomain:old.com");
    expect(got.hit && got.info.redirectToHost).toBe("new.com");
  });

  it("a genuine miss (no slug, no redirect) round-trips as a miss", () => {
    setCached("customDomain:nobody.com", { slug: null, hasHostedSite: false });
    const got = getCached("customDomain:nobody.com");
    expect(got.hit).toBe(true);
    if (!got.hit) return;
    expect(got.info.slug).toBeNull();
    expect(got.info.redirectToHost).toBeNull();
  });

  it("unknown host is a miss", () => {
    expect(getCached("customDomain:never-seen.com").hit).toBe(false);
  });

  it("invalidateHost drops the entry", () => {
    setCached("customDomain:x.com", FULL);
    invalidateHost("customDomain:x.com");
    expect(getCached("customDomain:x.com").hit).toBe(false);
  });

  it("defaults are applied for fields that were never set", () => {
    setCached("customDomain:min.com", { slug: "s", hasHostedSite: false });
    const got = getCached("customDomain:min.com");
    expect(got.hit).toBe(true);
    if (!got.hit) return;
    expect(got.info.customDomainActive).toBe(true);   // defaults to active
    expect(got.info.resellerProfileId).toBeNull();
    expect(got.info.subdomain).toBeNull();
    expect(got.info.redirectToHost).toBeNull();
  });

  it("does not leak the internal expiresAt into TenantInfo", () => {
    setCached("customDomain:old.com", FULL);
    const got = getCached("customDomain:old.com");
    expect(got.hit && "expiresAt" in (got.info as object)).toBe(false);
  });
});
