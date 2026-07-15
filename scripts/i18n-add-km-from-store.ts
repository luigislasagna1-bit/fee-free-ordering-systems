/** i18n × 38 for the "{km} km from store" distance label (Luigi 2026-07-15 —
 *  show delivery distance on checkout zone line + driver card + dispatch view).
 *  Run: npx tsx scripts/i18n-add-km-from-store.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "common.kmFromStore": {
    en: "{km} km from store",
    fr: "à {km} km du magasin",
    es: "a {km} km de la tienda",
    it: "a {km} km dal locale",
    pt: "a {km} km da loja",
    "pt-BR": "a {km} km da loja",
    de: "{km} km vom Geschäft entfernt",
    nl: "{km} km van de zaak",
    ro: "la {km} km de local",
    sv: "{km} km från butiken",
    da: "{km} km fra butikken",
    nb: "{km} km fra butikken",
    fi: "{km} km liikkeestä",
    pl: "{km} km od lokalu",
    cs: "{km} km od podniku",
    sk: "{km} km od podniku",
    hu: "{km} km-re az üzlettől",
    el: "{km} χλμ. από το κατάστημα",
    bg: "на {km} км от обекта",
    hr: "{km} km od lokala",
    sr: "{km} km od lokala",
    sl: "{km} km od lokala",
    et: "{km} km poest",
    lv: "{km} km no veikala",
    lt: "{km} km nuo parduotuvės",
    tr: "mağazadan {km} km",
    ru: "{km} км от заведения",
    uk: "{km} км від закладу",
    ca: "a {km} km de la botiga",
    id: "{km} km dari toko",
    vi: "cách cửa hàng {km} km",
    th: "ห่างจากร้าน {km} กม.",
    zh: "距门店 {km} 公里",
    ja: "店舗から {km} km",
    ko: "매장에서 {km} km",
    ar: "على بعد {km} كم من المتجر",
    he: "{km} ק\"מ מהחנות",
    hi: "स्टोर से {km} किमी",
  },
};

function setDeep(obj: Record<string, unknown>, key: string, value: string) {
  const parts = key.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== "object" || cur[parts[i]] == null) cur[parts[i]] = {};
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

let count = 0;
for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  const loc = f.replace(".json", "");
  const path = join(DIR, f);
  const data = JSON.parse(readFileSync(path, "utf8"));
  for (const [key, byLoc] of Object.entries(K)) {
    if (!byLoc[loc]) console.warn(`  ⚠ ${loc} missing ${key} — en fallback`);
    setDeep(data, key, byLoc[loc] ?? byLoc.en);
  }
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  count++;
}
console.log(`✓ added ${Object.keys(K).length} key to ${count} locale files`);
