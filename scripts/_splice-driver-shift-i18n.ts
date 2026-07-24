/**
 * Splice the 9 driver shift/earnings keys (B0/B3) into all 37 non-English locale
 * message files, in the same order + position as en.json (right after
 * "earnTipsFootnote" inside the `driver` namespace). Single-writer discipline:
 * this is the ONLY thing that edits the message files for this feature.
 *
 * Text-anchored (not JSON round-trip) so the diff is exactly the 9 inserted lines
 * per file — no reformatting. Idempotent: skips a file that already has the keys.
 *
 *   npx tsx scripts/_splice-driver-shift-i18n.ts
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const ORDER = [
  "earnHours", "earnHoursHelp", "earnPay",
  "startShift", "endShift", "onShift", "endShiftConfirm",
  "clockInFailed", "clockOutFailed",
];
const ANCHOR = /^(\s*)"earnTipsFootnote"\s*:/;

const packDir = "scripts/i18n-data/driver-shift";
const codes = readdirSync(packDir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));

let spliced = 0;
for (const code of codes) {
  const pack = JSON.parse(readFileSync(`${packDir}/${code}.json`, "utf8")) as Record<string, string>;
  const missing = ORDER.filter((k) => typeof pack[k] !== "string");
  if (missing.length) {
    console.error(`❌ ${code}: pack missing keys ${missing.join(", ")}`);
    process.exit(1);
  }

  const path = `src/messages/${code}.json`;
  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/);

  if (text.includes('"startShift"')) {
    console.log(`• ${code}: already spliced, skipping`);
    continue;
  }
  const idx = lines.findIndex((l) => ANCHOR.test(l));
  if (idx === -1) {
    console.error(`❌ ${code}: no "earnTipsFootnote" anchor found`);
    process.exit(1);
  }
  const indent = (lines[idx].match(ANCHOR) as RegExpMatchArray)[1];
  const newLines = ORDER.map((k) => `${indent}${JSON.stringify(k)}: ${JSON.stringify(pack[k])},`);
  lines.splice(idx + 1, 0, ...newLines);
  writeFileSync(path, lines.join("\n"), "utf8");
  spliced++;
  console.log(`✓ ${code}: spliced 9 keys`);
}
console.log(`\nDone — spliced ${spliced} locale(s).`);
