/**
 * i18n patch for the auto-accept confirmation-email fix (Luigi 2026-08-11).
 *
 * An auto-accepted order is born "accepted", so it never transitions
 * pending → accepted and the kitchen-accept email (the real confirmation)
 * never fires. The placement email was therefore the ONLY email the customer
 * ever got — and it said "awaiting restaurant confirmation" (ORD-143921044).
 * These keys give that email its already-confirmed voice:
 *
 *   email.orderConfirmed.subjectAccepted        — inbox line
 *   email.orderConfirmed.previewAccepted        — preheader
 *   email.orderConfirmed.headerTitleAccepted    — green header title
 *   email.orderConfirmed.headerSubtitleAccepted — green header subtitle
 *   email.orderConfirmed.bodyAcceptedNow        — ASAP order (kitchen starts now)
 *   email.orderConfirmed.bodyAcceptedLater      — scheduled / placed-while-closed
 *
 * Wording deliberately reuses each locale's EXISTING confirmed-order vocabulary
 * from email.orderStatus.acceptedTitle / acceptedBody so the two emails can
 * never say "confirmed" two different ways. German is the formal "Sie" the rest
 * of the customer mail uses; Serbian is Latin ekavian; pt vs pt-BR keep their
 * own encomenda/pedido split; Hungarian keeps the "#{orderNumber}. rendelés"
 * ordinal form of its existing subject.
 *
 *   npx tsx scripts/i18n-add-order-confirmed-accepted.ts
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");

// [subjectAccepted, previewAccepted, headerTitleAccepted, headerSubtitleAccepted,
//  bodyAcceptedNow, bodyAcceptedLater]
const T: Record<string, [string, string, string, string, string, string]> = {
  en: [
    "Order #{orderNumber} confirmed",
    "Order #{orderNumber} confirmed by the restaurant",
    "Order confirmed",
    "Confirmed by the restaurant",
    "Order #{orderNumber} is confirmed and the kitchen is starting on it now.",
    "Order #{orderNumber} is confirmed — it's booked in for the time shown below.",
  ],
  fr: [
    "Commande #{orderNumber} confirmée",
    "Commande #{orderNumber} confirmée par le restaurant",
    "Commande confirmée",
    "Confirmée par le restaurant",
    "La commande #{orderNumber} est confirmée et la cuisine s'y met dès maintenant.",
    "La commande #{orderNumber} est confirmée — elle est programmée pour l'horaire indiqué ci-dessous.",
  ],
  es: [
    "Pedido #{orderNumber} confirmado",
    "Pedido #{orderNumber} confirmado por el restaurante",
    "Pedido confirmado",
    "Confirmado por el restaurante",
    "El pedido #{orderNumber} está confirmado y la cocina ya está preparándolo.",
    "El pedido #{orderNumber} está confirmado — queda programado para la hora que se indica abajo.",
  ],
  it: [
    "Ordine #{orderNumber} confermato",
    "Ordine #{orderNumber} confermato dal ristorante",
    "Ordine confermato",
    "Confermato dal ristorante",
    "L'ordine #{orderNumber} è confermato e la cucina si sta già mettendo al lavoro.",
    "L'ordine #{orderNumber} è confermato — è programmato per l'orario indicato qui sotto.",
  ],
  pt: [
    "Encomenda #{orderNumber} confirmada",
    "Encomenda #{orderNumber} confirmada pelo restaurante",
    "Encomenda confirmada",
    "Confirmada pelo restaurante",
    "A encomenda #{orderNumber} está confirmada e a cozinha já está a trabalhar nela.",
    "A encomenda #{orderNumber} está confirmada — fica agendada para a hora indicada abaixo.",
  ],
  "pt-BR": [
    "Pedido #{orderNumber} confirmado",
    "Pedido #{orderNumber} confirmado pelo restaurante",
    "Pedido confirmado",
    "Confirmado pelo restaurante",
    "O pedido #{orderNumber} está confirmado e a cozinha já está preparando.",
    "O pedido #{orderNumber} está confirmado — está agendado para o horário indicado abaixo.",
  ],
  de: [
    "Bestellung #{orderNumber} bestätigt",
    "Bestellung #{orderNumber} vom Restaurant bestätigt",
    "Bestellung bestätigt",
    "Vom Restaurant bestätigt",
    "Bestellung #{orderNumber} ist bestätigt und die Küche fängt jetzt damit an.",
    "Bestellung #{orderNumber} ist bestätigt — sie ist für die unten angegebene Zeit vorgemerkt.",
  ],
  nl: [
    "Bestelling #{orderNumber} bevestigd",
    "Bestelling #{orderNumber} bevestigd door het restaurant",
    "Bestelling bevestigd",
    "Bevestigd door het restaurant",
    "Bestelling #{orderNumber} is bevestigd en de keuken gaat er nu mee aan de slag.",
    "Bestelling #{orderNumber} is bevestigd — ingepland voor het tijdstip hieronder.",
  ],
  ca: [
    "Comanda #{orderNumber} confirmada",
    "Comanda #{orderNumber} confirmada pel restaurant",
    "Comanda confirmada",
    "Confirmada pel restaurant",
    "La comanda #{orderNumber} està confirmada i la cuina ja hi està treballant.",
    "La comanda #{orderNumber} està confirmada — queda programada per a l'hora que s'indica a sota.",
  ],
  ro: [
    "Comanda #{orderNumber} confirmată",
    "Comanda #{orderNumber} confirmată de restaurant",
    "Comandă confirmată",
    "Confirmată de restaurant",
    "Comanda #{orderNumber} este confirmată, iar bucătăria a început deja să o prepare.",
    "Comanda #{orderNumber} este confirmată — este programată pentru ora indicată mai jos.",
  ],
  pl: [
    "Zamówienie #{orderNumber} potwierdzone",
    "Zamówienie #{orderNumber} potwierdzone przez restaurację",
    "Zamówienie potwierdzone",
    "Potwierdzone przez restaurację",
    "Zamówienie #{orderNumber} jest potwierdzone, a kuchnia już się nim zajęła.",
    "Zamówienie #{orderNumber} jest potwierdzone — jest zaplanowane na godzinę podaną poniżej.",
  ],
  cs: [
    "Objednávka #{orderNumber} potvrzena",
    "Objednávka #{orderNumber} potvrzena restaurací",
    "Objednávka potvrzena",
    "Potvrzeno restaurací",
    "Objednávka #{orderNumber} je potvrzena a kuchyně se do ní pustila.",
    "Objednávka #{orderNumber} je potvrzena — je naplánována na čas uvedený níže.",
  ],
  sk: [
    "Objednávka č. {orderNumber} potvrdená",
    "Objednávka č. {orderNumber} potvrdená reštauráciou",
    "Objednávka potvrdená",
    "Potvrdené reštauráciou",
    "Objednávka #{orderNumber} je potvrdená a kuchyňa sa do nej hneď pustí.",
    "Objednávka #{orderNumber} je potvrdená — je naplánovaná na čas uvedený nižšie.",
  ],
  sl: [
    "Naročilo #{orderNumber} potrjeno",
    "Naročilo #{orderNumber} je potrdila restavracija",
    "Naročilo potrjeno",
    "Potrdila restavracija",
    "Naročilo #{orderNumber} je potrjeno in kuhinja je že začela z delom.",
    "Naročilo #{orderNumber} je potrjeno — načrtovano je za spodaj navedeni čas.",
  ],
  hr: [
    "Narudžba #{orderNumber} potvrđena",
    "Narudžbu #{orderNumber} potvrdio je restoran",
    "Narudžba potvrđena",
    "Potvrdio restoran",
    "Narudžba #{orderNumber} je potvrđena i kuhinja je već krenula s pripremom.",
    "Narudžba #{orderNumber} je potvrđena — zakazana je za vrijeme navedeno u nastavku.",
  ],
  sr: [
    "Porudžbina #{orderNumber} potvrđena",
    "Porudžbinu #{orderNumber} potvrdio je restoran",
    "Porudžbina potvrđena",
    "Potvrdio restoran",
    "Porudžbina #{orderNumber} je potvrđena i kuhinja je upravo počela sa pripremom.",
    "Porudžbina #{orderNumber} je potvrđena — zakazana je za vreme navedeno ispod.",
  ],
  bg: [
    "Поръчка #{orderNumber} потвърдена",
    "Поръчка #{orderNumber} потвърдена от ресторанта",
    "Поръчката е потвърдена",
    "Потвърдена от ресторанта",
    "Поръчка #{orderNumber} е потвърдена и кухнята вече започва работа по нея.",
    "Поръчка #{orderNumber} е потвърдена — насрочена е за часа, посочен по-долу.",
  ],
  ru: [
    "Заказ #{orderNumber} подтверждён",
    "Заказ #{orderNumber} подтверждён рестораном",
    "Заказ подтверждён",
    "Подтверждён рестораном",
    "Заказ #{orderNumber} подтверждён, и кухня уже приступает к его приготовлению.",
    "Заказ #{orderNumber} подтверждён — он запланирован на время, указанное ниже.",
  ],
  uk: [
    "Замовлення #{orderNumber} підтверджено",
    "Замовлення #{orderNumber} підтверджено рестораном",
    "Замовлення підтверджено",
    "Підтверджено рестораном",
    "Замовлення #{orderNumber} підтверджено, і кухня вже приступила до роботи.",
    "Замовлення #{orderNumber} підтверджено — воно заплановане на час, указаний нижче.",
  ],
  el: [
    "Η παραγγελία #{orderNumber} επιβεβαιώθηκε",
    "Η παραγγελία #{orderNumber} επιβεβαιώθηκε από το εστιατόριο",
    "Παραγγελία επιβεβαιώθηκε",
    "Επιβεβαιώθηκε από το εστιατόριο",
    "Η παραγγελία #{orderNumber} επιβεβαιώθηκε και η κουζίνα αρχίζει να την ετοιμάζει τώρα.",
    "Η παραγγελία #{orderNumber} επιβεβαιώθηκε — έχει προγραμματιστεί για την ώρα που αναγράφεται παρακάτω.",
  ],
  hu: [
    "#{orderNumber}. rendelés visszaigazolva",
    "#{orderNumber}. rendelését visszaigazolta az étterem",
    "Rendelés visszaigazolva",
    "Az étterem visszaigazolta",
    "A #{orderNumber}. rendelése visszaigazolva, és a konyha már el is kezdte a készítést.",
    "A #{orderNumber}. rendelése visszaigazolva — a lent megadott időpontra van beütemezve.",
  ],
  fi: [
    "Tilaus #{orderNumber} vahvistettu",
    "Ravintola vahvisti tilauksen #{orderNumber}",
    "Tilaus vahvistettu",
    "Ravintolan vahvistama",
    "Tilaus #{orderNumber} on vahvistettu ja keittiö aloittaa sen valmistamisen nyt.",
    "Tilaus #{orderNumber} on vahvistettu — se on aikataulutettu alla näkyvään aikaan.",
  ],
  sv: [
    "Beställning #{orderNumber} bekräftad",
    "Beställning #{orderNumber} bekräftad av restaurangen",
    "Beställning bekräftad",
    "Bekräftad av restaurangen",
    "Beställning #{orderNumber} är bekräftad och köket börjar förbereda den nu.",
    "Beställning #{orderNumber} är bekräftad — den är inbokad till tiden som visas nedan.",
  ],
  da: [
    "Ordre #{orderNumber} bekræftet",
    "Ordre #{orderNumber} bekræftet af restauranten",
    "Ordre bekræftet",
    "Bekræftet af restauranten",
    "Ordre #{orderNumber} er bekræftet, og køkkenet går i gang nu.",
    "Ordre #{orderNumber} er bekræftet — den er booket til tidspunktet nedenfor.",
  ],
  nb: [
    "Bestilling #{orderNumber} bekreftet",
    "Bestilling #{orderNumber} bekreftet av restauranten",
    "Bestilling bekreftet",
    "Bekreftet av restauranten",
    "Bestilling #{orderNumber} er bekreftet, og kjøkkenet er i gang nå.",
    "Bestilling #{orderNumber} er bekreftet — den er satt opp til tidspunktet nedenfor.",
  ],
  et: [
    "Tellimus #{orderNumber} kinnitatud",
    "Restoran kinnitas tellimuse #{orderNumber}",
    "Tellimus kinnitatud",
    "Restorani kinnitatud",
    "Tellimus #{orderNumber} on kinnitatud ja köök alustab selle valmistamisega kohe.",
    "Tellimus #{orderNumber} on kinnitatud — see on planeeritud allpool näidatud ajaks.",
  ],
  lv: [
    "Pasūtījums #{orderNumber} apstiprināts",
    "Restorāns apstiprināja pasūtījumu #{orderNumber}",
    "Pasūtījums apstiprināts",
    "Restorāna apstiprināts",
    "Pasūtījums #{orderNumber} ir apstiprināts, un virtuve jau sāk to gatavot.",
    "Pasūtījums #{orderNumber} ir apstiprināts — tas ir ieplānots zemāk norādītajā laikā.",
  ],
  lt: [
    "Užsakymas #{orderNumber} patvirtintas",
    "Restoranas patvirtino užsakymą #{orderNumber}",
    "Užsakymas patvirtintas",
    "Patvirtino restoranas",
    "Užsakymas #{orderNumber} patvirtintas ir virtuvė jau pradėjo jį ruošti.",
    "Užsakymas #{orderNumber} patvirtintas — jis suplanuotas žemiau nurodytam laikui.",
  ],
  tr: [
    "#{orderNumber} numaralı sipariş onaylandı",
    "#{orderNumber} numaralı siparişiniz restoran tarafından onaylandı",
    "Sipariş onaylandı",
    "Restoran tarafından onaylandı",
    "#{orderNumber} numaralı siparişiniz onaylandı ve mutfak şu an hazırlamaya başladı.",
    "#{orderNumber} numaralı siparişiniz onaylandı — aşağıda belirtilen saat için planlandı.",
  ],
  id: [
    "Pesanan #{orderNumber} dikonfirmasi",
    "Pesanan #{orderNumber} dikonfirmasi oleh restoran",
    "Pesanan dikonfirmasi",
    "Dikonfirmasi oleh restoran",
    "Pesanan #{orderNumber} sudah dikonfirmasi dan dapur mulai memprosesnya sekarang.",
    "Pesanan #{orderNumber} sudah dikonfirmasi — dijadwalkan untuk waktu yang tertera di bawah.",
  ],
  vi: [
    "Đơn #{orderNumber} đã được xác nhận",
    "Đơn #{orderNumber} đã được nhà hàng xác nhận",
    "Đơn hàng đã được xác nhận",
    "Nhà hàng đã xác nhận",
    "Đơn hàng #{orderNumber} đã được xác nhận và bếp đang bắt đầu chế biến ngay bây giờ.",
    "Đơn hàng #{orderNumber} đã được xác nhận — đã được xếp lịch vào thời gian hiển thị bên dưới.",
  ],
  th: [
    "ยืนยันออร์เดอร์ #{orderNumber} แล้ว",
    "ร้านอาหารยืนยันออร์เดอร์ #{orderNumber} แล้ว",
    "ยืนยันออร์เดอร์แล้ว",
    "ร้านอาหารยืนยันแล้ว",
    "ออร์เดอร์ #{orderNumber} ได้รับการยืนยันแล้ว และครัวกำลังเริ่มทำอาหารให้คุณ",
    "ออร์เดอร์ #{orderNumber} ได้รับการยืนยันแล้ว — กำหนดไว้ตามเวลาที่แสดงด้านล่าง",
  ],
  ja: [
    "注文 #{orderNumber} が確定しました",
    "レストランが注文 #{orderNumber} を確定しました",
    "注文が確定しました",
    "レストランが確定しました",
    "注文 #{orderNumber} は確定し、キッチンで準備を開始しました。",
    "注文 #{orderNumber} は確定しました — 下に表示の時間に予約されています。",
  ],
  ko: [
    "주문 #{orderNumber} 확인됨",
    "레스토랑이 주문 #{orderNumber}을(를) 확인했습니다",
    "주문 확인됨",
    "레스토랑에서 확인함",
    "주문 #{orderNumber}이(가) 확인되었으며, 주방에서 지금 바로 준비를 시작합니다.",
    "주문 #{orderNumber}이(가) 확인되었으며, 아래 표시된 시간으로 예약되었습니다.",
  ],
  zh: [
    "订单 #{orderNumber} 已确认",
    "餐厅已确认订单 #{orderNumber}",
    "订单已确认",
    "餐厅已确认",
    "订单 #{orderNumber} 已确认，厨房正在开始备餐。",
    "订单 #{orderNumber} 已确认——已安排在下方显示的时间。",
  ],
  ar: [
    "تم تأكيد الطلب #{orderNumber}",
    "أكد المطعم الطلب #{orderNumber}",
    "تم تأكيد الطلب",
    "مؤكَّد من المطعم",
    "تم تأكيد الطلب #{orderNumber} وبدأ المطبخ في تحضيره الآن.",
    "تم تأكيد الطلب #{orderNumber} — وهو مجدول في الوقت الموضّح أدناه.",
  ],
  he: [
    "הזמנה #{orderNumber} אושרה",
    "המסעדה אישרה את הזמנה #{orderNumber}",
    "ההזמנה אושרה",
    "אושרה על ידי המסעדה",
    "הזמנה #{orderNumber} אושרה והמטבח כבר מתחיל בהכנה.",
    "הזמנה #{orderNumber} אושרה — היא נקבעה לשעה המופיעה למטה.",
  ],
  hi: [
    "ऑर्डर #{orderNumber} कन्फ़र्म हो गया",
    "रेस्तराँ ने ऑर्डर #{orderNumber} कन्फ़र्म कर दिया",
    "ऑर्डर कन्फ़र्म हो गया",
    "रेस्तराँ ने कन्फ़र्म किया",
    "ऑर्डर #{orderNumber} कन्फ़र्म हो गया है और किचन अभी उस पर काम शुरू कर रहा है।",
    "ऑर्डर #{orderNumber} कन्फ़र्म हो गया है — यह नीचे दिए गए समय के लिए तय है।",
  ],
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

const KEYS = [
  "email.orderConfirmed.subjectAccepted",
  "email.orderConfirmed.previewAccepted",
  "email.orderConfirmed.headerTitleAccepted",
  "email.orderConfirmed.headerSubtitleAccepted",
  "email.orderConfirmed.bodyAcceptedNow",
  "email.orderConfirmed.bodyAcceptedLater",
];

let n = 0;
const missing: string[] = [];
for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  const loc = f.replace(".json", "");
  const tr = T[loc];
  if (!tr) { missing.push(loc); continue; }
  const path = join(DIR, f);
  const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  KEYS.forEach((k, i) => setDeep(data, k, tr[i]));
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
if (missing.length) {
  console.error(`✗ NO TRANSLATION for: ${missing.join(", ")} — parity would break. Add them and re-run.`);
  process.exit(1);
}
console.log(`✓ auto-accept confirmation keys added to ${n} locale(s).`);
