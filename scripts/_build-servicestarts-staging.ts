import { readFileSync, writeFileSync } from "node:fs";
const OUT =
  "C:/Users/luigi/AppData/Local/Temp/claude/C--FeeFreeOrderingSystems/c7ef92b3-363d-4736-a981-25b95de9c857/tasks/w4laxkxke.output";
const EN = "🕒 {service} service hasn't started yet — it starts at {time}.";
const raw = JSON.parse(readFileSync(OUT, "utf8"));
const translations: Array<{ locale: string; text: string }> = (raw.result ?? raw).translations ?? raw.translations ?? [];
const staging: Record<string, Record<string, string>> = { "checkout.serviceStartsPrompt": { en: EN } };
for (const t of translations) {
  if (t.locale && t.text) staging["checkout.serviceStartsPrompt"][t.locale] = t.text;
}
const n = Object.keys(staging["checkout.serviceStartsPrompt"]).length;
if (n !== 38) console.log(`!! only ${n}/38 locales`);
writeFileSync("scripts/i18n-data/servicestarts-keys.json", JSON.stringify(staging, null, 2) + "\n", "utf8");
console.log(`wrote scripts/i18n-data/servicestarts-keys.json — checkout.serviceStartsPrompt × ${n} locales`);
