/**
 * ASR-LIKE NOISE for the LLM caller — the mistakes phone speech-to-text
 * actually makes, applied deterministically (seeded) so a noisy run can be
 * replayed: dropped articles, "half" → "0.5", homophones, split/joined
 * numbers, and the odd doubled word. Never touches menu-critical words in a
 * way the compiler's phonetic pass can't recover ("peperoni" is fine,
 * "mushroom" → "much room" is the kind of thing a real caller gets back).
 */
export type NoiseLevel = "none" | "light" | "heavy";

/** Tiny seeded PRNG (mulberry32) — deterministic per scenario/run. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HOMOPHONES: Record<string, string[]> = {
  two: ["to", "too"],
  to: ["two"],
  too: ["two"],
  four: ["for"],
  for: ["four"],
  eight: ["ate"],
  one: ["won"],
  no: ["know"],
  know: ["no"],
  our: ["hour"],
  hour: ["our"],
  their: ["there"],
  there: ["their"],
  whole: ["hole"],
  hole: ["whole"],
  plain: ["plane"],
  meat: ["meet"],
  pepperoni: ["peperoni", "pepproni"],
  mushrooms: ["mushroom", "much rooms"],
  mushroom: ["much room"],
  olives: ["all lives"],
  jalapeno: ["halapeno"],
  jalapenos: ["halapenos"],
  hawaiian: ["how why an"],
  lasagna: ["lasagne", "la sonya"],
  medium: ["median"],
  large: ["larch"],
  cheese: ["cheeze"],
  bacon: ["baking"],
  pickup: ["pick up"],
  delivery: ["deliver he"],
};

const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  twenty: "20", thirty: "30", forty: "40", fifty: "50",
};

const ARTICLES = new Set(["a", "an", "the"]);

export function applyAsrNoise(text: string, level: NoiseLevel, rng: () => number = Math.random): string {
  if (level === "none" || !text.trim()) return text;
  const p = level === "heavy" ? 0.35 : 0.12;
  const words = text.split(/(\s+)/);
  const out: string[] = [];
  for (const w of words) {
    if (!w.trim()) {
      out.push(w);
      continue;
    }
    const m = /^([^A-Za-z0-9]*)([A-Za-z0-9'-]+)([^A-Za-z0-9]*)$/.exec(w);
    if (!m) {
      out.push(w);
      continue;
    }
    const [, pre, core, post] = m;
    const lc = core.toLowerCase();
    let rep = core;
    const roll = rng();
    if (ARTICLES.has(lc) && roll < p) {
      // Dropped article: emit nothing (and swallow the following space).
      continue;
    }
    if (lc === "half" && roll < p) rep = "0.5";
    else if (HOMOPHONES[lc] && roll < p) {
      const alts = HOMOPHONES[lc];
      rep = alts[Math.floor(rng() * alts.length)];
    } else if (NUMBER_WORDS[lc] && roll < p * 0.8) rep = NUMBER_WORDS[lc];
    else if (/^\d{2,}$/.test(lc) && roll < p * 0.5) rep = lc.split("").join(" ");
    else if (roll < p * 0.15) rep = `${core} ${core}`; // stutter
    if (rep !== core && /^[A-Z]/.test(core)) rep = rep.charAt(0).toUpperCase() + rep.slice(1);
    out.push(pre + rep + post);
  }
  return out.join("").replace(/\s{2,}/g, " ").trim();
}
