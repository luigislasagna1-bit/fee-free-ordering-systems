/** i18n: checkout.reward.capHelp — the ⓘ tooltip explaining WHY only part of an
 *  order can be paid with reward credit (the restaurant's max-% limit). × 38.
 *  Placeholders {percent} + {label} must be preserved. Luigi 2026-06-29.
 *  Run: npx tsx scripts/i18n-add-reward-caphelp.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");

const CAP_HELP: Record<string, string> = {
  en: "Your restaurant lets you use up to {percent}% of an order's total in {label}.",
  fr: "Votre restaurant vous permet d'utiliser jusqu'à {percent}% du total d'une commande en {label}.",
  es: "Este restaurante permite usar hasta el {percent}% del total del pedido en {label}.",
  it: "Il ristorante consente di usare fino al {percent}% del totale dell'ordine in {label}.",
  pt: "O restaurante permite usar até {percent}% do total do pedido em {label}.",
  "pt-BR": "O restaurante permite usar até {percent}% do total do pedido em {label}.",
  de: "Dieses Restaurant erlaubt, bis zu {percent}% der Bestellsumme mit {label} zu bezahlen.",
  nl: "Dit restaurant staat toe om tot {percent}% van het ordertotaal met {label} te betalen.",
  ro: "Restaurantul permite folosirea a până la {percent}% din totalul comenzii în {label}.",
  sv: "Restaurangen tillåter att använda upp till {percent}% av ordersumman i {label}.",
  da: "Restauranten tillader at bruge op til {percent}% af ordresummen i {label}.",
  nb: "Restauranten tillater å bruke opptil {percent}% av ordresummen i {label}.",
  fi: "Ravintola sallii käyttää enintään {percent}% tilauksen summasta: {label}.",
  pl: "Restauracja pozwala wykorzystać do {percent}% wartości zamówienia w {label}.",
  cs: "Restaurace umožňuje použít až {percent}% z částky objednávky v {label}.",
  sk: "Reštaurácia umožňuje použiť až {percent}% zo sumy objednávky v {label}.",
  hu: "Az étterem a rendelés végösszegének legfeljebb {percent}%-áig engedi a(z) {label} felhasználását.",
  el: "Το εστιατόριο επιτρέπει χρήση έως {percent}% του συνόλου της παραγγελίας σε {label}.",
  bg: "Ресторантът позволява да използвате до {percent}% от сумата на поръчката в {label}.",
  hr: "Restoran dopušta korištenje do {percent}% ukupnog iznosa narudžbe u {label}.",
  sr: "Ресторан дозвољава коришћење до {percent}% укупног износа поруџбине у {label}.",
  sl: "Restavracija dovoljuje porabo do {percent}% zneska naročila v {label}.",
  et: "Restoran lubab kasutada kuni {percent}% tellimuse summast: {label}.",
  lv: "Restorāns ļauj izmantot līdz {percent}% no pasūtījuma summas {label}.",
  lt: "Restoranas leidžia panaudoti iki {percent}% užsakymo sumos {label}.",
  tr: "Restoran, sipariş tutarının en fazla %{percent} kadarını {label} ile ödemenize izin verir.",
  ru: "Ресторан разрешает использовать до {percent}% от суммы заказа в {label}.",
  uk: "Ресторан дозволяє використати до {percent}% від суми замовлення в {label}.",
  ca: "El restaurant permet usar fins al {percent}% del total de la comanda en {label}.",
  id: "Restoran mengizinkan penggunaan hingga {percent}% dari total pesanan dalam {label}.",
  vi: "Nhà hàng cho phép dùng tối đa {percent}% tổng đơn hàng bằng {label}.",
  th: "ร้านอนุญาตให้ใช้ {label} ได้สูงสุด {percent}% ของยอดคำสั่งซื้อ",
  zh: "餐厅允许使用 {label} 支付订单总额的最多 {percent}%。",
  ja: "この店では注文合計の最大{percent}%まで{label}で支払えます。",
  ko: "이 매장은 주문 금액의 최대 {percent}%까지 {label}(으)로 사용할 수 있습니다.",
  ar: "يسمح المطعم باستخدام ما يصل إلى {percent}٪ من إجمالي الطلب بـ {label}.",
  he: "המסעדה מאפשרת להשתמש עד {percent}% מסכום ההזמנה ב-{label}.",
  hi: "यह रेस्टोरेंट ऑर्डर के कुल का अधिकतम {percent}% {label} में उपयोग करने देता है।",
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
  setDeep(data, "checkout.reward.capHelp", CAP_HELP[loc] ?? CAP_HELP.en);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
console.log(`✓ checkout.reward.capHelp added to ${n} locale(s).`);
