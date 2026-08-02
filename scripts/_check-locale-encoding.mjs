// Guard against the ANSI-vs-UTF8 mojibake class that bit the 2026-08-02 merge:
// reading a UTF-8 file with the system codepage turns "à" into "Ã " and every
// locale file silently ships double-encoded text that still parses as JSON.
import fs from "node:fs";

const files = fs.readdirSync("src/messages").filter((f) => f.endsWith(".json"));
let invalid = 0;
let moji = 0;
// Latin-1-decoded-UTF-8 signatures: "Ã" or "Â" followed by a high byte, plus
// the classic smart-quote ("â€") and Cyrillic ("Ð") markers.
const MOJI = /Ã[-¿]|Â[-¿]|â|Ð[-¿]/;

for (const f of files) {
  const raw = fs.readFileSync(`src/messages/${f}`, "utf8");
  try {
    JSON.parse(raw);
  } catch (e) {
    invalid++;
    console.log(`INVALID JSON: ${f} — ${e.message}`);
  }
  if (MOJI.test(raw)) {
    moji++;
    console.log(`MOJIBAKE: ${f}`);
  }
}
console.log(`${files.length} locale files · ${invalid} invalid · ${moji} mojibake`);
process.exitCode = invalid + moji > 0 ? 1 : 0;
