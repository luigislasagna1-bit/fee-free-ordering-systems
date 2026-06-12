/** Merge a staging file from scripts/i18n-data/<name>.json into every
 *  src/messages/<locale>.json. Staging shape: { "dotted.key": { en, fr, … } }.
 *
 *  Validates locale coverage against the actual message-file set, warns on any
 *  key that is missing a locale (falls back to en so we never write `undefined`),
 *  and writes each file back in the canonical 2-space + trailing-newline format.
 *
 *    npx tsx scripts/i18n-merge-data.ts website-header
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const name = process.argv[2];
if (!name) {
  console.error("Usage: tsx scripts/i18n-merge-data.ts <staging-file-name-without-.json>");
  process.exit(1);
}

const MSG_DIR = join(process.cwd(), "src", "messages");
const STAGING = join(process.cwd(), "scripts", "i18n-data", `${name}.json`);

const locales = readdirSync(MSG_DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => f.replace(".json", ""));

const data = JSON.parse(readFileSync(STAGING, "utf8")) as Record<string, Record<string, string>>;
const keys = Object.keys(data);

// Coverage check — every key should carry every locale.
let gaps = 0;
for (const k of keys) {
  for (const loc of locales) {
    if (data[k][loc] == null) {
      console.warn(`  ⚠ ${k} missing locale "${loc}" — falling back to en`);
      gaps++;
    }
  }
}

function setDeep(obj: Record<string, unknown>, key: string, value: string) {
  const parts = key.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof cur[p] !== "object" || cur[p] === null || Array.isArray(cur[p])) cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

let n = 0;
for (const loc of locales) {
  const path = join(MSG_DIR, `${loc}.json`);
  const msg = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  for (const k of keys) setDeep(msg, k, data[k][loc] ?? data[k].en);
  writeFileSync(path, JSON.stringify(msg, null, 2) + "\n", "utf8");
  n++;
}

console.log(`✓ merged ${keys.length} key(s) from i18n-data/${name}.json into ${n} locale file(s)${gaps ? ` (${gaps} gap(s) filled from en)` : ""}.`);
