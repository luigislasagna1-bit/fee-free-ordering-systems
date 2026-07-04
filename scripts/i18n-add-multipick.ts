/** i18n × 38: count-aware wizard copy + multi-pick aria labels (Luigi
 *  2026-07-03, buy-3-pastas follow-up). {count}/{name} must survive.
 *  Run: npx tsx scripts/i18n-add-multipick.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "customer.guidedPromo.slotLabelPickN": {
    en: "Pick {count} items", fr: "Choisissez {count} articles", es: "Elige {count} artículos", it: "Scegli {count} articoli",
    pt: "Escolha {count} artigos", "pt-BR": "Escolha {count} itens", de: "{count} Artikel auswählen", nl: "Kies {count} items",
    ro: "Alege {count} produse", sv: "Välj {count} varor", da: "Vælg {count} varer", nb: "Velg {count} varer",
    fi: "Valitse {count} tuotetta", pl: "Wybierz {count} pozycje", cs: "Vyberte {count} položky", sk: "Vyberte {count} položky",
    hu: "Válasszon {count} tételt", el: "Επιλέξτε {count} είδη", bg: "Избери {count} артикула", hr: "Odaberi {count} stavke",
    sr: "Изабери {count} ставке", sl: "Izberi {count} izdelkov", et: "Vali {count} toodet", lv: "Izvēlies {count} produktus",
    lt: "Pasirinkite {count} prekes", tr: "{count} ürün seçin", ru: "Выберите {count} позиции", uk: "Виберіть {count} позиції",
    ca: "Tria {count} articles", id: "Pilih {count} item", vi: "Chọn {count} món", th: "เลือก {count} รายการ",
    zh: "选择 {count} 件", ja: "{count}品を選択", ko: "{count}개 선택", ar: "اختر {count} أصناف",
    he: "בחרו {count} פריטים", hi: "{count} आइटम चुनें",
  },
  "customer.guidedPromo.hintPickCounts": {
    en: "Pick {count} items — then choose your free item.", fr: "Choisissez {count} articles — puis votre article offert.", es: "Elige {count} artículos y luego tu artículo gratis.", it: "Scegli {count} articoli — poi il tuo articolo gratuito.",
    pt: "Escolha {count} artigos — depois o seu artigo grátis.", "pt-BR": "Escolha {count} itens — depois o seu item grátis.", de: "{count} Artikel wählen — dann Ihren Gratisartikel.", nl: "Kies {count} items — daarna je gratis item.",
    ro: "Alege {count} produse — apoi produsul tău gratuit.", sv: "Välj {count} varor — sedan din gratisvara.", da: "Vælg {count} varer — derefter din gratis vare.", nb: "Velg {count} varer — deretter gratisvaren din.",
    fi: "Valitse {count} tuotetta — sitten ilmainen tuotteesi.", pl: "Wybierz {count} pozycje — potem darmową pozycję.", cs: "Vyberte {count} položky — pak svou položku zdarma.", sk: "Vyberte {count} položky — potom svoju položku zadarmo.",
    hu: "Válasszon {count} tételt — majd az ingyenes tételét.", el: "Επιλέξτε {count} είδη — μετά το δωρεάν είδος σας.", bg: "Избери {count} артикула — после безплатния си артикул.", hr: "Odaberi {count} stavke — zatim svoju besplatnu stavku.",
    sr: "Изабери {count} ставке — затим своју бесплатну ставку.", sl: "Izberi {count} izdelkov — nato svoj brezplačni izdelek.", et: "Vali {count} toodet — seejärel tasuta toode.", lv: "Izvēlies {count} produktus — tad savu bezmaksas produktu.",
    lt: "Pasirinkite {count} prekes — tada nemokamą prekę.", tr: "{count} ürün seçin — sonra ücretsiz ürününüzü seçin.", ru: "Выберите {count} позиции — затем бесплатную.", uk: "Виберіть {count} позиції — потім безкоштовну.",
    ca: "Tria {count} articles — després el teu article gratuït.", id: "Pilih {count} item — lalu item gratis Anda.", vi: "Chọn {count} món — sau đó chọn món miễn phí.", th: "เลือก {count} รายการ — แล้วเลือกรายการฟรีของคุณ",
    zh: "选择 {count} 件后，再挑选您的免费商品。", ja: "{count}品を選ぶと、無料の1品を選べます。", ko: "{count}개를 고르면 무료 상품을 선택할 수 있어요.", ar: "اختر {count} أصناف — ثم اختر صنفك المجاني.",
    he: "בחרו {count} פריטים — ואז את הפריט החינמי שלכם.", hi: "{count} आइटम चुनें — फिर अपना मुफ़्त आइटम चुनें।",
  },
  "customer.guidedPromo.addOneMoreAria": {
    // EN avoids the literal "one {name}" — the parity audit's ICU
    // branch-stripper misreads it as a plural branch (known false positive).
    en: "Add a {name}", fr: "Ajouter un(e) {name}", es: "Añadir un {name}", it: "Aggiungi un {name}",
    pt: "Adicionar um {name}", "pt-BR": "Adicionar um {name}", de: "Ein {name} hinzufügen", nl: "Eén {name} toevoegen",
    ro: "Adaugă un {name}", sv: "Lägg till en {name}", da: "Tilføj en {name}", nb: "Legg til en {name}",
    fi: "Lisää yksi {name}", pl: "Dodaj jeden {name}", cs: "Přidat jeden {name}", sk: "Pridať jeden {name}",
    hu: "Egy {name} hozzáadása", el: "Προσθήκη ενός {name}", bg: "Добави един {name}", hr: "Dodaj jedan {name}",
    sr: "Додај један {name}", sl: "Dodaj en {name}", et: "Lisa üks {name}", lv: "Pievienot vienu {name}",
    lt: "Pridėti vieną {name}", tr: "Bir {name} ekle", ru: "Добавить один {name}", uk: "Додати один {name}",
    ca: "Afegeix un {name}", id: "Tambah satu {name}", vi: "Thêm một {name}", th: "เพิ่ม {name} หนึ่งรายการ",
    zh: "添加一份{name}", ja: "{name}を1つ追加", ko: "{name} 하나 추가", ar: "أضف {name} واحدًا",
    he: "הוסיפו {name} אחד", hi: "एक {name} जोड़ें",
  },
  "customer.guidedPromo.removeOneAria": {
    en: "Remove a {name}", fr: "Retirer un(e) {name}", es: "Quitar un {name}", it: "Rimuovi un {name}",
    pt: "Remover um {name}", "pt-BR": "Remover um {name}", de: "Ein {name} entfernen", nl: "Eén {name} verwijderen",
    ro: "Elimină un {name}", sv: "Ta bort en {name}", da: "Fjern en {name}", nb: "Fjern en {name}",
    fi: "Poista yksi {name}", pl: "Usuń jeden {name}", cs: "Odebrat jeden {name}", sk: "Odobrať jeden {name}",
    hu: "Egy {name} eltávolítása", el: "Αφαίρεση ενός {name}", bg: "Премахни един {name}", hr: "Ukloni jedan {name}",
    sr: "Уклони један {name}", sl: "Odstrani en {name}", et: "Eemalda üks {name}", lv: "Noņemt vienu {name}",
    lt: "Pašalinti vieną {name}", tr: "Bir {name} çıkar", ru: "Убрать один {name}", uk: "Прибрати один {name}",
    ca: "Treu un {name}", id: "Hapus satu {name}", vi: "Bớt một {name}", th: "นำ {name} ออกหนึ่งรายการ",
    zh: "移除一份{name}", ja: "{name}を1つ削除", ko: "{name} 하나 제거", ar: "أزل {name} واحدًا",
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
console.log(`✓ Multi-pick strings added to ${n} locale(s).`);
