/**
 * Numbers AS SPOKEN on the phone — the deterministic last pass a sentence goes
 * through before the voice hears it (session.ts `spokenForm`).
 *
 * Why this exists (Luigi, 2026-08-16, call cmswj3rv1 / report cmswjlo87):
 * "sometimes when saying numbers (double digits or more) the ai system says
 * it incorrectly, especially for the address". The evidence: on that call the
 * model wrote the callback number as "647-669-0808" and on Grace's call as
 * "416 799 6207", while on Negme's and David's calls the same evening it wrote
 * "four one six, five two nine, eight seven five six". ConversationRelay hands
 * our text to ElevenLabs with normalization effectively OFF on the pinned
 * turbo model (`elevenlabsTextNormalization="auto"` is not honoured there), so
 * whenever the model happens to write digits, the voice improvises — hundreds,
 * "minus", or a house number as "one thousand one hundred sixty-six".
 *
 * Why in code and not the prompt: the playbook ALREADY says to speak numbers as
 * words and house numbers "the way people do"; the model complies about half
 * the time. Three prompt-only fixes for exactly this class failed on the Roya
 * call — a deterministic layer beats an instruction. Same lesson as
 * spoken-money.ts, generalised.
 *
 * ENGLISH ONLY — session.ts gates on the call language; other languages pass
 * through untouched (their TTS reads digits natively, and English number words
 * in an Italian voice would be worse than digits).
 *
 * Rules run in this order; every rule leaves NO digits behind in what it
 * matched, so a later rule can never double-convert:
 *   money    $46.87 → "forty-six dollars and eighty-seven cents" · $5–$10 → "five dollars to ten dollars"
 *   phones   647-669-0808 · (416) 799 6207 · +1 4167996207
 *              → "six four seven, six six nine, zero eight zero eight"
 *   ISO date 2026-08-16 → "August sixteenth, twenty twenty-six"
 *   long runs (order / confirmation numbers, ≥ 7 digits) → digit by digit in threes
 *   postal   L9T 6W9 → "L nine T, six W nine"
 *   times    10:00 AM → "ten a.m." · 10:30 → "ten thirty" · 12:05 pm → "twelve oh five p.m." · 5pm → "five p.m."
 *   dates    August 16, 2026 → "August sixteenth, twenty twenty-six"
 *   percent  10% → "ten percent"
 *   ordinals 2nd → "second"
 *   sizes    18" / 18-inch → "eighteen inch"
 *   ranges   20-25 minutes → "twenty to twenty-five minutes"
 *   fractions 1/2 → "half", ½ → "half", 3/4 → "three quarters"
 *   units    Unit 305 · Apt 1204 · #1204 → "unit three oh five" (house style)
 *   houses   338 Black Drive · 1166 McEachern Court · 66 King St
 *              → "three thirty-eight …", "eleven sixty-six …", "sixty-six …"
 *   decimals 1.5 → "one point five"
 *   integers 20 → "twenty" · 1,250 → "one thousand two hundred and fifty" ·
 *            a standalone 1900–2099 → "twenty twenty-six" (year style)
 * Anything glued to letters ("L1", "P2", "2L") is left alone — the narration
 * filter owns ids, and "2L" reads fine as "two L".
 */
import { numberWords, spokenMoney } from "./spoken-money";

const DIGIT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH_RE = "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec";
const STREET_WORDS =
  "st|street|ave|avenue|rd|road|dr|drive|blvd|boulevard|cres|crescent|crt|court|ct|ln|lane|way|pl|place|trail|terr|terrace|hwy|highway|line|sideroad|circle|cir|sq|square|parkway|pkwy|gate|grove|hill|park|path|row|walk|close|heights|hts|concession|rr|route|main";
const UNIT_WORDS: Record<string, string> = { apt: "apartment", ste: "suite", buzz: "buzzer" };

/** "0808" → "zero eight zero eight"; grouped ("647669206", 3) → "six four seven, six six nine, two zero six". */
export function spokenDigits(digits: string, group = 0): string {
  const ds = digits.replace(/\D/g, "").split("").map((d) => DIGIT_WORDS[Number(d)]);
  if (!ds.length) return "";
  if (!group || ds.length <= group) return ds.join(" ");
  const groups: string[] = [];
  for (let i = 0; i < ds.length; i += group) groups.push(ds.slice(i, i + group).join(" "));
  return groups.join(", ");
}

/** A North-American phone number — area code, exchange, line — digit by digit. */
export function spokenPhone(area: string, exchange: string, line: string): string {
  return `${spokenDigits(area)}, ${spokenDigits(exchange)}, ${spokenDigits(line)}`;
}

/**
 * House / unit numbers the way people say them: 66 → "sixty-six",
 * 338 → "three thirty-eight", 305 → "three oh five", 300 → "three hundred",
 * 1166 → "eleven sixty-six", 1000 → "one thousand", 1100 → "eleven hundred",
 * 12345 → "one twenty-three forty-five"; ≥ 1,000,000 → digit by digit.
 */
