/** i18n: kill the last hardcoded "ASAP"/"Scheduled for"/"Delivery to" strings
 *  (reseller report cmq3s5xjl — Italian must read "Appena possibile").
 *  New keys × 38:
 *    checkout.timeScheduledFor   "Scheduled for {when}"
 *    checkout.timeCateringNotice "Catering — choose a time at least {hours}h ahead"
 *    checkout.deliveryTo         "Delivery to {address}"
 *    checkout.deliveryAddAddress "Delivery — add address"
 *    admin.receiptRenderer.asap  ← copied from each locale's receipt.scheduling.asap
 *  Plus Italian harmonisation: every customer-facing "ASAP" phrase uses
 *  "Appena possibile" (switchToASAP, cateringOnly).
 *    npx tsx scripts/i18n-fix-asap-everywhere.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");

const KEYS: Record<string, Record<string, string>> = {
  "checkout.timeScheduledFor": {
    en: "Scheduled for {when}", fr: "Programmé pour {when}", es: "Programado para {when}", it: "Programmato per {when}", pt: "Agendado para {when}", "pt-BR": "Agendado para {when}",
    de: "Geplant für {when}", nl: "Gepland voor {when}", ro: "Programat pentru {when}", sv: "Schemalagd till {when}", da: "Planlagt til {when}", nb: "Planlagt til {when}",
    fi: "Ajastettu: {when}", pl: "Zaplanowano na {when}", cs: "Naplánováno na {when}", sk: "Naplánované na {when}", hu: "Ütemezve: {when}", el: "Προγραμματισμένο για {when}",
    bg: "Насрочено за {when}", hr: "Zakazano za {when}", sr: "Заказано за {when}", sl: "Načrtovano za {when}", et: "Ajastatud: {when}", lv: "Ieplānots: {when}",
    lt: "Suplanuota: {when}", tr: "{when} için planlandı", ru: "Запланировано на {when}", uk: "Заплановано на {when}", ca: "Programat per a {when}", id: "Dijadwalkan untuk {when}",
    vi: "Đã hẹn lúc {when}", th: "กำหนดเวลา {when}", zh: "预定时间 {when}", ja: "{when} に予約", ko: "{when} 예약됨", ar: "مجدول في {when}", he: "מתוזמן ל-{when}", hi: "{when} के लिए निर्धारित",
  },
  "checkout.timeCateringNotice": {
    en: "Catering — choose a time at least {hours}h ahead", fr: "Traiteur — choisissez un horaire au moins {hours} h à l'avance", es: "Catering — elige una hora con al menos {hours}h de antelación", it: "Catering — scegli un orario con almeno {hours}h di anticipo", pt: "Catering — escolha uma hora com pelo menos {hours}h de antecedência", "pt-BR": "Catering — escolha um horário com pelo menos {hours}h de antecedência",
    de: "Catering — wähle eine Zeit mindestens {hours} Std. im Voraus", nl: "Catering — kies een tijd minstens {hours} u vooruit", ro: "Catering — alege o oră cu cel puțin {hours}h înainte", sv: "Catering — välj en tid minst {hours} h i förväg", da: "Catering — vælg et tidspunkt mindst {hours} t. forud", nb: "Catering — velg et tidspunkt minst {hours} t i forveien",
    fi: "Catering — valitse aika vähintään {hours} h etukäteen", pl: "Catering — wybierz godzinę z wyprzedzeniem co najmniej {hours} h", cs: "Catering — zvolte čas alespoň {hours} h předem", sk: "Catering — zvoľte čas aspoň {hours} h vopred", hu: "Catering — válassz időpontot legalább {hours} órával előre", el: "Catering — επιλέξτε ώρα τουλάχιστον {hours} ώρες νωρίτερα",
    bg: "Кетъринг — изберете час поне {hours} ч. предварително", hr: "Catering — odaberite vrijeme barem {hours} h unaprijed", sr: "Кетеринг — изаберите време бар {hours} ч унапред", sl: "Catering — izberite čas vsaj {hours} h vnaprej", et: "Catering — vali aeg vähemalt {hours} h ette", lv: "Ēdināšana — izvēlieties laiku vismaz {hours} h iepriekš",
    lt: "Maitinimas — pasirinkite laiką bent prieš {hours} val.", tr: "Catering — en az {hours} saat önceden bir saat seçin", ru: "Кейтеринг — выберите время минимум за {hours} ч.", uk: "Кейтеринг — оберіть час щонайменше за {hours} год", ca: "Càtering — tria una hora amb almenys {hours}h d'antelació", id: "Katering — pilih waktu minimal {hours} jam sebelumnya",
    vi: "Tiệc đặt — chọn thời gian trước ít nhất {hours} giờ", th: "จัดเลี้ยง — เลือกเวลาล่วงหน้าอย่างน้อย {hours} ชม.", zh: "宴会订餐——请至少提前 {hours} 小时选择时间", ja: "ケータリング — {hours}時間以上先の時間を選択してください", ko: "케이터링 — 최소 {hours}시간 이후 시간을 선택하세요", ar: "تموين — اختر وقتًا قبل {hours} ساعة على الأقل", he: "קייטרינג — בחר זמן לפחות {hours} שעות מראש", hi: "कैटरिंग — कम से कम {hours} घंटे पहले का समय चुनें",
  },
  "checkout.deliveryTo": {
    en: "Delivery to {address}", fr: "Livraison à {address}", es: "Entrega en {address}", it: "Consegna a {address}", pt: "Entrega em {address}", "pt-BR": "Entrega em {address}",
    de: "Lieferung an {address}", nl: "Bezorging naar {address}", ro: "Livrare la {address}", sv: "Leverans till {address}", da: "Levering til {address}", nb: "Levering til {address}",
    fi: "Toimitus osoitteeseen {address}", pl: "Dostawa do {address}", cs: "Rozvoz na {address}", sk: "Donáška na {address}", hu: "Kiszállítás ide: {address}", el: "Παράδοση σε {address}",
    bg: "Доставка до {address}", hr: "Dostava na {address}", sr: "Достава на {address}", sl: "Dostava na {address}", et: "Kohaletoimetamine: {address}", lv: "Piegāde uz {address}",
    lt: "Pristatymas adresu {address}", tr: "{address} adresine teslimat", ru: "Доставка по адресу {address}", uk: "Доставка за адресою {address}", ca: "Lliurament a {address}", id: "Antar ke {address}",
    vi: "Giao đến {address}", th: "จัดส่งไปที่ {address}", zh: "配送至 {address}", ja: "{address} へ配達", ko: "{address}(으)로 배달", ar: "توصيل إلى {address}", he: "משלוח אל {address}", hi: "{address} पर डिलीवरी",
  },
  "checkout.deliveryAddAddress": {
    en: "Delivery — add address", fr: "Livraison — ajoutez l'adresse", es: "Entrega — añade la dirección", it: "Consegna — aggiungi l'indirizzo", pt: "Entrega — adicione a morada", "pt-BR": "Entrega — adicione o endereço",
    de: "Lieferung — Adresse hinzufügen", nl: "Bezorging — voeg adres toe", ro: "Livrare — adaugă adresa", sv: "Leverans — lägg till adress", da: "Levering — tilføj adresse", nb: "Levering — legg til adresse",
    fi: "Toimitus — lisää osoite", pl: "Dostawa — dodaj adres", cs: "Rozvoz — přidejte adresu", sk: "Donáška — pridajte adresu", hu: "Kiszállítás — add meg a címet", el: "Παράδοση — προσθέστε διεύθυνση",
    bg: "Доставка — добавете адрес", hr: "Dostava — dodajte adresu", sr: "Достава — додајте адресу", sl: "Dostava — dodajte naslov", et: "Kohaletoimetamine — lisa aadress", lv: "Piegāde — pievienojiet adresi",
    lt: "Pristatymas — pridėkite adresą", tr: "Teslimat — adres ekleyin", ru: "Доставка — добавьте адрес", uk: "Доставка — додайте адресу", ca: "Lliurament — afegeix l'adreça", id: "Pengantaran — tambahkan alamat",
    vi: "Giao hàng — thêm địa chỉ", th: "จัดส่ง — เพิ่มที่อยู่", zh: "配送——请添加地址", ja: "配達 — 住所を追加", ko: "배달 — 주소를 추가하세요", ar: "توصيل — أضف العنوان", he: "משלוח — הוסף כתובת", hi: "डिलीवरी — पता जोड़ें",
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

function getDeep(obj: any, key: string): unknown {
  return key.split(".").reduce((a, k) => a?.[k], obj);
}

let n = 0;
for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  const loc = f.replace(".json", "");
  const path = join(DIR, f);
  const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  for (const [k, byLoc] of Object.entries(KEYS)) setDeep(data, k, byLoc[loc] ?? byLoc.en);
  // Receipt-preview ASAP label: mirror the locale's existing printed-receipt
  // phrase so the admin preview matches what actually prints.
  const receiptAsap = (getDeep(data, "receipt.scheduling.asap") as string) || "ASAP";
  setDeep(data, "admin.receiptRenderer.asap", receiptAsap);
  // Italian harmonisation — every customer-facing ASAP phrase says
  // "Appena possibile" (Luigi/Fabrizio 2026-06-11).
  if (loc === "it") {
    setDeep(data, "checkout.switchToASAP", "Torna ad Appena possibile");
    const co = getDeep(data, "checkout.cateringOnly") as string | undefined;
    if (co) setDeep(data, "checkout.cateringOnly", co.replace(/[Pp]rima possibile/g, "Appena possibile").replace(/L'opzione Appena/g, "L'opzione Appena"));
  }
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
console.log(`✓ ASAP-everywhere strings fixed in ${n} locale(s).`);
