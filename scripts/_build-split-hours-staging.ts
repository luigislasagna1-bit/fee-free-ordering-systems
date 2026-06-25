/**
 * Transform the translate-split-hours-admin-keys workflow output into a staging
 * file for scripts/i18n-merge-data.ts, then:
 *   npx tsx scripts/_build-split-hours-staging.ts
 *   npx tsx scripts/i18n-merge-data.ts split-hours-admin
 */
import { readFileSync, writeFileSync } from "node:fs";

const OUT =
  "C:/Users/luigi/AppData/Local/Temp/claude/C--FeeFreeOrderingSystems/c7ef92b3-363d-4736-a981-25b95de9c857/tasks/wsx7gwwyi.output";

const EN: Record<string, string> = {
  addSlot: "Add a time slot",
  removeSlot: "Remove time slot",
  closesNextDay: "Closes next day (e.g. open past midnight)",
};

const raw = JSON.parse(readFileSync(OUT, "utf8"));
const translations: Array<Record<string, string>> = (raw.result || raw).translations || [];
console.log("translations received:", translations.length);

const staging: Record<string, Record<string, string>> = {};
for (const k of Object.keys(EN)) {
  const dotted = `admin.hours.${k}`;
  staging[dotted] = { en: EN[k] };
  for (const t of translations) staging[dotted][t.locale] = t[k] || EN[k];
}

writeFileSync("scripts/i18n-data/split-hours-admin.json", JSON.stringify(staging, null, 2) + "\n", "utf8");
console.log(`wrote scripts/i18n-data/split-hours-admin.json — ${Object.keys(staging).length} keys × ${translations.length + 1} locales`);
