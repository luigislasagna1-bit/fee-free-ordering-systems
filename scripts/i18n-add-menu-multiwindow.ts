/** i18n × 38 for the multi-window Menu Daily Hours editor (Fabrizio cmrjb8voz).
 *  Run: npx tsx scripts/i18n-add-menu-multiwindow.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "admin.menus.windowN": {
    en: "Slot {n}", fr: "Créneau {n}", es: "Franja {n}", it: "Fascia {n}",
    pt: "Faixa {n}", "pt-BR": "Faixa {n}", de: "Zeitfenster {n}", nl: "Tijdvak {n}",
    ro: "Interval {n}", sv: "Tidsintervall {n}", da: "Tidsrum {n}", nb: "Tidsrom {n}",
    fi: "Aikaväli {n}", pl: "Przedział {n}", cs: "Časové okno {n}", sk: "Časové okno {n}",
    hu: "Idősáv {n}", el: "Χρονικό διάστημα {n}", bg: "Интервал {n}", hr: "Vremenski okvir {n}",
    sr: "Vremenski okvir {n}", sl: "Časovno okno {n}", et: "Ajavahemik {n}", lv: "Laika intervāls {n}",
    lt: "Laiko intervalas {n}", tr: "Saat Aralığı {n}", ru: "Интервал {n}", uk: "Інтервал {n}",
    ca: "Franja {n}", id: "Slot Waktu {n}", vi: "Khung giờ {n}", th: "ช่วงเวลา {n}",
    zh: "时段 {n}", ja: "時間帯 {n}", ko: "시간대 {n}", ar: "الفترة {n}",
    he: "משבצת זמן {n}", hi: "समय स्लॉट {n}",
  },
  "admin.menus.windowRemove": {
    en: "Remove", fr: "Supprimer", es: "Eliminar", it: "Rimuovi",
    pt: "Remover", "pt-BR": "Remover", de: "Entfernen", nl: "Verwijderen",
    ro: "Elimină", sv: "Ta bort", da: "Fjern", nb: "Fjern",
    fi: "Poista", pl: "Usuń", cs: "Odebrat", sk: "Odstrániť",
    hu: "Eltávolítás", el: "Κατάργηση", bg: "Премахване", hr: "Ukloni",
    sr: "Ukloni", sl: "Odstrani", et: "Eemalda", lv: "Noņemt",
    lt: "Pašalinti", tr: "Kaldır", ru: "Удалить", uk: "Видалити",
    ca: "Elimina", id: "Hapus", vi: "Xóa", th: "ลบ",
    zh: "删除", ja: "削除", ko: "제거", ar: "إزالة",
    he: "הסר", hi: "हटाएं",
  },
  "admin.menus.windowAdd": {
    en: "Add another time slot", fr: "Ajouter un autre créneau horaire", es: "Añadir otra franja horaria", it: "Aggiungi un'altra fascia oraria",
    pt: "Adicionar outra faixa horária", "pt-BR": "Adicionar outra faixa de horário", de: "Weiteres Zeitfenster hinzufügen", nl: "Nog een tijdvak toevoegen",
    ro: "Adaugă un alt interval orar", sv: "Lägg till ytterligare ett tidsintervall", da: "Tilføj endnu et tidsrum", nb: "Legg til et tidsrom til",
    fi: "Lisää toinen aikaväli", pl: "Dodaj kolejny przedział czasowy", cs: "Přidat další časové okno", sk: "Pridať ďalšie časové okno",
    hu: "Újabb idősáv hozzáadása", el: "Προσθήκη άλλου χρονικού διαστήματος", bg: "Добавяне на друг часови интервал", hr: "Dodaj još jedan vremenski okvir",
    sr: "Dodaj još jedan vremenski okvir", sl: "Dodaj še eno časovno okno", et: "Lisa veel üks ajavahemik", lv: "Pievienot vēl vienu laika intervālu",
    lt: "Pridėti dar vieną laiko intervalą", tr: "Başka bir saat aralığı ekle", ru: "Добавить ещё один интервал", uk: "Додати ще один інтервал",
    ca: "Afegeix una altra franja horària", id: "Tambahkan slot waktu lain", vi: "Thêm khung giờ khác", th: "เพิ่มช่วงเวลาอีกช่วง",
    zh: "添加另一个时段", ja: "別の時間帯を追加", ko: "다른 시간대 추가", ar: "إضافة فترة زمنية أخرى",
    he: "הוסף משבצת זמן נוספת", hi: "एक और समय स्लॉट जोड़ें",
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
console.log(`✓ menu multi-window strings added to ${n} locale(s).`);
