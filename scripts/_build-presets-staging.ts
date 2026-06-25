import { readFileSync, writeFileSync } from "node:fs";
const OUT =
  "C:/Users/luigi/AppData/Local/Temp/claude/C--FeeFreeOrderingSystems/c7ef92b3-363d-4736-a981-25b95de9c857/tasks/wxaoeinup.output";
const EN: Record<string, string> = { today: "Today", yesterday: "Yesterday" };
const raw = JSON.parse(readFileSync(OUT, "utf8"));
const translations: Array<Record<string, string>> = (raw.result || raw).translations || [];
const staging: Record<string, Record<string, string>> = {};
for (const k of Object.keys(EN)) {
  const dotted = `admin.dateRangePicker.${k}`;
  staging[dotted] = { en: EN[k] };
  for (const t of translations) staging[dotted][t.locale] = t[k] || EN[k];
}
writeFileSync("scripts/i18n-data/daterange-presets.json", JSON.stringify(staging, null, 2) + "\n", "utf8");
console.log(`wrote ${Object.keys(staging).length} keys × ${translations.length + 1} locales`);
