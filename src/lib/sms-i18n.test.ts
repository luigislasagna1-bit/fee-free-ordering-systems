/**
 * The `sms.*` catalog has to hold two lines that nothing else in the codebase
 * checks, because a text message is billed by the SEGMENT and truncated by the
 * carrier — not merely "wrapped" like an email:
 *
 *   1. LENGTH. `buildCustomerSms` prefixes every body with "RestaurantName: ",
 *      so the body itself must leave room for that inside one 160-char GSM-7
 *      segment. A translation that reads fine in the JSON but renders 190 chars
 *      silently costs Luigi double, in exactly the languages nobody on the team
 *      reads. The i18n parity audit counts KEYS, never their length.
 *
 *   2. ENCODING. ONE character outside GSM-7 flips the WHOLE message to UCS-2,
 *      which cuts the segment from 160 chars to 70. We can't do anything about
 *      alphabets (Greek, Cyrillic, Thai, CJK, Arabic, Hebrew, Devanagari and
 *      most accented Latin are UCS-2 no matter what we write), but we CAN keep
 *      an em dash or a curly apostrophe from dragging English, German, Dutch,
 *      Italian, Indonesian and the Nordics down with them. Hence: plain "-",
 *      straight quotes, no ellipsis character.
 *
 * Both rules apply to any NEW sms.* key too — see scripts/i18n-add-sms-keys.ts.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SUPPORTED_LOCALES } from "./locales";

/** Deliberately pessimistic sample values: the longest order number the app
 *  actually mints (ORD- + 9 digits), a two-digit delay, an ISO date. */
const SAMPLE: Record<string, string> = {
  orderNumber: "ORD-143921044",
  time: "19:30",
  minutes: "15",
  reason: "Out of dough",
  partySize: "4",
  date: "2026-08-15",
  code: "A1B2C3",
};

/** 160 (one GSM-7 segment) minus ~22 for the "Restaurant Name: " prefix that
 *  buildCustomerSms always prepends. Bodies at the ceiling still fit a single
 *  segment for a normal restaurant name. */
const MAX_BODY = 138;

/** Punctuation that would knock an otherwise-GSM-7 locale into UCS-2:
 *  en/em dashes, curly quotes, ellipsis. Plain "-" and "'" are fine. */
const NON_GSM_PUNCTUATION = /[‐-―‘’“”…]/;

const catalogs = SUPPORTED_LOCALES.map((code) => ({
  code,
  sms: (
    JSON.parse(
      readFileSync(join("src", "messages", `${code}.json`), "utf8"),
    ) as { sms?: Record<string, string> }
  ).sms,
}));

const render = (template: string) =>
  Object.entries(SAMPLE).reduce(
    (acc, [k, v]) => acc.split(`{${k}}`).join(v),
    template,
  );

describe("sms.* catalog", () => {
  it("exists in all 38 locales with the same shapes as English", () => {
    const english = catalogs.find((c) => c.code === "en")!.sms;
    expect(english).toBeTruthy();
    const expected = Object.keys(english!).sort();
    expect(expected.length).toBeGreaterThan(0);

    for (const { code, sms } of catalogs) {
      expect(sms, `${code}.json has no "sms" namespace`).toBeTruthy();
      expect(Object.keys(sms!).sort(), `${code} sms keys`).toEqual(expected);
    }
  });

  it("keeps every rendered body inside one SMS segment", () => {
    const over: string[] = [];
    for (const { code, sms } of catalogs) {
      for (const [key, template] of Object.entries(sms!)) {
        const body = render(template);
        if (body.length > MAX_BODY) over.push(`${code}.${key} = ${body.length} chars`);
      }
    }
    expect(over, `over ${MAX_BODY} chars`).toEqual([]);
  });

  it("leaves no placeholder unsubstituted (a typo'd {name} would text the guest raw braces)", () => {
    const leftovers: string[] = [];
    for (const { code, sms } of catalogs) {
      for (const [key, template] of Object.entries(sms!)) {
        const rest = render(template);
        if (/[{}]/.test(rest)) leftovers.push(`${code}.${key}: ${rest}`);
      }
    }
    expect(leftovers).toEqual([]);
  });

  it("uses only GSM-7-safe punctuation, so a dash can't double the bill", () => {
    const offenders: string[] = [];
    for (const { code, sms } of catalogs) {
      for (const [key, template] of Object.entries(sms!)) {
        const hit = template.match(NON_GSM_PUNCTUATION);
        if (hit) offenders.push(`${code}.${key} contains "${hit[0]}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
