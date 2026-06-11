/** i18n: flyer contact + extra-text fields × 38 locales.
 *   admin.marketingStudio.{phoneLabel,phonePlaceholder,websiteLabel,
 *   websitePlaceholder,footerTextLabel,footerTextPlaceholder}
 *   npx tsx scripts/i18n-add-flyer-contact.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");

const KEYS: Record<string, Record<string, string>> = {
  "admin.marketingStudio.phoneLabel": {
    en: "Phone", fr: "Téléphone", es: "Teléfono", it: "Telefono", pt: "Telefone", "pt-BR": "Telefone",
    de: "Telefon", nl: "Telefoon", ro: "Telefon", sv: "Telefon", da: "Telefon", nb: "Telefon",
    fi: "Puhelin", pl: "Telefon", cs: "Telefon", sk: "Telefón", hu: "Telefon", el: "Τηλέφωνο",
    bg: "Телефон", hr: "Telefon", sr: "Телефон", sl: "Telefon", et: "Telefon", lv: "Tālrunis",
    lt: "Telefonas", tr: "Telefon", ru: "Телефон", uk: "Телефон", ca: "Telèfon", id: "Telepon",
    vi: "Điện thoại", th: "โทรศัพท์", zh: "电话", ja: "電話", ko: "전화", ar: "الهاتف", he: "טלפון", hi: "फ़ोन",
  },
  "admin.marketingStudio.phonePlaceholder": {
    en: "Your phone number", fr: "Votre numéro de téléphone", es: "Tu número de teléfono", it: "Il tuo numero di telefono", pt: "O seu telefone", "pt-BR": "Seu telefone",
    de: "Deine Telefonnummer", nl: "Je telefoonnummer", ro: "Numărul tău de telefon", sv: "Ditt telefonnummer", da: "Dit telefonnummer", nb: "Telefonnummeret ditt",
    fi: "Puhelinnumerosi", pl: "Twój numer telefonu", cs: "Vaše telefonní číslo", sk: "Vaše telefónne číslo", hu: "Telefonszámod", el: "Το τηλέφωνό σας",
    bg: "Вашият телефонен номер", hr: "Vaš telefonski broj", sr: "Ваш број телефона", sl: "Vaša telefonska številka", et: "Sinu telefoninumber", lv: "Jūsu tālruņa numurs",
    lt: "Jūsų telefono numeris", tr: "Telefon numaranız", ru: "Ваш номер телефона", uk: "Ваш номер телефону", ca: "El teu número de telèfon", id: "Nomor telepon Anda",
    vi: "Số điện thoại của bạn", th: "หมายเลขโทรศัพท์ของคุณ", zh: "您的电话号码", ja: "電話番号", ko: "전화번호", ar: "رقم هاتفك", he: "מספר הטלפון שלך", hi: "आपका फ़ोन नंबर",
  },
  "admin.marketingStudio.websiteLabel": {
    en: "Website", fr: "Site web", es: "Sitio web", it: "Sito web", pt: "Site", "pt-BR": "Site",
    de: "Website", nl: "Website", ro: "Site web", sv: "Webbplats", da: "Websted", nb: "Nettsted",
    fi: "Verkkosivusto", pl: "Strona internetowa", cs: "Web", sk: "Webová stránka", hu: "Webhely", el: "Ιστότοπος",
    bg: "Уебсайт", hr: "Web-stranica", sr: "Веб-сајт", sl: "Spletno mesto", et: "Veebisait", lv: "Vietne",
    lt: "Svetainė", tr: "Web sitesi", ru: "Веб-сайт", uk: "Вебсайт", ca: "Lloc web", id: "Situs web",
    vi: "Trang web", th: "เว็บไซต์", zh: "网站", ja: "ウェブサイト", ko: "웹사이트", ar: "الموقع الإلكتروني", he: "אתר אינטרנט", hi: "वेबसाइट",
  },
  "admin.marketingStudio.websitePlaceholder": {
    en: "Your website", fr: "Votre site web", es: "Tu sitio web", it: "Il tuo sito web", pt: "O seu site", "pt-BR": "Seu site",
    de: "Deine Website", nl: "Je website", ro: "Site-ul tău web", sv: "Din webbplats", da: "Dit websted", nb: "Nettstedet ditt",
    fi: "Verkkosivustosi", pl: "Twoja strona internetowa", cs: "Váš web", sk: "Vaša webová stránka", hu: "Webhelyed", el: "Ο ιστότοπός σας",
    bg: "Вашият уебсайт", hr: "Vaša web-stranica", sr: "Ваш веб-сајт", sl: "Vaše spletno mesto", et: "Sinu veebisait", lv: "Jūsu vietne",
    lt: "Jūsų svetainė", tr: "Web siteniz", ru: "Ваш веб-сайт", uk: "Ваш вебсайт", ca: "El teu lloc web", id: "Situs web Anda",
    vi: "Trang web của bạn", th: "เว็บไซต์ของคุณ", zh: "您的网站", ja: "ウェブサイト", ko: "웹사이트", ar: "موقعك الإلكتروني", he: "האתר שלך", hi: "आपकी वेबसाइट",
  },
  "admin.marketingStudio.footerTextLabel": {
    en: "Extra text (under QR)", fr: "Texte supplémentaire (sous le QR)", es: "Texto adicional (debajo del QR)", it: "Testo aggiuntivo (sotto il QR)", pt: "Texto extra (abaixo do QR)", "pt-BR": "Texto extra (abaixo do QR)",
    de: "Zusätzlicher Text (unter dem QR)", nl: "Extra tekst (onder QR)", ro: "Text suplimentar (sub QR)", sv: "Extra text (under QR)", da: "Ekstra tekst (under QR)", nb: "Ekstra tekst (under QR)",
    fi: "Lisäteksti (QR:n alla)", pl: "Dodatkowy tekst (pod QR)", cs: "Další text (pod QR)", sk: "Ďalší text (pod QR)", hu: "További szöveg (a QR alatt)", el: "Επιπλέον κείμενο (κάτω από το QR)",
    bg: "Допълнителен текст (под QR)", hr: "Dodatni tekst (ispod QR-a)", sr: "Додатни текст (испод QR-а)", sl: "Dodatno besedilo (pod QR)", et: "Lisatekst (QR-koodi all)", lv: "Papildu teksts (zem QR)",
    lt: "Papildomas tekstas (po QR)", tr: "Ek metin (QR'ın altında)", ru: "Дополнительный текст (под QR)", uk: "Додатковий текст (під QR)", ca: "Text addicional (sota el QR)", id: "Teks tambahan (di bawah QR)",
    vi: "Văn bản thêm (dưới mã QR)", th: "ข้อความเพิ่มเติม (ใต้ QR)", zh: "附加文字（二维码下方）", ja: "追加テキスト（QRの下）", ko: "추가 텍스트 (QR 아래)", ar: "نص إضافي (أسفل رمز QR)", he: "טקסט נוסף (מתחת ל-QR)", hi: "अतिरिक्त टेक्स्ट (QR के नीचे)",
  },
  "admin.marketingStudio.footerTextPlaceholder": {
    en: "Optional extra line", fr: "Ligne supplémentaire (facultatif)", es: "Línea adicional (opcional)", it: "Riga aggiuntiva (facoltativa)", pt: "Linha extra (opcional)", "pt-BR": "Linha extra (opcional)",
    de: "Optionale Zusatzzeile", nl: "Optionele extra regel", ro: "Rând suplimentar (opțional)", sv: "Valfri extra rad", da: "Valgfri ekstra linje", nb: "Valgfri ekstra linje",
    fi: "Valinnainen lisärivi", pl: "Opcjonalny dodatkowy wiersz", cs: "Volitelný další řádek", sk: "Voliteľný ďalší riadok", hu: "Választható plusz sor", el: "Προαιρετική επιπλέον γραμμή",
    bg: "Незадължителен допълнителен ред", hr: "Neobavezni dodatni redak", sr: "Опционални додатни ред", sl: "Neobvezna dodatna vrstica", et: "Valikuline lisarida", lv: "Neobligāta papildu rinda",
    lt: "Neprivaloma papildoma eilutė", tr: "İsteğe bağlı ek satır", ru: "Необязательная дополнительная строка", uk: "Необов'язковий додатковий рядок", ca: "Línia addicional (opcional)", id: "Baris tambahan (opsional)",
    vi: "Dòng bổ sung (tùy chọn)", th: "บรรทัดเพิ่มเติม (ไม่บังคับ)", zh: "可选的额外文字", ja: "任意の追加行", ko: "선택적 추가 문구", ar: "سطر إضافي (اختياري)", he: "שורה נוספת (אופציונלי)", hi: "वैकल्पिक अतिरिक्त पंक्ति",
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
console.log(`✓ flyer-contact strings added to ${n} locale(s).`);
