/** Merge nabil-part*.json staging files into locale JSONs.
 *  Each part file has { "dotted.key": { locale: text, ... }, ... }
 *  Run: npx tsx scripts/i18n-merge-nabil-marketing-parts.ts */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const DIR = join(process.cwd(), "src", "messages");
const SCRATCH = process.argv[2] ?? resolve(
  process.env.LOCALAPPDATA ?? "",
  "Temp/claude/C--FeeFreeOrderingSystems/cd03f8a1-3412-467d-904e-9566f84e3149/scratchpad"
);

const partFiles = [1, 2, 3, 4].map(n => join(SCRATCH, `nabil-part${n}.json`));

let merged: Record<string, Record<string, string>> = {};
let fileCount = 0;
for (const pf of partFiles) {
  if (!existsSync(pf)) { console.log(`⏭ ${pf} not found, skipping`); continue; }
  const data = JSON.parse(readFileSync(pf, "utf8"));
  for (const [key, translations] of Object.entries(data)) {
    merged[key] = { ...(merged[key] || {}), ...(translations as Record<string, string>) };
  }
  fileCount++;
  console.log(`✅ Read ${Object.keys(data).length} keys from ${pf.split(/[\\/]/).pop()}`);
}

if (fileCount === 0) { console.log("No part files found. Exiting."); process.exit(1); }

function setDeep(obj: Record<string, unknown>, dottedKey: string, value: string) {
  const parts = dottedKey.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== "object" || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

const locales = readdirSync(DIR).filter(f => f.endsWith(".json")).map(f => f.replace(".json", ""));
for (const loc of locales) {
  const path = join(DIR, `${loc}.json`);
  const data = JSON.parse(readFileSync(path, "utf8"));
  let patched = 0;
  for (const [key, translations] of Object.entries(merged)) {
    const val = translations[loc] ?? translations.en;
    if (val) { setDeep(data, key, val); patched++; }
  }
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}

console.log(`\n✅ Merged ${Object.keys(merged).length} keys across ${locales.length} locales from ${fileCount} part file(s)`);
