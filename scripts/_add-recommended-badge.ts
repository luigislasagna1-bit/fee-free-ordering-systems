/**
 * Add admin.setupWizard.recommendedBadge to all 38 locale files, reusing each
 * locale's EXISTING "Recommended" translation (the `printerRecommended` value)
 * so we don't ship an English-only string. Surgical text insert (before the
 * `requiredToPublish` line) to keep the diff to one line per file. Validates
 * JSON + key placement after each insert. Run:
 *   npx tsx scripts/_add-recommended-badge.ts
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const DIR = "src/messages";
const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));
let ok = 0;
const problems: string[] = [];

for (const f of files) {
  const path = `${DIR}/${f}`;
  let text = readFileSync(path, "utf8");
  if (text.includes('"recommendedBadge"')) {
    ok++;
    continue; // idempotent
  }
  const recMatch = text.match(/"printerRecommended"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  const reqMatch = text.match(/([ \t]*)"requiredToPublish"\s*:\s*"(?:[^"\\]|\\.)*"/);
  if (!recMatch || !reqMatch) {
    problems.push(`${f}: missing printerRecommended or requiredToPublish`);
    continue;
  }
  const insert = `${reqMatch[1]}"recommendedBadge": "${recMatch[1]}",\n`;
  const next = text.replace(reqMatch[0], insert + reqMatch[0]);
  // Validate the result parses AND the key landed under admin.setupWizard.
  let parsed: { admin?: { setupWizard?: { recommendedBadge?: string } } };
  try {
    parsed = JSON.parse(next);
  } catch (e) {
    problems.push(`${f}: JSON broke — ${(e as Error).message}`);
    continue;
  }
  if (parsed.admin?.setupWizard?.recommendedBadge == null) {
    problems.push(`${f}: key not under admin.setupWizard after insert`);
    continue;
  }
  writeFileSync(path, next, "utf8");
  console.log(`  ${f.padEnd(12)} recommendedBadge = "${recMatch[1]}"`);
  ok++;
}

console.log(`\nrecommendedBadge present in ${ok}/${files.length} locales`);
if (problems.length) {
  console.log("PROBLEMS:");
  for (const p of problems) console.log("  " + p);
  process.exit(1);
}
