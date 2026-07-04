/**
 * Adds money.discounts ("Discounts") to all 38 locales — the EOD / Sales
 * Summary discounts line (money-display normalization batch, 2026-07-04).
 *   npx tsx scripts/i18n-add-money-discounts.ts
 */
import fs from "fs";
import path from "path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

const DISCOUNTS: Record<string, string> = {
  en: "Discounts",
  fr: "Remises",
  es: "Descuentos",
  it: "Sconti",
  pt: "Descontos",
  "pt-BR": "Descontos",
  de: "Rabatte",
  nl: "Kortingen",
  ro: "Reduceri",
  sv: "Rabatter",
  da: "Rabatter",
  nb: "Rabatter",
  fi: "Alennukset",
  pl: "Rabaty",
  cs: "Slevy",
  sk: "Zľavy",
  hu: "Kedvezmények",
  el: "Εκπτώσεις",
  bg: "Отстъпки",
  hr: "Popusti",
  sr: "Popusti",
  sl: "Popusti",
  et: "Allahindlused",
  lv: "Atlaides",
  lt: "Nuolaidos",
  tr: "İndirimler",
  ru: "Скидки",
  uk: "Знижки",
  ca: "Descomptes",
  id: "Diskon",
  vi: "Giảm giá",
  th: "ส่วนลด",
  zh: "折扣",
  ja: "割引",
  ko: "할인",
  ar: "الخصومات",
  he: "הנחות",
  hi: "छूट",
};

const dir = path.join(process.cwd(), "src", "messages");
let changed = 0;
for (const loc of SUPPORTED_LOCALES) {
  const file = path.join(dir, `${loc}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const money = (json.money ??= {});
  const v = DISCOUNTS[loc];
  if (!v) throw new Error(`${loc}: no translation provided`);
  if (money.discounts === v) continue;
  money.discounts = v;
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(`✅ money.discounts added in ${changed} locale file(s)`);
