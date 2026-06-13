/** Assemble the Phase 2 fulfilment translation fragments (_frag1..5.json, each
 *  locale → { dotted.key → text }) plus the `en` source from messages/en.json
 *  into the merge-tool staging shape { dotted.key → { locale → text } }.
 *  Then run:  npx tsx scripts/i18n-merge-data.ts menu-fulfilment
 *
 *    npx tsx scripts/i18n-assemble-fulfilment.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DATA = join(process.cwd(), "scripts", "i18n-data");
const MSG = join(process.cwd(), "src", "messages");

const KEYS = [
  "ordering.fulfilOrderAheadLabel",
  "checkout.fulfilSchedulePrompt",
  "admin.menuEditor.fulfilTitle",
  "admin.menuEditor.fulfilHelp",
  "admin.menuEditor.fulfilIntro",
  "admin.menuEditor.fulfilAlways",
  "admin.menuEditor.fulfilRestricted",
  "admin.menuEditor.fulfilDaysLabel",
  "admin.menuEditor.fulfilAnyDay",
  "admin.menuEditor.fulfilDaysHint",
  "admin.menuEditor.fulfilTimeHint",
  "admin.menuEditor.fulfilPreview",
];

function getDeep(obj: any, dotted: string): string | undefined {
  return dotted.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// 1) Pull en from the canonical source.
const en = JSON.parse(readFileSync(join(MSG, "en.json"), "utf8"));

// 2) Load all locale fragments.
const perLocale: Record<string, Record<string, string>> = { en: {} };
for (const k of KEYS) {
  const v = getDeep(en, k);
  if (typeof v !== "string") throw new Error(`en.json missing ${k}`);
  perLocale.en[k] = v;
}
for (const frag of ["_frag1", "_frag2", "_frag3", "_frag4", "_frag5"]) {
  const obj = JSON.parse(readFileSync(join(DATA, `${frag}.json`), "utf8"));
  for (const [loc, keys] of Object.entries(obj as Record<string, Record<string, string>>)) {
    perLocale[loc] = keys;
  }
}

// 3) Transpose to staging shape and validate coverage.
const staging: Record<string, Record<string, string>> = {};
let missing = 0;
for (const k of KEYS) {
  staging[k] = {};
  for (const [loc, keys] of Object.entries(perLocale)) {
    const t = keys[k];
    if (typeof t !== "string" || !t.trim()) { console.warn(`  ⚠ ${k} missing for ${loc}`); missing++; continue; }
    // Placeholder parity: every translation that should carry {window} must.
    if (k.endsWith("fulfilOrderAheadLabel") && !t.includes("{window}")) {
      console.warn(`  ⚠ ${k} [${loc}] dropped {window} placeholder`); missing++;
    }
    staging[k][loc] = t;
  }
}

const locales = Object.keys(perLocale).sort();
console.log(`locales: ${locales.length} (${locales.join(", ")})`);
console.log(`keys: ${KEYS.length}, missing/parity issues: ${missing}`);
if (locales.length !== 38) console.warn(`  ⚠ expected 38 locales, got ${locales.length}`);

writeFileSync(join(DATA, "menu-fulfilment.json"), JSON.stringify(staging, null, 2) + "\n");
console.log("✓ wrote scripts/i18n-data/menu-fulfilment.json");
