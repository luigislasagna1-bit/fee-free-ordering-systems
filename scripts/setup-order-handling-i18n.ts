/**
 * One-off: i18n for the new "Order Handling" page (Taking Orders).
 *  - Copies the 9 shared toggle strings from admin.services -> admin.orderHandling
 *    (reuses the existing professional translations, identical wording).
 *  - Adds the new page title + subtitle and the sidebar nav label, translated into
 *    all 38 locales (the sidebar label reuses the title).
 * Writes each file back in the canonical 2-space + trailing-newline format (same as
 * scripts/i18n-merge-data.ts). Run: npx tsx scripts/setup-order-handling-i18n.ts
 * Luigi 2026-06-22.
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MSG_DIR = join(process.cwd(), "src", "messages");

// Already exist (translated) under admin.services — copy verbatim.
const COPY_KEYS = [
  "autoAcceptTitle", "autoAcceptHelp", "autoAcceptOn",
  "scheduledOrdersTitle", "allowSchedulingHint",
  "hideAsapTitle", "hideAsapHint",
  "enable", "disable",
] as const;

// New strings — { title, subtitle }. Sidebar nav label reuses title.
const TR: Record<string, { title: string; subtitle: string }> = {
  en:      { title: "Order Handling",          subtitle: "Choose how new orders are accepted and scheduled." },
  fr:      { title: "Gestion des commandes",   subtitle: "Choisissez comment les nouvelles commandes sont acceptées et planifiées." },
  es:      { title: "Gestión de pedidos",      subtitle: "Elige cómo se aceptan y programan los nuevos pedidos." },
  it:      { title: "Gestione ordini",         subtitle: "Scegli come vengono accettati e programmati i nuovi ordini." },
  pt:      { title: "Gestão de pedidos",       subtitle: "Escolha como os novos pedidos são aceites e agendados." },
  "pt-BR": { title: "Gestão de pedidos",       subtitle: "Escolha como os novos pedidos são aceitos e agendados." },
  de:      { title: "Bestellabwicklung",       subtitle: "Legen Sie fest, wie neue Bestellungen angenommen und geplant werden." },
  nl:      { title: "Orderafhandeling",        subtitle: "Bepaal hoe nieuwe bestellingen worden geaccepteerd en gepland." },
  ro:      { title: "Gestionarea comenzilor",  subtitle: "Alege cum sunt acceptate și programate comenzile noi." },
  sv:      { title: "Orderhantering",          subtitle: "Välj hur nya beställningar accepteras och schemaläggs." },
  da:      { title: "Ordrehåndtering",         subtitle: "Vælg, hvordan nye ordrer accepteres og planlægges." },
  nb:      { title: "Ordrehåndtering",         subtitle: "Velg hvordan nye bestillinger godtas og planlegges." },
  fi:      { title: "Tilausten käsittely",     subtitle: "Valitse, miten uudet tilaukset hyväksytään ja ajoitetaan." },
  pl:      { title: "Obsługa zamówień",        subtitle: "Wybierz, jak nowe zamówienia są akceptowane i planowane." },
  cs:      { title: "Zpracování objednávek",   subtitle: "Vyberte, jak se nové objednávky přijímají a plánují." },
  sk:      { title: "Spracovanie objednávok",  subtitle: "Vyberte, ako sa nové objednávky prijímajú a plánujú." },
  hu:      { title: "Rendeléskezelés",         subtitle: "Állítsa be, hogyan fogadják el és ütemezik az új rendeléseket." },
  el:      { title: "Διαχείριση παραγγελιών",  subtitle: "Επιλέξτε πώς γίνονται αποδεκτές και προγραμματίζονται οι νέες παραγγελίες." },
  bg:      { title: "Обработка на поръчки",    subtitle: "Изберете как се приемат и планират новите поръчки." },
  hr:      { title: "Upravljanje narudžbama",  subtitle: "Odaberite kako se nove narudžbe prihvaćaju i zakazuju." },
  sr:      { title: "Upravljanje porudžbinama", subtitle: "Izaberite kako se nove porudžbine prihvataju i zakazuju." },
  sl:      { title: "Upravljanje naročil",     subtitle: "Izberite, kako se nova naročila sprejemajo in načrtujejo." },
  et:      { title: "Tellimuste haldus",       subtitle: "Valige, kuidas uusi tellimusi vastu võetakse ja ajastatakse." },
  lv:      { title: "Pasūtījumu apstrāde",     subtitle: "Izvēlieties, kā jaunie pasūtījumi tiek pieņemti un plānoti." },
  lt:      { title: "Užsakymų tvarkymas",      subtitle: "Pasirinkite, kaip nauji užsakymai priimami ir suplanuojami." },
  tr:      { title: "Sipariş Yönetimi",        subtitle: "Yeni siparişlerin nasıl kabul edileceğini ve planlanacağını seçin." },
  ru:      { title: "Обработка заказов",       subtitle: "Выберите, как принимаются и планируются новые заказы." },
  uk:      { title: "Обробка замовлень",       subtitle: "Виберіть, як приймаються та плануються нові замовлення." },
  ca:      { title: "Gestió de comandes",      subtitle: "Trieu com s'accepten i es programen les comandes noves." },
  id:      { title: "Penanganan Pesanan",      subtitle: "Pilih bagaimana pesanan baru diterima dan dijadwalkan." },
  vi:      { title: "Xử lý đơn hàng",          subtitle: "Chọn cách đơn hàng mới được chấp nhận và lên lịch." },
  th:      { title: "การจัดการคำสั่งซื้อ",        subtitle: "เลือกวิธีรับและกำหนดเวลาคำสั่งซื้อใหม่" },
  zh:      { title: "订单处理",                 subtitle: "选择如何接受和安排新订单。" },
  ja:      { title: "注文の処理",                subtitle: "新しい注文の受け付け方法とスケジュールを選択します。" },
  ko:      { title: "주문 처리",                subtitle: "새 주문을 수락하고 예약하는 방식을 선택하세요." },
  ar:      { title: "معالجة الطلبات",          subtitle: "اختر كيفية قبول الطلبات الجديدة وجدولتها." },
  he:      { title: "טיפול בהזמנות",           subtitle: "בחר כיצד הזמנות חדשות מתקבלות ומתוזמנות." },
  hi:      { title: "ऑर्डर प्रबंधन",            subtitle: "चुनें कि नए ऑर्डर कैसे स्वीकार और शेड्यूल किए जाएं।" },
};

type Dict = Record<string, any>;
const en = JSON.parse(readFileSync(join(MSG_DIR, "en.json"), "utf8")) as Dict;
const enServices = (en.admin?.services ?? {}) as Dict;

const locales = readdirSync(MSG_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(".json", ""));

let n = 0;
const missing: string[] = [];
for (const loc of locales) {
  const path = join(MSG_DIR, `${loc}.json`);
  const msg = JSON.parse(readFileSync(path, "utf8")) as Dict;
  msg.admin = msg.admin ?? {};
  const svc = (msg.admin.services ?? {}) as Dict;
  const oh = (msg.admin.orderHandling = (msg.admin.orderHandling ?? {}) as Dict);
  for (const k of COPY_KEYS) oh[k] = svc[k] ?? enServices[k];
  const tr = TR[loc] ?? TR.en;
  if (!TR[loc]) missing.push(loc);
  oh.title = tr.title;
  oh.subtitle = tr.subtitle;
  msg.admin.sidebar = (msg.admin.sidebar ?? {}) as Dict;
  (msg.admin.sidebar as Dict).orderHandling = tr.title;
  writeFileSync(path, JSON.stringify(msg, null, 2) + "\n", "utf8");
  n++;
}
console.log(`✓ order-handling i18n set up in ${n} locale files (${COPY_KEYS.length} copied + title/subtitle/nav).`);
if (missing.length) console.warn(`  ⚠ no TR entry for: ${missing.join(", ")} (used en fallback)`);
