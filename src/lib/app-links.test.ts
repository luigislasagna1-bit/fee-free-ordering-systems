import { describe, expect, it } from "vitest";
import { APP_LINKS } from "./app-links";

/** Typo guard for the day a store link gets flipped live: a wrong URL here
 *  would ship a broken "Get the app" link to every surface at once. */

const PKG: Record<keyof typeof APP_LINKS, string> = {
  kitchen: "com.feefreeordering.kitchen",
  driver: "com.feefreeordering.driver",
};

describe("APP_LINKS", () => {
  for (const app of Object.keys(APP_LINKS) as Array<keyof typeof APP_LINKS>) {
    it(`${app}.play is null or a Play listing for ${PKG[app]}`, () => {
      const url = APP_LINKS[app].play;
      if (url !== null) {
        expect(url.startsWith("https://play.google.com/store/apps/details?id=")).toBe(true);
        expect(url).toContain(PKG[app]);
      }
    });
    it(`${app}.ios is null or an App Store listing URL`, () => {
      const url = APP_LINKS[app].ios;
      if (url !== null) {
        expect(url.startsWith("https://apps.apple.com/")).toBe(true);
      }
    });
  }

  it("kitchen Play listing is LIVE (2026-07-22) — regression guard against accidental un-flip", () => {
    expect(APP_LINKS.kitchen.play).toContain("com.feefreeordering.kitchen");
  });
});
