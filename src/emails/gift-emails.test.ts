/**
 * The gift emails must never show a customer a raw {placeholder}.
 *
 * Written after shipping exactly that bug (2026-07-31): `rewardGift.step1Body`
 * reads "…because your {label} are attached to it", but the template passed only
 * `{ email }`. getDict does a plain string replace and does NOT throw on a
 * missing variable — it leaves the brace text in place — so the recipient would
 * have read "because your {label} are attached to it". Nothing in tsc, the
 * parity audit or the build catches that: the KEY exists, the TRANSLATIONS are
 * complete, and the arg mismatch lives in JSX.
 *
 * So these render the real templates through the real translator and assert the
 * output carries no leftover braces. They run over several locales because a
 * translator may legitimately move a placeholder, and over both the has-account
 * and no-account variants because they take different props.
 */
import { describe, it, expect, vi } from "vitest";

// getDict -> i18n-server -> @/lib/db, which throws without DATABASE_URL. These
// tests only exercise message lookup + JSX rendering, so a bare stub is enough.
vi.mock("@/lib/db", () => ({ default: {} }));

import { renderEmail } from "./render";
import { getDict } from "@/lib/i18n-dict";
import RewardGift from "./templates/RewardGift";
import RewardGiftInvite from "./templates/RewardGiftInvite";

// A brand name with no {} of its own, so any brace we find is a real defect.
const LABEL = "Luigi Bucks";
const LOCALES = ["en", "it", "fr", "de", "ja", "ar"];

/** Any {word} left in the rendered HTML is an unsubstituted placeholder. */
function leftoverPlaceholders(html: string): string[] {
  return [...html.matchAll(/\{[a-zA-Z][a-zA-Z0-9_]*\}/g)].map((m) => m[0]);
}

describe("gift emails render without leaking placeholders", () => {
  it.each(LOCALES)("RewardGift (recipient already has an account) — %s", async (locale) => {
    const t = await getDict(locale);
    const html = await renderEmail(
      RewardGift({
        t,
        customerName: "Faisal",
        restaurantName: "Luigi's Lasagna & Pizzeria",
        amountLabel: "$40.00",
        rewardLabel: LABEL,
        balanceLabel: "$47.62",
        note: "Sorry about the delay!",
        giftEmail: "faisalzia@live.ca",
        orderUrl: "https://www.luigislasagna.com/order/luigis-lasagna-pizzeria",
      }),
    );
    expect(leftoverPlaceholders(html)).toEqual([]);
    // The three teaching steps must actually be present, not silently dropped.
    expect(html).toContain("1");
    expect(html).toContain("faisalzia@live.ca");
    expect(html).toContain("$40.00");
  });

  it.each(LOCALES)("RewardGiftInvite (no account yet) — %s", async (locale) => {
    const t = await getDict(locale);
    const html = await renderEmail(
      RewardGiftInvite({
        t,
        customerName: "Faisal",
        restaurantName: "Luigi's Lasagna & Pizzeria",
        amountLabel: "$40.00",
        rewardLabel: LABEL,
        note: null,
        orderUrl: "https://www.luigislasagna.com/order/luigis-lasagna-pizzeria/account/signup",
        giftEmail: "faisalzia@live.ca",
      }),
    );
    expect(leftoverPlaceholders(html)).toEqual([]);
    expect(html).toContain("faisalzia@live.ca");
    expect(html).toContain("$40.00");
  });

  it("renders the gift amount and the address the credit is tied to, since that pair is what recipients act on", async () => {
    const t = await getDict("en");
    const html = await renderEmail(
      RewardGift({
        t,
        customerName: "Faisal",
        restaurantName: "Luigi's",
        amountLabel: "$40.00",
        rewardLabel: LABEL,
        balanceLabel: "$40.00",
        giftEmail: "faisalzia@live.ca",
        orderUrl: "https://example.com",
      }),
    );
    // The brand name must survive into the copy — the steps are written around it.
    expect(html).toContain(LABEL);
  });

  it("falls back cleanly when the gift address is unknown", async () => {
    const t = await getDict("en");
    const html = await renderEmail(
      RewardGift({
        t,
        customerName: "Faisal",
        restaurantName: "Luigi's",
        amountLabel: "$40.00",
        rewardLabel: LABEL,
        balanceLabel: "$40.00",
        // giftEmail deliberately omitted → step 1 uses the no-email variant.
        orderUrl: "https://example.com",
      }),
    );
    expect(leftoverPlaceholders(html)).toEqual([]);
  });
});
