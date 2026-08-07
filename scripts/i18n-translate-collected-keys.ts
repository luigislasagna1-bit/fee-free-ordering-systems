/**
 * Translations for the "store credit is a tender, not income" strings, plus the
 * two Orders List column headers (2026-08-07).
 *
 * Five keys map onto FIVE unique English strings — "Order value" is reused by
 * three keys, so it is translated once and fanned out.
 *
 *   npx tsx scripts/i18n-translate-collected-keys.ts
 *
 * Idempotent: a locale that already differs from the English source is left
 * alone (never clobber a hand-corrected translation).
 */
import fs from "node:fs";
import path from "node:path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

type Bundle = Record<string, string>;

/** canonical id → { en, ...37 locales } */
const T: Record<string, Bundle> = {
  orderValue: {
    en: "Order value",
    fr: "Valeur de la commande", es: "Valor del pedido", it: "Valore dell'ordine",
    de: "Bestellwert", pt: "Valor do pedido", "pt-BR": "Valor do pedido",
    nl: "Bestelwaarde", pl: "Wartość zamówienia", ro: "Valoarea comenzii",
    hu: "Rendelés értéke", cs: "Hodnota objednávky", sk: "Hodnota objednávky",
    sl: "Vrednost naročila", hr: "Vrijednost narudžbe", sr: "Vrednost porudžbine",
    bg: "Стойност на поръчката", el: "Αξία παραγγελίας", tr: "Sipariş tutarı",
    uk: "Вартість замовлення", ru: "Стоимость заказа", sv: "Ordervärde",
    nb: "Ordreverdi", da: "Ordreværdi", fi: "Tilauksen arvo",
    et: "Tellimuse väärtus", lv: "Pasūtījuma vērtība", lt: "Užsakymo vertė",
    ca: "Valor de la comanda", id: "Nilai pesanan", vi: "Giá trị đơn hàng",
    th: "มูลค่าคำสั่งซื้อ", zh: "订单金额", ja: "注文金額", ko: "주문 금액",
    ar: "قيمة الطلب", he: "שווי ההזמנה", hi: "ऑर्डर मूल्य",
  },
  creditSpent: {
    en: "{label} spent",
    fr: "{label} dépensés", es: "{label} gastados", it: "{label} spesi",
    de: "Ausgegebene {label}", pt: "{label} gastos", "pt-BR": "{label} gastos",
    nl: "Bestede {label}", pl: "Wydane {label}", ro: "{label} cheltuiți",
    hu: "Elköltött {label}", cs: "Utracené {label}", sk: "Minuté {label}",
    sl: "Porabljeni {label}", hr: "Potrošeni {label}", sr: "Potrošeni {label}",
    bg: "Изразходвани {label}", el: "{label} που δαπανήθηκαν", tr: "Harcanan {label}",
    uk: "Витрачені {label}", ru: "Потрачено {label}", sv: "Använda {label}",
    nb: "Brukte {label}", da: "Brugte {label}", fi: "Käytetyt {label}",
    et: "Kulutatud {label}", lv: "Iztērētie {label}", lt: "Išleisti {label}",
    ca: "{label} gastats", id: "{label} yang digunakan", vi: "{label} đã dùng",
    th: "{label} ที่ใช้ไป", zh: "已使用的{label}", ja: "使用した{label}",
    ko: "사용한 {label}", ar: "{label} المستخدمة", he: "{label} שנוצלו",
    hi: "खर्च किए गए {label}",
  },
  creditReturned: {
    en: "{amount} paid with {label} has been returned to the customer's wallet.",
    fr: "Les {amount} payés en {label} ont été recrédités sur le portefeuille du client.",
    es: "Los {amount} pagados con {label} se han devuelto al monedero del cliente.",
    it: "I {amount} pagati con {label} sono stati restituiti al portafoglio del cliente.",
    de: "Die mit {label} bezahlten {amount} wurden dem Guthaben des Kunden gutgeschrieben.",
    pt: "Os {amount} pagos com {label} foram devolvidos à carteira do cliente.",
    "pt-BR": "Os {amount} pagos com {label} foram devolvidos à carteira do cliente.",
    nl: "De met {label} betaalde {amount} is teruggestort naar de wallet van de klant.",
    pl: "Kwota {amount} zapłacona w {label} została zwrócona do portfela klienta.",
    ro: "Suma de {amount} plătită cu {label} a fost returnată în portofelul clientului.",
    hu: "A {label} egyenlegből fizetett {amount} visszakerült az ügyfél tárcájába.",
    cs: "Částka {amount} zaplacená pomocí {label} byla vrácena do peněženky zákazníka.",
    sk: "Suma {amount} zaplatená pomocou {label} bola vrátená do peňaženky zákazníka.",
    sl: "Znesek {amount}, plačan z {label}, je bil vrnjen v denarnico stranke.",
    hr: "Iznos {amount} plaćen putem {label} vraćen je u novčanik kupca.",
    sr: "Iznos {amount} plaćen putem {label} vraćen je u novčanik kupca.",
    bg: "Сумата {amount}, платена с {label}, е върната в портфейла на клиента.",
    el: "Το ποσό {amount} που πληρώθηκε με {label} επιστράφηκε στο πορτοφόλι του πελάτη.",
    tr: "{label} ile ödenen {amount} müşterinin cüzdanına iade edildi.",
    uk: "Суму {amount}, сплачену {label}, повернуто до гаманця клієнта.",
    ru: "Сумма {amount}, оплаченная с помощью {label}, возвращена в кошелёк клиента.",
    sv: "De {amount} som betalades med {label} har återförts till kundens plånbok.",
    nb: "De {amount} som ble betalt med {label}, er ført tilbake til kundens lommebok.",
    da: "De {amount}, der blev betalt med {label}, er ført tilbage til kundens tegnebog.",
    fi: "{label}-saldolla maksetut {amount} on palautettu asiakkaan lompakkoon.",
    et: "{label} abil makstud {amount} on kliendi rahakotti tagastatud.",
    lv: "Ar {label} samaksātie {amount} ir atgriezti klienta makā.",
    lt: "{label} sumokėti {amount} grąžinti į kliento piniginę.",
    ca: "Els {amount} pagats amb {label} s'han retornat al moneder del client.",
    id: "{amount} yang dibayar dengan {label} telah dikembalikan ke dompet pelanggan.",
    vi: "Số tiền {amount} đã thanh toán bằng {label} đã được hoàn lại vào ví của khách hàng.",
    th: "ยอด {amount} ที่ชำระด้วย {label} ได้คืนเข้ากระเป๋าเงินของลูกค้าแล้ว",
    zh: "使用{label}支付的 {amount} 已退回到顾客的钱包。",
    ja: "{label}でお支払いいただいた {amount} は、お客様のウォレットに返金されました。",
    ko: "{label}(으)로 결제한 {amount}이(가) 고객 지갑으로 반환되었습니다.",
    ar: "تمت إعادة مبلغ {amount} المدفوع باستخدام {label} إلى محفظة العميل.",
    he: "הסכום {amount} ששולם באמצעות {label} הוחזר לארנק של הלקוח.",
    hi: "{label} से भुगतान की गई {amount} राशि ग्राहक के वॉलेट में वापस कर दी गई है।",
  },
  restaurant: {
    en: "Restaurant",
    fr: "Restaurant", es: "Restaurante", it: "Ristorante", de: "Restaurant",
    pt: "Restaurante", "pt-BR": "Restaurante", nl: "Restaurant", pl: "Restauracja",
    ro: "Restaurant", hu: "Étterem", cs: "Restaurace", sk: "Reštaurácia",
    sl: "Restavracija", hr: "Restoran", sr: "Restoran", bg: "Ресторант",
    el: "Εστιατόριο", tr: "Restoran", uk: "Ресторан", ru: "Ресторан",
    sv: "Restaurang", nb: "Restaurant", da: "Restaurant", fi: "Ravintola",
    et: "Restoran", lv: "Restorāns", lt: "Restoranas", ca: "Restaurant",
    id: "Restoran", vi: "Nhà hàng", th: "ร้านอาหาร", zh: "餐厅", ja: "レストラン",
    ko: "레스토랑", ar: "المطعم", he: "מסעדה", hi: "रेस्टोरेंट",
  },
  customer: {
    en: "Customer",
    fr: "Client", es: "Cliente", it: "Cliente", de: "Kunde", pt: "Cliente",
    "pt-BR": "Cliente", nl: "Klant", pl: "Klient", ro: "Client", hu: "Vendég",
    cs: "Zákazník", sk: "Zákazník", sl: "Stranka", hr: "Kupac", sr: "Kupac",
    bg: "Клиент", el: "Πελάτης", tr: "Müşteri", uk: "Клієнт", ru: "Клиент",
    sv: "Kund", nb: "Kunde", da: "Kunde", fi: "Asiakas", et: "Klient",
    lv: "Klients", lt: "Klientas", ca: "Client", id: "Pelanggan", vi: "Khách hàng",
    th: "ลูกค้า", zh: "顾客", ja: "お客様", ko: "고객", ar: "العميل", he: "לקוח",
    hi: "ग्राहक",
  },
};

