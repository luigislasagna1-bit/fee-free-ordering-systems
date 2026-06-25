import { readFileSync, writeFileSync } from "node:fs";
const OUT =
  "C:/Users/luigi/AppData/Local/Temp/claude/C--FeeFreeOrderingSystems/c7ef92b3-363d-4736-a981-25b95de9c857/tasks/wzfqsp9px.output";
const EN: Record<string, string> = {
  viewDay: "Day", viewWeek: "Week", viewMonth: "Month",
  colSubtotal: "Subtotal", colTax: "Tax", colDeliveryFee: "Delivery fee",
  colTips: "Tips", colOtherFees: "Other fees", colTotal: "Total",
  totalRowLabel: "Total", emptyState: "No orders in this range.",
};
const raw = JSON.parse(readFileSync(OUT, "utf8"));
const translations: Array<Record<string, string>> = (raw.result || raw).translations || [];
const staging: Record<string, Record<string, string>> = {};
for (const k of Object.keys(EN)) {
  const dotted = `admin.reportSalesSummary.${k}`;
  staging[dotted] = { en: EN[k] };
  for (const t of translations) staging[dotted][t.locale] = t[k] || EN[k];
}
writeFileSync("scripts/i18n-data/summary-columns.json", JSON.stringify(staging, null, 2) + "\n", "utf8");
console.log(`wrote scripts/i18n-data/summary-columns.json — ${Object.keys(staging).length} keys × ${translations.length + 1} locales`);
