import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * The precedence chain here decides what gets PRINTED ON PAPER, so the failure mode of a
 * bug is "reprint 5,000 flyers", not "redeploy". Every rung of the chain and every reason
 * to fall off it is pinned.
 *
 * NEXT_PUBLIC_APP_URL is read at module scope, so each test re-imports with a fresh
 * module registry after setting it.
 */
async function load(appUrl = "https://feefreeordering.com") {
  vi.resetModules();
  process.env.NEXT_PUBLIC_APP_URL = appUrl;
  return import("./referral-url");
}

const BASE = {
  referralCode: "abc123",
  status: "approved",
  whiteLabelStatus: "active",
  whiteLabelTier: "full",
  customDomain: "acme.com",
  customDomainStatus: "verified",
  genericSubdomain: "acme",
};

const ORIGINAL = process.env.NEXT_PUBLIC_APP_URL;
beforeEach(() => vi.resetModules());
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = ORIGINAL;
});

describe("buildResellerReferralUrl — precedence", () => {
  it("prefers a verified custom domain on the Full tier", async () => {
    const { buildResellerReferralUrl } = await load();
    const r = buildResellerReferralUrl(BASE);
    expect(r.url).toBe("https://acme.com/signup?ref=abc123");
    expect(r.displayUrl).toBe("acme.com/signup");
    expect(r.kind).toBe("custom");
    expect(r.perishable).toBe(true);
  });

  it("falls back to the generic subdomain when the custom domain is not verified", async () => {
    const { buildResellerReferralUrl } = await load();
    const r = buildResellerReferralUrl({ ...BASE, customDomainStatus: "verifying" });
    expect(r.url).toBe("https://acme.feefreeordering.com/signup?ref=abc123");
    expect(r.kind).toBe("generic");
  });

  it("falls back to the platform apex when the subscription is not active", async () => {
    const { buildResellerReferralUrl } = await load();
    const r = buildResellerReferralUrl({ ...BASE, whiteLabelStatus: "past_due" });
    expect(r.url).toBe("https://feefreeordering.com/signup?ref=abc123");
    expect(r.kind).toBe("platform");
    expect(r.perishable).toBe(false);
  });

  it("falls back to the platform apex when the reseller is not approved", async () => {
    const { buildResellerReferralUrl } = await load();
    const r = buildResellerReferralUrl({ ...BASE, status: "pending" });
    expect(r.kind).toBe("platform");
  });

  /**
   * THE ASYMMETRY. resolve-host requires whiteLabelTier "full" on the custom-domain branch
   * but NOT on the generic-subdomain branch. A legacy "basic" partner with a verified
   * custom domain must fall THROUGH to their subdomain — printing the custom domain would
   * hand out a URL the proxy 404s.
   */
  it("does NOT use a custom domain on the legacy 'basic' tier — falls through to generic", async () => {
    const { buildResellerReferralUrl } = await load();
    const r = buildResellerReferralUrl({ ...BASE, whiteLabelTier: "basic" });
    expect(r.kind).toBe("generic");
    expect(r.url).toBe("https://acme.feefreeordering.com/signup?ref=abc123");
  });

  it("allows a generic subdomain on the 'basic' tier (no tier gate on that branch)", async () => {
    const { buildResellerReferralUrl } = await load();
    const r = buildResellerReferralUrl({
      ...BASE, whiteLabelTier: "basic", customDomain: null, customDomainStatus: "none",
    });
    expect(r.kind).toBe("generic");
  });
});

describe("buildResellerReferralUrl — URL shape", () => {
  it("always uses the /signup path, never the bare host", async () => {
    const { buildResellerReferralUrl } = await load();
    // A branded host's root rewrites to /login, so a bare domain sends prospects to a
    // login screen they have no account for.
    for (const profile of [BASE, { ...BASE, whiteLabelTier: "basic" }, { ...BASE, status: "pending" }]) {
      expect(buildResellerReferralUrl(profile).url).toContain("/signup?ref=");
      expect(buildResellerReferralUrl(profile).displayUrl).toMatch(/\/signup$/);
    }
  });

  it("always carries ?ref= — including on branded hosts where it is redundant", async () => {
    const { buildResellerReferralUrl } = await load();
    expect(buildResellerReferralUrl(BASE).url).toContain("?ref=abc123");
  });

  it("strips protocol, www. and port from the printed line", async () => {
    const { buildResellerReferralUrl } = await load();
    const r = buildResellerReferralUrl({ ...BASE, customDomain: "https://www.Acme.com:8443/x" });
    expect(r.host).toBe("acme.com");
    expect(r.displayUrl).toBe("acme.com/signup");
  });

  it("url-encodes the referral code", async () => {
    const { buildResellerReferralUrl } = await load();
    expect(buildResellerReferralUrl({ ...BASE, referralCode: "a b&c" }).url).toContain("ref=a%20b%26c");
  });

  it("derives the generic subdomain from NEXT_PUBLIC_APP_URL, not a hardcoded host", async () => {
    const { buildResellerReferralUrl } = await load("https://staging.example.org");
    const r = buildResellerReferralUrl({ ...BASE, customDomainStatus: "none" });
    expect(r.url).toBe("https://acme.staging.example.org/signup?ref=abc123");
  });
});

describe("buildResellerReferralUrl — falsy/blank handling", () => {
  it("treats a blank custom domain and blank subdomain as absent", async () => {
    const { buildResellerReferralUrl } = await load();
    const r = buildResellerReferralUrl({ ...BASE, customDomain: "   ", genericSubdomain: "  " });
    expect(r.kind).toBe("platform");
  });

  it("handles a plain profile with only a referral code", async () => {
    const { buildResellerReferralUrl } = await load();
    const r = buildResellerReferralUrl({ referralCode: "solo" });
    expect(r.url).toBe("https://feefreeordering.com/signup?ref=solo");
    expect(r.kind).toBe("platform");
    expect(r.perishable).toBe(false);
  });
});
