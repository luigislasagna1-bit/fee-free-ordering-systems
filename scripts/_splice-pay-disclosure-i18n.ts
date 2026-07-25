/**
 * Splice earnPayDisclosure into all 37 non-English locale files, right after the
 * driver "earnPay" key (matching en.json). Text-anchored, idempotent, handles the
 * anchor-is-last-key (no trailing comma) case.
 *
 *   npx tsx scripts/_splice-pay-disclosure-i18n.ts
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const ORDER = ["earnPayDisclosure"];
const ANCHOR = /^(\s*)"earnPay"\s*:/;

const packDir = "scripts/i18n-data/pay-disclosure";
const codes = readdirSync(packDir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));

let spliced = 0;
for (const code of codes) {
  const pack = JSON.parse(readFileSync(`${packDir}/${code}.json`, "utf8")) as Record<string, string>;
  if (typeof pack.earnPayDisclosure !== "string") {
    console.error(`❌ ${code}: pack missing earnPayDisclosure`);
    process.exit(1);
  }
  const path = `src/messages/${code}.json`;
  const text = readFileSync(path, "utf8");
  if (text.includes('"earnPayDisclosure"')) {
    console.log(`• ${code}: already spliced, skipping`);
    continue;
  }
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((l) => ANCHOR.test(l));
  if (idx === -1) {
    console.error(`❌ ${code}: no "earnPay" anchor found`);
    process.exit(1);
  }
  const indent = (lines[idx].match(ANCHOR) as RegExpMatchArray)[1];
  const anchorHasComma = /,\s*$/.test(lines[idx]);
  if (!anchorHasComma) lines[idx] = lines[idx].replace(/\s*$/, "") + ",";
  const newLines = ORDER.map((k, i) => {
    const comma = !anchorHasComma && i === ORDER.length - 1 ? "" : ",";
    return `${indent}${JSON.stringify(k)}: ${JSON.stringify(pack[k])}${comma}`;
  });
  lines.splice(idx + 1, 0, ...newLines);
  writeFileSync(path, lines.join("\n"), "utf8");
  spliced++;
  console.log(`✓ ${code}: spliced`);
}
console.log(`\nDone — spliced ${spliced} locale(s).`);
