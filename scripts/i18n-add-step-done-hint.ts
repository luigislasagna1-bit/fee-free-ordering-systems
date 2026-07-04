/** i18n × 38: wizard footer hint when the CURRENT step is complete but a later
 *  step remains (Luigi 2026-07-04 — "Pick 1 more item" next to "3 / 3" read as
 *  a contradiction). Run: npx tsx scripts/i18n-add-step-done-hint.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "customer.guidedPromo.stepDoneHint": {
    en: "This step is done — tap Next to continue.",
    fr: "Cette étape est terminée — appuyez sur Suivant pour continuer.",
    es: "Este paso está completo: toca Siguiente para continuar.",
    it: "Questo passaggio è completo — tocca Avanti per continuare.",
    pt: "Este passo está concluído — toque em Seguinte para continuar.",
    "pt-BR": "Esta etapa está concluída — toque em Avançar para continuar.",
    de: "Dieser Schritt ist fertig — tippen Sie auf Weiter.",
    nl: "Deze stap is klaar — tik op Volgende om door te gaan.",
    ro: "Acest pas este gata — apăsați Înainte pentru a continua.",
    sv: "Det här steget är klart — tryck på Nästa för att fortsätta.",
    da: "Dette trin er færdigt — tryk på Næste for at fortsætte.",
    nb: "Dette trinnet er ferdig — trykk på Neste for å fortsette.",
    fi: "Tämä vaihe on valmis — jatka napauttamalla Seuraava.",
    pl: "Ten krok jest gotowy — dotknij Dalej, aby kontynuować.",
    cs: "Tento krok je hotový — pokračujte klepnutím na Další.",
    sk: "Tento krok je hotový — pokračujte ťuknutím na Ďalej.",
    hu: "Ez a lépés kész — a folytatáshoz koppintson a Tovább gombra.",
    el: "Αυτό το βήμα ολοκληρώθηκε — πατήστε Επόμενο για να συνεχίσετε.",
    bg: "Тази стъпка е готова — натиснете Напред, за да продължите.",
    hr: "Ovaj je korak gotov — dodirnite Dalje za nastavak.",
    sr: "Овај корак је готов — додирните Даље да наставите.",
    sl: "Ta korak je končan — tapnite Naprej za nadaljevanje.",
    et: "See samm on valmis — jätkamiseks puudutage Edasi.",
    lv: "Šis solis ir pabeigts — pieskarieties Tālāk, lai turpinātu.",
    lt: "Šis žingsnis baigtas — palieskite Toliau, kad tęstumėte.",
    tr: "Bu adım tamamlandı — devam etmek için İleri'ye dokunun.",
    ru: "Этот шаг завершён — нажмите «Далее», чтобы продолжить.",
    uk: "Цей крок завершено — натисніть «Далі», щоб продовжити.",
    ca: "Aquest pas està complet — toca Següent per continuar.",
    id: "Langkah ini selesai — ketuk Berikutnya untuk melanjutkan.",
    vi: "Bước này đã xong — chạm Tiếp theo để tiếp tục.",
    th: "ขั้นตอนนี้เสร็จแล้ว — แตะถัดไปเพื่อดำเนินการต่อ",
    zh: "此步骤已完成——点按“下一步”继续。",
    ja: "このステップは完了です — 「次へ」をタップして続行してください。",
    ko: "이 단계가 완료되었습니다 — 계속하려면 다음을 탭하세요.",
    ar: "اكتملت هذه الخطوة — اضغط «التالي» للمتابعة.",
    he: "השלב הזה הושלם — הקישו על הבא כדי להמשיך.",
    hi: "यह चरण पूरा हो गया — जारी रखने के लिए ‘आगे’ पर टैप करें।",
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
console.log(`✓ stepDoneHint added to ${n} locale(s).`);
