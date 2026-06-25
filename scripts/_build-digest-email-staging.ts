/**
 * Transform translate-digest-email-keys output → staging for i18n-merge-data.
 *   npx tsx scripts/_build-digest-email-staging.ts
 *   npx tsx scripts/i18n-merge-data.ts digest-email
 */
import { readFileSync, writeFileSync } from "node:fs";

const OUT =
  "C:/Users/luigi/AppData/Local/Temp/claude/C--FeeFreeOrderingSystems/c7ef92b3-363d-4736-a981-25b95de9c857/tasks/w1olktp4e.output";

const EN: Record<string, string> = {
  viewFullReport: "View full report",
  noMissedOrder: "You didn't miss any order.",
  noCanceledOrder: "You didn't cancel any order.",
  sentDaily: "Sent daily",
  sentMonthly: "Sent monthly",
};

const raw = JSON.parse(readFileSync(OUT, "utf8"));
const translations: Array<Record<string, string>> = (raw.result || raw).translations || [];
console.log("translations received:", translations.length);

const staging: Record<string, Record<string, string>> = {};
for (const k of Object.keys(EN)) {
  const dotted = `email.digest.${k}`;
  staging[dotted] = { en: EN[k] };
  for (const t of translations) staging[dotted][t.locale] = t[k] || EN[k];
}

writeFileSync("scripts/i18n-data/digest-email.json", JSON.stringify(staging, null, 2) + "\n", "utf8");
console.log(`wrote scripts/i18n-data/digest-email.json — ${Object.keys(staging).length} keys × ${translations.length + 1} locales`);
