/**
 * Splice the translated saved-address checkout keys (from the
 * translate-saved-address-keys workflow) into each locale's checkout block,
 * after the "startTypingAddress" line.
 *   npx tsx scripts/_splice-saved-address-i18n.ts
 */
import { readFileSync, writeFileSync } from "node:fs";

const OUT =
  "C:/Users/luigi/AppData/Local/Temp/claude/C--FeeFreeOrderingSystems/c7ef92b3-363d-4736-a981-25b95de9c857/tasks/wddeyjycx.output";

const raw = JSON.parse(readFileSync(OUT, "utf8"));
const translations: Array<{ locale: string; savedAddressesLabel: string; savedAddressDefault: string; enterNewAddress: string }> =
  (raw.result || raw).translations || [];
console.log("translations received:", translations.length);

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
let ok = 0;
const problems: string[] = [];

for (const t of translations) {
  const file = `src/messages/${t.locale}.json`;
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    problems.push(`${t.locale}: file not found`);
    continue;
  }
  if (text.includes('"savedAddressesLabel"')) {
    ok++;
    continue; // idempotent
  }
  const m = text.match(/([ \t]*)"startTypingAddress"\s*:\s*"(?:[^"\\]|\\.)*",\n/);
  if (!m) {
    problems.push(`${t.locale}: startTypingAddress line not found`);
    continue;
  }
  const indent = m[1];
  const insert =
    `${indent}"savedAddressesLabel": "${esc(t.savedAddressesLabel)}",\n` +
    `${indent}"savedAddressDefault": "${esc(t.savedAddressDefault)}",\n` +
    `${indent}"enterNewAddress": "${esc(t.enterNewAddress)}",\n`;
  const next = text.replace(m[0], m[0] + insert);
  let parsed: { checkout?: { savedAddressesLabel?: string } };
  try {
    parsed = JSON.parse(next);
  } catch (e) {
    problems.push(`${t.locale}: JSON broke — ${(e as Error).message}`);
    continue;
  }
  if (parsed.checkout?.savedAddressesLabel == null) {
    problems.push(`${t.locale}: key not under checkout after insert`);
    continue;
  }
  writeFileSync(file, next, "utf8");
  console.log(`  ${t.locale.padEnd(6)} "${t.savedAddressesLabel}"`);
  ok++;
}

console.log(`\n${ok}/${translations.length} locales spliced`);
if (problems.length) {
  console.log("PROBLEMS:");
  for (const p of problems) console.log("  " + p);
  process.exit(1);
}
