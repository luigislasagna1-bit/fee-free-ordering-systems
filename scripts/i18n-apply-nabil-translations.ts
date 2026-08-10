/**
 * Apply staged Nabil-dashboard translations to the 37 non-English locale files.
 *
 * Input: a staging JSON (from the translate-nabil-dash workflow result):
 *   { "<dotted.key>": { en: "...", fr: "...", es: "...", ... } }
 * For every locale present on a row, deep-sets the translated value, replacing
 * the English baseline scripts/i18n-add-nabil-dash.ts wrote. `en.json` is never
 * touched. Keys outside the staging set are never touched. Refuses a row whose
 * `en` no longer matches the current en.json value (the key changed since
 * translation — retranslate instead of applying stale text).
 *
 *   npx tsx scripts/i18n-apply-nabil-translations.ts <staging.json> [--force-stale]
 */
import fs from "node:fs";
import path from "node:path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

const ROOT = path.join(__dirname, "..");
const MESSAGES_DIR = path.join(ROOT, "src", "messages");
const stagingPath = process.argv[2];
const forceStale = process.argv.includes("--force-stale");
if (!stagingPath || !fs.existsSync(stagingPath)) {
  console.error("Usage: npx tsx scripts/i18n-apply-nabil-translations.ts <staging.json>");
  process.exit(1);
}
const staging: Record<string, Record<string, string>> = JSON.parse(fs.readFileSync(stagingPath, "utf8"));

function deepGet(obj: any, dotted: string): unknown {
  return dotted.split(".").reduce((cur, p) => (cur == null ? cur : cur[p]), obj);
}
function deepSetOverwrite(obj: Record<string, any>, dotted: string, value: string): void {
  const parts = dotted.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof cur[p] !== "object" || cur[p] === null) cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
}
/** ICU placeholder set must survive translation exactly. */
function placeholders(s: string): string {
  return (s.match(/\{[a-zA-Z0-9_]+/g) || []).sort().join(",");
}

const en = JSON.parse(fs.readFileSync(path.join(MESSAGES_DIR, "en.json"), "utf8"));
let stale = 0;
const rows = Object.entries(staging);
for (const [key, row] of rows) {
  const current = deepGet(en, key);
  if (typeof current !== "string" || current !== row.en) {
    stale++;
    console.warn(`STALE en for ${key}: staged "${String(row.en).slice(0, 60)}" vs current "${String(current).slice(0, 60)}"`);
  }
}
if (stale > 0 && !forceStale) {
  console.error(`${stale} stale rows — retranslate those keys or pass --force-stale to apply the rest.`);
  process.exit(1);
}

let applied = 0;
let skippedPlaceholder = 0;
for (const code of SUPPORTED_LOCALES) {
  if (code === "en") continue;
  const file = path.join(MESSAGES_DIR, `${code}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  let changed = false;
  for (const [key, row] of rows) {
    const v = row[code];
    if (typeof v !== "string" || !v.trim()) continue;
    if (typeof row.en === "string" && deepGet(en, key) !== row.en) continue; // stale row (force mode skips it)
    if (placeholders(v) !== placeholders(row.en)) {
      skippedPlaceholder++;
      console.warn(`PLACEHOLDER mismatch ${code} ${key} — kept English baseline`);
      continue;
    }
    deepSetOverwrite(json, key, v);
    changed = true;
    applied++;
  }
  if (changed) fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
}
console.log(`Applied ${applied} translated values across ${SUPPORTED_LOCALES.length - 1} locales; ${skippedPlaceholder} placeholder-mismatch values kept English.`);
console.log("Now run: npx tsx scripts/i18n-parity-all.ts");
