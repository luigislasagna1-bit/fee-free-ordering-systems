/** Full parity audit across ALL 38 locales — closes the gap that
 *  i18n-audit.ts leaves (it only spot-checks fr/es/it/pt and ignores
 *  placeholder + rich-tag parity). Honors the standing i18n rule:
 *  0 missing · 0 extra · 0 placeholder-arg mismatch · 0 rich-tag mismatch
 *  against the en.json baseline, for every locale.
 *
 *    npx tsx scripts/i18n-parity-all.ts        # exit 1 on any gap
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SUPPORTED_LOCALES as LOCALES } from "../src/lib/locales";

type Json = Record<string, unknown>;
const load = (code: string): Json =>
  JSON.parse(readFileSync(join("src", "messages", `${code}.json`), "utf8"));

/** Flatten nested message object to { "a.b.c": "value" } for string leaves. */
function flatten(obj: Json, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v as Json, key, out);
    else if (typeof v === "string") out[key] = v;
  }
  return out;
}

/** ICU placeholder arg names: {count}, {name}, plurals {n, plural, ...} → arg "n".
 *  Strips plural/select sub-message branches first — their literal text
 *  (`one {step} other {steps}`) legitimately differs per language and must NOT
 *  be counted as an argument. Iterates to peel nested branches. */
function placeholderArgs(s: string): Set<string> {
  let prev: string;
  let cur = s;
  const branch = /\b(?:zero|one|two|few|many|other|=\d+)\s*\{[^{}]*\}/g;
  do {
    prev = cur;
    cur = cur.replace(branch, " ");
  } while (cur !== prev);
  const args = new Set<string>();
  for (const m of cur.matchAll(/\{\s*([a-zA-Z0-9_]+)\s*(?:,|\})/g)) args.add(m[1]);
  return args;
}
/** Rich-tag names: <b>…</b>, <link>…</link> → "b","link". Only PAIRED tags
 *  count — next-intl rich formatting is always `<tag>…</tag>`. A lone <word>
 *  (e.g. the literal fill-in text "<your city>") is not a rich tag. */
function richTags(s: string): Set<string> {
  const tags = new Set<string>();
  for (const m of s.matchAll(/<\s*([a-zA-Z0-9_]+)\s*>/g)) {
    const tag = m[1];
    if (new RegExp(`</\\s*${tag}\\s*>`).test(s)) tags.add(tag);
  }
  return tags;
}
const eq = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

const base = flatten(load("en"));
const baseKeys = Object.keys(base);
let totalProblems = 0;

for (const code of LOCALES) {
  if (code === "en") continue;
  const loc = flatten(load(code));
  const locKeys = new Set(Object.keys(loc));
  const missing = baseKeys.filter((k) => !locKeys.has(k));
  const extra = [...locKeys].filter((k) => !(k in base));
  const phMismatch: string[] = [];
  const rtMismatch: string[] = [];
  for (const k of baseKeys) {
    if (!(k in loc)) continue;
    if (!eq(placeholderArgs(base[k]), placeholderArgs(loc[k]))) phMismatch.push(k);
    if (!eq(richTags(base[k]), richTags(loc[k]))) rtMismatch.push(k);
  }
  const problems = missing.length + extra.length + phMismatch.length + rtMismatch.length;
  totalProblems += problems;
  if (problems > 0) {
    console.log(`✗ ${code.toUpperCase()}: missing ${missing.length} · extra ${extra.length} · placeholder ${phMismatch.length} · rich-tag ${rtMismatch.length}`);
    for (const k of missing.slice(0, 5)) console.log(`    missing: ${k}`);
    for (const k of extra.slice(0, 5)) console.log(`    extra: ${k}`);
    for (const k of phMismatch.slice(0, 5)) console.log(`    placeholder: ${k}  en{${[...placeholderArgs(base[k])]}} ${code}{${[...placeholderArgs(loc[k])]}}`);
    for (const k of rtMismatch.slice(0, 5)) console.log(`    rich-tag: ${k}`);
  }
}

console.log("────────────────────────────────────────────────────────────");
if (totalProblems === 0) {
  console.log(`✓ All ${LOCALES.length} locales in full parity (${baseKeys.length} keys each · 0 missing · 0 extra · 0 placeholder · 0 rich-tag).`);
} else {
  console.log(`✗ ${totalProblems} parity problem(s) across locales.`);
  process.exit(1);
}