export function spokenHouseNumber(n: number): string {
  const v = Math.floor(Math.abs(Number(n) || 0));
  if (v < 100) return numberWords(v);
  if (v >= 1_000_000) return spokenDigits(String(v));
  if (v % 1000 === 0) return numberWords(v); // 1000, 2000 …
  if (v < 1000) {
    const h = Math.floor(v / 100);
    const r = v % 100;
    if (r === 0) return `${DIGIT_WORDS[h]} hundred`;
    if (r < 10) return `${DIGIT_WORDS[h]} oh ${DIGIT_WORDS[r]}`;
    return `${DIGIT_WORDS[h]} ${numberWords(r)}`;
  }
  const hi = Math.floor(v / 100);
  const lo = v % 100;
  const hiWords = hi < 100 ? numberWords(hi) : spokenHouseNumber(hi);
  if (lo === 0) return `${hiWords} hundred`;
  if (lo < 10) return `${hiWords} oh ${DIGIT_WORDS[lo]}`;
  return `${hiWords} ${numberWords(lo)}`;
}

/** 2026 → "twenty twenty-six", 2000 → "two thousand", 2005 → "two thousand and five", 1999 → "nineteen ninety-nine". */
export function spokenYear(y: number): string {
  if (y >= 2000 && y < 2010) return numberWords(y);
  if (y >= 1000 && y <= 9999) return spokenHouseNumber(y);
  return numberWords(y);
}

const IRREGULAR_ORDINALS: Record<number, string> = { 1: "first", 2: "second", 3: "third", 5: "fifth", 8: "eighth", 9: "ninth", 12: "twelfth" };

/** 1 → "first" … 22 → "twenty-second" · 100 → "one hundredth" · 105 → "one hundred and fifth". */
export function ordinalWords(n: number): string {
  const v = Math.floor(Math.abs(Number(n) || 0));
  const small = (x: number): string => {
    // 0..99
    if (IRREGULAR_ORDINALS[x]) return IRREGULAR_ORDINALS[x];
    if (x < 20) return `${numberWords(x)}th`;
    const t = Math.floor(x / 10) * 10;
    const r = x % 10;
    if (!r) return `${numberWords(t).slice(0, -1)}ieth`; // twenty → twentieth
    return `${numberWords(t)}-${small(r)}`;
  };
  if (v < 100) return small(v);
  const rest = v % 100;
  if (rest === 0) return `${numberWords(v)}th`; // "one hundredth", "two thousandth"
  return `${numberWords(v - rest)} and ${small(rest)}`; // "one hundred and fifth"
}

/** 10, 0, "AM" → "ten a.m." · 10, 30 → "ten thirty" · 12, 5, "pm" → "twelve oh five p.m." · 22, 0 → "twenty-two hundred". */
export function spokenTime(h: number, m: number, ampm?: string | null): string {
  const suffix = ampm ? (/^p/i.test(ampm) ? " p.m." : " a.m.") : "";
  const hour = numberWords(h);
  if (m === 0) return ampm ? `${hour}${suffix}` : h > 12 ? `${hour} hundred` : `${hour} o'clock`;
  if (m < 10) return `${hour} oh ${DIGIT_WORDS[m]}${suffix}`;
  return `${hour} ${numberWords(m)}${suffix}`;
}

function monthName(raw: string): string {
  const key = raw.replace(/\./g, "").toLowerCase().slice(0, 3);
  const idx = MONTHS.findIndex((mm) => mm.toLowerCase().startsWith(key));
  return idx >= 0 ? MONTHS[idx] : raw;
}

function intWords(raw: string): string {
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n)) return raw;
  if (n >= 1_000_000) return spokenDigits(String(n), 3);
  return numberWords(n);
}

function moneyOf(dollars: string, cents?: string): number {
  return Number(`${dollars.replace(/,/g, "")}.${(cents ?? "0").padEnd(2, "0")}`);
}

