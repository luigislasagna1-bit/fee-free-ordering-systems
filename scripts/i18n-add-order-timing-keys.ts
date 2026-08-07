/**
 * email.timing.* — the order-timing block shown on every order email
 * (Luigi 2026-08-07, GloriaFood parity): when the order was placed, the
 * confirmed prep time, the expected ready/pickup/delivery time, and a clear
 * banner when the order is for a FUTURE date rather than ASAP.
 *
 *   npx tsx scripts/i18n-add-order-timing-keys.ts
 *
 * Idempotent — never overwrites an existing value.
 */
import fs from "node:fs";
import path from "node:path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

type Bundle = {
  placedAt: string; prepTime: string; readyTime: string;
  pickupTime: string; deliveryTime: string; scheduledBanner: string; acceptedAt: string;
};

const T: Record<string, Bundle> = {
  en: { placedAt: "Order placed", prepTime: "Prep time", readyTime: "Ready time", pickupTime: "Pickup time", deliveryTime: "Delivery time", scheduledBanner: "SCHEDULED ORDER — for a later time", acceptedAt: "Accepted on" },
  it: { placedAt: "Ordine ricevuto", prepTime: "Tempo di preparazione", readyTime: "Orario previsto", pickupTime: "Orario di ritiro", deliveryTime: "Orario di consegna", scheduledBanner: "ORDINE PROGRAMMATO — per un orario successivo", acceptedAt: "Accettato il" },
  fr: { placedAt: "Commande passée", prepTime: "Temps de préparation", readyTime: "Heure prévue", pickupTime: "Heure de retrait", deliveryTime: "Heure de livraison", scheduledBanner: "COMMANDE PROGRAMMÉE — pour plus tard", acceptedAt: "Acceptée le" },
  es: { placedAt: "Pedido realizado", prepTime: "Tiempo de preparación", readyTime: "Hora prevista", pickupTime: "Hora de recogida", deliveryTime: "Hora de entrega", scheduledBanner: "PEDIDO PROGRAMADO — para más tarde", acceptedAt: "Aceptado el" },
  de: { placedAt: "Bestellung eingegangen", prepTime: "Zubereitungszeit", readyTime: "Voraussichtliche Zeit", pickupTime: "Abholzeit", deliveryTime: "Lieferzeit", scheduledBanner: "VORBESTELLUNG — für später", acceptedAt: "Angenommen am" },
  pt: { placedAt: "Pedido efetuado", prepTime: "Tempo de preparação", readyTime: "Hora prevista", pickupTime: "Hora de levantamento", deliveryTime: "Hora de entrega", scheduledBanner: "PEDIDO AGENDADO — para mais tarde", acceptedAt: "Aceite em" },
  "pt-BR": { placedAt: "Pedido realizado", prepTime: "Tempo de preparo", readyTime: "Horário previsto", pickupTime: "Horário de retirada", deliveryTime: "Horário de entrega", scheduledBanner: "PEDIDO AGENDADO — para mais tarde", acceptedAt: "Aceito em" },
  nl: { placedAt: "Bestelling geplaatst", prepTime: "Bereidingstijd", readyTime: "Verwachte tijd", pickupTime: "Afhaaltijd", deliveryTime: "Bezorgtijd", scheduledBanner: "GEPLANDE BESTELLING — voor later", acceptedAt: "Geaccepteerd op" },
  pl: { placedAt: "Zamówienie złożone", prepTime: "Czas przygotowania", readyTime: "Przewidywana godzina", pickupTime: "Godzina odbioru", deliveryTime: "Godzina dostawy", scheduledBanner: "ZAMÓWIENIE ZAPLANOWANE — na później", acceptedAt: "Zaakceptowano" },
  ro: { placedAt: "Comandă plasată", prepTime: "Timp de preparare", readyTime: "Ora estimată", pickupTime: "Ora de ridicare", deliveryTime: "Ora de livrare", scheduledBanner: "COMANDĂ PROGRAMATĂ — pentru mai târziu", acceptedAt: "Acceptată la" },
  hu: { placedAt: "Rendelés leadva", prepTime: "Elkészítési idő", readyTime: "Várható időpont", pickupTime: "Átvétel időpontja", deliveryTime: "Kiszállítás időpontja", scheduledBanner: "ELŐRE ÜTEMEZETT RENDELÉS — későbbi időpontra", acceptedAt: "Elfogadva" },
  cs: { placedAt: "Objednávka přijata", prepTime: "Doba přípravy", readyTime: "Předpokládaný čas", pickupTime: "Čas vyzvednutí", deliveryTime: "Čas doručení", scheduledBanner: "NAPLÁNOVANÁ OBJEDNÁVKA — na pozdější dobu", acceptedAt: "Přijato" },
  sk: { placedAt: "Objednávka prijatá", prepTime: "Čas prípravy", readyTime: "Predpokladaný čas", pickupTime: "Čas vyzdvihnutia", deliveryTime: "Čas doručenia", scheduledBanner: "NAPLÁNOVANÁ OBJEDNÁVKA — na neskôr", acceptedAt: "Prijaté" },
  sl: { placedAt: "Naročilo oddano", prepTime: "Čas priprave", readyTime: "Predviden čas", pickupTime: "Čas prevzema", deliveryTime: "Čas dostave", scheduledBanner: "NAČRTOVANO NAROČILO — za pozneje", acceptedAt: "Sprejeto" },
  hr: { placedAt: "Narudžba zaprimljena", prepTime: "Vrijeme pripreme", readyTime: "Predviđeno vrijeme", pickupTime: "Vrijeme preuzimanja", deliveryTime: "Vrijeme dostave", scheduledBanner: "ZAKAZANA NARUDŽBA — za kasnije", acceptedAt: "Prihvaćeno" },
  sr: { placedAt: "Porudžbina primljena", prepTime: "Vreme pripreme", readyTime: "Predviđeno vreme", pickupTime: "Vreme preuzimanja", deliveryTime: "Vreme dostave", scheduledBanner: "ZAKAZANA PORUDŽBINA — za kasnije", acceptedAt: "Prihvaćeno" },
  bg: { placedAt: "Поръчката е направена", prepTime: "Време за приготвяне", readyTime: "Очаквано време", pickupTime: "Час за вземане", deliveryTime: "Час за доставка", scheduledBanner: "ПЛАНИРАНА ПОРЪЧКА — за по-късно", acceptedAt: "Приета на" },
  el: { placedAt: "Η παραγγελία καταχωρήθηκε", prepTime: "Χρόνος προετοιμασίας", readyTime: "Εκτιμώμενη ώρα", pickupTime: "Ώρα παραλαβής", deliveryTime: "Ώρα παράδοσης", scheduledBanner: "ΠΡΟΓΡΑΜΜΑΤΙΣΜΕΝΗ ΠΑΡΑΓΓΕΛΙΑ — για αργότερα", acceptedAt: "Έγινε αποδεκτή" },
  tr: { placedAt: "Sipariş alındı", prepTime: "Hazırlık süresi", readyTime: "Tahmini saat", pickupTime: "Teslim alma saati", deliveryTime: "Teslimat saati", scheduledBanner: "İLERİ TARİHLİ SİPARİŞ — sonrası için", acceptedAt: "Kabul edildi" },
  uk: { placedAt: "Замовлення створено", prepTime: "Час приготування", readyTime: "Очікуваний час", pickupTime: "Час самовивозу", deliveryTime: "Час доставки", scheduledBanner: "ЗАПЛАНОВАНЕ ЗАМОВЛЕННЯ — на пізніше", acceptedAt: "Прийнято" },
  ru: { placedAt: "Заказ оформлен", prepTime: "Время приготовления", readyTime: "Ожидаемое время", pickupTime: "Время самовывоза", deliveryTime: "Время доставки", scheduledBanner: "ЗАПЛАНИРОВАННЫЙ ЗАКАЗ — на более позднее время", acceptedAt: "Принят" },
  sv: { placedAt: "Beställning lagd", prepTime: "Tillagningstid", readyTime: "Beräknad tid", pickupTime: "Upphämtningstid", deliveryTime: "Leveranstid", scheduledBanner: "FÖRBOKAD BESTÄLLNING — för senare", acceptedAt: "Accepterad" },
  nb: { placedAt: "Bestilling mottatt", prepTime: "Tilberedningstid", readyTime: "Forventet tid", pickupTime: "Hentetidspunkt", deliveryTime: "Leveringstidspunkt", scheduledBanner: "PLANLAGT BESTILLING — til senere", acceptedAt: "Godtatt" },
  da: { placedAt: "Bestilling modtaget", prepTime: "Tilberedningstid", readyTime: "Forventet tid", pickupTime: "Afhentningstid", deliveryTime: "Leveringstid", scheduledBanner: "PLANLAGT BESTILLING — til senere", acceptedAt: "Accepteret" },
  fi: { placedAt: "Tilaus vastaanotettu", prepTime: "Valmistusaika", readyTime: "Arvioitu aika", pickupTime: "Noutoaika", deliveryTime: "Toimitusaika", scheduledBanner: "AJASTETTU TILAUS — myöhempään ajankohtaan", acceptedAt: "Hyväksytty" },
  et: { placedAt: "Tellimus esitatud", prepTime: "Valmistusaeg", readyTime: "Eeldatav aeg", pickupTime: "Järeletuleku aeg", deliveryTime: "Tarneaeg", scheduledBanner: "PLANEERITUD TELLIMUS — hilisemaks ajaks", acceptedAt: "Vastu võetud" },
  lv: { placedAt: "Pasūtījums saņemts", prepTime: "Gatavošanas laiks", readyTime: "Paredzamais laiks", pickupTime: "Saņemšanas laiks", deliveryTime: "Piegādes laiks", scheduledBanner: "PLĀNOTS PASŪTĪJUMS — vēlākam laikam", acceptedAt: "Apstiprināts" },
  lt: { placedAt: "Užsakymas pateiktas", prepTime: "Ruošimo laikas", readyTime: "Numatomas laikas", pickupTime: "Atsiėmimo laikas", deliveryTime: "Pristatymo laikas", scheduledBanner: "SUPLANUOTAS UŽSAKYMAS — vėlesniam laikui", acceptedAt: "Priimta" },
  ca: { placedAt: "Comanda feta", prepTime: "Temps de preparació", readyTime: "Hora prevista", pickupTime: "Hora de recollida", deliveryTime: "Hora de lliurament", scheduledBanner: "COMANDA PROGRAMADA — per més tard", acceptedAt: "Acceptada el" },
  id: { placedAt: "Pesanan dibuat", prepTime: "Waktu persiapan", readyTime: "Perkiraan waktu", pickupTime: "Waktu pengambilan", deliveryTime: "Waktu pengiriman", scheduledBanner: "PESANAN TERJADWAL — untuk nanti", acceptedAt: "Diterima pada" },
  vi: { placedAt: "Đã đặt hàng", prepTime: "Thời gian chuẩn bị", readyTime: "Thời gian dự kiến", pickupTime: "Giờ lấy hàng", deliveryTime: "Giờ giao hàng", scheduledBanner: "ĐƠN HÀNG ĐẶT TRƯỚC — cho thời điểm sau", acceptedAt: "Chấp nhận lúc" },
  th: { placedAt: "รับคำสั่งซื้อแล้ว", prepTime: "เวลาเตรียม", readyTime: "เวลาโดยประมาณ", pickupTime: "เวลารับสินค้า", deliveryTime: "เวลาจัดส่ง", scheduledBanner: "คำสั่งซื้อล่วงหน้า — สำหรับเวลาถัดไป", acceptedAt: "ตอบรับเมื่อ" },
  zh: { placedAt: "下单时间", prepTime: "备餐时间", readyTime: "预计时间", pickupTime: "取餐时间", deliveryTime: "送达时间", scheduledBanner: "预约订单 — 稍后时段", acceptedAt: "接单时间" },
  ja: { placedAt: "注文日時", prepTime: "調理時間", readyTime: "完成予定時刻", pickupTime: "受け取り時刻", deliveryTime: "配達時刻", scheduledBanner: "予約注文 — 後の時間帯", acceptedAt: "受付日時" },
  ko: { placedAt: "주문 접수", prepTime: "조리 시간", readyTime: "예상 시각", pickupTime: "픽업 시각", deliveryTime: "배달 시각", scheduledBanner: "예약 주문 — 이후 시간", acceptedAt: "수락 시각" },
  ar: { placedAt: "تم استلام الطلب", prepTime: "وقت التحضير", readyTime: "الوقت المتوقع", pickupTime: "وقت الاستلام", deliveryTime: "وقت التوصيل", scheduledBanner: "طلب مجدول — لوقت لاحق", acceptedAt: "تم القبول في" },
  he: { placedAt: "ההזמנה התקבלה", prepTime: "זמן הכנה", readyTime: "זמן משוער", pickupTime: "שעת איסוף", deliveryTime: "שעת משלוח", scheduledBanner: "הזמנה מתוזמנת — למועד מאוחר יותר", acceptedAt: "אושרה בתאריך" },
  hi: { placedAt: "ऑर्डर दिया गया", prepTime: "तैयारी का समय", readyTime: "अनुमानित समय", pickupTime: "पिकअप समय", deliveryTime: "डिलीवरी समय", scheduledBanner: "निर्धारित ऑर्डर — बाद के समय के लिए", acceptedAt: "स्वीकृत" },
};

const DIR = path.join(process.cwd(), "src", "messages");
let touched = 0;
const gaps: string[] = [];

for (const locale of SUPPORTED_LOCALES) {
  const file = path.join(DIR, `${locale}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, any>;
  const b = T[locale];
  if (!b) { gaps.push(locale); continue; }
  json.email = json.email ?? {};
  json.email.timing = json.email.timing ?? {};
  let n = 0;
  for (const [k, v] of Object.entries(b)) {
    if (typeof json.email.timing[k] !== "string") { json.email.timing[k] = v; n++; }
  }
  if (n > 0) { fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8"); touched++; }
  console.log(`  ${locale.padEnd(6)} +${n}`);
}

if (gaps.length) console.error(`\n⚠️  missing bundle for: ${gaps.join(", ")}`);
console.log(`\n✅ ${touched}/${SUPPORTED_LOCALES.length} locale files updated.`);
