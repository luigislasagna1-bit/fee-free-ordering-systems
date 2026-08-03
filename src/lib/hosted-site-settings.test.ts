import { describe, it, expect } from "vitest";
import {
  defaultHostedSiteSettings,
  parseHostedSiteSettings,
  type CustomSection,
} from "./hosted-site-settings";

describe("hosted-site-settings — custom CTA button (2026-08-02)", () => {
  it("defaults cta.custom to disabled/empty and every custom section to a disabled cta", () => {
    const defaults = defaultHostedSiteSettings();
    expect(defaults.cta.custom).toEqual({
      enabled: false,
      label: "",
      href: null,
      newTab: false,
    });
    expect(defaults.customSections).toEqual([]);
  });

  it("round-trips a fully configured hero custom CTA through parse", () => {
    const raw = JSON.stringify({
      cta: {
        custom: { enabled: true, label: "See our menu on Yelp", href: "https://yelp.com/biz/x", newTab: true },
      },
    });
    const parsed = parseHostedSiteSettings(raw);
    expect(parsed.cta.custom).toEqual({
      enabled: true,
      label: "See our menu on Yelp",
      href: "https://yelp.com/biz/x",
      newTab: true,
    });
    // primary/secondary still fall back to their own defaults — merge is
    // per-field, not all-or-nothing.
    expect(parsed.cta.primary.label).toBe("Order Online");
  });

  it("backfills a disabled default cta on a custom section saved BEFORE this feature shipped", () => {
    // Simulates a row persisted by the old shape (no `cta` key at all).
    const raw = JSON.stringify({
      customSections: [
        { id: "cs-1", title: "Daily specials", body: "Ask your server", position: "about" },
      ],
    });
    const parsed = parseHostedSiteSettings(raw);
    expect(parsed.customSections).toHaveLength(1);
    expect(parsed.customSections[0].cta).toEqual({
      enabled: false,
      label: "",
      href: null,
      newTab: false,
    });
  });

  it("merges a partial custom-section cta over the disabled default", () => {
    const raw = JSON.stringify({
      customSections: [
        {
          id: "cs-1",
          title: "Catering",
          body: "Ask about our catering menu",
          position: "about",
          cta: { enabled: true, label: "Get a quote" }, // href/newTab omitted
        },
      ],
    });
    const parsed = parseHostedSiteSettings(raw);
    expect(parsed.customSections[0].cta).toEqual({
      enabled: true,
      label: "Get a quote",
      href: null,
      newTab: false,
    });
  });

  it("tolerates a malformed/non-object cta on a custom section (falls back to disabled default)", () => {
    const raw = JSON.stringify({
      customSections: [
        { id: "cs-1", title: "X", body: "Y", position: "about", cta: "not-an-object" },
      ],
    });
    const parsed = parseHostedSiteSettings(raw);
    expect(parsed.customSections[0].cta).toEqual({
      enabled: false,
      label: "",
      href: null,
      newTab: false,
    });
  });

  it("caps custom sections at 2 and each still carries a well-formed cta", () => {
    const sections: CustomSection[] = Array.from({ length: 4 }, (_, i) => ({
      id: `cs-${i}`,
      title: `Section ${i}`,
      body: "body",
      position: "about",
      cta: { enabled: true, label: `Button ${i}`, href: "https://example.com", newTab: false },
    }));
    const raw = JSON.stringify({ customSections: sections });
    const parsed = parseHostedSiteSettings(raw);
    expect(parsed.customSections).toHaveLength(2);
    expect(parsed.customSections.every((s) => typeof s.cta.enabled === "boolean")).toBe(true);
  });
});
