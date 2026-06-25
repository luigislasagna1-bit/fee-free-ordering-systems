import { readFileSync, writeFileSync } from "node:fs";
const OUT =
  "C:/Users/luigi/AppData/Local/Temp/claude/C--FeeFreeOrderingSystems/c7ef92b3-363d-4736-a981-25b95de9c857/tasks/wirx0wywd.output";
const EN: Record<string, string> = {
  allTime: "All-time",
  search: "Search name, email, phone…",
  perPage: "per page",
  lastOrder: "Last order",
};
const KEYMAP: Record<string, string[]> = {
  allTime: ["admin.reportsHome.allTime"],
  search: ["admin.reportOrdersList.searchPlaceholder", "admin.reportClientsList.searchPlaceholder"],
  perPage: ["admin.reportOrdersList.perPage", "admin.reportClientsList.perPage"],
  lastOrder: ["admin.reportClientsList.colLastOrder"],
};
const raw = JSON.parse(readFileSync(OUT, "utf8"));
const translations: Array<Record<string, string>> = (raw.result || raw).translations || [];
const staging: Record<string, Record<string, string>> = {};
for (const [valKey, dottedKeys] of Object.entries(KEYMAP)) {
  for (const dotted of dottedKeys) {
    staging[dotted] = { en: EN[valKey] };
    for (const t of translations) staging[dotted][t.locale] = t[valKey] || EN[valKey];
  }
}
writeFileSync("scripts/i18n-data/reports-p34.json", JSON.stringify(staging, null, 2) + "\n", "utf8");
console.log(`wrote scripts/i18n-data/reports-p34.json — ${Object.keys(staging).length} keys × ${translations.length + 1} locales`);
