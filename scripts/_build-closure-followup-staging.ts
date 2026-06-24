/**
 * Transform the translate-closure-followup-keys workflow output into a staging
 * file for scripts/i18n-merge-data.ts, then:
 *   npx tsx scripts/_build-closure-followup-staging.ts
 *   npx tsx scripts/i18n-merge-data.ts closure-followup
 */
import { readFileSync, writeFileSync } from "node:fs";

const OUT =
  "C:/Users/luigi/AppData/Local/Temp/claude/C--FeeFreeOrderingSystems/c7ef92b3-363d-4736-a981-25b95de9c857/tasks/wbgd639cd.output";

const EN: Record<string, string> = {
  holidayClosedHoursToday: "Closed {windows} today",
  servicePausedBadge: "paused",
};
const PH: Record<string, string[]> = { holidayClosedHoursToday: ["{windows}"] };

const raw = JSON.parse(readFileSync(OUT, "utf8"));
const translations: Array<Record<string, string>> = (raw.result || raw).translations || [];
console.log("translations received:", translations.length);

const staging: Record<string, Record<string, string>> = {};
for (const k of Object.keys(EN)) {
  const dotted = `ordering.${k}`;
  staging[dotted] = { en: EN[k] };
  for (const t of translations) {
    let v = t[k];
    if (!v) v = EN[k];
    for (const ph of PH[k] ?? []) if (!v.includes(ph)) { console.warn(`  ⚠ ${t.locale}.${k} missing ${ph} → en`); v = EN[k]; }
    staging[dotted][t.locale] = v;
  }
}

writeFileSync("scripts/i18n-data/closure-followup.json", JSON.stringify(staging, null, 2) + "\n", "utf8");
console.log(`wrote scripts/i18n-data/closure-followup.json — ${Object.keys(staging).length} keys × ${translations.length + 1} locales`);
