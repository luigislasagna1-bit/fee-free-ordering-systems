/**
 * Adds admin.services.firstOrderDelay{Label,Hint,None} ×38 — the per-service
 * "first scheduled order after opening" warm-up buffer (Luigi 2026-08-10: a
 * customer could book delivery for the exact opening minute).
 *
 *   npx tsx scripts/i18n-add-first-order-delay.ts          (dry run)
 *   npx tsx scripts/i18n-add-first-order-delay.ts --write
 */
import fs from "node:fs";
import path from "node:path";

const WRITE = process.argv.includes("--write");
const DIR = path.join(process.cwd(), "src", "messages");

type Pack = { firstOrderDelayLabel: string; firstOrderDelayHint: string; firstOrderDelayNone: string };

const PACKS: Record<string, Pack> = {
  en: { firstOrderDelayLabel: "First scheduled order after opening", firstOrderDelayHint: "Warm-up buffer: the earliest slot customers can schedule after each opening. Open at 10:00 with 30 min here → first slot 10:30. Applies to lunch and dinner openings separately on split-hours days.", firstOrderDelayNone: "At opening (no buffer)" },
  ar: { firstOrderDelayLabel: "أول طلب مجدول بعد الافتتاح", firstOrderDelayHint: "مهلة تجهيز: أول موعد يمكن للعملاء حجزه بعد كل افتتاح. الفتح 10:00 مع 30 دقيقة هنا ← أول موعد 10:30. تُطبق على فترتي الغداء والعشاء كلًا على حدة في أيام الدوام المقسم.", firstOrderDelayNone: "عند الافتتاح (بدون مهلة)" },
  bg: { firstOrderDelayLabel: "Първа планирана поръчка след отваряне", firstOrderDelayHint: "Буфер за подготовка: най-ранният час, който клиентите могат да запазят след всяко отваряне. Отваряне в 10:00 с 30 мин тук → първи час 10:30. Прилага се поотделно за обедното и вечерното отваряне при разделено работно време.", firstOrderDelayNone: "При отваряне (без буфер)" },
  ca: { firstOrderDelayLabel: "Primera comanda programada després d'obrir", firstOrderDelayHint: "Marge d'escalfament: la primera franja que els clients poden reservar després de cada obertura. Obertura a les 10:00 amb 30 min aquí → primera franja 10:30. S'aplica per separat a dinar i sopar en horaris partits.", firstOrderDelayNone: "En obrir (sense marge)" },
  cs: { firstOrderDelayLabel: "První plánovaná objednávka po otevření", firstOrderDelayHint: "Rozjezdová rezerva: nejbližší čas, který si zákazníci mohou naplánovat po každém otevření. Otevírka 10:00 a 30 min zde → první termín 10:30. Při dělené otevírací době platí zvlášť pro oběd i večer.", firstOrderDelayNone: "Při otevření (bez rezervy)" },
  da: { firstOrderDelayLabel: "Første planlagte ordre efter åbning", firstOrderDelayHint: "Opvarmningsbuffer: det tidligste tidspunkt kunder kan planlægge efter hver åbning. Åbner kl. 10:00 med 30 min her → første tid 10:30. Gælder frokost- og aftenåbning hver for sig ved delte åbningstider.", firstOrderDelayNone: "Ved åbning (ingen buffer)" },
  de: { firstOrderDelayLabel: "Erste vorbestellte Zeit nach Öffnung", firstOrderDelayHint: "Anlaufpuffer: der früheste Slot, den Kunden nach jeder Öffnung wählen können. Öffnung 10:00 mit 30 Min. hier → erster Slot 10:30. Gilt bei geteilten Öffnungszeiten für Mittag- und Abendöffnung getrennt.", firstOrderDelayNone: "Ab Öffnung (kein Puffer)" },
  el: { firstOrderDelayLabel: "Πρώτη προγραμματισμένη παραγγελία μετά το άνοιγμα", firstOrderDelayHint: "Περιθώριο προετοιμασίας: η νωρίτερη ώρα που μπορούν να κλείσουν οι πελάτες μετά από κάθε άνοιγμα. Άνοιγμα 10:00 με 30 λεπτά εδώ → πρώτη ώρα 10:30. Ισχύει χωριστά για μεσημέρι και βράδυ σε διακεκομμένο ωράριο.", firstOrderDelayNone: "Με το άνοιγμα (χωρίς περιθώριο)" },
  es: { firstOrderDelayLabel: "Primer pedido programado tras la apertura", firstOrderDelayHint: "Margen de arranque: la primera franja que los clientes pueden programar tras cada apertura. Abres a las 10:00 con 30 min aquí → primera franja 10:30. Se aplica por separado a comida y cena en horarios partidos.", firstOrderDelayNone: "Al abrir (sin margen)" },
  et: { firstOrderDelayLabel: "Esimene plaanitud tellimus pärast avamist", firstOrderDelayHint: "Soojendusvaru: varaseim aeg, mille kliendid saavad pärast iga avamist broneerida. Avamine 10:00 ja siin 30 min → esimene aeg 10:30. Jagatud lahtiolekuaegadel kehtib lõuna- ja õhtuavamisele eraldi.", firstOrderDelayNone: "Avamisel (varuta)" },
  fi: { firstOrderDelayLabel: "Ensimmäinen ajastettu tilaus avaamisen jälkeen", firstOrderDelayHint: "Lämmittelyvara: aikaisin aika, jonka asiakkaat voivat varata kunkin avauksen jälkeen. Avaus klo 10:00 ja tässä 30 min → ensimmäinen aika 10:30. Jaetuissa aukioloissa lounas- ja ilta-avaukselle erikseen.", firstOrderDelayNone: "Avattaessa (ei varaa)" },
  fr: { firstOrderDelayLabel: "Première commande programmée après l'ouverture", firstOrderDelayHint: "Marge de mise en route : le premier créneau que les clients peuvent réserver après chaque ouverture. Ouverture à 10:00 avec 30 min ici → premier créneau 10:30. S'applique séparément au déjeuner et au dîner en horaires coupés.", firstOrderDelayNone: "À l'ouverture (sans marge)" },
  he: { firstOrderDelayLabel: "הזמנה מתוזמנת ראשונה אחרי הפתיחה", firstOrderDelayHint: "מרווח התארגנות: המועד המוקדם ביותר שלקוחות יכולים לקבוע אחרי כל פתיחה. פתיחה ב-10:00 עם 30 דק' כאן ← מועד ראשון 10:30. חל בנפרד על צהריים וערב בימים עם שעות מפוצלות.", firstOrderDelayNone: "עם הפתיחה (ללא מרווח)" },
  hi: { firstOrderDelayLabel: "खुलने के बाद पहला निर्धारित ऑर्डर", firstOrderDelayHint: "तैयारी का समय: हर बार खुलने के बाद ग्राहक जो सबसे पहला समय चुन सकते हैं। 10:00 बजे खुलने पर यहाँ 30 मिनट → पहला समय 10:30। विभाजित समय वाले दिनों में दोपहर और शाम पर अलग-अलग लागू होता है।", firstOrderDelayNone: "खुलते ही (कोई अंतराल नहीं)" },
  hr: { firstOrderDelayLabel: "Prva zakazana narudžba nakon otvaranja", firstOrderDelayHint: "Vrijeme zagrijavanja: najraniji termin koji kupci mogu zakazati nakon svakog otvaranja. Otvaranje u 10:00 uz 30 min ovdje → prvi termin 10:30. Kod podijeljenog radnog vremena vrijedi zasebno za ručak i večeru.", firstOrderDelayNone: "Pri otvaranju (bez odgode)" },
  hu: { firstOrderDelayLabel: "Első ütemezett rendelés nyitás után", firstOrderDelayHint: "Bemelegítési ráhagyás: a legkorábbi időpont, amit a vendégek az egyes nyitások után foglalhatnak. 10:00-s nyitás és itt 30 perc → első időpont 10:30. Osztott nyitvatartásnál a déli és esti nyitásra külön érvényes.", firstOrderDelayNone: "Nyitáskor (ráhagyás nélkül)" },
  id: { firstOrderDelayLabel: "Pesanan terjadwal pertama setelah buka", firstOrderDelayHint: "Waktu pemanasan: slot paling awal yang bisa dijadwalkan pelanggan setelah setiap jam buka. Buka 10:00 dengan 30 menit di sini → slot pertama 10:30. Berlaku terpisah untuk sesi siang dan malam pada jam buka terpisah.", firstOrderDelayNone: "Saat buka (tanpa jeda)" },
  it: { firstOrderDelayLabel: "Primo ordine programmato dopo l'apertura", firstOrderDelayHint: "Margine di avvio: il primo orario prenotabile dai clienti dopo ogni apertura. Apri alle 10:00 con 30 min qui → primo orario 10:30. Con orari spezzati vale separatamente per pranzo e cena.", firstOrderDelayNone: "All'apertura (nessun margine)" },
  ja: { firstOrderDelayLabel: "開店後の最初の予約注文", firstOrderDelayHint: "準備バッファ:各開店後にお客様が予約できる最初の時間です。10:00開店でここを30分に→最初の枠は10:30。昼夜分割営業の日はそれぞれの開店に個別に適用されます。", firstOrderDelayNone: "開店と同時(バッファなし)" },
  ko: { firstOrderDelayLabel: "오픈 후 첫 예약 주문", firstOrderDelayHint: "준비 시간: 각 오픈 후 고객이 예약할 수 있는 가장 이른 시간입니다. 10:00 오픈에 여기를 30분으로 → 첫 시간대는 10:30. 분리 영업일에는 점심·저녁 오픈에 각각 적용됩니다.", firstOrderDelayNone: "오픈 즉시(대기 없음)" },
  lt: { firstOrderDelayLabel: "Pirmas suplanuotas užsakymas po atidarymo", firstOrderDelayHint: "Įsibėgėjimo atsarga: anksčiausias laikas, kurį klientai gali rezervuoti po kiekvieno atidarymo. Atidarymas 10:00 ir čia 30 min → pirmas laikas 10:30. Esant skaidytam darbo laikui taikoma pietų ir vakaro atidarymams atskirai.", firstOrderDelayNone: "Atidarius (be atsargos)" },
  lv: { firstOrderDelayLabel: "Pirmais plānotais pasūtījums pēc atvēršanas", firstOrderDelayHint: "Iesilšanas rezerve: agrākais laiks, ko klienti var ieplānot pēc katras atvēršanas. Atvēršana 10:00 ar 30 min šeit → pirmais laiks 10:30. Dalītā darba laikā attiecas uz pusdienu un vakara atvēršanu atsevišķi.", firstOrderDelayNone: "Atverot (bez rezerves)" },
  nb: { firstOrderDelayLabel: "Første planlagte ordre etter åpning", firstOrderDelayHint: "Oppvarmingsbuffer: det tidligste tidspunktet kunder kan planlegge etter hver åpning. Åpner 10:00 med 30 min her → første tid 10:30. Gjelder lunsj- og kveldsåpning hver for seg ved delte åpningstider.", firstOrderDelayNone: "Ved åpning (ingen buffer)" },
  nl: { firstOrderDelayLabel: "Eerste geplande bestelling na opening", firstOrderDelayHint: "Opstartbuffer: het vroegste tijdstip dat klanten na elke opening kunnen inplannen. Open om 10:00 met hier 30 min → eerste tijdstip 10:30. Geldt bij gesplitste openingstijden apart voor lunch en avond.", firstOrderDelayNone: "Bij opening (geen buffer)" },
  pl: { firstOrderDelayLabel: "Pierwsze planowane zamówienie po otwarciu", firstOrderDelayHint: "Bufor rozruchu: najwcześniejsza godzina, jaką klienci mogą zaplanować po każdym otwarciu. Otwarcie 10:00 i 30 min tutaj → pierwszy termin 10:30. Przy dzielonych godzinach dotyczy osobno otwarcia na obiad i wieczór.", firstOrderDelayNone: "Od otwarcia (bez buforu)" },
  pt: { firstOrderDelayLabel: "Primeira encomenda agendada após a abertura", firstOrderDelayHint: "Margem de arranque: o primeiro horário que os clientes podem agendar após cada abertura. Abre às 10:00 com 30 min aqui → primeiro horário 10:30. Em horários repartidos aplica-se separadamente ao almoço e ao jantar.", firstOrderDelayNone: "Na abertura (sem margem)" },
  "pt-BR": { firstOrderDelayLabel: "Primeiro pedido agendado após a abertura", firstOrderDelayHint: "Margem de preparo: o primeiro horário que os clientes podem agendar após cada abertura. Abre às 10:00 com 30 min aqui → primeiro horário 10:30. Em horários divididos vale separadamente para almoço e jantar.", firstOrderDelayNone: "Na abertura (sem margem)" },
  ro: { firstOrderDelayLabel: "Prima comandă programată după deschidere", firstOrderDelayHint: "Marjă de pregătire: cel mai devreme interval pe care clienții îl pot programa după fiecare deschidere. Deschidere la 10:00 cu 30 min aici → primul interval 10:30. La program fracționat se aplică separat prânzului și serii.", firstOrderDelayNone: "La deschidere (fără marjă)" },
  ru: { firstOrderDelayLabel: "Первый запланированный заказ после открытия", firstOrderDelayHint: "Буфер на разогрев: самое раннее время, которое клиенты могут выбрать после каждого открытия. Открытие в 10:00 и 30 мин здесь → первое время 10:30. При раздельном графике действует отдельно для дневного и вечернего открытия.", firstOrderDelayNone: "С открытия (без буфера)" },
  sk: { firstOrderDelayLabel: "Prvá plánovaná objednávka po otvorení", firstOrderDelayHint: "Rozbehová rezerva: najskorší čas, ktorý si zákazníci môžu naplánovať po každom otvorení. Otvorenie 10:00 a tu 30 min → prvý termín 10:30. Pri delených hodinách platí zvlášť pre obed aj večer.", firstOrderDelayNone: "Pri otvorení (bez rezervy)" },
  sl: { firstOrderDelayLabel: "Prvo načrtovano naročilo po odprtju", firstOrderDelayHint: "Zagonska rezerva: najzgodnejši termin, ki ga stranke lahko rezervirajo po vsakem odprtju. Odprtje ob 10:00 s 30 min tukaj → prvi termin 10:30. Pri deljenem delovnem času velja ločeno za kosilo in večer.", firstOrderDelayNone: "Ob odprtju (brez rezerve)" },
  sr: { firstOrderDelayLabel: "Prva zakazana porudžbina posle otvaranja", firstOrderDelayHint: "Vreme zagrevanja: najraniji termin koji kupci mogu da zakažu posle svakog otvaranja. Otvaranje u 10:00 uz 30 min ovde → prvi termin 10:30. Kod podeljenog radnog vremena važi posebno za ručak i veče.", firstOrderDelayNone: "Pri otvaranju (bez odlaganja)" },
  sv: { firstOrderDelayLabel: "Första schemalagda beställning efter öppning", firstOrderDelayHint: "Uppvärmningsbuffert: den tidigaste tid kunder kan boka efter varje öppning. Öppnar 10:00 med 30 min här → första tid 10:30. Vid delade öppettider gäller det lunch- och kvällsöppning var för sig.", firstOrderDelayNone: "Vid öppning (ingen buffert)" },
  th: { firstOrderDelayLabel: "ออร์เดอร์ล่วงหน้าแรกหลังเปิดร้าน", firstOrderDelayHint: "เวลาเตรียมความพร้อม: เวลาแรกสุดที่ลูกค้าจองได้หลังการเปิดแต่ละรอบ เปิด 10:00 ตั้งไว้ 30 นาที → ช่วงแรกคือ 10:30 ใช้แยกกันสำหรับรอบกลางวันและรอบเย็นในวันที่เปิดเป็นช่วง", firstOrderDelayNone: "ทันทีที่เปิด (ไม่มีเวลาเตรียม)" },
  tr: { firstOrderDelayLabel: "Açılıştan sonra ilk planlı sipariş", firstOrderDelayHint: "Isınma payı: müşterilerin her açılıştan sonra planlayabileceği en erken saat. 10:00 açılış ve burada 30 dk → ilk saat 10:30. Bölünmüş çalışma saatlerinde öğle ve akşam açılışına ayrı ayrı uygulanır.", firstOrderDelayNone: "Açılışta (paysız)" },
  uk: { firstOrderDelayLabel: "Перше заплановане замовлення після відкриття", firstOrderDelayHint: "Буфер на розігрів: найраніший час, який клієнти можуть обрати після кожного відкриття. Відкриття о 10:00 і 30 хв тут → перший час 10:30. За роздільного графіка діє окремо для денного та вечірнього відкриття.", firstOrderDelayNone: "З відкриття (без буфера)" },
  vi: { firstOrderDelayLabel: "Đơn đặt trước đầu tiên sau giờ mở cửa", firstOrderDelayHint: "Thời gian khởi động: khung giờ sớm nhất khách có thể đặt sau mỗi lần mở cửa. Mở 10:00 và đặt 30 phút ở đây → khung đầu tiên là 10:30. Áp dụng riêng cho ca trưa và ca tối vào ngày có giờ mở tách ca.", firstOrderDelayNone: "Ngay khi mở cửa (không trễ)" },
  zh: { firstOrderDelayLabel: "开门后的首个预约订单", firstOrderDelayHint: "热身缓冲:每次开门后顾客可预约的最早时间。10:00 开门、此处设 30 分钟 → 首个时段为 10:30。分段营业时,午市与晚市分别适用。", firstOrderDelayNone: "开门即可(无缓冲)" },
};

function main() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json"));
  const locales = files.map((f) => f.replace(/\.json$/, ""));
  const missing = locales.filter((l) => !PACKS[l]);
  const extras = Object.keys(PACKS).filter((l) => !locales.includes(l));
  if (missing.length || extras.length) { console.error("❌ ABORTED:", { missing, extras }); process.exit(1); }
  for (const loc of locales) {
    const file = path.join(DIR, `${loc}.json`);
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    json.admin ??= {}; json.admin.services ??= {};
    Object.assign(json.admin.services, PACKS[loc]);
    if (WRITE) fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  }
  console.log(`${WRITE ? "✅ wrote" : "🔍 dry run —"} 3 keys × ${locales.length}`);
}
main();
