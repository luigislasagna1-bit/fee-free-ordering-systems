/** Assemble the auto-call alert i18n fragments (_acall1..5.json, locale → {key→text})
 *  + the `en` source from messages/en.json into merge-tool staging shape, then:
 *    npx tsx scripts/i18n-merge-data.ts autocall-alert
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DATA = join(process.cwd(), "scripts", "i18n-data");
const MSG = join(process.cwd(), "src", "messages");
const PFX = "admin.kitchenWorkflowToggle.";
const KEYS = [
  "autoCallNumberLabel", "autoCallNumberFromStore", "autoCallNumberNone",
  "autoCallAlertPhoneLabel", "autoCallAlertPhonePlaceholderFallback", "autoCallAlertPhoneHint",
  "autoCallAlertPhoneSave", "autoCallAlertPhoneSavedToast",
  "autoCallNeedsSetupTitle", "autoCallNeedsSetupBody",
].map((k) => PFX + k);

const getDeep = (o: any, d: string): string | undefined => d.split(".").reduce((a, c) => (a == null ? undefined : a[c]), o);

const en = JSON.parse(readFileSync(join(MSG, "en.json"), "utf8"));
const perLocale: Record<string, Record<string, string>> = { en: {} };
for (const k of KEYS) {
  const v = getDeep(en, k);
  if (typeof v !== "string") throw new Error(`en.json missing ${k}`);
  perLocale.en[k] = v;
}
for (const frag of ["_acall1", "_acall2", "_acall3", "_acall4", "_acall5"]) {
  const obj = JSON.parse(readFileSync(join(DATA, `${frag}.json`), "utf8"));
  for (const [loc, keys] of Object.entries(obj as Record<string, Record<string, string>>)) perLocale[loc] = keys;
}

const staging: Record<string, Record<string, string>> = {};
let missing = 0;
for (const k of KEYS) {
  staging[k] = {};
  for (const [loc, keys] of Object.entries(perLocale)) {
    const t = keys[k];
    if (typeof t !== "string" || !t.trim()) { console.warn(`  ⚠ ${k} missing for ${loc}`); missing++; continue; }
    staging[k][loc] = t;
  }
}
const locales = Object.keys(perLocale);
console.log(`locales: ${locales.length}, keys: ${KEYS.length}, missing: ${missing}`);
if (locales.length !== 38) console.warn(`  ⚠ expected 38 locales, got ${locales.length}`);
writeFileSync(join(DATA, "autocall-alert.json"), JSON.stringify(staging, null, 2) + "\n");
console.log("✓ wrote scripts/i18n-data/autocall-alert.json");
