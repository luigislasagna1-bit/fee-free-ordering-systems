/**
 * Adds the two sidebar keys that were shipping as hardcoded English
 * fallbacks in all 38 locales (spotted via MISSING_MESSAGE console errors):
 *   admin.sidebar.driverPool  — reuses each locale's existing, professionally
 *                               translated admin.driverPool.heading
 *   admin.sidebar.support24_7 — "24/7 support", translated below
 *
 *   npx tsx scripts/i18n-add-sidebar-driverpool-support.ts
 */
import fs from "fs";
import path from "path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

const SUPPORT_24_7: Record<string, string> = {
  en: "24/7 support",
  fr: "Assistance 24h/24 et 7j/7",
  es: "Soporte 24/7",
  it: "Assistenza 24/7",
  pt: "Suporte 24/7",
  "pt-BR": "Suporte 24/7",
  de: "24/7-Support",
  nl: "24/7 ondersteuning",
  ro: "Asistență 24/7",
  sv: "Support dygnet runt",
  da: "Support døgnet rundt",
  nb: "Døgnåpen support",
  fi: "Tuki 24/7",
  pl: "Wsparcie 24/7",
  cs: "Podpora 24/7",
  sk: "Podpora 24/7",
  hu: "0–24 órás támogatás",
  el: "Υποστήριξη 24/7",
  bg: "Поддръжка 24/7",
  hr: "Podrška 24/7",
  sr: "Подршка 24/7",
  sl: "Podpora 24/7",
  et: "Tugi 24/7",
  lv: "Atbalsts 24/7",
  lt: "Pagalba 24/7",
  tr: "7/24 destek",
  ru: "Поддержка 24/7",
  uk: "Підтримка 24/7",
  ca: "Suport 24/7",
  id: "Dukungan 24/7",
  vi: "Hỗ trợ 24/7",
  th: "ฝ่ายสนับสนุนตลอด 24 ชม.",
  zh: "24/7 全天候支持",
  ja: "24時間365日サポート",
  ko: "연중무휴 24시간 지원",
  ar: "دعم على مدار الساعة طوال أيام الأسبوع",
  he: "תמיכה 24/7",
  hi: "24/7 सहायता",
};

const dir = path.join(process.cwd(), "src", "messages");
let changed = 0;
for (const loc of SUPPORTED_LOCALES) {
  const file = path.join(dir, `${loc}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const admin = (json.admin ??= {});
  const sidebar = (admin.sidebar ??= {});

  const heading: string | undefined = admin.driverPool?.heading;
  if (!heading) throw new Error(`${loc}: admin.driverPool.heading missing — refusing to fall back to English`);
  const support = SUPPORT_24_7[loc];
  if (!support) throw new Error(`${loc}: no support24_7 translation provided`);

  if (sidebar.driverPool === heading && sidebar.support24_7 === support) continue;
  sidebar.driverPool = heading;
  sidebar.support24_7 = support;
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
  console.log(`${loc}: driverPool="${heading}" support24_7="${support}"`);
}
console.log(`\n✅ ${changed} locale file(s) updated`);
