/**
 * One-shot i18n patch: add admin.promotionsList.tabSelfMade / tabPreMade across
 * all 38 locales (Luigi 2026-06-09, Promotions Self-made vs Pre-made tabs).
 *   npx tsx scripts/i18n-add-premade-tabs.ts
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");
// [tabSelfMade, tabPreMade]
const T: Record<string, [string, string]> = {
  en: ["Self-made", "Pre-made"],
  fr: ["Personnalisées", "Prédéfinies"],
  es: ["Propias", "Predefinidas"],
  it: ["Personalizzate", "Predefinite"],
  pt: ["Próprias", "Predefinidas"],
  "pt-BR": ["Próprias", "Predefinidas"],
  de: ["Eigene", "Vorgefertigt"],
  nl: ["Eigen", "Vooraf gemaakt"],
  ro: ["Proprii", "Predefinite"],
  sv: ["Egna", "Färdiga"],
  da: ["Egne", "Forudlavede"],
  nb: ["Egne", "Forhåndslagde"],
  fi: ["Omat", "Valmiit"],
  pl: ["Własne", "Gotowe"],
  cs: ["Vlastní", "Předpřipravené"],
  sk: ["Vlastné", "Predpripravené"],
  hu: ["Saját", "Előre elkészített"],
  el: ["Δικά σας", "Έτοιμα"],
  bg: ["Собствени", "Готови"],
  hr: ["Vlastite", "Unaprijed izrađene"],
  sr: ["Сопствене", "Унапред направљене"],
  sl: ["Lastne", "Vnaprej pripravljene"],
  et: ["Omad", "Valmis"],
  lv: ["Pašu veidotās", "Iepriekš sagatavotās"],
  lt: ["Savos", "Iš anksto paruoštos"],
  tr: ["Kendi", "Hazır"],
  ru: ["Свои", "Готовые"],
  uk: ["Власні", "Готові"],
  ca: ["Pròpies", "Predefinides"],
  id: ["Buatan sendiri", "Siap pakai"],
  vi: ["Tự tạo", "Có sẵn"],
  th: ["สร้างเอง", "สำเร็จรูป"],
  zh: ["自建", "预设"],
  ja: ["自作", "既製"],
  ko: ["직접 만든", "기본 제공"],
  ar: ["خاصة بك", "جاهزة"],
  he: ["משלך", "מוכנות מראש"],
  hi: ["स्वयं बनाई", "पूर्व-निर्मित"],
};

function setDeep(obj: Record<string, unknown>, key: string, value: string) {
  const parts = key.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof cur[p] !== "object" || cur[p] === null || Array.isArray(cur[p])) cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

let n = 0;
for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  const loc = f.replace(".json", "");
  const tr = T[loc] ?? T.en;
  const path = join(DIR, f);
  const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  setDeep(data, "admin.promotionsList.tabSelfMade", tr[0]);
  setDeep(data, "admin.promotionsList.tabPreMade", tr[1]);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
console.log(`✓ Self-made/Pre-made tab keys added to ${n} locale(s).`);