/** Verbalise every number in an ENGLISH sentence. Returns the spoken text and how many substitutions were made. */
export function verbalizeNumbersEn(input: string): { text: string; changes: number } {
  if (!/\d|[½¼¾]/.test(input)) return { text: input, changes: 0 };
  let text = input;
  let changes = 0;
  const sub = (re: RegExp, fn: (...m: string[]) => string) => {
    text = text.replace(re, (...args: unknown[]) => {
      changes++;
      return fn(...(args as string[]));
    });
  };
  const CUR = "(?:CA|US|C|A|NZ|AU|HK|S)?\\$\\s?";

  // money ranges first — "$5-$10", "$5–10"
  sub(new RegExp(`${CUR}(\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.(\\d{1,2}))?\\s?[-–—]\\s?${CUR.replace("\\$", "\\$?")}(\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.(\\d{1,2}))?`, "g"), (_m, d1, c1, d2, c2) =>
    `${spokenMoney(moneyOf(d1, c1))} to ${spokenMoney(moneyOf(d2, c2))}`,
  );
  // money — "$46.87", "CA$8.99", "$30", "$1,250", "46.87 dollars"
  sub(new RegExp(`${CUR}(\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.(\\d{1,2}))?`, "g"), (_m, d, c) => spokenMoney(moneyOf(d, c)));
  sub(/\b(\d+)\.(\d{2})\s+dollars?\b/g, (_m, d, c) => spokenMoney(moneyOf(d, c)));

  // North-American phone numbers — any separators, optional +1 / 1- prefix
  sub(/(?<![\d-])(?:\+?1[\s.-]?)?\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})(?![\d-])/g, (_m, a, b, c) => spokenPhone(a, b, c));

  // ISO dates the model should never say, but if it does: 2026-08-16
  sub(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_m, y, mo, d) => `${MONTHS[Number(mo) - 1] ?? mo} ${ordinalWords(Number(d))}, ${spokenYear(Number(y))}`);

  // long digit runs — order / confirmation numbers
  sub(/\b\d{7,}\b/g, (m) => spokenDigits(m, 3));

  // Canadian postal codes — L9T 6W9
  sub(/\b([A-Za-z])(\d)([A-Za-z])[\s-]?(\d)([A-Za-z])(\d)\b/g, (_m, l1, d1, l2, d2, l3, d3) =>
    `${l1.toUpperCase()} ${DIGIT_WORDS[Number(d1)]} ${l2.toUpperCase()}, ${DIGIT_WORDS[Number(d2)]} ${l3.toUpperCase()} ${DIGIT_WORDS[Number(d3)]}`,
  );

  // times — 10:00 AM · 10:30 · 12:05 pm · 10 AM · 5pm
  sub(/\b(\d{1,2}):(\d{2})(?:\s?([AaPp])\.?[Mm]\.?)?(?![\d:])/g, (_m, h, mm, ap) => spokenTime(Number(h), Number(mm), ap ?? null));
  sub(/\b(\d{1,2})\s?([AaPp])\.?[Mm]\.?(?![A-Za-z])/g, (_m, h, ap) => spokenTime(Number(h), 0, ap));

  // month-name dates — August 16, 2026 · Aug 16 · March 3rd
  sub(new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4})\\b)?`, "g"), (_m, mo, d, y) =>
    `${monthName(mo)} ${ordinalWords(Number(d))}${y ? `, ${spokenYear(Number(y))}` : ""}`,
  );

  // percent, ordinals, sizes
  sub(/(\d+)(?:\.(\d+))?\s?%/g, (_m, a, b) => `${numberWords(Number(a))}${b ? ` point ${spokenDigits(b)}` : ""} percent`);
  sub(/\b(\d+)(?:st|nd|rd|th)\b/g, (_m, n) => ordinalWords(Number(n)));
  sub(/\b(\d+)\s?(?:["″]|-?\s?inch(?:es)?\b)/g, (_m, n) => `${numberWords(Number(n))} inch`);

  // ranges — 20-25 minutes, Zones 1–3
  sub(/\b(\d+)\s?[-–—]\s?(\d+)\b/g, (_m, a, b) => `${numberWords(Number(a))} to ${numberWords(Number(b))}`);

  // fractions
  sub(/\b1\/2\b/g, () => "half");
  sub(/\b1\/4\b/g, () => "a quarter");
  sub(/\b3\/4\b/g, () => "three quarters");
  sub(/\b1\/3\b/g, () => "a third");
  sub(/\b2\/3\b/g, () => "two thirds");
  sub(/½/g, () => "half");
  sub(/¼/g, () => "a quarter");
  sub(/¾/g, () => "three quarters");

  // units / apartments / buzzers — house style
  sub(/\b(unit|apt|apartment|suite|ste|buzzer|buzz|room|floor|lot)\.?\s?#?\s?(\d{1,5})([A-Za-z])?\b/gi, (_m, w, n, l) => {
    const word = UNIT_WORDS[w.toLowerCase()] ?? w;
    return `${word} ${spokenHouseNumber(Number(n))}${l ? ` ${l.toUpperCase()}` : ""}`;
  });
  sub(/#\s?(\d{1,5})\b/g, (_m, n) => `number ${spokenHouseNumber(Number(n))}`);

  // house numbers — a number right before a Capitalised word or a street word
  sub(new RegExp(`\\b(\\d{1,6})([A-Za-z])?\\b(?=\\s+(?:[A-Z][A-Za-z'.-]*|(?:${STREET_WORDS})\\b))`, "g"), (_m, n, l) =>
    `${spokenHouseNumber(Number(n))}${l ? ` ${l.toUpperCase()}` : ""}`,
  );

  // decimals — 1.5, 3.14
  sub(/\b(\d+)\.(\d+)\b/g, (_m, a, b) => `${numberWords(Number(a))} point ${spokenDigits(b)}`);

  // remaining integers — a standalone 4-digit 1900–2099 is a year, else plain words
  sub(/\b(\d{1,3}(?:,\d{3})+|\d+)\b/g, (m) => {
    if (/^\d{4}$/.test(m)) {
      const y = Number(m);
      if (y >= 1900 && y <= 2099) return spokenYear(y);
    }
    return intWords(m);
  });

  return { text, changes };
}
