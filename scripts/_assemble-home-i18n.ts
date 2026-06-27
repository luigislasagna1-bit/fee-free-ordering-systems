/** Assemble the 37 per-locale _home-<code>.json translation files (+ English
 *  source) into the canonical scripts/i18n-data/home.json staging shape
 *  ({ key: { en, ar, bg, ... } }). QA each value against the English baseline:
 *  rich-tag parity (<accent></accent> etc.) and ICU-placeholder parity. Any cell
 *  that breaks a tag/placeholder, is missing, or isn't a string falls back to
 *  English so the downstream merge + parity-all stays clean. Reports everything.
 *  Run: npx tsx scripts/_assemble-home-i18n.ts
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SRC = "scripts/i18n-data/home.json";
const LOCALES = ["ar","bg","ca","cs","da","de","el","es","et","fi","fr","he","hi","hr","hu","id","it","ja","ko","lt","lv","nb","nl","pl","pt-BR","pt","ro","ru","sk","sl","sr","sv","th","tr","uk","vi","zh"];

const src = JSON.parse(readFileSync(SRC, "utf8")) as Record<string, { en: string }>;
const keys = Object.keys(src);

function richTags(s: string): Set<string> {
  const t = new Set<string>();
  for (const m of s.matchAll(/<\s*([a-zA-Z0-9_]+)\s*>/g)) { const tag = m[1]; if (new RegExp(`</\\s*${tag}\\s*>`).test(s)) t.add(tag); }
  return t;
}
function phArgs(s: string): Set<string> {
  let prev: string, cur = s;
  const b = /\b(?:zero|one|two|few|many|other|=\d+)\s*\{[^{}]*\}/g;
  do { prev = cur; cur = cur.replace(b, " "); } while (cur !== prev);
  const a = new Set<string>();
  for (const m of cur.matchAll(/\{\s*([a-zA-Z0-9_]+)\s*(?:,|\})/g)) a.add(m[1]);
  return a;
}
const eq = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

const out: Record<string, Record<string, string>> = {};
for (const k of keys) out[k] = { en: src[k].en };

let totalFallback = 0;
const missingFiles: string[] = [];
for (const loc of LOCALES) {
  const f = `scripts/i18n-data/_home-${loc}.json`;
  if (!existsSync(f)) { missingFiles.push(loc); for (const k of keys) out[k][loc] = src[k].en; continue; }
  let data: Record<string, string>;
  try { data = JSON.parse(readFileSync(f, "utf8")); } catch { console.log(`✗ ${loc}: JSON parse error → all English fallback`); for (const k of keys) out[k][loc] = src[k].en; totalFallback += keys.length; continue; }
  let miss = 0, tagBad = 0, phBad = 0;
  const sampleTag: string[] = [];
  for (const k of keys) {
    const v = data[k];
    if (typeof v !== "string" || v.trim() === "") { out[k][loc] = src[k].en; miss++; totalFallback++; continue; }
    if (!eq(richTags(src[k].en), richTags(v))) { out[k][loc] = src[k].en; tagBad++; totalFallback++; if (sampleTag.length < 3) sampleTag.push(k); continue; }
    if (!eq(phArgs(src[k].en), phArgs(v))) { out[k][loc] = src[k].en; phBad++; totalFallback++; continue; }
    out[k][loc] = v;
  }
  const extra = Object.keys(data).filter((k) => !(k in src)).length;
  const flag = miss || tagBad || phBad ? "⚠" : "✓";
  console.log(`${flag} ${loc}: ${keys.length - miss - tagBad - phBad}/${keys.length} translated · missing ${miss} · tag ${tagBad} · ph ${phBad} · extra ${extra}${sampleTag.length ? "  [tag:" + sampleTag.join(",") + "]" : ""}`);
}

writeFileSync(SRC, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`\nAssembled ${keys.length} keys × ${LOCALES.length + 1} locales → ${SRC}`);
if (missingFiles.length) console.log(`MISSING staging files (all-English fallback): ${missingFiles.join(", ")}`);
console.log(`Total cells fallen back to English: ${totalFallback} (of ${keys.length * LOCALES.length})`);
