/** i18n × 38: promo "Get it Now" screen qty-stepper accessibility labels
 *  (Fabrizio cmqtmfp2n follow-up, 2026-07-03). {name} placeholder must survive.
 *  Run: npx tsx scripts/i18n-add-promo-stepper.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "customer.promoDetail.increaseQty": {
    en: "Add one more {name}", fr: "Ajouter un(e) {name} de plus", es: "Añadir un {name} más", it: "Aggiungi un altro {name}",
    pt: "Adicionar mais um {name}", "pt-BR": "Adicionar mais um {name}", de: "Ein weiteres {name} hinzufügen", nl: "Nog een {name} toevoegen",
    ro: "Adaugă încă un {name}", sv: "Lägg till en {name} till", da: "Tilføj endnu en {name}", nb: "Legg til enda en {name}",
    fi: "Lisää vielä yksi {name}", pl: "Dodaj jeszcze jeden {name}", cs: "Přidat další {name}", sk: "Pridať ďalší {name}",
    hu: "Még egy {name} hozzáadása", el: "Προσθήκη ενός ακόμα {name}", bg: "Добави още един {name}", hr: "Dodaj još jedan {name}",
    sr: "Додај још један {name}", sl: "Dodaj še en {name}", et: "Lisa veel üks {name}", lv: "Pievienot vēl vienu {name}",
    lt: "Pridėti dar vieną {name}", tr: "Bir {name} daha ekle", ru: "Добавить ещё один {name}", uk: "Додати ще один {name}",
    ca: "Afegeix un {name} més", id: "Tambah satu {name} lagi", vi: "Thêm một {name} nữa", th: "เพิ่ม {name} อีกหนึ่งรายการ",
    zh: "再加一份{name}", ja: "{name}をもう1つ追加", ko: "{name} 하나 더 추가", ar: "أضف {name} آخر",
    he: "הוסיפו {name} נוסף", hi: "एक और {name} जोड़ें",
  },
  "customer.promoDetail.decreaseQty": {
    // EN avoids the literal sequence "one {name}" — the parity audit's ICU
    // branch-stripper would misread it as a plural branch (false positive).
    en: "Remove a {name}", fr: "Retirer un(e) {name}", es: "Quitar un {name}", it: "Rimuovi un {name}",
    pt: "Remover um {name}", "pt-BR": "Remover um {name}", de: "Ein {name} entfernen", nl: "Eén {name} verwijderen",
    ro: "Elimină un {name}", sv: "Ta bort en {name}", da: "Fjern en {name}", nb: "Fjern en {name}",
    fi: "Poista yksi {name}", pl: "Usuń jeden {name}", cs: "Odebrat jeden {name}", sk: "Odobrať jeden {name}",
    hu: "Egy {name} eltávolítása", el: "Αφαίρεση ενός {name}", bg: "Премахни един {name}", hr: "Ukloni jedan {name}",
    sr: "Уклони један {name}", sl: "Odstrani en {name}", et: "Eemalda üks {name}", lv: "Noņemt vienu {name}",
    lt: "Pašalinti vieną {name}", tr: "Bir {name} çıkar", ru: "Убрать один {name}", uk: "Прибрати один {name}",
    ca: "Treu un {name}", id: "Hapus satu {name}", vi: "Bớt một {name}", th: "นำ {name} ออกหนึ่งรายการ",
    zh: "减少一份{name}", ja: "{name}を1つ減らす", ko: "{name} 하나 빼기", ar: "أزل {name} واحدًا",
    he: "הסירו {name} אחד", hi: "एक {name} हटाएँ",
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
console.log(`✓ Promo stepper strings added to ${n} locale(s).`);
