/**
 * The spoken Temporary Closure line appended to the call greeting
 * (Luigi 2026-08-20: "specify that by phone immediately to callers").
 * Deterministic — composed before the model says a word.
 */
import { describe, expect, it } from "vitest";
import { buildPauseAnnouncement, resolvePausePhrases } from "./pause-announcement";

const NOW = new Date("2026-08-20T20:00:00.000Z");
const IN_2H = new Date("2026-08-20T22:00:00.000Z");
const PAST = new Date("2026-08-20T18:00:00.000Z");

function base() {
  return {
    pickup: { offered: true, pausedUntil: null as Date | string | null },
    delivery: { offered: true, pausedUntil: null as Date | string | null },
    reservations: { offered: true, pausedUntil: null as Date | string | null },
    now: NOW,
    timezone: "America/Toronto",
    hoursFormat: "12h" as const,
    lang: "en",
    canBookReservations: true,
  };
}

describe("buildPauseAnnouncement", () => {
  it("returns empty when nothing offered is paused", () => {
    expect(buildPauseAnnouncement(base())).toBe("");
  });

  it("an expired pause is not announced (auto-resume)", () => {
    expect(buildPauseAnnouncement({ ...base(), delivery: { offered: true, pausedUntil: PAST } })).toBe("");
  });

  it("a pause on a NOT-offered service is ignored", () => {
    expect(
      buildPauseAnnouncement({ ...base(), delivery: { offered: false, pausedUntil: IN_2H } }),
    ).toBe("");
  });

  it("delivery paused with pickup available → names both, with the resume time in words (EN)", () => {
    const line = buildPauseAnnouncement({ ...base(), delivery: { offered: true, pausedUntil: IN_2H } });
    expect(line).toContain("delivery is paused");
    expect(line).toContain("pickup is still available");
    // 22:00Z = 6:00 PM Toronto — same local day ⇒ "this evening at 6:00 PM".
    expect(line).toContain("this evening at 6:00 PM");
    expect(line.length).toBeLessThanOrEqual(160);
  });

  it("pickup paused with delivery available → the mirror line", () => {
    const line = buildPauseAnnouncement({ ...base(), pickup: { offered: true, pausedUntil: IN_2H } });
    expect(line).toContain("pickup is paused");
    expect(line).toContain("delivery is still available");
  });

  it("both order channels paused → orders-paused line, offering reservations when bookable", () => {
    const paused = { ...base(), pickup: { offered: true, pausedUntil: IN_2H }, delivery: { offered: true, pausedUntil: IN_2H } };
    expect(buildPauseAnnouncement(paused)).toContain("book you a table");
    expect(buildPauseAnnouncement({ ...paused, canBookReservations: false })).not.toContain("table");
    expect(
      buildPauseAnnouncement({ ...paused, reservations: { offered: true, pausedUntil: IN_2H } }),
    ).not.toContain("table");
  });

  it("the only offered channel paused → orders-paused line (no alternative exists)", () => {
    const line = buildPauseAnnouncement({
      ...base(),
      delivery: { offered: false, pausedUntil: null },
      pickup: { offered: true, pausedUntil: IN_2H },
      reservations: { offered: false, pausedUntil: null },
    });
    expect(line).toContain("not taking orders");
  });

  it("the owner's custom message replaces the auto sentence verbatim", () => {
    const line = buildPauseAnnouncement({
      ...base(),
      delivery: { offered: true, pausedUntil: IN_2H },
      customGreeting: "  Private event tonight — back tomorrow at 11!  ",
    });
    expect(line).toBe("Private event tonight — back tomorrow at 11!");
  });

  it("non-EN locales speak the localized line WITHOUT English time words", () => {
    const line = buildPauseAnnouncement({ ...base(), lang: "fr", delivery: { offered: true, pausedUntil: IN_2H } });
    expect(line).toContain("la livraison");
    expect(line).toContain("le retrait");
    expect(line).not.toContain("this evening");
    expect(line).not.toContain("PM");
  });

  it("locale resolution: region-stripped, pt-BR exact, unknown → en", () => {
    expect(resolvePausePhrases("fr-CA")).toBe(resolvePausePhrases("fr"));
    expect(resolvePausePhrases("pt-BR")).not.toBe(resolvePausePhrases("pt"));
    expect(resolvePausePhrases("xx")).toBe(resolvePausePhrases("en"));
    expect(resolvePausePhrases(null)).toBe(resolvePausePhrases("en"));
  });

  it("every locale table keeps the template placeholders", () => {
    for (const lang of ["en", "fr", "es", "it", "pt", "pt-BR", "de", "nl", "ro", "sv", "da", "nb", "fi", "pl", "cs", "sk", "hu", "el", "bg", "hr", "sr", "sl", "et", "lv", "lt", "tr", "ru", "uk", "ca", "id", "vi", "th", "zh", "ja", "ko", "ar", "he", "hi"]) {
      const p = resolvePausePhrases(lang);
      // A missing table would silently fall back to en and pass every check.
      if (lang !== "en") expect(p, lang).not.toBe(resolvePausePhrases("en"));
      expect(p.onePausedAlt, lang).toContain("{service}");
      expect(p.onePausedAlt, lang).toContain("{alt}");
      expect(p.pickup, lang).toBeTruthy();
      expect(p.delivery, lang).toBeTruthy();
      expect(p.ordersPaused, lang).toBeTruthy();
      expect(p.ordersPausedReservations, lang).toBeTruthy();
    }
  });
});
