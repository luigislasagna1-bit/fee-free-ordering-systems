import { describe, expect, it } from "vitest";
import { sanitizePhone } from "@/lib/phone";
import {
  FAQ_CATEGORIES,
  LINK_KINDS,
  MAX_ACTIVE_UPSELLS,
  MAX_URL_CHARS,
  parseSortOrder,
  sanitizeHttpUrl,
  upsellCapReached,
} from "./validators";

describe("sanitizeHttpUrl (text links)", () => {
  it("accepts absolute http(s) URLs, trimmed", () => {
    expect(sanitizeHttpUrl("https://luigislasagna.com/order?promo=1")).toBe(
      "https://luigislasagna.com/order?promo=1",
    );
    expect(sanitizeHttpUrl("  http://example.com/menu  ")).toBe("http://example.com/menu");
    expect(sanitizeHttpUrl("HTTPS://EXAMPLE.COM/x")).toBe("HTTPS://EXAMPLE.COM/x");
  });

  it("rejects script-exec and non-http schemes (SMS links must be http(s))", () => {
    expect(sanitizeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeHttpUrl("java\tscript:alert(1)")).toBeNull(); // obfuscated scheme
    expect(sanitizeHttpUrl("data:text/html,<b>x</b>")).toBeNull();
    expect(sanitizeHttpUrl("mailto:owner@example.com")).toBeNull();
    expect(sanitizeHttpUrl("tel:+19055550123")).toBeNull();
  });

  it("rejects relative paths and scheme-less strings", () => {
    expect(sanitizeHttpUrl("/order")).toBeNull();
    expect(sanitizeHttpUrl("example.com/menu")).toBeNull();
  });

  it("rejects non-strings, empties, unparseable and oversized URLs", () => {
    expect(sanitizeHttpUrl(null)).toBeNull();
    expect(sanitizeHttpUrl(42)).toBeNull();
    expect(sanitizeHttpUrl("   ")).toBeNull();
    expect(sanitizeHttpUrl("http://")).toBeNull();
    expect(sanitizeHttpUrl(`https://x.com/${"a".repeat(MAX_URL_CHARS)}`)).toBeNull();
  });
});

describe("sanitizePhone reuse (blocked callers)", () => {
  // BlockedCaller.phone is matched RAW against Twilio's E.164 `From` at the
  // TwiML entry route — these assertions pin the "+digits" storage shape.
  it("normalizes to the same +E.164 shape Twilio sends in From", () => {
    expect(sanitizePhone("+1 (905) 385-4444")).toBe("+19053854444");
    expect(sanitizePhone("9053854444")).toBe("+19053854444");
    expect(sanitizePhone("1-905-385-4444")).toBe("+19053854444");
    expect(sanitizePhone("+13656581458")).toBe("+13656581458");
  });

  it("returns null for junk so the route can 400", () => {
    expect(sanitizePhone("not a phone")).toBeNull();
    expect(sanitizePhone("12345")).toBeNull();
    expect(sanitizePhone("")).toBeNull();
  });
});

describe("upsell active cap", () => {
  it("allows activation up to 5, rejects the 6th", () => {
    expect(upsellCapReached(MAX_ACTIVE_UPSELLS - 1)).toBe(false);
    expect(upsellCapReached(MAX_ACTIVE_UPSELLS)).toBe(true);
    expect(upsellCapReached(MAX_ACTIVE_UPSELLS + 3)).toBe(true);
  });
});

describe("parseSortOrder", () => {
  it("rounds finite numbers and clamps the range", () => {
    expect(parseSortOrder(3.7)).toBe(4);
    expect(parseSortOrder(-2)).toBe(-2);
    expect(parseSortOrder(9999999)).toBe(100000);
  });
  it("returns null for non-numbers", () => {
    expect(parseSortOrder("3")).toBeNull();
    expect(parseSortOrder(Infinity)).toBeNull();
    expect(parseSortOrder(undefined)).toBeNull();
  });
});

describe("enum sets mirror the schema comments", () => {
  it("VoiceFaq.category has exactly the 6 schema values", () => {
    expect([...FAQ_CATEGORIES].sort()).toEqual([
      "allergen", "business_info", "deflection", "dietary", "escalation", "operational",
    ]);
  });
  it("VoiceTextLink.kind has exactly the 5 schema values", () => {
    expect([...LINK_KINDS].sort()).toEqual([
      "custom", "menu", "order_online", "reservation", "support",
    ]);
  });
});