/** dotted key path → canonical id above. */
const KEY_MAP: Record<string, keyof typeof T> = {
  "admin.reportsHome.kpiOrderValue": "orderValue",
  "admin.customersList.colOrderValue": "orderValue",
  "money.orderValue": "orderValue",
  "admin.customersList.colCreditSpent": "creditSpent",
  "email.staffOrderDead.creditReturned": "creditReturned",
  "reseller.ordersList.colRestaurant": "restaurant",
  "reseller.ordersList.colCustomer": "customer",
};

const DIR = path.join(process.cwd(), "src", "messages");

function getDeep(obj: Record<string, any>, dotted: string): unknown {
  return dotted.split(".").reduce<any>((n, p) => (n == null ? n : n[p]), obj);
}
function setDeep(obj: Record<string, any>, dotted: string, value: string) {
  const parts = dotted.split(".");
  let node = obj;
  for (const p of parts.slice(0, -1)) {
    if (typeof node[p] !== "object" || node[p] === null) node[p] = {};
    node = node[p];
  }
  node[parts[parts.length - 1]] = value;
}

let touched = 0;
const gaps: string[] = [];

for (const locale of SUPPORTED_LOCALES) {
  const file = path.join(DIR, `${locale}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, any>;
  let n = 0;
  for (const [dotted, id] of Object.entries(KEY_MAP)) {
    const bundle = T[id];
    const translated = bundle[locale];
    if (!translated) { gaps.push(`${locale}:${dotted}`); continue; }
    const current = getDeep(json, dotted);
    // Only overwrite when the file still holds the English source — a value
    // somebody already corrected by hand must survive a re-run.
    if (typeof current === "string" && current !== bundle.en && locale !== "en") continue;
    if (current === translated) continue;
    setDeep(json, dotted, translated);
    n++;
  }
  if (n > 0) { fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8"); touched++; }
  console.log(`  ${locale.padEnd(6)} +${n}`);
}

if (gaps.length > 0) console.error(`\n⚠️  missing translations: ${gaps.join(", ")}`);
console.log(`\n✅ ${touched}/${SUPPORTED_LOCALES.length} locale files updated.`);
