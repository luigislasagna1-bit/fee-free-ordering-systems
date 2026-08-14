/**
 * Undo speech-to-text SURFACE FORMATTING before the model ever sees the words.
 *
 * Deepgram applies smart formatting to its output, which is right for most
 * things and wrong for a restaurant: on 2026-08-14 a caller said "half of it,
 * pepperoni" and the model received **"0.5 of it, pepperoni"** — twice, on the
 * one call whose whole difficulty was a half-and-half pizza. Twilio
 * ConversationRelay exposes no inbound control over that formatting, so the fix
 * lives here: deterministic, provider-independent, and free.
 *
 * Same shape as the already-documented failure where spoken digits came back as
 * currency ("$6.04 $7.06 $0.08" for a caller reading out "6 4 7 6 6 9 0 8").
 *
 * 🚨 RULES FOR ADDING TO THIS FILE
 * - Only ever rewrite a SURFACE FORM. Never repair meaning, never guess an
 *   intent — that belongs to the model, and a wrong guess here is invisible.
 * - Every rule must be anchored so it cannot fire inside a real number: "1.5
 *   litres" and "$26.30" must survive untouched. The tests hold that line.
 * - This is where ASR defects get fixed. Not prompt.ts — a prompt cannot
 *   correct a word the model never received.
 */

/** One surface-form repair: what it matches, and what it should have said. */
type Rule = { re: RegExp; to: string };

const RULES: Rule[] = [
  // "0.5 of it, pepperoni" → "half of it, pepperoni".
  // Anchored on word boundaries with no adjacent digit or currency symbol, so
  // "1.5" and "$0.50" are left alone.
  { re: /(?<![\d.$])0\.5(?![\d])/g, to: "half" },
  { re: /(?<![\d.$])0\.25(?![\d])/g, to: "a quarter" },
  { re: /(?<![\d.$])0\.75(?![\d])/g, to: "three quarters" },
  // "1/2 pepperoni" — the other way smart formatting writes it.
  { re: /(?<![\d/])1\/2(?![\d/])/g, to: "half" },
];

/**
 * Normalize one caller utterance. Returns the text unchanged when nothing
 * matched, so the common path allocates nothing.
 */
export function normalizeAsr(text: string): string {
  let out = text;
  for (const r of RULES) out = out.replace(r.re, r.to);
  return out;
}
