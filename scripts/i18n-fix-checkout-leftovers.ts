/** i18n: remaining hardcoded checkout/menu-card strings × 38 locales
 *  (Luigi 2026-06-11 — "Pick a date", "Sub-Total", "Tax", "You unlocked…",
 *  "FREE", "from $X" were English regardless of chosen language).
 *    checkout.{free,taxWithRate,unlockedPromoOne,unlockedPromoMany,
 *              pickADateFirst,closedThisDay}
 *    ordering.fromPrice
 *    npx tsx scripts/i18n-fix-checkout-leftovers.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");

const KEYS: Record<string, Record<string, string>> = {
  "checkout.free": {
    en: "Free", fr: "Gratuit", es: "Gratis", it: "Gratis", pt: "Grátis", "pt-BR": "Grátis",
    de: "Gratis", nl: "Gratis", ro: "Gratuit", sv: "Gratis", da: "Gratis", nb: "Gratis",
    fi: "Ilmainen", pl: "Za darmo", cs: "Zdarma", sk: "Zadarmo", hu: "Ingyenes", el: "Δωρεάν",
    bg: "Безплатно", hr: "Besplatno", sr: "Бесплатно", sl: "Brezplačno", et: "Tasuta", lv: "Bezmaksas",
    lt: "Nemokamai", tr: "Ücretsiz", ru: "Бесплатно", uk: "Безкоштовно", ca: "Gratis", id: "Gratis",
    vi: "Miễn phí", th: "ฟรี", zh: "免费", ja: "無料", ko: "무료", ar: "مجانًا", he: "חינם", hi: "मुफ़्त",
  },
  "checkout.taxWithRate": {
    en: "Tax ({rate}%)", fr: "TVA ({rate} %)", es: "Impuesto ({rate}%)", it: "Tasse ({rate}%)", pt: "Imposto ({rate}%)", "pt-BR": "Imposto ({rate}%)",
    de: "Steuer ({rate}%)", nl: "Btw ({rate}%)", ro: "Taxă ({rate}%)", sv: "Moms ({rate}%)", da: "Moms ({rate}%)", nb: "MVA ({rate}%)",
    fi: "Vero ({rate} %)", pl: "Podatek ({rate}%)", cs: "Daň ({rate}%)", sk: "Daň ({rate}%)", hu: "Adó ({rate}%)", el: "Φόρος ({rate}%)",
    bg: "Данък ({rate}%)", hr: "Porez ({rate}%)", sr: "Порез ({rate}%)", sl: "Davek ({rate}%)", et: "Maks ({rate}%)", lv: "Nodoklis ({rate}%)",
    lt: "Mokestis ({rate}%)", tr: "Vergi (%{rate})", ru: "Налог ({rate}%)", uk: "Податок ({rate}%)", ca: "Impost ({rate}%)", id: "Pajak ({rate}%)",
    vi: "Thuế ({rate}%)", th: "ภาษี ({rate}%)", zh: "税费（{rate}%）", ja: "税（{rate}%）", ko: "세금 ({rate}%)", ar: "ضريبة ({rate}%)", he: "מס ({rate}%)", hi: "कर ({rate}%)",
  },
  "checkout.unlockedPromoOne": {
    en: "You unlocked a promo!", fr: "Vous avez débloqué une promo !", es: "¡Has desbloqueado una promo!", it: "Hai sbloccato una promo!", pt: "Desbloqueou uma promoção!", "pt-BR": "Você desbloqueou uma promoção!",
    de: "Du hast eine Promo freigeschaltet!", nl: "Je hebt een promo ontgrendeld!", ro: "Ai deblocat o promoție!", sv: "Du har låst upp en kampanj!", da: "Du har låst op for en kampagne!", nb: "Du har låst opp en kampanje!",
    fi: "Avasit tarjouksen!", pl: "Odblokowano promocję!", cs: "Odemkli jste promo akci!", sk: "Odomkli ste promo akciu!", hu: "Feloldottál egy promóciót!", el: "Ξεκλειδώσατε μια προσφορά!",
    bg: "Отключихте промоция!", hr: "Otključali ste promociju!", sr: "Откључали сте промоцију!", sl: "Odklenili ste promocijo!", et: "Avasid sooduspakkumise!", lv: "Atbloķēji akciju!",
    lt: "Atrakinote akciją!", tr: "Bir promosyon açtınız!", ru: "Вы открыли промоакцию!", uk: "Ви відкрили промоакцію!", ca: "Has desbloquejat una promo!", id: "Anda membuka promo!",
    vi: "Bạn đã mở khóa ưu đãi!", th: "คุณปลดล็อกโปรโมชั่นแล้ว!", zh: "您解锁了一个优惠！", ja: "プロモを獲得しました！", ko: "프로모션을 잠금 해제했습니다!", ar: "لقد فتحت عرضًا ترويجيًا!", he: "פתחת מבצע!", hi: "आपने एक प्रोमो अनलॉक किया!",
  },
  "checkout.unlockedPromoMany": {
    en: "You unlocked promos!", fr: "Vous avez débloqué des promos !", es: "¡Has desbloqueado promos!", it: "Hai sbloccato delle promo!", pt: "Desbloqueou promoções!", "pt-BR": "Você desbloqueou promoções!",
    de: "Du hast Promos freigeschaltet!", nl: "Je hebt promo's ontgrendeld!", ro: "Ai deblocat promoții!", sv: "Du har låst upp kampanjer!", da: "Du har låst op for kampagner!", nb: "Du har låst opp kampanjer!",
    fi: "Avasit tarjouksia!", pl: "Odblokowano promocje!", cs: "Odemkli jste promo akce!", sk: "Odomkli ste promo akcie!", hu: "Feloldottál promóciókat!", el: "Ξεκλειδώσατε προσφορές!",
    bg: "Отключихте промоции!", hr: "Otključali ste promocije!", sr: "Откључали сте промоције!", sl: "Odklenili ste promocije!", et: "Avasid sooduspakkumisi!", lv: "Atbloķēji akcijas!",
    lt: "Atrakinote akcijas!", tr: "Promosyonlar açtınız!", ru: "Вы открыли промоакции!", uk: "Ви відкрили промоакції!", ca: "Has desbloquejat promos!", id: "Anda membuka promo!",
    vi: "Bạn đã mở khóa các ưu đãi!", th: "คุณปลดล็อกโปรโมชั่นแล้ว!", zh: "您解锁了多个优惠！", ja: "プロモを獲得しました！", ko: "프로모션을 잠금 해제했습니다!", ar: "لقد فتحت عروضًا ترويجية!", he: "פתחת מבצעים!", hi: "आपने प्रोमो अनलॉक किए!",
  },
  "checkout.pickADateFirst": {
    en: "Pick a date first", fr: "Choisissez d'abord une date", es: "Primero elige una fecha", it: "Scegli prima una data", pt: "Escolha primeiro uma data", "pt-BR": "Escolha primeiro uma data",
    de: "Zuerst ein Datum wählen", nl: "Kies eerst een datum", ro: "Alege mai întâi o dată", sv: "Välj ett datum först", da: "Vælg en dato først", nb: "Velg en dato først",
    fi: "Valitse ensin päivä", pl: "Najpierw wybierz datę", cs: "Nejprve vyberte datum", sk: "Najprv vyberte dátum", hu: "Először válassz dátumot", el: "Επιλέξτε πρώτα ημερομηνία",
    bg: "Първо изберете дата", hr: "Prvo odaberite datum", sr: "Прво изаберите датум", sl: "Najprej izberite datum", et: "Vali esmalt kuupäev", lv: "Vispirms izvēlieties datumu",
    lt: "Pirma pasirinkite datą", tr: "Önce bir tarih seçin", ru: "Сначала выберите дату", uk: "Спершу виберіть дату", ca: "Tria primer una data", id: "Pilih tanggal dulu",
    vi: "Chọn ngày trước", th: "เลือกวันที่ก่อน", zh: "请先选择日期", ja: "先に日付を選択", ko: "먼저 날짜를 선택하세요", ar: "اختر تاريخًا أولاً", he: "בחר תאריך תחילה", hi: "पहले तारीख़ चुनें",
  },
  "checkout.closedThisDay": {
    en: "Closed this day", fr: "Fermé ce jour", es: "Cerrado este día", it: "Chiuso questo giorno", pt: "Fechado neste dia", "pt-BR": "Fechado neste dia",
    de: "An diesem Tag geschlossen", nl: "Deze dag gesloten", ro: "Închis în această zi", sv: "Stängt denna dag", da: "Lukket denne dag", nb: "Stengt denne dagen",
    fi: "Suljettu tänä päivänä", pl: "Zamknięte tego dnia", cs: "Tento den zavřeno", sk: "Tento deň zatvorené", hu: "Ezen a napon zárva", el: "Κλειστά αυτή την ημέρα",
    bg: "Затворено в този ден", hr: "Zatvoreno na ovaj dan", sr: "Затворено овог дана", sl: "Ta dan zaprto", et: "Sel päeval suletud", lv: "Šajā dienā slēgts",
    lt: "Šią dieną uždaryta", tr: "Bu gün kapalı", ru: "В этот день закрыто", uk: "У цей день зачинено", ca: "Tancat aquest dia", id: "Tutup pada hari ini",
    vi: "Đóng cửa ngày này", th: "วันนี้ปิดทำการ", zh: "当天休息", ja: "この日は休業", ko: "이 날은 휴무", ar: "مغلق في هذا اليوم", he: "סגור ביום זה", hi: "इस दिन बंद",
  },
  "ordering.fromPrice": {
    en: "from {price}", fr: "à partir de {price}", es: "desde {price}", it: "da {price}", pt: "a partir de {price}", "pt-BR": "a partir de {price}",
    de: "ab {price}", nl: "vanaf {price}", ro: "de la {price}", sv: "från {price}", da: "fra {price}", nb: "fra {price}",
    fi: "alkaen {price}", pl: "od {price}", cs: "od {price}", sk: "od {price}", hu: "{price}-tól", el: "από {price}",
    bg: "от {price}", hr: "od {price}", sr: "од {price}", sl: "od {price}", et: "alates {price}", lv: "no {price}",
    lt: "nuo {price}", tr: "{price} başlangıç", ru: "от {price}", uk: "від {price}", ca: "des de {price}", id: "mulai {price}",
    vi: "từ {price}", th: "เริ่มต้น {price}", zh: "{price} 起", ja: "{price}〜", ko: "{price}부터", ar: "من {price}", he: "החל מ-{price}", hi: "{price} से",
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

let n = 0;
for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  const loc = f.replace(".json", "");
  const path = join(DIR, f);
  const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  for (const [k, byLoc] of Object.entries(KEYS)) setDeep(data, k, byLoc[loc] ?? byLoc.en);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
console.log(`✓ checkout-leftover strings (${Object.keys(KEYS).length} keys) added to ${n} locale(s).`);
