/** i18n × 38: customer-receipt item-table headers (Qty / Items / Price) + the
 *  per-line "Note" label. Previously hardcoded English in EmailParts
 *  OrderItemsTable; the customer OrderConfirmation now passes these localized.
 *  (Kitchen/staff email stays English by design.) Red-team i18n 2026-07-06.
 *  Run: npx tsx scripts/i18n-add-receipt-item-headers.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "receipt.customer.qty": {
    en: "Qty", fr: "Qté", es: "Cant.", it: "Qtà", pt: "Qtd", "pt-BR": "Qtd", de: "Menge", nl: "Aantal",
    ro: "Cant.", sv: "Antal", da: "Antal", nb: "Antall", fi: "Määrä", pl: "Ilość", cs: "Množ.", sk: "Množ.",
    hu: "Menny.", el: "Ποσότητα", bg: "Количество", hr: "Količina", sr: "Количина", sl: "Količina",
    et: "Kogus", lv: "Daudzums", lt: "Kiekis", tr: "Adet", ru: "Кол-во", uk: "Кількість", ca: "Quant.",
    id: "Jml", vi: "SL", th: "จำนวน", zh: "数量", ja: "数量", ko: "수량", ar: "الكمية", he: "כמות", hi: "मात्रा",
  },
  "receipt.customer.items": {
    en: "Items", fr: "Articles", es: "Artículos", it: "Articoli", pt: "Artigos", "pt-BR": "Itens", de: "Artikel",
    nl: "Artikelen", ro: "Produse", sv: "Artiklar", da: "Varer", nb: "Varer", fi: "Tuotteet", pl: "Pozycje",
    cs: "Položky", sk: "Položky", hu: "Tételek", el: "Είδη", bg: "Артикули", hr: "Stavke", sr: "Ставке",
    sl: "Izdelki", et: "Tooted", lv: "Preces", lt: "Prekės", tr: "Ürünler", ru: "Позиции", uk: "Позиції",
    ca: "Articles", id: "Item", vi: "Món", th: "รายการ", zh: "商品", ja: "商品", ko: "항목", ar: "العناصر",
    he: "פריטים", hi: "आइटम",
  },
  "receipt.customer.price": {
    en: "Price", fr: "Prix", es: "Precio", it: "Prezzo", pt: "Preço", "pt-BR": "Preço", de: "Preis", nl: "Prijs",
    ro: "Preț", sv: "Pris", da: "Pris", nb: "Pris", fi: "Hinta", pl: "Cena", cs: "Cena", sk: "Cena", hu: "Ár",
    el: "Τιμή", bg: "Цена", hr: "Cijena", sr: "Цена", sl: "Cena", et: "Hind", lv: "Cena", lt: "Kaina",
    tr: "Fiyat", ru: "Цена", uk: "Ціна", ca: "Preu", id: "Harga", vi: "Giá", th: "ราคา", zh: "价格",
    ja: "価格", ko: "가격", ar: "السعر", he: "מחיר", hi: "कीमत",
  },
  "receipt.customer.lineNote": {
    en: "Note", fr: "Note", es: "Nota", it: "Nota", pt: "Nota", "pt-BR": "Nota", de: "Notiz", nl: "Notitie",
    ro: "Notă", sv: "Notering", da: "Note", nb: "Notat", fi: "Huomautus", pl: "Uwaga", cs: "Poznámka",
    sk: "Poznámka", hu: "Megjegyzés", el: "Σημείωση", bg: "Бележка", hr: "Napomena", sr: "Напомена",
    sl: "Opomba", et: "Märkus", lv: "Piezīme", lt: "Pastaba", tr: "Not", ru: "Примечание", uk: "Примітка",
    ca: "Nota", id: "Catatan", vi: "Ghi chú", th: "หมายเหตุ", zh: "备注", ja: "備考", ko: "참고",
    ar: "ملاحظة", he: "הערה", hi: "नोट",
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
console.log(`✓ receipt item-table headers added to ${n} locale(s).`);
