/**
 * One-shot i18n patch: add the marketplace-channel picker keys to
 * admin.promoStepRestrictions across ALL 38 locales (Luigi 2026-06-09,
 * "Offer on Marketplace" toggle). channelTitle keeps the brand term
 * "Marketplace" everywhere (like Menu/Status/Banner per the i18n convention);
 * the other four keys are translated per locale.
 *
 *   npx tsx scripts/i18n-add-channel.ts
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");

// channelSubtitle, channelWebsiteLabel, channelMarketplaceLabel, channelBothLabel
const T: Record<string, [string, string, string, string]> = {
  en: ["Marketplace customers are a separate audience — choose where this offer runs.", "Your website only", "Marketplace only", "Both"],
  fr: ["Les clients du Marketplace sont un public distinct — choisissez où cette offre s'applique.", "Votre site web uniquement", "Marketplace uniquement", "Les deux"],
  es: ["Los clientes del Marketplace son un público distinto: elige dónde se aplica esta oferta.", "Solo tu sitio web", "Solo Marketplace", "Ambos"],
  it: ["I clienti del Marketplace sono un pubblico distinto: scegli dove si applica questa offerta.", "Solo il tuo sito web", "Solo Marketplace", "Entrambi"],
  pt: ["Os clientes do Marketplace são um público distinto — escolha onde esta oferta se aplica.", "Apenas o seu site", "Apenas Marketplace", "Ambos"],
  "pt-BR": ["Os clientes do Marketplace são um público à parte — escolha onde esta oferta se aplica.", "Apenas seu site", "Apenas Marketplace", "Ambos"],
  de: ["Marketplace-Kunden sind eine eigene Zielgruppe – wählen Sie, wo dieses Angebot gilt.", "Nur Ihre Website", "Nur Marketplace", "Beide"],
  nl: ["Marketplace-klanten zijn een apart publiek — kies waar deze aanbieding geldt.", "Alleen uw website", "Alleen Marketplace", "Beide"],
  ro: ["Clienții Marketplace sunt un public separat — alege unde se aplică această ofertă.", "Doar site-ul dvs.", "Doar Marketplace", "Ambele"],
  sv: ["Marketplace-kunder är en egen målgrupp – välj var det här erbjudandet gäller.", "Endast din webbplats", "Endast Marketplace", "Båda"],
  da: ["Marketplace-kunder er et separat publikum – vælg, hvor dette tilbud gælder.", "Kun dit website", "Kun Marketplace", "Begge"],
  nb: ["Marketplace-kunder er et eget publikum – velg hvor dette tilbudet gjelder.", "Bare nettstedet ditt", "Bare Marketplace", "Begge"],
  fi: ["Marketplace-asiakkaat ovat eri yleisö — valitse, missä tämä tarjous on voimassa.", "Vain verkkosivustosi", "Vain Marketplace", "Molemmat"],
  pl: ["Klienci Marketplace to osobna grupa odbiorców — wybierz, gdzie obowiązuje ta oferta.", "Tylko Twoja witryna", "Tylko Marketplace", "Oba"],
  cs: ["Zákazníci Marketplace jsou samostatné publikum — vyberte, kde se tato nabídka uplatní.", "Pouze váš web", "Pouze Marketplace", "Obojí"],
  sk: ["Zákazníci Marketplace sú samostatné publikum — vyberte, kde táto ponuka platí.", "Iba váš web", "Iba Marketplace", "Oboje"],
  hu: ["A Marketplace ügyfelei külön közönség — válassza ki, hol érvényes ez az ajánlat.", "Csak a webhelye", "Csak Marketplace", "Mindkettő"],
  el: ["Οι πελάτες του Marketplace είναι ξεχωριστό κοινό — επιλέξτε πού ισχύει αυτή η προσφορά.", "Μόνο ο ιστότοπός σας", "Μόνο Marketplace", "Και τα δύο"],
  bg: ["Клиентите на Marketplace са отделна аудитория — изберете къде да се прилага тази оферта.", "Само вашия уебсайт", "Само Marketplace", "И двете"],
  hr: ["Kupci Marketplacea zasebna su publika — odaberite gdje se ova ponuda primjenjuje.", "Samo vaša web stranica", "Samo Marketplace", "Oboje"],
  sr: ["Купци Marketplace-а су посебна публика — изаберите где важи ова понуда.", "Само ваш сајт", "Само Marketplace", "Оба"],
  sl: ["Stranke Marketplacea so ločeno občinstvo — izberite, kje velja ta ponudba.", "Samo vaše spletno mesto", "Samo Marketplace", "Oboje"],
  et: ["Marketplace'i kliendid on eraldi sihtrühm — valige, kus see pakkumine kehtib.", "Ainult teie veebisait", "Ainult Marketplace", "Mõlemad"],
  lv: ["Marketplace klienti ir atsevišķa auditorija — izvēlieties, kur šis piedāvājums ir spēkā.", "Tikai jūsu vietne", "Tikai Marketplace", "Abi"],
  lt: ["Marketplace klientai yra atskira auditorija — pasirinkite, kur galioja šis pasiūlymas.", "Tik jūsų svetainė", "Tik Marketplace", "Abu"],
  tr: ["Marketplace müşterileri ayrı bir kitledir — bu teklifin nerede geçerli olacağını seçin.", "Yalnızca web siteniz", "Yalnızca Marketplace", "Her ikisi"],
  ru: ["Клиенты Marketplace — отдельная аудитория. Выберите, где действует это предложение.", "Только ваш сайт", "Только Marketplace", "Оба"],
  uk: ["Клієнти Marketplace — окрема аудиторія. Виберіть, де діє ця пропозиція.", "Лише ваш сайт", "Лише Marketplace", "Обидва"],
  ca: ["Els clients del Marketplace són un públic diferent: tria on s'aplica aquesta oferta.", "Només el teu lloc web", "Només Marketplace", "Tots dos"],
  id: ["Pelanggan Marketplace adalah audiens terpisah — pilih di mana penawaran ini berlaku.", "Hanya situs web Anda", "Hanya Marketplace", "Keduanya"],
  vi: ["Khách hàng Marketplace là nhóm đối tượng riêng — chọn nơi áp dụng ưu đãi này.", "Chỉ trang web của bạn", "Chỉ Marketplace", "Cả hai"],
  th: ["ลูกค้า Marketplace เป็นกลุ่มผู้ชมแยกต่างหาก — เลือกว่าข้อเสนอนี้จะใช้ที่ใด", "เฉพาะเว็บไซต์ของคุณ", "เฉพาะ Marketplace", "ทั้งสอง"],
  zh: ["Marketplace 客户是不同的受众——请选择此优惠的适用范围。", "仅限您的网站", "仅限 Marketplace", "两者"],
  ja: ["マーケットプレイスの顧客は別の客層です。この特典を適用する場所を選んでください。", "自社サイトのみ", "マーケットプレイスのみ", "両方"],
  ko: ["마켓플레이스 고객은 별도의 고객층입니다 — 이 혜택을 적용할 위치를 선택하세요.", "내 웹사이트만", "마켓플레이스만", "둘 다"],
  ar: ["عملاء Marketplace جمهور منفصل — اختر أين يسري هذا العرض.", "موقعك فقط", "Marketplace فقط", "كلاهما"],
  he: ["לקוחות ה-Marketplace הם קהל נפרד — בחר היכן ההצעה הזו חלה.", "האתר שלך בלבד", "Marketplace בלבד", "שניהם"],
  hi: ["Marketplace के ग्राहक एक अलग दर्शक वर्ग हैं — चुनें कि यह ऑफ़र कहाँ लागू हो।", "केवल आपकी वेबसाइट", "केवल Marketplace", "दोनों"],
};

function setDeep(obj: Record<string, unknown>, dottedKey: string, value: string): void {
  const parts = dottedKey.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof cur[p] !== "object" || cur[p] === null || Array.isArray(cur[p])) cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));
let total = 0;
for (const f of files) {
  const loc = f.replace(".json", "");
  const tr = T[loc] ?? T.en; // fall back to en only if a locale somehow lacks a map entry
  const path = join(DIR, f);
  const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  setDeep(data, "admin.promoStepRestrictions.channelTitle", "Marketplace");
  setDeep(data, "admin.promoStepRestrictions.channelSubtitle", tr[0]);
  setDeep(data, "admin.promoStepRestrictions.channelWebsiteLabel", tr[1]);
  setDeep(data, "admin.promoStepRestrictions.channelMarketplaceLabel", tr[2]);
  setDeep(data, "admin.promoStepRestrictions.channelBothLabel", tr[3]);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  total++;
}
console.log(`✓ channel picker keys added to ${total} locale(s).`);
