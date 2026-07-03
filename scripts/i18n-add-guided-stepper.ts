/** i18n × 38: guided-promo step wizard strings (Luigi 2026-07-03 — GloriaFood
 *  style one-group-per-step flow). {n}/{total} placeholders must survive.
 *  Run: npx tsx scripts/i18n-add-guided-stepper.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "customer.guidedPromo.stepOf": {
    en: "Step {n} of {total}", fr: "Étape {n} sur {total}", es: "Paso {n} de {total}", it: "Passaggio {n} di {total}",
    pt: "Passo {n} de {total}", "pt-BR": "Passo {n} de {total}", de: "Schritt {n} von {total}", nl: "Stap {n} van {total}",
    ro: "Pasul {n} din {total}", sv: "Steg {n} av {total}", da: "Trin {n} af {total}", nb: "Trinn {n} av {total}",
    fi: "Vaihe {n}/{total}", pl: "Krok {n} z {total}", cs: "Krok {n} z {total}", sk: "Krok {n} z {total}",
    hu: "{n}. lépés / {total}", el: "Βήμα {n} από {total}", bg: "Стъпка {n} от {total}", hr: "Korak {n} od {total}",
    sr: "Корак {n} од {total}", sl: "Korak {n} od {total}", et: "Samm {n}/{total}", lv: "{n}. solis no {total}",
    lt: "{n} žingsnis iš {total}", tr: "Adım {n}/{total}", ru: "Шаг {n} из {total}", uk: "Крок {n} з {total}",
    ca: "Pas {n} de {total}", id: "Langkah {n} dari {total}", vi: "Bước {n}/{total}", th: "ขั้นตอนที่ {n} จาก {total}",
    zh: "第 {n} 步，共 {total} 步", ja: "ステップ {n} / {total}", ko: "{total}단계 중 {n}단계", ar: "الخطوة {n} من {total}",
    he: "שלב {n} מתוך {total}", hi: "चरण {n}/{total}",
  },
  "customer.guidedPromo.nextStep": {
    en: "Next", fr: "Suivant", es: "Siguiente", it: "Avanti", pt: "Seguinte", "pt-BR": "Próximo", de: "Weiter", nl: "Volgende",
    ro: "Următorul", sv: "Nästa", da: "Næste", nb: "Neste", fi: "Seuraava", pl: "Dalej", cs: "Další", sk: "Ďalej",
    hu: "Tovább", el: "Επόμενο", bg: "Напред", hr: "Dalje", sr: "Даље", sl: "Naprej", et: "Edasi", lv: "Tālāk",
    lt: "Toliau", tr: "İleri", ru: "Далее", uk: "Далі", ca: "Següent", id: "Berikutnya", vi: "Tiếp", th: "ถัดไป",
    zh: "下一步", ja: "次へ", ko: "다음", ar: "التالي", he: "הבא", hi: "आगे",
  },
  "customer.guidedPromo.backStep": {
    en: "Back", fr: "Retour", es: "Atrás", it: "Indietro", pt: "Voltar", "pt-BR": "Voltar", de: "Zurück", nl: "Terug",
    ro: "Înapoi", sv: "Tillbaka", da: "Tilbage", nb: "Tilbake", fi: "Takaisin", pl: "Wstecz", cs: "Zpět", sk: "Späť",
    hu: "Vissza", el: "Πίσω", bg: "Назад", hr: "Natrag", sr: "Назад", sl: "Nazaj", et: "Tagasi", lv: "Atpakaļ",
    lt: "Atgal", tr: "Geri", ru: "Назад", uk: "Назад", ca: "Enrere", id: "Kembali", vi: "Quay lại", th: "ย้อนกลับ",
    zh: "上一步", ja: "戻る", ko: "뒤로", ar: "رجوع", he: "חזרה", hi: "पीछे",
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
console.log(`✓ Guided-stepper strings added to ${n} locale(s).`);
