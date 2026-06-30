/** i18n: two new Reward Dollars ledger-reason labels for the customer activity
 *  list, used by the full-refund-to-wallet path × 38 locales. Luigi 2026-06-30.
 *    customer.accountPage.reward.reason.refund  (spent credit returned)
 *    customer.accountPage.reward.reason.reverse (earned credit clawed back)
 *  Run: npx tsx scripts/i18n-add-reward-refund-reasons.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const REFUND: Record<string, string> = {
  en: "Refunded to your balance", fr: "Remboursé sur votre solde", es: "Reembolsado a tu saldo", it: "Rimborsato sul tuo saldo",
  pt: "Reembolsado para o seu saldo", "pt-BR": "Reembolsado para o seu saldo", de: "Auf Ihr Guthaben erstattet", nl: "Teruggestort op je saldo",
  ro: "Rambursat în soldul tău", sv: "Återbetalt till ditt saldo", da: "Refunderet til din saldo", nb: "Refundert til saldoen din",
  fi: "Hyvitetty saldoosi", pl: "Zwrócono na Twoje saldo", cs: "Vráceno na váš zůstatek", sk: "Vrátené na váš zostatok",
  hu: "Visszatérítve az egyenlegére", el: "Επιστράφηκε στο υπόλοιπό σας", bg: "Възстановено към баланса ви", hr: "Vraćeno na vaš saldo",
  sr: "Враћено на ваш салдо", sl: "Vrnjeno na vaše stanje", et: "Tagastatud teie saldole", lv: "Atgriezts jūsu atlikumā",
  lt: "Grąžinta į jūsų likutį", tr: "Bakiyenize iade edildi", ru: "Возвращено на ваш баланс", uk: "Повернуто на ваш баланс",
  ca: "Reemborsat al teu saldo", id: "Dikembalikan ke saldo Anda", vi: "Đã hoàn vào số dư của bạn", th: "คืนเข้ายอดคงเหลือของคุณแล้ว",
  zh: "已退回您的余额", ja: "残高に返金されました", ko: "잔액으로 환불됨", ar: "تم ردّه إلى رصيدك",
  he: "הוחזר ליתרה שלך", hi: "आपके बैलेंस में वापस किया गया",
};

const REVERSE: Record<string, string> = {
  en: "Reversed (order refunded)", fr: "Annulé (commande remboursée)", es: "Revertido (pedido reembolsado)", it: "Annullato (ordine rimborsato)",
  pt: "Revertido (pedido reembolsado)", "pt-BR": "Revertido (pedido reembolsado)", de: "Rückgängig gemacht (Bestellung erstattet)", nl: "Teruggedraaid (bestelling terugbetaald)",
  ro: "Anulat (comandă rambursată)", sv: "Återförd (order återbetald)", da: "Tilbageført (ordre refunderet)", nb: "Reversert (ordre refundert)",
  fi: "Peruutettu (tilaus hyvitetty)", pl: "Cofnięto (zamówienie zwrócone)", cs: "Stornováno (objednávka vrácena)", sk: "Stornované (objednávka vrátená)",
  hu: "Visszavonva (rendelés visszatérítve)", el: "Αντιστράφηκε (η παραγγελία επιστράφηκε)", bg: "Анулирано (поръчката е възстановена)", hr: "Poništeno (narudžba vraćena)",
  sr: "Поништено (поруџбина враћена)", sl: "Razveljavljeno (naročilo vrnjeno)", et: "Tühistatud (tellimus tagastatud)", lv: "Atcelts (pasūtījums atmaksāts)",
  lt: "Atšaukta (užsakymas grąžintas)", tr: "Geri alındı (sipariş iade edildi)", ru: "Отменено (заказ возвращён)", uk: "Скасовано (замовлення повернуто)",
  ca: "Revertit (comanda reemborsada)", id: "Dibatalkan (pesanan dikembalikan)", vi: "Đã đảo ngược (đơn hàng được hoàn)", th: "ย้อนกลับแล้ว (คำสั่งซื้อถูกคืนเงิน)",
  zh: "已撤销（订单已退款）", ja: "取り消し（注文が返金されました）", ko: "취소됨 (주문 환불됨)", ar: "تم العكس (تم ردّ الطلب)",
  he: "בוטל (ההזמנה הוחזרה)", hi: "वापस लिया गया (ऑर्डर रिफंड किया गया)",
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
  setDeep(data, "customer.accountPage.reward.reason.refund", REFUND[loc] ?? REFUND.en);
  setDeep(data, "customer.accountPage.reward.reason.reverse", REVERSE[loc] ?? REVERSE.en);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
console.log(`✓ reward refund/reverse reason labels added to ${n} locale(s).`);
