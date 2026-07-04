/** i18n × 38: alert-phone dialability validation + will-dial preview (Luigi
 *  2026-07-03). {number} must survive. Run: npx tsx scripts/i18n-add-alert-phone-validation.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "admin.kitchenWorkflowToggle.alertPhoneInvalid": {
    en: "This number can't be dialed. Use digits with area code (e.g. 6476690808) or full international format (+16476690808).",
    fr: "Ce numéro ne peut pas être composé. Utilisez des chiffres avec l'indicatif régional (ex. 6476690808) ou le format international complet (+16476690808).",
    es: "Este número no se puede marcar. Usa dígitos con el código de área (p. ej. 6476690808) o el formato internacional completo (+16476690808).",
    it: "Questo numero non può essere composto. Usa cifre con prefisso (es. 6476690808) o il formato internazionale completo (+16476690808).",
    pt: "Este número não pode ser marcado. Use dígitos com indicativo (ex. 6476690808) ou o formato internacional completo (+16476690808).",
    "pt-BR": "Este número não pode ser discado. Use dígitos com DDD (ex. 6476690808) ou o formato internacional completo (+16476690808).",
    de: "Diese Nummer kann nicht gewählt werden. Ziffern mit Vorwahl (z. B. 6476690808) oder volles internationales Format (+16476690808) verwenden.",
    nl: "Dit nummer kan niet worden gebeld. Gebruik cijfers met netnummer (bijv. 6476690808) of het volledige internationale formaat (+16476690808).",
    ro: "Acest număr nu poate fi apelat. Folosiți cifre cu prefix (ex. 6476690808) sau formatul internațional complet (+16476690808).",
    sv: "Numret kan inte ringas. Använd siffror med riktnummer (t.ex. 6476690808) eller fullt internationellt format (+16476690808).",
    da: "Nummeret kan ikke ringes op. Brug cifre med områdekode (fx 6476690808) eller fuldt internationalt format (+16476690808).",
    nb: "Nummeret kan ikke ringes. Bruk sifre med retningsnummer (f.eks. 6476690808) eller fullt internasjonalt format (+16476690808).",
    fi: "Numeroon ei voi soittaa. Käytä numeroita suuntanumerolla (esim. 6476690808) tai täyttä kansainvälistä muotoa (+16476690808).",
    pl: "Nie można wybrać tego numeru. Użyj cyfr z numerem kierunkowym (np. 6476690808) lub pełnego formatu międzynarodowego (+16476690808).",
    cs: "Toto číslo nelze vytočit. Použijte číslice s předvolbou (např. 6476690808) nebo plný mezinárodní formát (+16476690808).",
    sk: "Toto číslo sa nedá vytočiť. Použite číslice s predvoľbou (napr. 6476690808) alebo plný medzinárodný formát (+16476690808).",
    hu: "Ez a szám nem hívható. Használjon körzetszámos számjegyeket (pl. 6476690808) vagy teljes nemzetközi formátumot (+16476690808).",
    el: "Αυτός ο αριθμός δεν μπορεί να κληθεί. Χρησιμοποιήστε ψηφία με κωδικό περιοχής (π.χ. 6476690808) ή πλήρη διεθνή μορφή (+16476690808).",
    bg: "Този номер не може да бъде набран. Използвайте цифри с код (напр. 6476690808) или пълен международен формат (+16476690808).",
    hr: "Ovaj se broj ne može birati. Koristite znamenke s pozivnim brojem (npr. 6476690808) ili puni međunarodni format (+16476690808).",
    sr: "Овај број не може да се позове. Користите цифре са позивним бројем (нпр. 6476690808) или пуни међународни формат (+16476690808).",
    sl: "Te številke ni mogoče poklicati. Uporabite števke z omrežno skupino (npr. 6476690808) ali polni mednarodni format (+16476690808).",
    et: "Sellele numbrile ei saa helistada. Kasutage numbreid koos suunakoodiga (nt 6476690808) või täielikku rahvusvahelist vormingut (+16476690808).",
    lv: "Šo numuru nevar sastādīt. Izmantojiet ciparus ar rajona kodu (piem., 6476690808) vai pilnu starptautisko formātu (+16476690808).",
    lt: "Šio numerio negalima surinkti. Naudokite skaitmenis su krypties kodu (pvz., 6476690808) arba pilną tarptautinį formatą (+16476690808).",
    tr: "Bu numara aranamaz. Alan koduyla rakamlar (örn. 6476690808) veya tam uluslararası biçim (+16476690808) kullanın.",
    ru: "Этот номер нельзя набрать. Используйте цифры с кодом города (напр. 6476690808) или полный международный формат (+16476690808).",
    uk: "Цей номер не можна набрати. Використовуйте цифри з кодом (напр. 6476690808) або повний міжнародний формат (+16476690808).",
    ca: "Aquest número no es pot marcar. Fes servir dígits amb codi d'àrea (p. ex. 6476690808) o el format internacional complet (+16476690808).",
    id: "Nomor ini tidak dapat dihubungi. Gunakan digit dengan kode area (mis. 6476690808) atau format internasional lengkap (+16476690808).",
    vi: "Không thể gọi số này. Dùng chữ số kèm mã vùng (vd. 6476690808) hoặc định dạng quốc tế đầy đủ (+16476690808).",
    th: "หมายเลขนี้โทรออกไม่ได้ ใช้ตัวเลขพร้อมรหัสพื้นที่ (เช่น 6476690808) หรือรูปแบบสากลเต็ม (+16476690808)",
    zh: "无法拨打此号码。请使用带区号的数字（如 6476690808）或完整国际格式（+16476690808）。",
    ja: "この番号には発信できません。市外局番付きの数字（例: 6476690808）または完全な国際形式（+16476690808）を使用してください。",
    ko: "이 번호로 전화를 걸 수 없습니다. 지역번호가 포함된 숫자(예: 6476690808) 또는 전체 국제 형식(+16476690808)을 사용하세요.",
    ar: "لا يمكن الاتصال بهذا الرقم. استخدم أرقامًا مع رمز المنطقة (مثل 6476690808) أو التنسيق الدولي الكامل (+16476690808).",
    he: "לא ניתן לחייג למספר זה. השתמשו בספרות עם קידומת (למשל 6476690808) או בפורמט בינלאומי מלא (+16476690808).",
    hi: "यह नंबर डायल नहीं हो सकता। क्षेत्र कोड सहित अंक (जैसे 6476690808) या पूर्ण अंतरराष्ट्रीय प्रारूप (+16476690808) उपयोग करें।",
  },
  "admin.kitchenWorkflowToggle.alertPhoneWillDial": {
    en: "Will dial: {number}", fr: "Numéro composé : {number}", es: "Se marcará: {number}", it: "Verrà composto: {number}",
    pt: "Será marcado: {number}", "pt-BR": "Será discado: {number}", de: "Gewählt wird: {number}", nl: "Er wordt gebeld naar: {number}",
    ro: "Se va apela: {number}", sv: "Ringer upp: {number}", da: "Der ringes til: {number}", nb: "Ringer: {number}",
    fi: "Soitetaan numeroon: {number}", pl: "Wybierze numer: {number}", cs: "Vytočí se: {number}", sk: "Vytočí sa: {number}",
    hu: "Hívott szám: {number}", el: "Θα κληθεί: {number}", bg: "Ще се набере: {number}", hr: "Birat će se: {number}",
    sr: "Позваће се: {number}", sl: "Poklicano bo: {number}", et: "Helistatakse: {number}", lv: "Tiks zvanīts: {number}",
    lt: "Bus renkama: {number}", tr: "Aranacak: {number}", ru: "Будет набран: {number}", uk: "Буде набрано: {number}",
    ca: "Es marcarà: {number}", id: "Akan menghubungi: {number}", vi: "Sẽ gọi: {number}", th: "จะโทรไปที่: {number}",
    zh: "将拨打：{number}", ja: "発信先: {number}", ko: "발신 번호: {number}", ar: "سيتم الاتصال بـ: {number}",
    he: "יחויג: {number}", hi: "डायल होगा: {number}",
  },
  "admin.kitchenWorkflowToggle.alertPhoneInvalidToast": {
    en: "That phone number can't be dialed — fix the format first.", fr: "Ce numéro ne peut pas être composé — corrigez d'abord le format.", es: "Ese número no se puede marcar; corrige primero el formato.", it: "Quel numero non può essere composto — correggi prima il formato.",
    pt: "Esse número não pode ser marcado — corrija primeiro o formato.", "pt-BR": "Esse número não pode ser discado — corrija o formato primeiro.", de: "Diese Nummer kann nicht gewählt werden — zuerst das Format korrigieren.", nl: "Dat nummer kan niet worden gebeld — corrigeer eerst het formaat.",
    ro: "Numărul nu poate fi apelat — corectați mai întâi formatul.", sv: "Numret kan inte ringas — åtgärda formatet först.", da: "Nummeret kan ikke ringes op — ret formatet først.", nb: "Nummeret kan ikke ringes — rett formatet først.",
    fi: "Numeroon ei voi soittaa — korjaa ensin muoto.", pl: "Tego numeru nie można wybrać — najpierw popraw format.", cs: "Toto číslo nelze vytočit — nejprve opravte formát.", sk: "Toto číslo sa nedá vytočiť — najprv opravte formát.",
    hu: "A szám nem hívható — először javítsa a formátumot.", el: "Ο αριθμός δεν καλείται — διορθώστε πρώτα τη μορφή.", bg: "Номерът не може да бъде набран — първо поправете формата.", hr: "Broj se ne može birati — najprije ispravite format.",
    sr: "Број не може да се позове — прво исправите формат.", sl: "Številke ni mogoče poklicati — najprej popravite obliko.", et: "Numbrile ei saa helistada — parandage kõigepealt vorming.", lv: "Numuru nevar sastādīt — vispirms izlabojiet formātu.",
    lt: "Numerio negalima surinkti — pirmiausia pataisykite formatą.", tr: "Bu numara aranamaz — önce biçimi düzeltin.", ru: "Номер нельзя набрать — сначала исправьте формат.", uk: "Номер не можна набрати — спершу виправте формат.",
    ca: "Aquest número no es pot marcar — corregeix primer el format.", id: "Nomor itu tidak dapat dihubungi — perbaiki formatnya dulu.", vi: "Không thể gọi số đó — hãy sửa định dạng trước.", th: "หมายเลขนั้นโทรออกไม่ได้ — แก้ไขรูปแบบก่อน",
    zh: "该号码无法拨打——请先修正格式。", ja: "その番号には発信できません — まず形式を修正してください。", ko: "해당 번호로 전화를 걸 수 없습니다 — 형식을 먼저 수정하세요.", ar: "لا يمكن الاتصال بهذا الرقم — صحّح التنسيق أولًا.",
    he: "לא ניתן לחייג למספר — תקנו קודם את הפורמט.", hi: "उस नंबर पर डायल नहीं हो सकता — पहले प्रारूप ठीक करें।",
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
console.log(`✓ Alert-phone validation strings added to ${n} locale(s).`);
