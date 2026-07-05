/**
 * Fix the misleading "Toppings optional = OFF" hint (Luigi 2026-07-04): it
 * claimed "at least one topping is required" — only true when the topping
 * GROUP itself is Required / Min ≥ 1. OFF actually means "defer to each
 * topping group's own Required / Min rule". ×38.
 *   npx tsx scripts/i18n-fix-toppings-optional-hint.ts
 */
import fs from "fs";
import path from "path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

const T: Record<string, string> = {
  en: "Each topping group's own Required / Min settings decide whether a topping must be picked.",
  fr: "Les réglages Requis / Minimum de chaque groupe de garnitures déterminent si une garniture doit être choisie.",
  es: "Los ajustes Obligatorio / Mínimo de cada grupo de ingredientes deciden si hay que elegir un ingrediente.",
  it: "Sono le impostazioni Obbligatorio / Minimo di ogni gruppo di condimenti a decidere se va scelto un condimento.",
  pt: "As definições Obrigatório / Mínimo de cada grupo de coberturas decidem se é preciso escolher uma cobertura.",
  "pt-BR": "As configurações Obrigatório / Mínimo de cada grupo de coberturas decidem se é preciso escolher uma cobertura.",
  de: "Ob ein Belag gewählt werden muss, bestimmen die Pflicht-/Mindest-Einstellungen der jeweiligen Belag-Gruppe.",
  nl: "De eigen Verplicht/Minimum-instellingen van elke toppinggroep bepalen of een topping gekozen moet worden.",
  ro: "Setările Obligatoriu / Minim ale fiecărui grup de topping decid dacă trebuie ales un topping.",
  sv: "Varje fyllningsgrupps egna Obligatorisk/Min-inställningar avgör om en fyllning måste väljas.",
  da: "Hver fyldgruppes egne Påkrævet/Min-indstillinger afgør, om der skal vælges fyld.",
  nb: "Hver fyllgruppes egne Påkrevd/Min-innstillinger avgjør om fyll må velges.",
  fi: "Kunkin täyteryhmän omat Pakollinen/Minimi-asetukset ratkaisevat, onko täyte valittava.",
  pl: "O tym, czy dodatek trzeba wybrać, decydują ustawienia Wymagane / Minimum każdej grupy dodatków.",
  cs: "Zda je nutné přílohu vybrat, určují vlastní nastavení Povinné / Minimum každé skupiny příloh.",
  sk: "Či je potrebné prílohu vybrať, určujú vlastné nastavenia Povinné / Minimum každej skupiny príloh.",
  hu: "Azt, hogy kell-e feltétet választani, az egyes feltétcsoportok saját Kötelező / Minimum beállításai döntik el.",
  el: "Οι ρυθμίσεις Υποχρεωτικό / Ελάχιστο κάθε ομάδας υλικών καθορίζουν αν πρέπει να επιλεγεί υλικό.",
  bg: "Дали трябва да се избере топинг решават настройките Задължително / Минимум на всяка група топинги.",
  hr: "Hoće li se dodatak morati odabrati, određuju postavke Obavezno / Minimum svake grupe dodataka.",
  sr: "Da li se dodatak mora odabrati, određuju podešavanja Obavezno / Minimum svake grupe dodataka.",
  sl: "Ali je treba dodatek izbrati, določajo nastavitve Obvezno / Najmanj vsake skupine dodatkov.",
  et: "Kas kate tuleb valida, otsustavad iga katterühma enda Kohustuslik/Miinimum seaded.",
  lv: "To, vai piedeva jāizvēlas, nosaka katras piedevu grupas iestatījumi Obligāts / Minimums.",
  lt: "Ar priedą reikia pasirinkti, sprendžia kiekvienos priedų grupės nustatymai Privaloma / Minimumas.",
  tr: "Bir malzemenin seçilmesinin zorunlu olup olmadığına her malzeme grubunun kendi Zorunlu / Minimum ayarları karar verir.",
  ru: "Нужно ли выбирать топпинг, определяют собственные настройки «Обязательно / Минимум» каждой группы топпингов.",
  uk: "Чи потрібно обирати топінг, визначають власні налаштування «Обов'язково / Мінімум» кожної групи топінгів.",
  ca: "Els ajustos Obligatori / Mínim de cada grup d'ingredients decideixen si cal triar-ne un.",
  id: "Pengaturan Wajib / Minimum tiap grup topping yang menentukan apakah topping harus dipilih.",
  vi: "Cài đặt Bắt buộc / Tối thiểu của từng nhóm topping quyết định có phải chọn topping hay không.",
  th: "การตั้งค่า จำเป็น / ขั้นต่ำ ของแต่ละกลุ่มท็อปปิงจะเป็นตัวกำหนดว่าต้องเลือกท็อปปิงหรือไม่",
  zh: "是否必须选择配料，由每个配料组自己的“必选 / 最少”设置决定。",
  ja: "トッピングの選択が必須かどうかは、各トッピンググループ自身の必須／最小設定で決まります。",
  ko: "토핑 선택이 필수인지 여부는 각 토핑 그룹의 필수/최소 설정이 결정합니다.",
  ar: "إعدادات الإلزامي / الحد الأدنى الخاصة بكل مجموعة إضافات هي التي تحدد ما إذا كان يجب اختيار إضافة.",
  he: "הגדרות החובה / המינימום של כל קבוצת תוספות קובעות אם חייבים לבחור תוספת.",
  hi: "टॉपिंग चुनना ज़रूरी है या नहीं, यह हर टॉपिंग समूह की अपनी आवश्यक / न्यूनतम सेटिंग तय करती है।",
};

const dir = path.join(process.cwd(), "src", "messages");
let changed = 0;
for (const loc of SUPPORTED_LOCALES) {
  const v = T[loc];
  if (!v) throw new Error(`${loc}: missing translation`);
  const file = path.join(dir, `${loc}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  // Same nesting the existing key lives in (admin.menuEditor per en.json).
  const node = json?.admin?.menuEditor;
  if (!node || node.toppingsOptionalOffHint === undefined) throw new Error(`${loc}: toppingsOptionalOffHint not found`);
  node.toppingsOptionalOffHint = v;
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(`✅ toppingsOptionalOffHint corrected in ${changed} locale file(s)`);
