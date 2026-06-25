import { readFileSync, writeFileSync } from "node:fs";
const OUT =
  "C:/Users/luigi/AppData/Local/Temp/claude/C--FeeFreeOrderingSystems/c7ef92b3-363d-4736-a981-25b95de9c857/tasks/wumytoewd.output";
const EN: Record<string, string> = {
  chainTitle: "{brand} — Chain reports",
  chainSubtitle: "Chain-wide · {range} · {count, plural, one {# location} other {# locations}}",
  chainMixedCaveat: "Totals shown in {currency}. Some locations use a different currency or timezone, so chain figures are indicative.",
  byLocation: "By location",
  colLocation: "Location",
  colOrders: "Orders",
  colRevenue: "Revenue",
  colAvgOrder: "Avg order",
  colShare: "Share",
  brandBadge: "Brand",
  locationDrillHint: "Tap a location to open its own reports.",
};
const raw = JSON.parse(readFileSync(OUT, "utf8"));
const translations: Array<Record<string, string>> = (raw.result || raw).translations || [];
const staging: Record<string, Record<string, string>> = {};
for (const k of Object.keys(EN)) {
  const dotted = `admin.reportsHome.${k}`;
  staging[dotted] = { en: EN[k] };
  for (const t of translations) staging[dotted][t.locale] = t[k] || EN[k];
}
writeFileSync("scripts/i18n-data/chain-dashboard.json", JSON.stringify(staging, null, 2) + "\n", "utf8");
console.log(`wrote scripts/i18n-data/chain-dashboard.json — ${Object.keys(staging).length} keys × ${translations.length + 1} locales`);
