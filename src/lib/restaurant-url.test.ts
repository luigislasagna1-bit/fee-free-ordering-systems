import { describe, it, expect } from "vitest";
import { restaurantOrderUrl, restaurantOrigin, isOwnCustomDomainHost } from "./restaurant-url";

describe("restaurantOrderUrl", () => {
  it("uses a VERIFIED custom domain, root-relative (proxy prepends /order/<slug>)", () => {
    const url = restaurantOrderUrl(
      { slug: "luigis-lasagna", customDomain: "luigislasagna.com", customDomainStatus: "verified" },
      "/status/abc",
    );
    expect(url).toBe("https://luigislasagna.com/status/abc");
    expect(url).not.toContain("/order/");
  });

  it("ignores an UNVERIFIED custom domain and falls back to the subdomain", () => {
    const url = restaurantOrderUrl(
      { slug: "luigis-lasagna", customDomain: "luigislasagna.com", customDomainStatus: "pending", subdomain: "luigis" },
      "/status/abc",
    );
    expect(url).not.toContain("luigislasagna.com");
    expect(url).toContain("//luigis.");
    expect(url.endsWith("/status/abc")).toBe(true);
    expect(url).not.toContain("/order/");
  });

  it("uses the platform SUBDOMAIN when there is no custom domain (root-relative)", () => {
    const url = restaurantOrderUrl({ slug: "luigis-lasagna", subdomain: "luigis" }, "/paypal/return?orderId=1");
    expect(url).toContain("//luigis.");
    expect(url.endsWith("/paypal/return?orderId=1")).toBe(true);
    expect(url).not.toContain("/order/");
  });

  it("falls back to the platform apex with an explicit /order/<slug> path", () => {
    const url = restaurantOrderUrl({ slug: "luigis-lasagna" }, "/status/abc");
    expect(url).toContain("/order/luigis-lasagna/status/abc");
  });

  it("normalizes a sub-path missing its leading slash", () => {
    expect(restaurantOrderUrl({ slug: "s", customDomain: "x.com", customDomainStatus: "verified" }, "status/1"))
      .toBe("https://x.com/status/1");
  });

  it("storefront URL (empty sub-path)", () => {
    expect(restaurantOrderUrl({ slug: "s", customDomain: "x.com", customDomainStatus: "verified" })).toBe("https://x.com");
    expect(restaurantOrderUrl({ slug: "s" })).toContain("/order/s");
  });

  it("restaurantOrigin flags branded hosts as rooted, platform as not", () => {
    expect(restaurantOrigin({ slug: "s", customDomain: "x.com", customDomainStatus: "verified" }).rooted).toBe(true);
    expect(restaurantOrigin({ slug: "s", subdomain: "luigis" }).rooted).toBe(true);
    expect(restaurantOrigin({ slug: "s" }).rooted).toBe(false);
  });
});

describe("isOwnCustomDomainHost (white-label branding gate)", () => {
  const verified = { customDomain: "luigislasagna.com", customDomainStatus: "verified" };

  it("matches the verified custom domain (apex + www, case/port-insensitive)", () => {
    expect(isOwnCustomDomainHost(verified, "luigislasagna.com")).toBe(true);
    expect(isOwnCustomDomainHost(verified, "www.luigislasagna.com")).toBe(true);
    expect(isOwnCustomDomainHost(verified, "LUIGISLASAGNA.COM")).toBe(true);
    expect(isOwnCustomDomainHost(verified, "luigislasagna.com:443")).toBe(true);
  });

  it("matches when the stored value itself carries a www. prefix", () => {
    const r = { customDomain: "www.luigislasagna.com", customDomainStatus: "verified" };
    expect(isOwnCustomDomainHost(r, "luigislasagna.com")).toBe(true);
    expect(isOwnCustomDomainHost(r, "www.luigislasagna.com")).toBe(true);
  });

  it("does NOT match a platform subdomain — that still shows platform branding", () => {
    expect(isOwnCustomDomainHost(verified, "luigis.feefreeordering.com")).toBe(false);
  });

  it("does NOT match when the custom domain is unverified, absent, or host is empty", () => {
    expect(isOwnCustomDomainHost({ customDomain: "luigislasagna.com", customDomainStatus: "pending" }, "luigislasagna.com")).toBe(false);
    expect(isOwnCustomDomainHost({ customDomain: null, customDomainStatus: "verified" }, "luigislasagna.com")).toBe(false);
    expect(isOwnCustomDomainHost(verified, "")).toBe(false);
    expect(isOwnCustomDomainHost(verified, null)).toBe(false);
  });

  it("does NOT match a different host (no partial / substring matches)", () => {
    expect(isOwnCustomDomainHost(verified, "feefreeordering.com")).toBe(false);
    expect(isOwnCustomDomainHost(verified, "evilluigislasagna.com")).toBe(false);
    expect(isOwnCustomDomainHost(verified, "localhost:3001")).toBe(false);
  });
});
