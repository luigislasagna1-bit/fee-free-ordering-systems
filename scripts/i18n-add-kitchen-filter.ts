/** i18n × 38 for the kitchen order-screen service-type filter (Fabrizio cmrjatqy6).
 *  Run: npx tsx scripts/i18n-add-kitchen-filter.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "kitchen.filterAll": { en: "All", fr: "Toutes", es: "Todos", it: "Tutti", pt: "Todos", "pt-BR": "Todos", de: "Alle", nl: "Alle", ro: "Toate", sv: "Alla", da: "Alle", nb: "Alle", fi: "Kaikki", pl: "Wszystkie", cs: "Vše", sk: "Všetky", hu: "Összes", el: "Όλα", bg: "Всички", hr: "Sve", sr: "Sve", sl: "Vsa", et: "Kõik", lv: "Visi", lt: "Visi", tr: "Tümü", ru: "Все", uk: "Всі", ca: "Totes", id: "Semua", vi: "Tất cả", th: "ทั้งหมด", zh: "全部", ja: "すべて", ko: "전체", ar: "الكل", he: "הכל", hi: "सभी" },
  "kitchen.filterTakeaway": { en: "Takeaway", fr: "À emporter", es: "Para llevar", it: "Asporto", pt: "Retirada", "pt-BR": "Retirada", de: "Abholung", nl: "Afhalen", ro: "Ridicare", sv: "Avhämtning", da: "Afhentning", nb: "Henting", fi: "Nouto", pl: "Odbiór", cs: "Vyzvednutí", sk: "Vyzdvihnutie", hu: "Elvitel", el: "Παραλαβή", bg: "Вземане", hr: "Preuzimanje", sr: "Preuzimanje", sl: "Prevzem", et: "Järeletulek", lv: "Paņemšana", lt: "Atsiėmimas", tr: "Gel-Al", ru: "Самовывоз", uk: "Самовивіз", ca: "Recollida", id: "Ambil Sendiri", vi: "Tự lấy", th: "รับที่ร้าน", zh: "自取", ja: "テイクアウト", ko: "픽업", ar: "استلام", he: "איסוף עצמי", hi: "पिकअप" },
  "kitchen.filterDelivery": { en: "Delivery", fr: "Livraison", es: "Entrega", it: "Consegna", pt: "Entrega", "pt-BR": "Entrega", de: "Lieferung", nl: "Bezorgen", ro: "Livrare", sv: "Leverans", da: "Levering", nb: "Levering", fi: "Toimitus", pl: "Dostawa", cs: "Doručení", sk: "Doručenie", hu: "Szállítás", el: "Παράδοση", bg: "Доставка", hr: "Dostava", sr: "Dostava", sl: "Dostava", et: "Kojuvedu", lv: "Piegāde", lt: "Pristatymas", tr: "Teslimat", ru: "Доставка", uk: "Доставка", ca: "Lliurament", id: "Pengiriman", vi: "Giao hàng", th: "จัดส่ง", zh: "外卖配送", ja: "デリバリー", ko: "배달", ar: "توصيل", he: "משלוח", hi: "डिलीवरी" },
  "kitchen.filterReservations": { en: "Reservations", fr: "Réservations", es: "Reservas", it: "Prenotazioni", pt: "Reservas", "pt-BR": "Reservas", de: "Reservierungen", nl: "Reserveringen", ro: "Rezervări", sv: "Reservationer", da: "Reservationer", nb: "Reservasjoner", fi: "Varaukset", pl: "Rezerwacje", cs: "Rezervace", sk: "Rezervácie", hu: "Foglalások", el: "Κρατήσεις", bg: "Резервации", hr: "Rezervacije", sr: "Rezervacije", sl: "Rezervacije", et: "Broneeringud", lv: "Rezervācijas", lt: "Rezervacijos", tr: "Rezervasyonlar", ru: "Брони", uk: "Бронювання", ca: "Reserves", id: "Reservasi", vi: "Đặt bàn", th: "การจอง", zh: "预订", ja: "予約", ko: "예약", ar: "الحجوزات", he: "הזמנות שולחנות", hi: "आरक्षण" },
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
console.log(`✓ kitchen filter strings added to ${n} locale(s).`);
