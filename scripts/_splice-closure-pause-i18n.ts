/**
 * Splice the translated closure/pause banner ordering keys into each locale's
 * "ordering" block, after the "holidayOrderLater" line.
 *   npx tsx scripts/_splice-closure-pause-i18n.ts
 */
import { readFileSync, writeFileSync } from "node:fs";

const OUT =
  "C:/Users/luigi/AppData/Local/Temp/claude/C--FeeFreeOrderingSystems/c7ef92b3-363d-4736-a981-25b95de9c857/tasks/w79s148np.output";

const K = ["holidayServiceClosedWindows", "holidayServiceSpecialHours", "pauseBannerTitle", "pauseBannerDescription", "pauseBannerResume"] as const;
const raw = JSON.parse(readFileSync(OUT, "utf8"));
const translations: Array<Record<string, string>> = (raw.result || raw).translations || [];
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
  if (text.includes('"holidayServiceClosedWindows"')) {
    ok++;
    continue; // idempotent
  }
  const m = text.match(/([ \t]*)"holidayOrderLater"\s*:\s*"(?:[^"\\]|\\.)*",\n/);
  if (!m) {
    problems.push(`${t.locale}: holidayOrderLater line not found`);
    continue;
  }
  const indent = m[1];
  const insert = K.map((k) => `${indent}"${k}": "${esc(t[k] ?? "")}",\n`).join("");
  const next = text.replace(m[0], m[0] + insert);
  let parsed: { ordering?: Record<string, string> };
  try {
    parsed = JSON.parse(next);
  } catch (e) {
    problems.push(`${t.locale}: JSON broke — ${(e as Error).message}`);
    continue;
  }
  if (parsed.ordering?.holidayServiceClosedWindows == null) {
    problems.push(`${t.locale}: key not under ordering after insert`);
    continue;
  }
  // Sanity: every placeholder must survive in the translation.
  const need = { holidayServiceClosedWindows: ["{service}", "{windows}"], holidayServiceSpecialHours: ["{service}", "{windows}"], pauseBannerTitle: ["{services}"], pauseBannerResume: ["{time}"] } as Record<string, string[]>;
  let phOk = true;
  for (const [k, phs] of Object.entries(need)) for (const ph of phs) if (!(t[k] ?? "").includes(ph)) { problems.push(`${t.locale}: ${k} missing ${ph}`); phOk = false; }
  if (!phOk) continue;
  writeFileSync(file, next, "utf8");
  console.log(`  ${t.locale.padEnd(6)} ok`);
  ok++;
}

console.log(`\n${ok}/${translations.length} locales spliced`);
if (problems.length) {
  console.log("PROBLEMS:");
  for (const p of problems) console.log("  " + p);
  process.exit(1);
}
