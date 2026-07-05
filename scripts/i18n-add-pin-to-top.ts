/** i18n × 38: "Pin to top" item toggle + category accent color (Fabrizio
 *  cmr80joh0). Run: npx tsx scripts/i18n-add-pin-to-top.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "admin.menuEditor.pinToTop": {
    en: "Pin to top of menu", fr: "Épingler en haut du menu", es: "Fijar arriba del menú",
    it: "Fissa in cima al menu", pt: "Fixar no topo do menu", "pt-BR": "Fixar no topo do cardápio",
    de: "Oben in der Karte anpinnen", nl: "Bovenaan menu vastzetten", ro: "Fixează în capul meniului",
    sv: "Fäst högst upp i menyn", da: "Fastgør øverst i menuen", nb: "Fest øverst i menyen",
    fi: "Kiinnitä valikon alkuun", pl: "Przypnij na górze menu", cs: "Připnout na začátek menu",
    sk: "Pripnúť na začiatok menu", hu: "Kitűzés az étlap tetejére", el: "Καρφίτσωμα στην κορυφή του μενού",
    bg: "Закачи най-отгоре в менюто", hr: "Prikvači na vrh jelovnika", sr: "Закачи на врх менија",
    sl: "Pripni na vrh menija", et: "Kinnita menüü algusesse", lv: "Piespraust ēdienkartes augšā",
    lt: "Prisegti meniu viršuje", tr: "Menünün başına sabitle", ru: "Закрепить вверху меню",
    uk: "Закріпити вгорі меню", ca: "Fixa a dalt del menú", id: "Sematkan di atas menu",
    vi: "Ghim lên đầu thực đơn", th: "ปักหมุดไว้บนสุดของเมนู", zh: "置顶显示", ja: "メニューの先頭に固定",
    ko: "메뉴 상단에 고정", ar: "تثبيت أعلى القائمة", he: "הצמד לראש התפריט", hi: "मेनू में सबसे ऊपर पिन करें",
  },
  "admin.menuEditor.categoryAccentColor": {
    en: "Accent color", fr: "Couleur d'accent", es: "Color de acento", it: "Colore in evidenza",
    pt: "Cor de destaque", "pt-BR": "Cor de destaque", de: "Akzentfarbe", nl: "Accentkleur",
    ro: "Culoare de accent", sv: "Accentfärg", da: "Accentfarve", nb: "Aksentfarge",
    fi: "Korostusväri", pl: "Kolor akcentu", cs: "Zvýrazňující barva", sk: "Zvýrazňujúca farba",
    hu: "Kiemelőszín", el: "Χρώμα έμφασης", bg: "Акцентен цвят", hr: "Naglasna boja",
    sr: "Акцентна боја", sl: "Poudarna barva", et: "Rõhuvärv", lv: "Akcenta krāsa",
    lt: "Akcento spalva", tr: "Vurgu rengi", ru: "Акцентный цвет", uk: "Акцентний колір",
    ca: "Color d'accent", id: "Warna aksen", vi: "Màu nhấn", th: "สีเน้น", zh: "强调色",
    ja: "アクセントカラー", ko: "강조 색상", ar: "لون مميز", he: "צבע הדגשה", hi: "एक्सेंट रंग",
  },
  "admin.menuEditor.categoryAccentColorClear": {
    en: "Use theme color", fr: "Utiliser la couleur du thème", es: "Usar color del tema",
    it: "Usa il colore del tema", pt: "Usar cor do tema", "pt-BR": "Usar cor do tema",
    de: "Themenfarbe verwenden", nl: "Themakleur gebruiken", ro: "Folosește culoarea temei",
    sv: "Använd temafärg", da: "Brug temafarve", nb: "Bruk temafarge", fi: "Käytä teeman väriä",
    pl: "Użyj koloru motywu", cs: "Použít barvu motivu", sk: "Použiť farbu témy",
    hu: "Téma színének használata", el: "Χρήση χρώματος θέματος", bg: "Използвай цвета на темата",
    hr: "Koristi boju teme", sr: "Користи боју теме", sl: "Uporabi barvo teme", et: "Kasuta teema värvi",
    lv: "Izmantot tēmas krāsu", lt: "Naudoti temos spalvą", tr: "Tema rengini kullan",
    ru: "Использовать цвет темы", uk: "Використати колір теми", ca: "Usa el color del tema",
    id: "Gunakan warna tema", vi: "Dùng màu chủ đề", th: "ใช้สีธีม", zh: "使用主题色",
    ja: "テーマカラーを使用", ko: "테마 색상 사용", ar: "استخدام لون السمة", he: "השתמש בצבע ערכת הנושא",
    hi: "थीम रंग उपयोग करें",
  },
  "admin.menuEditor.categoryAccentColorDefault": {
    en: "Theme color (default)", fr: "Couleur du thème (par défaut)", es: "Color del tema (predeterminado)",
    it: "Colore del tema (predefinito)", pt: "Cor do tema (padrão)", "pt-BR": "Cor do tema (padrão)",
    de: "Themenfarbe (Standard)", nl: "Themakleur (standaard)", ro: "Culoarea temei (implicit)",
    sv: "Temafärg (standard)", da: "Temafarve (standard)", nb: "Temafarge (standard)",
    fi: "Teeman väri (oletus)", pl: "Kolor motywu (domyślny)", cs: "Barva motivu (výchozí)",
    sk: "Farba témy (predvolené)", hu: "Téma színe (alapértelmezett)", el: "Χρώμα θέματος (προεπιλογή)",
    bg: "Цвят на темата (по подразбиране)", hr: "Boja teme (zadano)", sr: "Боја теме (подразумевано)",
    sl: "Barva teme (privzeto)", et: "Teema värv (vaikimisi)", lv: "Tēmas krāsa (noklusējums)",
    lt: "Temos spalva (numatytoji)", tr: "Tema rengi (varsayılan)", ru: "Цвет темы (по умолчанию)",
    uk: "Колір теми (типово)", ca: "Color del tema (per defecte)", id: "Warna tema (bawaan)",
    vi: "Màu chủ đề (mặc định)", th: "สีธีม (ค่าเริ่มต้น)", zh: "主题色（默认）", ja: "テーマカラー（既定）",
    ko: "테마 색상(기본)", ar: "لون السمة (افتراضي)", he: "צבע ערכת הנושא (ברירת מחדל)",
    hi: "थीम रंग (डिफ़ॉल्ट)",
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
console.log(`✓ pin-to-top + accent-color keys added to ${n} locale(s).`);
