/**
 * Combine the per-locale translation fragments (scripts/i18n-data/dunning-i18n/<loc>.json,
 * written by the translate-dunning workflow) with the English source into a
 * single merge-format staging file (scripts/i18n-data/dunning-combined.json),
 * then it's merged via i18n-merge-data.ts.
 *
 * Guards (honor the standing i18n rule):
 *   - every locale must carry every key (missing → en fallback, logged)
 *   - every translation must preserve the EXACT same {placeholder} set as en
 *     (mismatch → en fallback, logged) — a translated/garbled {days} would
 *     break interpolation.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join("scripts", "i18n-data");
const FRAG = join(DIR, "dunning-i18n");

const en: Record<string, string> = {};
for (const f of ["dunning.json", "addon-billing-notice.json"]) {
  const obj = JSON.parse(readFileSync(join(DIR, f), "utf8")) as Record<string, { en: string }>;
  for (const [k, v] of Object.entries(obj)) en[k] = v.en;
}
const keys = Object.keys(en);
const ph = (s: string) => new Set(s.match(/\{\w+\}/g) ?? []);
const enPh = Object.fromEntries(keys.map((k) => [k, ph(en[k])]));

const combined: Record<string, Record<string, string>> = {};
for (const k of keys) combined[k] = { en: en[k] };

let fallbacks = 0;
const fragFiles = readdirSync(FRAG).filter((f) => f.endsWith(".json"));
for (const f of fragFiles) {
  const loc = f.replace(".json", "");
  const obj = JSON.parse(readFileSync(join(FRAG, f), "utf8")) as Record<string, string>;
  for (const k of keys) {
    const val = obj[k];
    if (typeof val !== "string" || !val.trim()) {
      console.warn(`  ⚠ ${loc}: missing "${k}" → en`); combined[k][loc] = en[k]; fallbacks++; continue;
    }
    const got = ph(val), want = enPh[k];
    const same = got.size === want.size && [...want].every((p) => got.has(p));
    if (!same) {
      console.warn(`  ⚠ ${loc}: placeholder mismatch "${k}" want[${[...want]}] got[${[...got]}] → en`);
      combined[k][loc] = en[k]; fallbacks++; continue;
    }
    combined[k][loc] = val;
  }
}

writeFileSync(join(DIR, "dunning-combined.json"), JSON.stringify(combined, null, 2) + "\n", "utf8");
console.log(`\n✓ ${keys.length} keys × ${fragFiles.length} locales → dunning-combined.json${fallbacks ? ` (${fallbacks} en fallback(s))` : " — all clean, no fallbacks"}`);
