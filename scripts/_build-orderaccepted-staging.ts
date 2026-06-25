import { readFileSync, writeFileSync } from "node:fs";
const OUT =
  "C:/Users/luigi/AppData/Local/Temp/claude/C--FeeFreeOrderingSystems/c7ef92b3-363d-4736-a981-25b95de9c857/tasks/wln4o9vhe.output";
const EN: Record<string, string> = {
  badge: "Order confirmed",
  subjectDelivery: "Delivery order #{orderNumber} confirmed — {restaurant}",
  subjectPickup: "Pickup order #{orderNumber} confirmed — {restaurant}",
  subjectDineIn: "Dine-in order #{orderNumber} confirmed — {restaurant}",
  subjectScheduled: "Scheduled order #{orderNumber} confirmed — {restaurant}",
};
const raw = JSON.parse(readFileSync(OUT, "utf8"));
const translations: Array<Record<string, string>> = (raw.result ?? raw).translations ?? raw.translations ?? [];
const staging: Record<string, Record<string, string>> = {};
for (const k of Object.keys(EN)) {
  const dotted = `email.orderAccepted.${k}`;
  staging[dotted] = { en: EN[k] };
  for (const t of translations) {
    if (t.locale && t[k]) staging[dotted][t.locale] = t[k];
  }
}
// sanity: every key must have all 38 locales
for (const [dotted, map] of Object.entries(staging)) {
  const n = Object.keys(map).length;
  if (n !== 38) console.log(`!! ${dotted}: ${n}/38 locales`);
}
writeFileSync("scripts/i18n-data/orderaccepted-keys.json", JSON.stringify(staging, null, 2) + "\n", "utf8");
console.log(`wrote scripts/i18n-data/orderaccepted-keys.json — ${Object.keys(staging).length} keys, ${translations.length + 1} locales each`);
