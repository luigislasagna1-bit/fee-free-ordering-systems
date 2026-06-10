/**
 * One-shot i18n patch: admin.autopilotClient.resultSent / resultSales /
 * resultFees across all 38 locales (Luigi 2026-06-09, per-campaign results E).
 *   npx tsx scripts/i18n-add-autopilot-results.ts
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");
// [resultSent, resultSales, resultFees]
const T: Record<string, [string, string, string]> = {
  en: ["Sent", "Sales · 30d", "Fees"],
  fr: ["Envoyés", "Ventes · 30j", "Frais"],
  es: ["Enviados", "Ventas · 30d", "Comisiones"],
  it: ["Inviati", "Vendite · 30g", "Commissioni"],
  pt: ["Enviados", "Vendas · 30d", "Taxas"],
  "pt-BR": ["Enviados", "Vendas · 30d", "Taxas"],
  de: ["Gesendet", "Umsatz · 30T", "Gebühren"],
  nl: ["Verzonden", "Omzet · 30d", "Kosten"],
  ro: ["Trimise", "Vânzări · 30z", "Comisioane"],
  sv: ["Skickade", "Försäljning · 30d", "Avgifter"],
  da: ["Sendt", "Salg · 30d", "Gebyrer"],
  nb: ["Sendt", "Salg · 30d", "Gebyrer"],
  fi: ["Lähetetyt", "Myynti · 30pv", "Maksut"],
  pl: ["Wysłane", "Sprzedaż · 30d", "Opłaty"],
  cs: ["Odesláno", "Tržby · 30d", "Poplatky"],
  sk: ["Odoslané", "Tržby · 30d", "Poplatky"],
  hu: ["Elküldve", "Eladás · 30n", "Díjak"],
  el: ["Απεσταλμένα", "Πωλήσεις · 30η", "Χρεώσεις"],
  bg: ["Изпратени", "Продажби · 30д", "Такси"],
  hr: ["Poslano", "Prodaja · 30d", "Naknade"],
  sr: ["Послато", "Продаја · 30д", "Накнаде"],
  sl: ["Poslano", "Prodaja · 30d", "Pristojbine"],
  et: ["Saadetud", "Müük · 30p", "Tasud"],
  lv: ["Nosūtīts", "Pārdošana · 30d", "Maksas"],
  lt: ["Išsiųsta", "Pardavimai · 30d", "Mokesčiai"],
  tr: ["Gönderildi", "Satış · 30g", "Ücretler"],
  ru: ["Отправлено", "Продажи · 30д", "Сборы"],
  uk: ["Надіслано", "Продажі · 30д", "Збори"],
  ca: ["Enviats", "Vendes · 30d", "Comissions"],
  id: ["Terkirim", "Penjualan · 30h", "Biaya"],
  vi: ["Đã gửi", "Doanh số · 30n", "Phí"],
  th: ["ส่งแล้ว", "ยอดขาย · 30 วัน", "ค่าธรรมเนียม"],
  zh: ["已发送", "销售额 · 30天", "费用"],
  ja: ["送信済み", "売上 · 30日", "手数料"],
  ko: ["발송됨", "매출 · 30일", "수수료"],
  ar: ["المرسلة", "المبيعات · 30 يوم", "الرسوم"],
  he: ["נשלחו", "מכירות · 30 ימים", "עמלות"],
  hi: ["भेजे गए", "बिक्री · 30द", "शुल्क"],
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
  const tr = T[loc] ?? T.en;
  const path = join(DIR, f);
  const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  setDeep(data, "admin.autopilotClient.resultSent", tr[0]);
  setDeep(data, "admin.autopilotClient.resultSales", tr[1]);
  setDeep(data, "admin.autopilotClient.resultFees", tr[2]);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
console.log(`✓ autopilot result keys added to ${n} locale(s).`);
