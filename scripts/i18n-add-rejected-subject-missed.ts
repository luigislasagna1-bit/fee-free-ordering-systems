/**
 * One-shot i18n patch: email.orderRejected.subjectMissed across all 38 locales
 * (Luigi 2026-06-09 — the restaurant's email subject for a TIMED-OUT order must
 * say "missed", not "rejected"). {orderNumber} placeholder preserved.
 *   npx tsx scripts/i18n-add-rejected-subject-missed.ts
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");
const T: Record<string, string> = {
  en: "Order #{orderNumber} missed",
  fr: "Commande n°{orderNumber} manquée",
  es: "Pedido n.º {orderNumber} perdido",
  it: "Ordine n. {orderNumber} perso",
  pt: "Pedido n.º {orderNumber} perdido",
  "pt-BR": "Pedido nº {orderNumber} perdido",
  de: "Bestellung #{orderNumber} verpasst",
  nl: "Bestelling #{orderNumber} gemist",
  ro: "Comanda #{orderNumber} ratată",
  sv: "Beställning #{orderNumber} missad",
  da: "Ordre #{orderNumber} gået glip af",
  nb: "Bestilling #{orderNumber} gått glipp av",
  fi: "Tilaus #{orderNumber} jäi huomaamatta",
  pl: "Zamówienie #{orderNumber} przeoczone",
  cs: "Objednávka #{orderNumber} promeškána",
  sk: "Objednávka #{orderNumber} premeškaná",
  hu: "A(z) #{orderNumber} rendelés lemaradt",
  el: "Η παραγγελία #{orderNumber} χάθηκε",
  bg: "Поръчка #{orderNumber} пропусната",
  hr: "Narudžba #{orderNumber} propuštena",
  sr: "Поруџбина #{orderNumber} пропуштена",
  sl: "Naročilo #{orderNumber} zamujeno",
  et: "Tellimus #{orderNumber} jäi märkamata",
  lv: "Pasūtījums #{orderNumber} nokavēts",
  lt: "Užsakymas #{orderNumber} praleistas",
  tr: "#{orderNumber} numaralı sipariş kaçırıldı",
  ru: "Заказ #{orderNumber} пропущен",
  uk: "Замовлення #{orderNumber} пропущено",
  ca: "Comanda #{orderNumber} perduda",
  id: "Pesanan #{orderNumber} terlewat",
  vi: "Đơn hàng #{orderNumber} bị bỏ lỡ",
  th: "พลาดออเดอร์ #{orderNumber}",
  zh: "错过订单 #{orderNumber}",
  ja: "注文 #{orderNumber} を逃しました",
  ko: "주문 #{orderNumber} 놓침",
  ar: "تم تفويت الطلب #{orderNumber}",
  he: "הזמנה #{orderNumber} הוחמצה",
  hi: "ऑर्डर #{orderNumber} छूट गया",
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
  setDeep(data, "email.orderRejected.subjectMissed", T[loc] ?? T.en);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
console.log(`✓ subjectMissed added to ${n} locale(s).`);
