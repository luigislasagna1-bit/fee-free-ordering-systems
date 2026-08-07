/**
 * kitchen.delayedBy / kitchen.delayedTimes — the amber "ready time was pushed
 * back" chip on the kitchen order detail (Fabrizio cms0gyexp #16).
 *
 * Replaces the raw, untranslated "[Delayed +15m at <ISO UTC>]" string that was
 * being appended to the CUSTOMER's notes field and shown in the kitchen's
 * yellow Notes box, which staff could not read at a glance.
 *
 *   npx tsx scripts/i18n-add-kitchen-delay-keys.ts
 *
 * Idempotent — never overwrites an existing value.
 */
import fs from "node:fs";
import path from "node:path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

/** locale -> { delayedBy, delayedTimes } */
const T: Record<string, { by: string; times: string }> = {
  en: { by: "Delayed by {minutes} min", times: "{count} changes" },
  fr: { by: "Retardé de {minutes} min", times: "{count} modifications" },
  es: { by: "Retrasado {minutes} min", times: "{count} cambios" },
  it: { by: "Ritardo di {minutes} min", times: "{count} modifiche" },
  de: { by: "Um {minutes} Min. verschoben", times: "{count} Änderungen" },
  pt: { by: "Atrasado {minutes} min", times: "{count} alterações" },
  "pt-BR": { by: "Atrasado {minutes} min", times: "{count} alterações" },
  nl: { by: "{minutes} min vertraagd", times: "{count} wijzigingen" },
  pl: { by: "Opóźnienie o {minutes} min", times: "{count} zmian" },
  ro: { by: "Întârziat cu {minutes} min", times: "{count} modificări" },
  hu: { by: "{minutes} perc csúszás", times: "{count} módosítás" },
  cs: { by: "Zpoždění o {minutes} min", times: "{count} změn" },
  sk: { by: "Meškanie o {minutes} min", times: "{count} zmien" },
  sl: { by: "Zamuda {minutes} min", times: "{count} sprememb" },
  hr: { by: "Kašnjenje {minutes} min", times: "{count} izmjena" },
  sr: { by: "Kašnjenje {minutes} min", times: "{count} izmena" },
  bg: { by: "Забавяне с {minutes} мин", times: "{count} промени" },
  el: { by: "Καθυστέρηση {minutes} λεπτά", times: "{count} αλλαγές" },
  tr: { by: "{minutes} dk gecikme", times: "{count} değişiklik" },
  uk: { by: "Затримка на {minutes} хв", times: "{count} змін" },
  ru: { by: "Задержка на {minutes} мин", times: "{count} изменений" },
  sv: { by: "Försenad {minutes} min", times: "{count} ändringar" },
  nb: { by: "Forsinket {minutes} min", times: "{count} endringer" },
  da: { by: "Forsinket {minutes} min", times: "{count} ændringer" },
  fi: { by: "Myöhässä {minutes} min", times: "{count} muutosta" },
  et: { by: "Hilineb {minutes} min", times: "{count} muudatust" },
  lv: { by: "Aizkavēts par {minutes} min", times: "{count} izmaiņas" },
  lt: { by: "Vėluoja {minutes} min", times: "{count} pakeitimai" },
  ca: { by: "Retardat {minutes} min", times: "{count} canvis" },
  id: { by: "Tertunda {minutes} menit", times: "{count} perubahan" },
  vi: { by: "Trễ {minutes} phút", times: "{count} thay đổi" },
  th: { by: "ล่าช้า {minutes} นาที", times: "{count} ครั้ง" },
  zh: { by: "延迟 {minutes} 分钟", times: "{count} 次调整" },
  ja: { by: "{minutes}分の遅延", times: "{count}回の変更" },
  ko: { by: "{minutes}분 지연", times: "{count}회 변경" },
  ar: { by: "تأخير {minutes} دقيقة", times: "{count} تغييرات" },
  he: { by: "עיכוב של {minutes} דקות", times: "{count} שינויים" },
  hi: { by: "{minutes} मिनट की देरी", times: "{count} बदलाव" },
};

const DIR = path.join(process.cwd(), "src", "messages");
let touched = 0;
const missing: string[] = [];

for (const locale of SUPPORTED_LOCALES) {
  const file = path.join(DIR, `${locale}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, any>;
  const bundle = T[locale];
  if (!bundle) { missing.push(locale); continue; }
  json.kitchen = json.kitchen ?? {};
  let n = 0;
  if (typeof json.kitchen.delayedBy !== "string") { json.kitchen.delayedBy = bundle.by; n++; }
  if (typeof json.kitchen.delayedTimes !== "string") { json.kitchen.delayedTimes = bundle.times; n++; }
  if (n > 0) { fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8"); touched++; }
  console.log(`  ${locale.padEnd(6)} +${n}`);
}

if (missing.length) console.error(`\n⚠️  no translation supplied for: ${missing.join(", ")}`);
console.log(`\n✅ ${touched}/${SUPPORTED_LOCALES.length} locale files updated.`);
