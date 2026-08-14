/**
 * Which locales the Marketing Kit may actually OFFER for print (Luigi 2026-08-14).
 *
 * Three different things get confused here, so they are separated deliberately:
 *
 *  1. KEY PARITY — all 38 locale files carry every `resellerKit.*` key, so the parity audit
 *     stays at 0 missing / 0 extra. That is a structural guarantee, nothing more.
 *  2. REAL TRANSLATION — whether a locale's strings are actually in that language rather than
 *     the English fallback the splice script writes when no translation file exists. This list
 *     is the truth for that, and it is what the language picker uses.
 *  3. RENDERABILITY — whether satori can shape the script at all (see fonts.ts; Devanagari and
 *     Arabic are gated there).
 *
 * Offering "Français" and handing back an English flyer would be worse than offering nothing:
 * the partner only finds out after printing. So the picker shows a language ONLY once its
 * translation file exists.
 *
 * TO ADD A LANGUAGE: create scripts/i18n-data/reseller-kit/<locale>.json with the translated
 * strings, run `npx tsx scripts/i18n-add-reseller-kit.ts`, then add the code here.
 */
import { SUPPORTED_LOCALES, type Locale } from "@/lib/locales";
import { isRenderableLocale } from "./fonts";

/**
 * Locales with a real, hand-checked translation of the printed copy.
 *
 * ⚠️ Currently English only. The other 37 locale files hold the English fallback so parity
 * holds; they are NOT translated yet. Do not add a code here until its data file contains
 * genuine translations — this list is the only thing standing between a partner and a
 * mislabelled flyer.
 */
export const KIT_TRANSLATED_LOCALES: Locale[] = ["en"];

/** Locales the picker may show: translated AND renderable. */
export function kitOfferableLocales(): Locale[] {
  return SUPPORTED_LOCALES.filter(
    (l) => KIT_TRANSLATED_LOCALES.includes(l) && isRenderableLocale(l),
  );
}

export function isKitOfferableLocale(locale: string): boolean {
  return kitOfferableLocales().includes(locale as Locale);
}
