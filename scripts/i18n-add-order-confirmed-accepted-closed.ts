/**
 * Round 2 of the auto-accept confirmation i18n (Luigi 2026-08-11).
 *
 * The 12-agent audit of round 1 found the SAME broken promise still in the same
 * email: `closedNote` / `closedNoteWithTime` render on `placedWhileClosed`
 * alone, so an auto-accepted after-hours order read "Order confirmed" and then,
 * three lines later, "you'll get an update as soon as they open" — an update
 * that never comes, because the update it means IS the kitchen-accept email
 * auto-accept skips. It also flagged that "the time shown below" is the wrong
 * pointer for a closed store, whose estimatedReady is a now+prep guess landing
 * inside its own closed hours.
 *
 *   email.orderConfirmed.bodyAcceptedClosed         — body, closed + accepted
 *   email.orderConfirmed.closedNoteAccepted         — closed note, accepted
 *   email.orderConfirmed.closedNoteAcceptedWithTime — ditto, names the opening
 *
 * Also repairs two round-1 strings the audit caught:
 *   ja bodyAcceptedLater — used 予約 (this platform's TABLE-RESERVATION word,
 *     222 keys, and this very email renders a テーブル予約 block) and the
 *     invalid attributive 下に表示の時間.
 *   sk previewAccepted — used "č. {orderNumber}" while sk's own new body lines
 *     use "#{orderNumber}", so one email showed both forms two lines apart.
 *
 *   npx tsx scripts/i18n-add-order-confirmed-accepted-closed.ts
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");

// [bodyAcceptedClosed, closedNoteAccepted, closedNoteAcceptedWithTime]
const T: Record<string, [string, string, string]> = {
  en: [
    "Order #{orderNumber} is confirmed — the kitchen will start on it when the restaurant opens.",
    "The restaurant is closed right now, but your order is already confirmed — the kitchen will start on it when they open.",
    "The restaurant is closed right now, but your order is already confirmed — the kitchen will start on it when they open on {openingTime}.",
  ],
  fr: [
    "La commande #{orderNumber} est confirmée — la cuisine s'y mettra à l'ouverture du restaurant.",
    "Le restaurant est fermé pour le moment, mais votre commande est déjà confirmée — la cuisine s'y mettra dès l'ouverture.",
    "Le restaurant est fermé pour le moment, mais votre commande est déjà confirmée — la cuisine s'y mettra à l'ouverture, {openingTime}.",
  ],
  es: [
    "El pedido #{orderNumber} está confirmado — la cocina empezará a prepararlo cuando el restaurante abra.",
    "El restaurante está cerrado ahora mismo, pero tu pedido ya está confirmado — la cocina empezará a prepararlo cuando abran.",
    "El restaurante está cerrado ahora mismo, pero tu pedido ya está confirmado — la cocina empezará a prepararlo cuando abran, el {openingTime}.",
  ],
  it: [
    "L'ordine #{orderNumber} è confermato — la cucina si metterà al lavoro all'apertura del ristorante.",
    "Il ristorante è chiuso in questo momento, ma il tuo ordine è già confermato — la cucina si metterà al lavoro all'apertura.",
    "Il ristorante è chiuso in questo momento, ma il tuo ordine è già confermato — la cucina si metterà al lavoro all'apertura, {openingTime}.",
  ],
  pt: [
    "A encomenda #{orderNumber} está confirmada — a cozinha começa a prepará-la quando o restaurante abrir.",
    "O restaurante está fechado neste momento, mas a sua encomenda já está confirmada — a cozinha começa a prepará-la quando abrirem.",
    "O restaurante está fechado neste momento, mas a sua encomenda já está confirmada — a cozinha começa a prepará-la quando abrirem, {openingTime}.",
  ],
  "pt-BR": [
    "O pedido #{orderNumber} está confirmado — a cozinha começa a preparar quando o restaurante abrir.",
    "O restaurante está fechado agora, mas seu pedido já está confirmado — a cozinha começa a preparar quando abrirem.",
    "O restaurante está fechado agora, mas seu pedido já está confirmado — a cozinha começa a preparar quando abrirem, {openingTime}.",
  ],
  de: [
    "Bestellung #{orderNumber} ist bestätigt — die Küche fängt damit an, sobald das Restaurant öffnet.",
    "Das Restaurant hat gerade geschlossen, Ihre Bestellung ist aber bereits bestätigt — die Küche fängt damit an, sobald geöffnet wird.",
    "Das Restaurant hat gerade geschlossen, Ihre Bestellung ist aber bereits bestätigt — die Küche fängt damit an, sobald am {openingTime} geöffnet wird.",
  ],
  nl: [
    "Bestelling #{orderNumber} is bevestigd — de keuken gaat ermee aan de slag zodra het restaurant opengaat.",
    "Het restaurant is nu gesloten, maar uw bestelling is al bevestigd — de keuken gaat ermee aan de slag zodra ze opengaan.",
    "Het restaurant is nu gesloten, maar uw bestelling is al bevestigd — de keuken gaat ermee aan de slag bij opening op {openingTime}.",
  ],
  ca: [
    "La comanda #{orderNumber} està confirmada — la cuina hi començarà a treballar quan el restaurant obri.",
    "El restaurant ara està tancat, però la vostra comanda ja està confirmada — la cuina hi començarà a treballar quan obrin.",
    "El restaurant ara està tancat, però la vostra comanda ja està confirmada — la cuina hi començarà a treballar quan obrin, el {openingTime}.",
  ],
  ro: [
    "Comanda #{orderNumber} este confirmată — bucătăria începe să o prepare la deschiderea restaurantului.",
    "Restaurantul este închis acum, dar comanda dvs. este deja confirmată — bucătăria începe să o prepare la deschidere.",
    "Restaurantul este închis acum, dar comanda dvs. este deja confirmată — bucătăria începe să o prepare la deschidere, pe {openingTime}.",
  ],
  pl: [
    "Zamówienie #{orderNumber} jest potwierdzone — kuchnia zajmie się nim po otwarciu restauracji.",
    "Restauracja jest teraz zamknięta, ale Twoje zamówienie jest już potwierdzone — kuchnia zajmie się nim po otwarciu.",
    "Restauracja jest teraz zamknięta, ale Twoje zamówienie jest już potwierdzone — kuchnia zajmie się nim po otwarciu, {openingTime}.",
  ],
  cs: [
    "Objednávka #{orderNumber} je potvrzena — kuchyně se do ní pustí, jakmile restaurace otevře.",
    "Restaurace je právě zavřená, ale vaše objednávka je už potvrzená — kuchyně se do ní pustí po otevření.",
    "Restaurace je právě zavřená, ale vaše objednávka je už potvrzená — kuchyně se do ní pustí po otevření, {openingTime}.",
  ],
  sk: [
    "Objednávka #{orderNumber} je potvrdená — kuchyňa sa do nej pustí, hneď ako reštaurácia otvorí.",
    "Reštaurácia je práve zatvorená, ale vaša objednávka je už potvrdená — kuchyňa sa do nej pustí po otvorení.",
    "Reštaurácia je práve zatvorená, ale vaša objednávka je už potvrdená — kuchyňa sa do nej pustí po otvorení, {openingTime}.",
  ],
  sl: [
    "Naročilo #{orderNumber} je potrjeno — kuhinja ga bo začela pripravljati, ko se restavracija odpre.",
    "Restavracija je trenutno zaprta, a vaše naročilo je že potrjeno — kuhinja ga bo začela pripravljati po odprtju.",
    "Restavracija je trenutno zaprta, a vaše naročilo je že potrjeno — kuhinja ga bo začela pripravljati po odprtju, {openingTime}.",
  ],
  hr: [
    "Narudžba #{orderNumber} je potvrđena — kuhinja će krenuti s pripremom kada se restoran otvori.",
    "Restoran je trenutačno zatvoren, ali vaša narudžba je već potvrđena — kuhinja kreće s pripremom po otvaranju.",
    "Restoran je trenutačno zatvoren, ali vaša narudžba je već potvrđena — kuhinja kreće s pripremom po otvaranju, {openingTime}.",
  ],
  sr: [
    "Porudžbina #{orderNumber} je potvrđena — kuhinja počinje sa pripremom kada se restoran otvori.",
    "Restoran je trenutno zatvoren, ali vaša porudžbina je već potvrđena — kuhinja počinje sa pripremom po otvaranju.",
    "Restoran je trenutno zatvoren, ali vaša porudžbina je već potvrđena — kuhinja počinje sa pripremom po otvaranju, {openingTime}.",
  ],
  bg: [
    "Поръчка #{orderNumber} е потвърдена — кухнята ще започне работа по нея, щом ресторантът отвори.",
    "Ресторантът в момента е затворен, но поръчката ви вече е потвърдена — кухнята ще започне работа по нея след отварянето.",
    "Ресторантът в момента е затворен, но поръчката ви вече е потвърдена — кухнята ще започне работа по нея след отварянето, на {openingTime}.",
  ],
  ru: [
    "Заказ #{orderNumber} подтверждён — кухня приступит к нему, как только ресторан откроется.",
    "Ресторан сейчас закрыт, но ваш заказ уже подтверждён — кухня приступит к нему после открытия.",
    "Ресторан сейчас закрыт, но ваш заказ уже подтверждён — кухня приступит к нему после открытия, {openingTime}.",
  ],
  uk: [
    "Замовлення #{orderNumber} підтверджено — кухня візьметься за нього, щойно ресторан відкриється.",
    "Ресторан зараз зачинений, але ваше замовлення вже підтверджено — кухня візьметься за нього після відкриття.",
    "Ресторан зараз зачинений, але ваше замовлення вже підтверджено — кухня візьметься за нього після відкриття, {openingTime}.",
  ],
  el: [
    "Η παραγγελία #{orderNumber} επιβεβαιώθηκε — η κουζίνα θα ξεκινήσει μόλις ανοίξει το εστιατόριο.",
    "Το εστιατόριο είναι κλειστό αυτή τη στιγμή, αλλά η παραγγελία σας έχει ήδη επιβεβαιωθεί — η κουζίνα θα ξεκινήσει μόλις ανοίξει.",
    "Το εστιατόριο είναι κλειστό αυτή τη στιγμή, αλλά η παραγγελία σας έχει ήδη επιβεβαιωθεί — η κουζίνα θα ξεκινήσει με το άνοιγμα, στις {openingTime}.",
  ],
  hu: [
    "A #{orderNumber}. rendelése visszaigazolva — a konyha nyitáskor kezd hozzá.",
    "Az étterem most zárva van, de a rendelése már vissza van igazolva — a konyha nyitáskor kezd hozzá.",
    "Az étterem most zárva van, de a rendelése már vissza van igazolva — a konyha nyitáskor kezd hozzá: {openingTime}.",
  ],
  fi: [
    "Tilaus #{orderNumber} on vahvistettu — keittiö aloittaa sen valmistamisen, kun ravintola avautuu.",
    "Ravintola on nyt suljettu, mutta tilauksesi on jo vahvistettu — keittiö aloittaa sen valmistamisen aukeamisen jälkeen.",
    "Ravintola on nyt suljettu, mutta tilauksesi on jo vahvistettu — keittiö aloittaa sen valmistamisen, kun ravintola avautuu {openingTime}.",
  ],
  sv: [
    "Beställning #{orderNumber} är bekräftad — köket börjar med den när restaurangen öppnar.",
    "Restaurangen är stängd just nu, men din beställning är redan bekräftad — köket börjar med den när de öppnar.",
    "Restaurangen är stängd just nu, men din beställning är redan bekräftad — köket börjar med den när de öppnar, {openingTime}.",
  ],
  da: [
    "Ordre #{orderNumber} er bekræftet — køkkenet går i gang, når restauranten åbner.",
    "Restauranten har lukket lige nu, men din ordre er allerede bekræftet — køkkenet går i gang, når de åbner.",
    "Restauranten har lukket lige nu, men din ordre er allerede bekræftet — køkkenet går i gang, når de åbner {openingTime}.",
  ],
  nb: [
    "Bestilling #{orderNumber} er bekreftet — kjøkkenet setter i gang når restauranten åpner.",
    "Restauranten er stengt akkurat nå, men bestillingen din er allerede bekreftet — kjøkkenet setter i gang når de åpner.",
    "Restauranten er stengt akkurat nå, men bestillingen din er allerede bekreftet — kjøkkenet setter i gang når de åpner {openingTime}.",
  ],
  et: [
    "Tellimus #{orderNumber} on kinnitatud — köök alustab selle valmistamisega, kui restoran avatakse.",
    "Restoran on praegu suletud, kuid teie tellimus on juba kinnitatud — köök alustab selle valmistamisega pärast avamist.",
    "Restoran on praegu suletud, kuid teie tellimus on juba kinnitatud — köök alustab selle valmistamisega pärast avamist, {openingTime}.",
  ],
  lv: [
    "Pasūtījums #{orderNumber} ir apstiprināts — virtuve sāks to gatavot, tiklīdz restorāns atvērsies.",
    "Restorāns pašlaik ir slēgts, taču jūsu pasūtījums jau ir apstiprināts — virtuve sāks to gatavot pēc atvēršanas.",
    "Restorāns pašlaik ir slēgts, taču jūsu pasūtījums jau ir apstiprināts — virtuve sāks to gatavot pēc atvēršanas, {openingTime}.",
  ],
  lt: [
    "Užsakymas #{orderNumber} patvirtintas — virtuvė jį pradės ruošti, kai restoranas atsidarys.",
    "Restoranas dabar uždarytas, bet jūsų užsakymas jau patvirtintas — virtuvė jį pradės ruošti po atidarymo.",
    "Restoranas dabar uždarytas, bet jūsų užsakymas jau patvirtintas — virtuvė jį pradės ruošti po atidarymo, {openingTime}.",
  ],
  tr: [
    "#{orderNumber} numaralı siparişiniz onaylandı — restoran açılınca mutfak hazırlamaya başlayacak.",
    "Restoran şu anda kapalı, ancak siparişiniz zaten onaylandı — mutfak açılışta hazırlamaya başlayacak.",
    "Restoran şu anda kapalı, ancak siparişiniz zaten onaylandı — mutfak {openingTime} açılışında hazırlamaya başlayacak.",
  ],
  id: [
    "Pesanan #{orderNumber} sudah dikonfirmasi — dapur akan mulai memprosesnya saat restoran buka.",
    "Restoran sedang tutup, tetapi pesanan Anda sudah dikonfirmasi — dapur akan mulai memprosesnya saat mereka buka.",
    "Restoran sedang tutup, tetapi pesanan Anda sudah dikonfirmasi — dapur akan mulai memprosesnya saat buka pada {openingTime}.",
  ],
  vi: [
    "Đơn hàng #{orderNumber} đã được xác nhận — bếp sẽ bắt đầu chế biến khi nhà hàng mở cửa.",
    "Nhà hàng hiện đang đóng cửa, nhưng đơn hàng của bạn đã được xác nhận — bếp sẽ bắt đầu chế biến khi mở cửa.",
    "Nhà hàng hiện đang đóng cửa, nhưng đơn hàng của bạn đã được xác nhận — bếp sẽ bắt đầu chế biến khi mở cửa vào {openingTime}.",
  ],
  th: [
    "ออร์เดอร์ #{orderNumber} ได้รับการยืนยันแล้ว — ครัวจะเริ่มทำอาหารเมื่อร้านเปิด",
    "ขณะนี้ร้านปิดอยู่ แต่ออร์เดอร์ของคุณได้รับการยืนยันแล้ว — ครัวจะเริ่มทำอาหารเมื่อร้านเปิด",
    "ขณะนี้ร้านปิดอยู่ แต่ออร์เดอร์ของคุณได้รับการยืนยันแล้ว — ครัวจะเริ่มทำอาหารเมื่อร้านเปิดใน {openingTime}",
  ],
  ja: [
    "注文 #{orderNumber} は確定しました — レストランの開店後にキッチンが調理を開始します。",
    "レストランは現在閉店中ですが、ご注文はすでに確定しています — 開店後にキッチンが調理を開始します。",
    "レストランは現在閉店中ですが、ご注文はすでに確定しています — {openingTime} の開店後にキッチンが調理を開始します。",
  ],
  ko: [
    "주문 #{orderNumber}이(가) 확인되었으며, 레스토랑이 문을 열면 주방에서 준비를 시작합니다.",
    "레스토랑이 지금은 영업 종료 상태이지만 주문은 이미 확인되었습니다 — 영업을 시작하면 주방에서 준비에 들어갑니다.",
    "레스토랑이 지금은 영업 종료 상태이지만 주문은 이미 확인되었습니다 — {openingTime}에 영업을 시작하면 주방에서 준비에 들어갑니다.",
  ],
  zh: [
    "订单 #{orderNumber} 已确认——餐厅营业后厨房会立即开始备餐。",
    "餐厅目前已打烊，但您的订单已经确认——营业后厨房会立即开始备餐。",
    "餐厅目前已打烊，但您的订单已经确认——{openingTime} 营业后厨房会立即开始备餐。",
  ],
  ar: [
    "تم تأكيد الطلب #{orderNumber} — وسيبدأ المطبخ في تحضيره عند فتح المطعم.",
    "المطعم مغلق حالياً، لكن طلبك مؤكَّد بالفعل — وسيبدأ المطبخ في تحضيره عند الفتح.",
    "المطعم مغلق حالياً، لكن طلبك مؤكَّد بالفعل — وسيبدأ المطبخ في تحضيره عند الفتح في {openingTime}.",
  ],
  he: [
    "הזמנה #{orderNumber} אושרה — המטבח יתחיל בהכנה עם פתיחת המסעדה.",
    "המסעדה סגורה כרגע, אך ההזמנה שלך כבר אושרה — המטבח יתחיל בהכנה עם הפתיחה.",
    "המסעדה סגורה כרגע, אך ההזמנה שלך כבר אושרה — המטבח יתחיל בהכנה עם הפתיחה ב־{openingTime}.",
  ],
  hi: [
    "ऑर्डर #{orderNumber} कन्फ़र्म हो गया है — रेस्तराँ खुलते ही किचन इसे बनाना शुरू कर देगा।",
    "रेस्तराँ अभी बंद है, लेकिन आपका ऑर्डर कन्फ़र्म हो चुका है — खुलते ही किचन इसे बनाना शुरू कर देगा।",
    "रेस्तराँ अभी बंद है, लेकिन आपका ऑर्डर कन्फ़र्म हो चुका है — {openingTime} को खुलते ही किचन इसे बनाना शुरू कर देगा।",
  ],
};

// Round-1 repairs the audit caught.
const REPAIRS: Record<string, Record<string, string>> = {
  ja: {
    // 予約 is THIS platform's table-reservation word (and this very email can
    // render a テーブル予約 block); 下に表示の時間 is not a valid attributive.
    "email.orderConfirmed.bodyAcceptedLater":
      "注文 #{orderNumber} は確定しました — 下記の時間にご用意します。",
  },
  sk: {
    // Was "č. {orderNumber}" while sk's own body lines use "#{orderNumber}".
    "email.orderConfirmed.previewAccepted": "Objednávka #{orderNumber} potvrdená reštauráciou",
  },
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
  "email.orderConfirmed.bodyAcceptedClosed",
  "email.orderConfirmed.closedNoteAccepted",
  "email.orderConfirmed.closedNoteAcceptedWithTime",
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
  for (const [k, v] of Object.entries(REPAIRS[loc] ?? {})) setDeep(data, k, v);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
if (missing.length) {
  console.error(`✗ NO TRANSLATION for: ${missing.join(", ")} — parity would break. Add them and re-run.`);
  process.exit(1);
}
console.log(`✓ closed-note accepted keys (+2 repairs) added to ${n} locale(s).`);
