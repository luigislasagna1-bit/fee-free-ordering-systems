/** i18n: per-order Reward Dollars lines on the customer receipt/confirmation +
 *  the order link on the account wallet activity × 38 locales. Luigi 2026-06-29.
 *    customer.orderStatus.{paidWithReward,earnedReward,rewardDefaultName}
 *    customer.confirmation.{paidWithReward,earnedReward,rewardDefaultName}
 *    customer.accountPage.reward.orderRef
 *  rewardDefaultName reuses each locale's existing accountPage.reward.defaultPlural.
 *  Run: npx tsx scripts/i18n-add-reward-receipt.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");

const PAID: Record<string, string> = {
  en: "Paid with {label}", fr: "Payé avec {label}", es: "Pagado con {label}", it: "Pagato con {label}",
  pt: "Pago com {label}", "pt-BR": "Pago com {label}", de: "Bezahlt mit {label}", nl: "Betaald met {label}",
  ro: "Plătit cu {label}", sv: "Betalat med {label}", da: "Betalt med {label}", nb: "Betalt med {label}",
  fi: "Maksettu: {label}", pl: "Zapłacono za pomocą {label}", cs: "Zaplaceno pomocí {label}", sk: "Zaplatené pomocou {label}",
  hu: "Fizetve ezzel: {label}", el: "Πληρώθηκε με {label}", bg: "Платено с {label}", hr: "Plaćeno s {label}",
  sr: "Плаћено са {label}", sl: "Plačano z {label}", et: "Makstud: {label}", lv: "Apmaksāts ar {label}",
  lt: "Apmokėta naudojant {label}", tr: "{label} ile ödendi", ru: "Оплачено с помощью {label}", uk: "Оплачено за допомогою {label}",
  ca: "Pagat amb {label}", id: "Dibayar dengan {label}", vi: "Đã thanh toán bằng {label}", th: "ชำระด้วย {label}",
  zh: "使用 {label} 支付", ja: "{label}で支払い", ko: "{label}(으)로 결제", ar: "تم الدفع بـ {label}",
  he: "שולם באמצעות {label}", hi: "{label} से भुगतान किया गया",
};

const EARNED: Record<string, string> = {
  en: "You earned {label}", fr: "Vous avez gagné des {label}", es: "Ganaste {label}", it: "Hai guadagnato {label}",
  pt: "Ganhou {label}", "pt-BR": "Você ganhou {label}", de: "Sie haben {label} verdient", nl: "Je hebt {label} verdiend",
  ro: "Ai câștigat {label}", sv: "Du tjänade {label}", da: "Du optjente {label}", nb: "Du tjente {label}",
  fi: "Ansaitsit {label}", pl: "Zdobyto {label}", cs: "Získali jste {label}", sk: "Získali ste {label}",
  hu: "{label} jóváírva", el: "Κερδίσατε {label}", bg: "Спечелихте {label}", hr: "Zaradili ste {label}",
  sr: "Зарадили сте {label}", sl: "Prislužili ste {label}", et: "Teenisid {label}", lv: "Nopelnīji {label}",
  lt: "Uždirbote {label}", tr: "{label} kazandınız", ru: "Вы заработали {label}", uk: "Ви заробили {label}",
  ca: "Has guanyat {label}", id: "Anda mendapatkan {label}", vi: "Bạn đã nhận được {label}", th: "คุณได้รับ {label}",
  zh: "您获得了 {label}", ja: "{label}を獲得しました", ko: "{label}을(를) 적립했습니다", ar: "لقد ربحت {label}",
  he: "צברת {label}", hi: "आपने {label} कमाए",
};

const ORDER_REF: Record<string, string> = {
  en: "Order #{number}", fr: "Commande n° {number}", es: "Pedido n.º {number}", it: "Ordine n. {number}",
  pt: "Pedido n.º {number}", "pt-BR": "Pedido nº {number}", de: "Bestellung #{number}", nl: "Bestelling #{number}",
  ro: "Comanda #{number}", sv: "Beställning #{number}", da: "Ordre #{number}", nb: "Ordre #{number}",
  fi: "Tilaus #{number}", pl: "Zamówienie #{number}", cs: "Objednávka #{number}", sk: "Objednávka #{number}",
  hu: "Rendelés #{number}", el: "Παραγγελία #{number}", bg: "Поръчка №{number}", hr: "Narudžba #{number}",
  sr: "Поруџбина #{number}", sl: "Naročilo #{number}", et: "Tellimus #{number}", lv: "Pasūtījums #{number}",
  lt: "Užsakymas #{number}", tr: "Sipariş #{number}", ru: "Заказ №{number}", uk: "Замовлення №{number}",
  ca: "Comanda #{number}", id: "Pesanan #{number}", vi: "Đơn hàng #{number}", th: "คำสั่งซื้อ #{number}",
  zh: "订单 #{number}", ja: "注文 #{number}", ko: "주문 #{number}", ar: "الطلب #{number}",
  he: "הזמנה #{number}", hi: "ऑर्डर #{number}",
};

const BALANCE_DUE: Record<string, string> = {
  en: "Balance to pay", fr: "Reste à payer", es: "Saldo a pagar", it: "Resto da pagare",
  pt: "Valor a pagar", "pt-BR": "Valor a pagar", de: "Restbetrag", nl: "Te betalen",
  ro: "Rest de plată", sv: "Kvar att betala", da: "Tilbage at betale", nb: "Gjenstår å betale",
  fi: "Maksettavaa jäljellä", pl: "Pozostało do zapłaty", cs: "Zbývá zaplatit", sk: "Zostáva zaplatiť",
  hu: "Fizetendő hátralék", el: "Υπόλοιπο πληρωμής", bg: "Остатък за плащане", hr: "Preostalo za platiti",
  sr: "Преостало за плаћање", sl: "Preostalo za plačilo", et: "Maksta jääb", lv: "Atlikusī summa",
  lt: "Liko sumokėti", tr: "Ödenecek tutar", ru: "Остаток к оплате", uk: "Залишок до сплати",
  ca: "Pendent de pagar", id: "Sisa pembayaran", vi: "Còn phải trả", th: "ยอดที่ต้องชำระ",
  zh: "应付余额", ja: "お支払い残額", ko: "결제할 잔액", ar: "المبلغ المتبقي",
  he: "יתרה לתשלום", hi: "शेष भुगतान",
};

const REWARD_BALANCE: Record<string, string> = {
  en: "{label} balance", fr: "Solde {label}", es: "Saldo de {label}", it: "Saldo {label}",
  pt: "Saldo de {label}", "pt-BR": "Saldo de {label}", de: "{label}-Guthaben", nl: "{label}-saldo",
  ro: "Sold {label}", sv: "{label}-saldo", da: "{label}-saldo", nb: "{label}-saldo",
  fi: "{label}-saldo", pl: "Saldo {label}", cs: "Zůstatek {label}", sk: "Zostatok {label}",
  hu: "{label} egyenleg", el: "Υπόλοιπο {label}", bg: "Баланс {label}", hr: "Stanje {label}",
  sr: "Стање {label}", sl: "Stanje {label}", et: "{label} saldo", lv: "{label} atlikums",
  lt: "{label} likutis", tr: "{label} bakiyesi", ru: "Баланс {label}", uk: "Баланс {label}",
  ca: "Saldo de {label}", id: "Saldo {label}", vi: "Số dư {label}", th: "ยอดคงเหลือ {label}",
  zh: "{label} 余额", ja: "{label}残高", ko: "{label} 잔액", ar: "رصيد {label}",
  he: "יתרת {label}", hi: "{label} शेष",
};

// rewardDefaultName reuses the locale's existing accountPage.reward.defaultPlural
// (read live from each file) so the fallback name matches everywhere.

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
function getDeep(obj: any, key: string): string | undefined {
  return key.split(".").reduce((o, p) => (o == null ? undefined : o[p]), obj);
}

let n = 0;
for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  const loc = f.replace(".json", "");
  const path = join(DIR, f);
  const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const paid = PAID[loc] ?? PAID.en;
  const earned = EARNED[loc] ?? EARNED.en;
  const orderRef = ORDER_REF[loc] ?? ORDER_REF.en;
  const defaultName = getDeep(data, "customer.accountPage.reward.defaultPlural") ?? "Reward Dollars";

  setDeep(data, "customer.orderStatus.paidWithReward", paid);
  setDeep(data, "customer.orderStatus.earnedReward", earned);
  setDeep(data, "customer.orderStatus.rewardDefaultName", defaultName);
  setDeep(data, "customer.confirmation.paidWithReward", paid);
  setDeep(data, "customer.confirmation.earnedReward", earned);
  setDeep(data, "customer.confirmation.rewardDefaultName", defaultName);
  setDeep(data, "customer.accountPage.reward.orderRef", orderRef);
  // Thermal/printed receipt totals (receipt.customer namespace, used by the
  // ESC/POS + StarXpand bitmap builders via getDict).
  setDeep(data, "receipt.customer.paidWithReward", paid);
  setDeep(data, "receipt.customer.earnedReward", earned);
  setDeep(data, "receipt.customer.balanceDue", BALANCE_DUE[loc] ?? BALANCE_DUE.en);
  setDeep(data, "receipt.customer.rewardBalance", REWARD_BALANCE[loc] ?? REWARD_BALANCE.en);
  // Pre-existing parity gap: the sidebar nav label "Reward Dollars" only existed
  // in en. Fill all locales with the localized feature name (= defaultPlural).
  setDeep(data, "admin.sidebar.rewards", defaultName);

  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
console.log(`✓ reward-receipt strings added to ${n} locale(s).`);
