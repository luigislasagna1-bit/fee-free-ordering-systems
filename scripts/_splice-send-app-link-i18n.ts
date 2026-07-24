/**
 * Splice the 11 send-app-link keys into all 37 non-English locale files, in the
 * same order + position as en.json (right after "getAppIosSoon" inside the
 * admin.publishingPage namespace). Text-anchored, idempotent, single-writer.
 *
 *   npx tsx scripts/_splice-send-app-link-i18n.ts
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const ORDER = [
  "sendLinkTitle", "sendLinkBody", "sendLinkEmailOption", "sendLinkTextOption",
  "sendLinkEmailPlaceholder", "sendLinkTextPlaceholder", "sendLinkSend",
  "sendLinkSending", "sendLinkDone", "sendLinkError", "sendLinkRateLimited",
];
const ANCHOR = /^(\s*)"getAppIosSoon"\s*:/;

const packDir = "scripts/i18n-data/send-app-link";
const codes = readdirSync(packDir).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));

let spliced = 0;
for (const code of codes) {
  const pack = JSON.parse(readFileSync(`${packDir}/${code}.json`, "utf8")) as Record<string, string>;
  const missing = ORDER.filter((k) => typeof pack[k] !== "string");
  if (missing.length) {
    console.error(`❌ ${code}: pack missing ${missing.join(", ")}`);
    process.exit(1);
  }
  const path = `src/messages/${code}.json`;
  const text = readFileSync(path, "utf8");
  if (text.includes('"sendLinkTitle"')) {
    console.log(`• ${code}: already spliced, skipping`);
    continue;
  }
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((l) => ANCHOR.test(l));
  if (idx === -1) {
    console.error(`❌ ${code}: no "getAppIosSoon" anchor found`);
    process.exit(1);
  }
  const indent = (lines[idx].match(ANCHOR) as RegExpMatchArray)[1];
  // The anchor may be the LAST key in its object (no trailing comma). If so, give
  // it a comma and drop the trailing comma on our last inserted key, so the JSON
  // stays valid either way.
  const anchorHasComma = /,\s*$/.test(lines[idx]);
  if (!anchorHasComma) lines[idx] = lines[idx].replace(/\s*$/, "") + ",";
  const newLines = ORDER.map((k, i) => {
    const comma = !anchorHasComma && i === ORDER.length - 1 ? "" : ",";
    return `${indent}${JSON.stringify(k)}: ${JSON.stringify(pack[k])}${comma}`;
  });
  lines.splice(idx + 1, 0, ...newLines);
  writeFileSync(path, lines.join("\n"), "utf8");
  spliced++;
  console.log(`✓ ${code}: spliced 11 keys`);
}
console.log(`\nDone — spliced ${spliced} locale(s).`);
