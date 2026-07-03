/** i18n × 38: kitchen display zoom setting (restaurateur accessibility
 *  feedback via Fabrizio, 2026-07-03). Run: npx tsx scripts/i18n-add-kitchen-zoom.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "kitchen.zoomTitle": {
    en: "Zoom — text size", fr: "Zoom — taille du texte", es: "Zoom — tamaño del texto", it: "Zoom — dimensione del testo",
    pt: "Zoom — tamanho do texto", "pt-BR": "Zoom — tamanho do texto", de: "Zoom — Textgröße", nl: "Zoom — tekstgrootte",
    ro: "Zoom — dimensiunea textului", sv: "Zoom — textstorlek", da: "Zoom — tekststørrelse", nb: "Zoom — tekststørrelse",
    fi: "Zoomaus — tekstin koko", pl: "Powiększenie — rozmiar tekstu", cs: "Přiblížení — velikost textu", sk: "Priblíženie — veľkosť textu",
    hu: "Nagyítás — szövegméret", el: "Ζουμ — μέγεθος κειμένου", bg: "Мащаб — размер на текста", hr: "Zumiranje — veličina teksta",
    sr: "Зумирање — величина текста", sl: "Povečava — velikost besedila", et: "Suum — teksti suurus", lv: "Tālummaiņa — teksta izmērs",
    lt: "Mastelis — teksto dydis", tr: "Yakınlaştırma — metin boyutu", ru: "Масштаб — размер текста", uk: "Масштаб — розмір тексту",
    ca: "Zoom — mida del text", id: "Zoom — ukuran teks", vi: "Thu phóng — cỡ chữ", th: "ซูม — ขนาดตัวอักษร",
    zh: "缩放 — 文字大小", ja: "ズーム — 文字サイズ", ko: "확대 — 글자 크기", ar: "التكبير — حجم النص",
    he: "זום — גודל טקסט", hi: "ज़ूम — टेक्स्ट आकार",
  },
  "kitchen.zoomSubtitle": {
    en: "Make all text and numbers bigger on this device", fr: "Agrandir tout le texte et les chiffres sur cet appareil", es: "Agranda todo el texto y los números en este dispositivo", it: "Ingrandisce tutto il testo e i numeri su questo dispositivo",
    pt: "Aumenta todo o texto e os números neste dispositivo", "pt-BR": "Aumenta todo o texto e os números neste dispositivo", de: "Vergrößert alle Texte und Zahlen auf diesem Gerät", nl: "Maakt alle tekst en cijfers groter op dit apparaat",
    ro: "Mărește tot textul și cifrele pe acest dispozitiv", sv: "Gör all text och alla siffror större på den här enheten", da: "Gør al tekst og alle tal større på denne enhed", nb: "Gjør all tekst og alle tall større på denne enheten",
    fi: "Suurentaa kaiken tekstin ja numerot tällä laitteella", pl: "Powiększa cały tekst i liczby na tym urządzeniu", cs: "Zvětší veškerý text a čísla na tomto zařízení", sk: "Zväčší všetok text a čísla na tomto zariadení",
    hu: "Minden szöveget és számot nagyobbá tesz ezen az eszközön", el: "Μεγαλώνει όλο το κείμενο και τους αριθμούς σε αυτή τη συσκευή", bg: "Уголемява целия текст и числата на това устройство", hr: "Povećava sav tekst i brojeve na ovom uređaju",
    sr: "Увећава сав текст и бројеве на овом уређају", sl: "Poveča vse besedilo in številke na tej napravi", et: "Suurendab kogu teksti ja numbreid sellel seadmel", lv: "Palielina visu tekstu un skaitļus šajā ierīcē",
    lt: "Padidina visą tekstą ir skaičius šiame įrenginyje", tr: "Bu cihazda tüm metin ve rakamları büyütür", ru: "Увеличивает весь текст и цифры на этом устройстве", uk: "Збільшує весь текст і цифри на цьому пристрої",
    ca: "Fa més grans tot el text i els números en aquest dispositiu", id: "Memperbesar semua teks dan angka di perangkat ini", vi: "Phóng to mọi chữ và số trên thiết bị này", th: "ขยายตัวอักษรและตัวเลขทั้งหมดบนอุปกรณ์นี้",
    zh: "放大此设备上的所有文字和数字", ja: "この端末のすべての文字と数字を大きくします", ko: "이 기기의 모든 글자와 숫자를 크게 표시", ar: "يكبّر كل النصوص والأرقام على هذا الجهاز",
    he: "מגדיל את כל הטקסט והמספרים במכשיר זה", hi: "इस डिवाइस पर सभी टेक्स्ट और अंक बड़े करता है",
  },
  "kitchen.zoomStandard": {
    en: "Standard", fr: "Standard", es: "Estándar", it: "Standard", pt: "Padrão", "pt-BR": "Padrão", de: "Standard", nl: "Standaard",
    ro: "Standard", sv: "Standard", da: "Standard", nb: "Standard", fi: "Vakio", pl: "Standard", cs: "Standardní", sk: "Štandard",
    hu: "Normál", el: "Κανονικό", bg: "Стандартен", hr: "Standardno", sr: "Стандардно", sl: "Standardno", et: "Standard", lv: "Standarta",
    lt: "Standartinis", tr: "Standart", ru: "Стандарт", uk: "Стандарт", ca: "Estàndard", id: "Standar", vi: "Chuẩn", th: "มาตรฐาน",
    zh: "标准", ja: "標準", ko: "표준", ar: "قياسي", he: "רגיל", hi: "मानक",
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
  for (const [key, byLoc] of Object.entries(K)) setDeep(data, key, byLoc[loc] ?? byLoc.en);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
console.log(`✓ Kitchen zoom strings added to ${n} locale(s).`);
