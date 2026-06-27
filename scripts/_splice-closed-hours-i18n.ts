/**
 * Splice the translated closed-hours admin keys (from the translate-closed-hours-keys
 * workflow) into each locale's admin.hours block, after the "modeOpen" line.
 *   npx tsx scripts/_splice-closed-hours-i18n.ts
 */
import { readFileSync, writeFileSync } from "node:fs";

const OUT =
  "C:/Users/luigi/AppData/Local/Temp/claude/C--FeeFreeOrderingSystems/c7ef92b3-363d-4736-a981-25b95de9c857/tasks/woh8z3ifd.output";

const raw = JSON.parse(readFileSync(OUT, "utf8"));
const translations: Array<{ locale: string; modeClosedHours: string; modeClosedHoursHint: string }> =
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
  if (text.includes('"modeClosedHours"')) {
    ok++;
    continue; // idempotent
  }
  const m = text.match(/([ \t]*)"modeOpen"\s*:\s*"(?:[^"\\]|\\.)*",\n/);
  if (!m) {
    problems.push(`${t.locale}: modeOpen line not found`);
    continue;
  }
  const indent = m[1];
  const insert =
    `${indent}"modeClosedHours": "${esc(t.modeClosedHours)}",\n` +
    `${indent}"modeClosedHoursHint": "${esc(t.modeClosedHoursHint)}",\n`;
  const next = text.replace(m[0], m[0] + insert);
  let parsed: { admin?: { hours?: { modeClosedHours?: string } } };
  try {
    parsed = JSON.parse(next);
  } catch (e) {
    problems.push(`${t.locale}: JSON broke — ${(e as Error).message}`);
    continue;
  }
  if (parsed.admin?.hours?.modeClosedHours == null) {
    problems.push(`${t.locale}: key not under admin.hours after insert`);
    continue;
  }
  writeFileSync(file, next, "utf8");
  console.log(`  ${t.locale.padEnd(6)} "${t.modeClosedHours}"`);
  ok++;
}

console.log(`\n${ok}/${translations.length} locales spliced`);
if (problems.length) {
  console.log("PROBLEMS:");
  for (const p of problems) console.log("  " + p);
  process.exit(1);
}
