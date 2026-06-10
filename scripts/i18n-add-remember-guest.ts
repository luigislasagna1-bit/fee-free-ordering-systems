/**
 * One-shot i18n patch: checkout.rememberedHint + checkout.rememberedClear across
 * all 38 locales (Luigi 2026-06-10 — silent guest "remember me": the checkout
 * form pre-fills from details this device saved on a prior order, with a
 * "Not you? Clear" link for shared devices). No placeholders.
 *   npx tsx scripts/i18n-add-remember-guest.ts
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");

// hint = the reassurance line; clear = the "Not you?" action button.
const HINT: Record<string, string> = {
  en: "We filled in your details from this device.",
  fr: "Nous avons rempli vos coordonnées depuis cet appareil.",
  es: "Hemos completado tus datos desde este dispositivo.",
  it: "Abbiamo compilato i tuoi dati da questo dispositivo.",
  pt: "Preenchemos os seus dados a partir deste dispositivo.",
  "pt-BR": "Preenchemos seus dados a partir deste dispositivo.",
  de: "Wir haben Ihre Daten von diesem Gerät übernommen.",
  nl: "We hebben je gegevens van dit apparaat ingevuld.",
  ro: "Am completat datele tale de pe acest dispozitiv.",
  sv: "Vi fyllde i dina uppgifter från den här enheten.",
  da: "Vi udfyldte dine oplysninger fra denne enhed.",
  nb: "Vi fylte ut opplysningene dine fra denne enheten.",
  fi: "Täytimme tietosi tältä laitteelta.",
  pl: "Uzupełniliśmy Twoje dane z tego urządzenia.",
  cs: "Vyplnili jsme vaše údaje z tohoto zařízení.",
  sk: "Vyplnili sme vaše údaje z tohto zariadenia.",
  hu: "Az adatait erről az eszközről töltöttük ki.",
  el: "Συμπληρώσαμε τα στοιχεία σας από αυτή τη συσκευή.",
  bg: "Попълнихме данните ви от това устройство.",
  hr: "Ispunili smo vaše podatke s ovog uređaja.",
  sr: "Попунили смо ваше податке са овог уређаја.",
  sl: "Vaše podatke smo izpolnili iz te naprave.",
  et: "Täitsime teie andmed sellest seadmest.",
  lv: "Mēs aizpildījām jūsu datus no šīs ierīces.",
  lt: "Užpildėme jūsų duomenis iš šio įrenginio.",
  tr: "Bilgilerinizi bu cihazdan doldurduk.",
  ru: "Мы заполнили ваши данные с этого устройства.",
  uk: "Ми заповнили ваші дані з цього пристрою.",
  ca: "Hem emplenat les teves dades des d'aquest dispositiu.",
  id: "Kami mengisi detail Anda dari perangkat ini.",
  vi: "Chúng tôi đã điền thông tin của bạn từ thiết bị này.",
  th: "เรากรอกข้อมูลของคุณจากอุปกรณ์นี้แล้ว",
  zh: "我们已根据此设备填写了您的信息。",
  ja: "この端末に保存された情報を入力しました。",
  ko: "이 기기에 저장된 정보를 입력했습니다.",
  ar: "لقد ملأنا بياناتك من هذا الجهاز.",
  he: "מילאנו את הפרטים שלך מהמכשיר הזה.",
  hi: "हमने इस डिवाइस से आपकी जानकारी भर दी है।",
};

const CLEAR: Record<string, string> = {
  en: "Not you? Clear",
  fr: "Ce n'est pas vous ? Effacer",
  es: "¿No eres tú? Borrar",
  it: "Non sei tu? Cancella",
  pt: "Não é você? Limpar",
  "pt-BR": "Não é você? Limpar",
  de: "Nicht Sie? Löschen",
  nl: "Niet jij? Wissen",
  ro: "Nu ești tu? Șterge",
  sv: "Inte du? Rensa",
  da: "Ikke dig? Ryd",
  nb: "Ikke deg? Tøm",
  fi: "Etkö sinä? Tyhjennä",
  pl: "To nie Ty? Wyczyść",
  cs: "Nejste to vy? Vymazat",
  sk: "Nie ste to vy? Vymazať",
  hu: "Nem Ön az? Törlés",
  el: "Δεν είστε εσείς; Διαγραφή",
  bg: "Не сте вие? Изчисти",
  hr: "Niste vi? Očisti",
  sr: "Нисте ви? Обриши",
  sl: "Niste vi? Počisti",
  et: "Kas pole teie? Tühjenda",
  lv: "Vai tas neesat jūs? Notīrīt",
  lt: "Ne jūs? Išvalyti",
  tr: "Siz değil misiniz? Temizle",
  ru: "Это не вы? Очистить",
  uk: "Це не ви? Очистити",
  ca: "No ets tu? Esborra",
  id: "Bukan Anda? Hapus",
  vi: "Không phải bạn? Xóa",
  th: "ไม่ใช่คุณ? ล้าง",
  zh: "不是您？清除",
  ja: "本人ではない場合は消去",
  ko: "본인이 아닌가요? 지우기",
  ar: "لست أنت؟ مسح",
  he: "לא אתה? נקה",
  hi: "आप नहीं? साफ़ करें",
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
  setDeep(data, "checkout.rememberedHint", HINT[loc] ?? HINT.en);
  setDeep(data, "checkout.rememberedClear", CLEAR[loc] ?? CLEAR.en);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
console.log(`✓ rememberedHint + rememberedClear added to ${n} locale(s).`);
