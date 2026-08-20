/**
 * Money and money-adjacent phrases AS SPOKEN on the phone.
 *
 * ConversationRelay sends our text to ElevenLabs with text normalization
 * effectively off (Twilio: "auto" == "off" for voice calls), so "CA$45.22" is
 * a gamble — letters, a symbol and a decimal the voice may read as "see-ay
 * dollar forty-five point two two". Luigi heard "about 2 cents" on 2026-08-15
 * because the compiler's note said "CA$0.02 extra". Words are deterministic:
 * "forty-five dollars and twenty-two cents".
 *
 * English only for now (the multilingual read-back is a tracked follow-up);
 * the currency NAME is not spoken — a caller to a Canadian pizzeria knows the
 * dollars are Canadian.
 */

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** 0..999999 → English words ("one hundred and five", "twenty-two"). */
export function numberWords(n: number): string {
  const v = Math.floor(Math.abs(Number(n) || 0));
  if (v === 0) return "zero";
  if (v >= 1_000_000) return String(v);
  const below1000 = (x: number): string => {
    const parts: string[] = [];
    const h = Math.floor(x / 100);
    const r = x % 100;
    if (h) parts.push(`${ONES[h]} hundred`);
    if (r) {
      const t = r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? `-${ONES[r % 10]}` : ""}`;
      parts.push(h ? `and ${t}` : t);
    }
    return parts.join(" ");
  };
  const th = Math.floor(v / 1000);
  const rest = v % 1000;
  if (!th) return below1000(v);
  return `${below1000(th)} thousand${rest ? (rest < 100 ? ` and ${below1000(rest)}` : ` ${below1000(rest)}`) : ""}`;
}

/** 45.22 → "forty-five dollars and twenty-two cents"; 20 → "twenty dollars";
 *  0.5 → "fifty cents"; 1.01 → "one dollar and one cent". */
export function spokenMoney(amount: number): string {
  const cents = Math.round((Number(amount) || 0) * 100);
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const d = Math.floor(abs / 100);
  const c = abs % 100;
  const dollars = d ? `${numberWords(d)} dollar${d === 1 ? "" : "s"}` : "";
  const centsWords = c ? `${numberWords(c)} cent${c === 1 ? "" : "s"}` : "";
  const body = dollars && centsWords ? `${dollars} and ${centsWords}` : dollars || centsWords || "zero dollars";
  return neg ? `minus ${body}` : body;
}

/**
 * Below this, an over-allowance is not worth a sentence — the total at quote
 * time is exact anyway. Announcing "two cents extra" (a rounding artefact of
 * half-toppings at 2.75 × ½) is what made Luigi say "the price was wrong".
 */
export const MIN_SPOKEN_SURCHARGE = 0.5;

/** The compiler's raw over-allowance → what the agent may say, or null. */
export function spokenSurcharge(
  s: { amount: number; direction: "extra" | "less" } | null | undefined,
  legacyNote: string | null = null,
): string | null {
  if (s === undefined) return legacyNote; // build-line predates the field: keep the old text
  if (!s || !(Number(s.amount) >= MIN_SPOKEN_SURCHARGE)) return null;
  return s.direction === "extra"
    ? `Extra toppings add ${spokenMoney(s.amount)}.`
    : `That's ${spokenMoney(s.amount)} less than the standard build.`;
}

/**
 * The combo compiler's per-pick money → ONE spoken sentence, or null.
 * "Fettuccine Alfredo adds five dollars, and the extra toppings add nine
 * dollars." Slot premiums name the pick; a lone pizza-extras part skips the
 * item name (menu code names sound wrong aloud), naming it only when several
 * pizzas need telling apart. Parts under the threshold are dropped.
 */
export function spokenPriceParts(
  parts: Array<{ label: string; amount: number; kind: "slot_upcharge" | "child_extras" }> | null | undefined,
): string | null {
  const xs = (Array.isArray(parts) ? parts : []).filter((p) => Number(p?.amount) >= MIN_SPOKEN_SURCHARGE);
  if (!xs.length) return null;
  const extrasCount = xs.filter((p) => p.kind === "child_extras").length;
  const phrase = (p: (typeof xs)[number]) =>
    p.kind === "child_extras"
      ? extrasCount === 1
        ? `the extra toppings add ${spokenMoney(p.amount)}`
        : `the ${p.label} extra toppings add ${spokenMoney(p.amount)}`
      : `${p.label} adds ${spokenMoney(p.amount)}`;
  const list = xs.map(phrase);
  const body =
    list.length === 1 ? list[0] : list.length === 2 ? `${list[0]}, and ${list[1]}` : `${list.slice(0, -1).join(", ")}, and ${list[list.length - 1]}`;
  return `${body.charAt(0).toUpperCase()}${body.slice(1)}.`;
}

/** "So that's X, Y, and Z." — the pre-quote read-back joiner. */
export function spokenOrderText(lines: string[]): string {
  const xs = lines.filter((l) => l && l.trim());
  if (!xs.length) return "Nothing is on the order yet.";
  const list = xs.length === 1 ? xs[0] : xs.length === 2 ? `${xs[0]}, and ${xs[1]}` : `${xs.slice(0, -1).join(", ")}, and ${xs[xs.length - 1]}`;
  return `So that's ${list}.`;
}
