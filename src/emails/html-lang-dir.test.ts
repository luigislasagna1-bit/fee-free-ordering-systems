/**
 * Every email must declare the language + direction of its OWN content.
 *
 * The bug (2026-08-11): EmailLayout rendered a bare `<Html>`, and
 * @react-email/html defaults `lang="en" dir="ltr"` and emits them EXPLICITLY.
 * So all 38 locales shipped as `<html dir="ltr" lang="en">`. An explicit
 * dir="ltr" is worse than no attribute at all — it overrides the RTL
 * auto-detection a mail client would otherwise apply to Arabic and Hebrew.
 *
 * Types can't catch a missing `locale` prop (it's optional at both ends), and
 * the i18n parity audit only compares dictionaries. Only rendering the
 * template and reading the markup can. So: render it, and assert the tag.
 */
import { describe, it, expect, vi } from "vitest";

// getDict -> i18n-server -> @/lib/db, which throws without DATABASE_URL.
vi.mock("@/lib/db", () => ({ default: {} }));

import { renderEmail } from "./render";
import { getDict } from "@/lib/i18n-dict";
import OrderConfirmation from "./templates/OrderConfirmation";
import VerifyEmail from "./templates/VerifyEmail";

// Rendering a full template is slow (~1-5s cold), and several cases below want
// the same locale. Render each one once.
const cache = new Map<string, Promise<string>>();
function renderOrder(locale: string): Promise<string> {
  const hit = cache.get(locale);
  if (hit) return hit;
  const p = renderOrderUncached(locale);
  cache.set(locale, p);
  return p;
}

async function renderOrderUncached(locale: string) {
  const t = await getDict(locale);
  return renderEmail(
    OrderConfirmation({
      t,
      customerName: "Sameem",
      orderNumber: "ORD-519009065",
      restaurantName: "Luigi's",
      orderType: "delivery",
      paidOnline: true,
      estimatedMinutes: 20,
      items: [
        {
          name: "Lasagna",
          quantity: 2,
          price: 15.8,
          lineTotal: 31.6,
          modifiers: [{ label: "Size", value: "Large" }],
          bundleItems: [{ name: "Garlic bread", modifiers: [{ name: "Cheese" }] }],
        },
      ],
      subtotal: 31.6,
      total: 31.6,
      trackingUrl: "https://example.com/t",
    } as never),
  );
}

const htmlTag = (html: string) => html.match(/<html[^>]*>/i)?.[0] ?? "";
/** Markup Gmail/Outlook.com/Yahoo actually keep — they drop <html>/<head>/<body>. */
const belowBody = (html: string) => html.slice(html.search(/<body[^>]*>/i));

const count = (html: string, res: RegExp[]) =>
  res.reduce((n, re) => n + (html.match(re)?.length ?? 0), 0);
const LEFTISH = [/text-align:\s*left/g, /padding-left/g, /margin-left/g, /border-left(?!-)/g, /align="left"/g];
const RIGHTISH = [/text-align:\s*right/g, /padding-right/g, /margin-right/g, /border-right(?!-)/g, /align="right"/g];

describe("email <html> lang + dir", () => {
  it.each([
    ["en", "ltr"],
    ["ja", "ltr"],
    ["zh", "ltr"],
    ["fr", "ltr"],
    ["ar", "rtl"],
    ["he", "rtl"],
  ])("localized template renders lang=%s dir=%s", async (locale, dir) => {
    const tag = htmlTag(await renderOrder(locale));
    expect(tag).toMatch(new RegExp(`lang="${locale}"`));
    expect(tag).toMatch(new RegExp(`dir="${dir}"`));
  }, 60_000);

  it("labels a hardcoded-English body as English whatever the recipient speaks", async () => {
    // lang describes the CONTENT, not the recipient's preference. These
    // templates have no Translator, so "en" is the truthful answer — the fix
    // must not blanket-relabel them.
    const tag = htmlTag(await renderEmail(VerifyEmail({ name: "Luigi", verifyUrl: "https://e.co/v" })));
    expect(tag).toMatch(/lang="en"/);
    expect(tag).toMatch(/dir="ltr"/);
  }, 60_000);
});

describe("RTL survives the webmail strippers", () => {
  it("repeats dir=rtl on an element below <body>", async () => {
    // Gmail, Outlook.com and Yahoo re-host our markup inside their own
    // document, so <html dir> never arrives. Without a dir further down,
    // Arabic renders left-to-right for most of our recipients.
    expect(belowBody(await renderOrder("ar"))).toMatch(/<(table|div)[^>]*\sdir="rtl"/i);
  }, 60_000);

  it("never emits an explicit dir=ltr below <body>", async () => {
    // That would re-create the original bug one level down: an explicit LTR
    // overrides the client's own RTL heuristics.
    for (const loc of ["en", "ar", "he", "fr"]) {
      expect(belowBody(await renderOrder(loc))).not.toMatch(/<(table|div)[^>]*\sdir="ltr"/i);
    }
  }, 60_000);
});

describe("RTL mirrors the physical layout values", () => {
  // dir="rtl" flips reading order and table column order, but leaves a
  // hardcoded `text-align: right` / `padding-left` pinned to the wrong edge —
  // and email clients can't use logical properties (Outlook = Word engine).
  it("swaps every left/right physical value for ar and he", async () => {
    const en = await renderOrder("en");
    const enLeft = count(en, LEFTISH);
    const enRight = count(en, RIGHTISH);
    expect(enLeft).toBeGreaterThan(0);
    expect(enRight).toBeGreaterThan(0);

    for (const loc of ["ar", "he"]) {
      const html = await renderOrder(loc);
      expect({ loc, left: count(html, LEFTISH), right: count(html, RIGHTISH) }).toEqual({
        loc,
        left: enRight,
        right: enLeft,
      });
    }
  }, 60_000);

  it("leaves LTR locales exactly as they were", async () => {
    const en = await renderOrder("en");
    for (const loc of ["fr", "ja", "zh"]) {
      const html = await renderOrder(loc);
      expect(count(html, LEFTISH)).toBe(count(en, LEFTISH));
      expect(count(html, RIGHTISH)).toBe(count(en, RIGHTISH));
    }
  }, 60_000);
});
