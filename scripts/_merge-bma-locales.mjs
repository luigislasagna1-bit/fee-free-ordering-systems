// Merge the BMA translation staging (workflow result: dotted key → {en, fr, ...})
// into src/messages/<code>.json. Node-only — NEVER PowerShell-roundtrip locale
// files (UTF-8 mojibake lesson, 2026-08-01).
//
//   node scripts/_merge-bma-locales.mjs <staging.json>
import { readFileSync, writeFileSync } from "node:fs";

const stagingPath = process.argv[2];
if (!stagingPath) { console.error("usage: node scripts/_merge-bma-locales.mjs <staging.json>"); process.exit(1); }
const staging = JSON.parse(readFileSync(stagingPath, "utf8"));

const LOCALES = ["fr","es","it","pt","pt-BR","de","nl","ro","sv","da","nb","fi","pl","cs","sk","hu","el","bg","hr","sr","sl","et","lv","lt","tr","ru","uk","ca","id","vi","th","zh","ja","ko","ar","he","hi"];

const setDeep = (obj, dotted, value) => {
  const parts = dotted.split(".");
  let cur = obj;
  for (const p of parts.slice(0, -1)) {
    if (typeof cur[p] !== "object" || cur[p] === null || Array.isArray(cur[p])) cur[p] = {};
    cur = cur[p];
  }
  cur[parts.at(-1)] = value;
};

// Placeholder guard: every {arg} in EN must survive translation exactly.
const args = (s) => [...String(s).matchAll(/\{[a-zA-Z0-9_]+\}/g)].map((m) => m[0]).sort().join("|");

let totalSet = 0;
const problems = [];
for (const code of LOCALES) {
  const path = `src/messages/${code}.json`;
  const json = JSON.parse(readFileSync(path, "utf8"));
  let set = 0;
  for (const [dotted, row] of Object.entries(staging)) {
    const v = row[code];
    if (!v) { problems.push(`${code} MISSING ${dotted}`); continue; }
    if (args(row.en) !== args(v)) { problems.push(`${code} PLACEHOLDER-MISMATCH ${dotted}: "${v}"`); continue; }
    setDeep(json, dotted, v);
    set++;
  }
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n", "utf8");
  totalSet += set;
  if (set !== Object.keys(staging).length) console.log(`${code}: ${set}/${Object.keys(staging).length}`);
}
console.log(`merged ${totalSet} values across ${LOCALES.length} locales (${Object.keys(staging).length} keys each expected)`);
if (problems.length) {
  console.log(`\n${problems.length} PROBLEMS (not merged — fix and re-run):`);
  for (const p of problems.slice(0, 40)) console.log("  " + p);
  process.exit(1);
}
