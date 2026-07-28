/**
 * Splice kitchen.printerNativeOnlyDescLanOnly into all 37 non-English locales,
 * right after "printerNativeOnlyDesc" (matches en.json). Text-anchored,
 * idempotent, handles the anchor-is-last-key case.
 *
 *   npx tsx scripts/_splice-lan-only-banner-i18n.ts
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const ANCHOR = /^(\s*)"printerNativeOnlyDesc"\s*:/;
const KEY = "printerNativeOnlyDescLanOnly";

const packDir = "scripts/i18n-data/lan-only-banner";
const codes = readdirSync(packDir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));

let spliced = 0;
for (const code of codes) {
  const pack = JSON.parse(readFileSync(`${packDir}/${code}.json`, "utf8")) as Record<string, string>;
  if (typeof pack[KEY] !== "string") { console.error(`❌ ${code}: pack missing ${KEY}`); process.exit(1); }
  const path = `src/messages/${code}.json`;
  const text = readFileSync(path, "utf8");
  if (text.includes(`"${KEY}"`)) { console.log(`• ${code}: already spliced`); continue; }
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((l) => ANCHOR.test(l));
  if (idx === -1) { console.error(`❌ ${code}: no anchor`); process.exit(1); }
  const indent = (lines[idx].match(ANCHOR) as RegExpMatchArray)[1];
  const hasComma = /,\s*$/.test(lines[idx]);
  if (!hasComma) lines[idx] = lines[idx].replace(/\s*$/, "") + ",";
  lines.splice(idx + 1, 0, `${indent}${JSON.stringify(KEY)}: ${JSON.stringify(pack[KEY])}${hasComma ? "," : ""}`);
  writeFileSync(path, lines.join("\n"), "utf8");
  spliced++;
  console.log(`✓ ${code}`);
}
console.log(`\nDone — spliced ${spliced} locale(s).`);
