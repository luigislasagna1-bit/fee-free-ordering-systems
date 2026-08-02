import { describe, expect, it } from "vitest";
import {
  APP_NAME_MAX,
  approvalBlockers,
  deriveBundleId,
  isValidBundleId,
  validateDraft,
} from "./validate";

describe("validateDraft — partial saves check only provided fields", () => {
  it("empty draft has no errors (nothing provided yet)", () => {
    expect(validateDraft({})).toEqual([]);
  });

  it("app name length limits (3–30, store caps)", () => {
    expect(validateDraft({ appName: "Lu" })).toEqual([{ field: "appName", code: "too_short" }]);
    expect(validateDraft({ appName: "L".repeat(APP_NAME_MAX + 1) })).toEqual([{ field: "appName", code: "too_long" }]);
    expect(validateDraft({ appName: "Luigi's Lasagna" })).toEqual([]);
  });

  it("description caps (80 / 4000)", () => {
    expect(validateDraft({ shortDescription: "x".repeat(81) })).toEqual([{ field: "shortDescription", code: "too_long" }]);
    expect(validateDraft({ shortDescription: "x".repeat(80) })).toEqual([]);
    expect(validateDraft({ fullDescription: "x".repeat(4001) })).toEqual([{ field: "fullDescription", code: "too_long" }]);
  });

  it("email / url / hex / platform shapes", () => {
    expect(validateDraft({ supportEmail: "not-an-email" })).toEqual([{ field: "supportEmail", code: "invalid" }]);
    expect(validateDraft({ supportEmail: "info@luigislasagna.com" })).toEqual([]);
    expect(validateDraft({ privacyPolicyUrl: "ftp://nope" })).toEqual([{ field: "privacyPolicyUrl", code: "invalid" }]);
    expect(validateDraft({ privacyPolicyUrl: "https://luigislasagna.com/privacy" })).toEqual([]);
    expect(validateDraft({ primaryColorHex: "red" })).toEqual([{ field: "primaryColorHex", code: "invalid" }]);
    expect(validateDraft({ primaryColorHex: "#B91C1C" })).toEqual([]);
    expect(validateDraft({ platformsRequested: "windows" })).toEqual([{ field: "platformsRequested", code: "invalid" }]);
  });

  it("appIconUrl/splashIconUrl must be OUR Blob uploader's URL (SSRF guard)", () => {
    expect(validateDraft({ appIconUrl: "http://169.254.169.254/latest/meta-data/" }))
      .toEqual([{ field: "appIconUrl", code: "invalid" }]);
    expect(validateDraft({ appIconUrl: "https://evil.com/icon.png" }))
      .toEqual([{ field: "appIconUrl", code: "invalid" }]);
    expect(validateDraft({ appIconUrl: "https://abc123.public.blob.vercel-storage.com/branded-apps/icon.png" }))
      .toEqual([]);
    expect(validateDraft({ splashIconUrl: "https://evil.com/splash.png" }))
      .toEqual([{ field: "splashIconUrl", code: "invalid" }]);
  });

  it("appName rejects embedded control characters", () => {
    expect(validateDraft({ appName: "Luigi's\nLasagna" })).toEqual([{ field: "appName", code: "invalid" }]);
  });
});

describe("approvalBlockers — approval freezes the build config, so everything required must be present", () => {
  const complete = {
    appName: "Luigi's Lasagna",
    shortDescription: "Order pickup & delivery from Luigi's in Milton.",
    fullDescription: "Fresh lasagna and pizza…",
    supportEmail: "info@luigislasagna.com",
    privacyPolicyUrl: "https://luigislasagna.com/privacy",
    // Must be OUR Blob uploader's hostname — validateDraft rejects any other
    // host as of the SSRF fix (2026-08-02): the build pipeline fetches this
    // URL server-side, so an attacker-chosen host is a real vector, not a
    // hypothetical one.
    appIconUrl: "https://abc123.public.blob.vercel-storage.com/branded-apps/icon.png",
  };

  it("passes when complete", () => {
    expect(approvalBlockers(complete)).toEqual([]);
  });

  it("flags every missing required field", () => {
    const blockers = approvalBlockers({});
    const fields = blockers.map((b) => b.field).sort();
    expect(fields).toEqual(
      ["appIconUrl", "appName", "fullDescription", "privacyPolicyUrl", "shortDescription", "supportEmail"].sort(),
    );
  });

  it("an invalid provided field blocks approval too", () => {
    const blockers = approvalBlockers({ ...complete, supportEmail: "junk" });
    expect(blockers).toEqual([{ field: "supportEmail", code: "invalid" }]);
  });
});

describe("deriveBundleId — the app is branded as THEIRS in their store accounts", () => {
  it("reverses the restaurant's domain", () => {
    expect(deriveBundleId({ customDomain: "luigislasagna.com", slug: "luigis" }))
      .toBe("com.luigislasagna.orderapp");
    expect(deriveBundleId({ customDomain: "www.luigis-lasagna.com", slug: "luigis" }))
      .toBe("com.luigislasagna.orderapp"); // www stripped, hyphen removed
  });

  it("handles multi-level TLDs and awkward segments", () => {
    expect(deriveBundleId({ customDomain: "mario.pizza.co.uk", slug: "mario" }))
      .toBe("uk.co.pizza.mario.orderapp");
    // Leading-digit segment gets an x prefix; Java keyword gets a suffix.
    expect(deriveBundleId({ customDomain: "24hpizza.com", slug: "p" }))
      .toBe("com.x24hpizza.orderapp");
    expect(deriveBundleId({ customDomain: "new.it", slug: "p" }))
      .toBe("it.newapp.orderapp");
  });

  it("falls back to the platform namespace without a custom domain", () => {
    expect(deriveBundleId({ customDomain: null, slug: "demo-pizza-palace" }))
      .toBe("com.feefreeordering.customer.demopizzapalace");
  });

  it("every derived id is valid by our own validator", () => {
    for (const d of ["luigislasagna.com", "www.a-b.io", "24hpizza.com", null]) {
      expect(isValidBundleId(deriveBundleId({ customDomain: d, slug: "some-slug" }))).toBe(true);
    }
  });
});

describe("isValidBundleId", () => {
  it("accepts real ids and rejects malformed ones", () => {
    expect(isValidBundleId("com.luigislasagna.orderapp")).toBe(true);
    expect(isValidBundleId("com.feefreeordering.customer.demo")).toBe(true);
    for (const bad of ["single", "com..double", "com.1bad", "Com.Upper.case", "com.new", "", "com.-dash"]) {
      expect(isValidBundleId(bad), bad).toBe(false);
    }
  });
});
