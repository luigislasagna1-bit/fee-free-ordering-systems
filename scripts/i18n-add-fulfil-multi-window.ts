/** i18n × 38: multi-window fulfilment editor (Fabrizio cmr803ovq c).
 *  Run: npx tsx scripts/i18n-add-fulfil-multi-window.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "admin.menuEditor.addFulfilWindow": {
    en: "Add another time window", fr: "Ajouter une autre plage horaire", es: "Añadir otra franja horaria",
    it: "Aggiungi un'altra fascia oraria", pt: "Adicionar outra janela horária", "pt-BR": "Adicionar outra janela de horário",
    de: "Weiteres Zeitfenster hinzufügen", nl: "Nog een tijdvenster toevoegen", ro: "Adaugă altă fereastră orară",
    sv: "Lägg till ett till tidsfönster", da: "Tilføj endnu et tidsvindue", nb: "Legg til enda et tidsvindu",
    fi: "Lisää toinen aikaikkuna", pl: "Dodaj kolejne okno czasowe", cs: "Přidat další časové okno",
    sk: "Pridať ďalšie časové okno", hu: "Újabb idősáv hozzáadása", el: "Προσθήκη άλλου χρονικού παραθύρου",
    bg: "Добави още един времеви прозорец", hr: "Dodaj još jedan vremenski okvir", sr: "Додај још један временски оквир",
    sl: "Dodaj še eno časovno okno", et: "Lisa veel üks ajaaken", lv: "Pievienot vēl vienu laika logu",
    lt: "Pridėti dar vieną laiko langą", tr: "Başka bir zaman aralığı ekle", ru: "Добавить ещё одно временное окно",
    uk: "Додати ще одне часове вікно", ca: "Afegeix una altra franja horària", id: "Tambah jendela waktu lain",
    vi: "Thêm khung giờ khác", th: "เพิ่มช่วงเวลาอีกช่วง", zh: "添加另一个时间段", ja: "別の時間帯を追加",
    ko: "다른 시간대 추가", ar: "إضافة نافذة زمنية أخرى", he: "הוסף חלון זמן נוסף", hi: "एक और समय विंडो जोड़ें",
  },
  "admin.menuEditor.fulfilWindowN": {
    en: "Window {n}", fr: "Plage {n}", es: "Franja {n}", it: "Fascia {n}", pt: "Janela {n}", "pt-BR": "Janela {n}",
    de: "Zeitfenster {n}", nl: "Venster {n}", ro: "Fereastra {n}", sv: "Fönster {n}", da: "Vindue {n}",
    nb: "Vindu {n}", fi: "Ikkuna {n}", pl: "Okno {n}", cs: "Okno {n}", sk: "Okno {n}", hu: "Idősáv {n}",
    el: "Παράθυρο {n}", bg: "Прозорец {n}", hr: "Okvir {n}", sr: "Оквир {n}", sl: "Okno {n}", et: "Aken {n}",
    lv: "Logs {n}", lt: "Langas {n}", tr: "Aralık {n}", ru: "Окно {n}", uk: "Вікно {n}", ca: "Franja {n}",
    id: "Jendela {n}", vi: "Khung {n}", th: "ช่วงที่ {n}", zh: "时间段 {n}", ja: "時間帯 {n}", ko: "시간대 {n}",
    ar: "نافذة {n}", he: "חלון {n}", hi: "विंडो {n}",
  },
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
  const path = join(DIR, f);
  const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  for (const [key, byLoc] of Object.entries(K)) setDeep(data, key, byLoc[loc] ?? byLoc.en);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
console.log(`✓ multi-window keys added to ${n} locale(s).`);
