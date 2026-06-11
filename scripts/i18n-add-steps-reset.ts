/** i18n: admin.autopilotClient.stepsReset + stepsResetConfirm × 38 locales (Luigi 2026-06-10).
 *   npx tsx scripts/i18n-add-steps-reset.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");

const KEYS: Record<string, Record<string, string>> = {
  "admin.autopilotClient.stepsReset": {
    en: "Reset to defaults", fr: "Réinitialiser", es: "Restablecer", it: "Ripristina predefiniti", pt: "Repor predefinições", "pt-BR": "Restaurar padrões",
    de: "Auf Standard zurücksetzen", nl: "Standaard herstellen", ro: "Resetează la implicit", sv: "Återställ standard", da: "Nulstil til standard", nb: "Tilbakestill til standard",
    fi: "Palauta oletukset", pl: "Przywróć domyślne", cs: "Obnovit výchozí", sk: "Obnoviť predvolené", hu: "Alapértékek visszaállítása", el: "Επαναφορά προεπιλογών",
    bg: "Възстанови по подразбиране", hr: "Vrati zadano", sr: "Врати подразумевано", sl: "Ponastavi na privzeto", et: "Lähtesta vaikeväärtustele", lv: "Atiestatīt uz noklusējumu",
    lt: "Atstatyti numatytuosius", tr: "Varsayılanlara sıfırla", ru: "Сбросить по умолчанию", uk: "Скинути до типових", ca: "Restableix els valors predeterminats", id: "Setel ulang ke default",
    vi: "Đặt lại mặc định", th: "รีเซ็ตเป็นค่าเริ่มต้น", zh: "恢复默认", ja: "デフォルトに戻す", ko: "기본값으로 재설정", ar: "إعادة التعيين إلى الافتراضي", he: "אפס לברירת מחדל", hi: "डिफ़ॉल्ट पर रीसेट करें",
  },
  "admin.autopilotClient.stepsResetConfirm": {
    en: "Replace all emails with the default sequence?",
    fr: "Remplacer tous les e-mails par la séquence par défaut ?",
    es: "¿Reemplazar todos los correos con la secuencia predeterminada?",
    it: "Sostituire tutte le email con la sequenza predefinita?",
    pt: "Substituir todos os e-mails pela sequência predefinida?",
    "pt-BR": "Substituir todos os e-mails pela sequência padrão?",
    de: "Alle E-Mails durch die Standardsequenz ersetzen?",
    nl: "Alle e-mails vervangen door de standaardreeks?",
    ro: "Înlocuiești toate e-mailurile cu secvența implicită?",
    sv: "Ersätt alla e-postmeddelanden med standardsekvensen?",
    da: "Erstat alle e-mails med standardsekvensen?",
    nb: "Erstatte alle e-poster med standardsekvensen?",
    fi: "Korvataanko kaikki sähköpostit oletussarjalla?",
    pl: "Zastąpić wszystkie e-maile domyślną sekwencją?",
    cs: "Nahradit všechny e-maily výchozí sekvencí?",
    sk: "Nahradiť všetky e-maily predvolenou sekvenciou?",
    hu: "Lecseréli az összes e-mailt az alapértelmezett sorozatra?",
    el: "Αντικατάσταση όλων των email με την προεπιλεγμένη ακολουθία;",
    bg: "Да заменя ли всички имейли с последователността по подразбиране?",
    hr: "Zamijeniti sve e-poruke zadanim nizom?",
    sr: "Заменити све имејлове подразумеваним низом?",
    sl: "Zamenjati vsa e-poštna sporočila s privzetim zaporedjem?",
    et: "Asendada kõik e-kirjad vaikejadaga?",
    lv: "Aizstāt visus e-pastus ar noklusējuma secību?",
    lt: "Pakeisti visus el. laiškus numatytąja seka?",
    tr: "Tüm e-postalar varsayılan diziyle değiştirilsin mi?",
    ru: "Заменить все письма последовательностью по умолчанию?",
    uk: "Замінити всі листи типовою послідовністю?",
    ca: "Vols substituir tots els correus per la seqüència predeterminada?",
    id: "Ganti semua email dengan urutan default?",
    vi: "Thay tất cả email bằng chuỗi mặc định?",
    th: "แทนที่อีเมลทั้งหมดด้วยลำดับเริ่มต้นหรือไม่?",
    zh: "用默认序列替换所有邮件？",
    ja: "すべてのメールを既定のシーケンスに置き換えますか？",
    ko: "모든 이메일을 기본 시퀀스로 바꿀까요?",
    ar: "هل تريد استبدال جميع رسائل البريد الإلكتروني بالتسلسل الافتراضي؟",
    he: "להחליף את כל האימיילים ברצף ברירת המחדל?",
    hi: "क्या सभी ईमेल को डिफ़ॉल्ट अनुक्रम से बदलें?",
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
console.log(`✓ stepsReset + stepsResetConfirm added to ${n} locale(s).`);
