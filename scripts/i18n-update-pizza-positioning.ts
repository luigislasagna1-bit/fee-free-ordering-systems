/** i18n: lead the homepage pizza section with the custom-pizza-builder positioning
 *  (defensible "most powerful", not an unprovable "#1"). Overwrites two existing
 *  keys × 38 locales. Luigi 2026-06-30.
 *    marketing.home.v2.pizza.eyebrow
 *    marketing.home.v2.pizza.title
 *  Run: npx tsx scripts/i18n-update-pizza-positioning.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const EYEBROW: Record<string, string> = {
  en: "Built for independent pizzerias", fr: "Conçu pour les pizzerias indépendantes", es: "Hecho para pizzerías independientes", it: "Creato per le pizzerie indipendenti",
  pt: "Feito para pizzarias independentes", "pt-BR": "Feito para pizzarias independentes", de: "Für unabhängige Pizzerien gemacht", nl: "Gemaakt voor zelfstandige pizzeria's",
  ro: "Creat pentru pizzerii independente", sv: "Byggd för fristående pizzerior", da: "Skabt til uafhængige pizzeriaer", nb: "Laget for uavhengige pizzeriaer",
  fi: "Tehty itsenäisille pizzerioille", pl: "Stworzone dla niezależnych pizzerii", cs: "Vytvořeno pro nezávislé pizzerie", sk: "Vytvorené pre nezávislé pizzerie",
  hu: "Független pizzériáknak készült", el: "Φτιαγμένο για ανεξάρτητες πιτσαρίες", bg: "Създадено за независими пицарии", hr: "Stvoreno za neovisne pizzerije",
  sr: "Направљено за независне пицерије", sl: "Ustvarjeno za neodvisne picerije", et: "Loodud sõltumatutele pitsarestoranidele", lv: "Veidots neatkarīgām picērijām",
  lt: "Sukurta nepriklausomoms picerijoms", tr: "Bağımsız pizzacılar için tasarlandı", ru: "Создано для независимых пиццерий", uk: "Створено для незалежних піцерій",
  ca: "Fet per a pizzeries independents", id: "Dibuat untuk pizzeria independen", vi: "Được tạo cho các tiệm pizza độc lập", th: "สร้างมาเพื่อร้านพิซซ่าอิสระ",
  zh: "为独立披萨店打造", ja: "独立系ピッツェリアのために", ko: "독립 피자 가게를 위해 만들어졌습니다", ar: "مصمّم لمطاعم البيتزا المستقلة",
  he: "נבנה לפיצריות עצמאיות", hi: "स्वतंत्र पिज़्ज़ेरिया के लिए बनाया गया",
};

const TITLE: Record<string, string> = {
  en: "The most powerful custom pizza builder for independent pizzerias.",
  fr: "Le créateur de pizzas personnalisées le plus puissant pour les pizzerias indépendantes.",
  es: "El creador de pizzas personalizado más potente para pizzerías independientes.",
  it: "Il configuratore di pizze personalizzate più potente per le pizzerie indipendenti.",
  pt: "O construtor de pizzas personalizado mais poderoso para pizzarias independentes.",
  "pt-BR": "O montador de pizzas personalizado mais poderoso para pizzarias independentes.",
  de: "Der leistungsstärkste individuelle Pizza-Konfigurator für unabhängige Pizzerien.",
  nl: "De krachtigste pizzabouwer op maat voor zelfstandige pizzeria's.",
  ro: "Cel mai puternic configurator de pizza personalizat pentru pizzerii independente.",
  sv: "Den kraftfullaste anpassade pizzabyggaren för fristående pizzerior.",
  da: "Den mest kraftfulde tilpassede pizzabygger til uafhængige pizzeriaer.",
  nb: "Den kraftigste tilpassede pizzabyggeren for uavhengige pizzeriaer.",
  fi: "Tehokkain räätälöity pizzanrakentaja itsenäisille pizzerioille.",
  pl: "Najpotężniejszy kreator pizzy na zamówienie dla niezależnych pizzerii.",
  cs: "Nejvýkonnější konfigurátor pizzy na míru pro nezávislé pizzerie.",
  sk: "Najvýkonnejší konfigurátor pizze na mieru pre nezávislé pizzerie.",
  hu: "A legerősebb egyedi pizzaépítő független pizzériáknak.",
  el: "Ο πιο ισχυρός κατασκευαστής προσαρμοσμένης πίτσας για ανεξάρτητες πιτσαρίες.",
  bg: "Най-мощният конструктор на персонализирана пица за независими пицарии.",
  hr: "Najmoćniji alat za izradu pizza po mjeri za neovisne pizzerije.",
  sr: "Најмоћнији алат за прављење пица по мери за независне пицерије.",
  sl: "Najzmogljivejši sestavljalnik pic po meri za neodvisne picerije.",
  et: "Võimsaim kohandatud pitsa koostaja sõltumatutele pitsarestoranidele.",
  lv: "Jaudīgākais pielāgotais picas veidotājs neatkarīgām picērijām.",
  lt: "Galingiausias pritaikomas picų kūrimo įrankis nepriklausomoms picerijoms.",
  tr: "Bağımsız pizzacılar için en güçlü özel pizza oluşturucu.",
  ru: "Самый мощный конструктор пиццы на заказ для независимых пиццерий.",
  uk: "Найпотужніший конструктор піци на замовлення для незалежних піцерій.",
  ca: "El creador de pizzes personalitzat més potent per a pizzeries independents.",
  id: "Pembuat pizza kustom paling canggih untuk pizzeria independen.",
  vi: "Trình tạo pizza tùy chỉnh mạnh mẽ nhất cho các tiệm pizza độc lập.",
  th: "เครื่องมือสร้างพิซซ่าแบบกำหนดเองที่ทรงพลังที่สุดสำหรับร้านพิซซ่าอิสระ",
  zh: "为独立披萨店打造的最强大自定义披萨构建器。",
  ja: "独立系ピッツェリア向けの最も強力なカスタムピザビルダー。",
  ko: "독립 피자 가게를 위한 가장 강력한 맞춤형 피자 빌더.",
  ar: "أقوى أداة لتصميم البيتزا المخصصة لمطاعم البيتزا المستقلة.",
  he: "בונה הפיצה המותאם אישית החזק ביותר לפיצריות עצמאיות.",
  hi: "स्वतंत्र पिज़्ज़ेरिया के लिए सबसे शक्तिशाली कस्टम पिज़्ज़ा बिल्डर।",
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
  setDeep(data, "marketing.home.v2.pizza.eyebrow", EYEBROW[loc] ?? EYEBROW.en);
  setDeep(data, "marketing.home.v2.pizza.title", TITLE[loc] ?? TITLE.en);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
console.log(`✓ pizza-builder positioning updated in ${n} locale(s).`);
