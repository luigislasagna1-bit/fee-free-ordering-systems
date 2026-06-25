import { readFileSync, writeFileSync } from "node:fs";
const OUT =
  "C:/Users/luigi/AppData/Local/Temp/claude/C--FeeFreeOrderingSystems/c7ef92b3-363d-4736-a981-25b95de9c857/tasks/wuxqcznhg.output";
const EN: Record<string, string> = {
  chooserTitle: "Choose a location",
  chooserSubtitle: "This report is per-location — pick a location to view it.",
  viewingLocation: "Viewing",
  changeLocation: "Change location",
};
const raw = JSON.parse(readFileSync(OUT, "utf8"));
const translations: Array<Record<string, string>> = (raw.result || raw).translations || [];
const staging: Record<string, Record<string, string>> = {};
for (const k of Object.keys(EN)) {
  const dotted = `admin.reportsHome.${k}`;
  staging[dotted] = { en: EN[k] };
  for (const t of translations) staging[dotted][t.locale] = t[k] || EN[k];
}
writeFileSync("scripts/i18n-data/chooser-keys.json", JSON.stringify(staging, null, 2) + "\n", "utf8");
console.log(`wrote scripts/i18n-data/chooser-keys.json — ${Object.keys(staging).length} keys × ${translations.length + 1} locales`);
