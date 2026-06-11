/** i18n: admin.marketingStudio.scansOverTime + noScansYet (P4) × 38 locales.
 *   npx tsx scripts/i18n-add-scan-analytics.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");

const KEYS: Record<string, Record<string, string>> = {
  "admin.marketingStudio.scansOverTime": {
    en: "Scans (last 30 days)", fr: "Scans (30 derniers jours)", es: "Escaneos (últimos 30 días)", it: "Scansioni (ultimi 30 giorni)", pt: "Leituras (últimos 30 dias)", "pt-BR": "Leituras (últimos 30 dias)",
    de: "Scans (letzte 30 Tage)", nl: "Scans (laatste 30 dagen)", ro: "Scanări (ultimele 30 de zile)", sv: "Skanningar (senaste 30 dagarna)", da: "Scanninger (seneste 30 dage)", nb: "Skanninger (siste 30 dager)",
    fi: "Skannaukset (viimeiset 30 päivää)", pl: "Skany (ostatnie 30 dni)", cs: "Skeny (posledních 30 dní)", sk: "Skeny (posledných 30 dní)", hu: "Beolvasások (utolsó 30 nap)", el: "Σαρώσεις (τελευταίες 30 ημέρες)",
    bg: "Сканирания (последните 30 дни)", hr: "Skeniranja (zadnjih 30 dana)", sr: "Скенирања (последњих 30 дана)", sl: "Skeniranja (zadnjih 30 dni)", et: "Skannimised (viimased 30 päeva)", lv: "Skenēšanas (pēdējās 30 dienas)",
    lt: "Nuskaitymai (paskutinės 30 d.)", tr: "Taramalar (son 30 gün)", ru: "Сканирования (последние 30 дней)", uk: "Сканування (останні 30 днів)", ca: "Escanejos (últims 30 dies)", id: "Pemindaian (30 hari terakhir)",
    vi: "Lượt quét (30 ngày qua)", th: "การสแกน (30 วันที่ผ่านมา)", zh: "扫描（最近30天）", ja: "スキャン（過去30日）", ko: "스캔 (최근 30일)", ar: "عمليات المسح (آخر 30 يومًا)", he: "סריקות (30 הימים האחרונים)", hi: "स्कैन (पिछले 30 दिन)",
  },
  "admin.marketingStudio.noScansYet": {
    en: "No scans yet", fr: "Aucun scan pour l'instant", es: "Aún no hay escaneos", it: "Ancora nessuna scansione", pt: "Ainda sem leituras", "pt-BR": "Ainda sem leituras",
    de: "Noch keine Scans", nl: "Nog geen scans", ro: "Încă nicio scanare", sv: "Inga skanningar ännu", da: "Ingen scanninger endnu", nb: "Ingen skanninger ennå",
    fi: "Ei vielä skannauksia", pl: "Brak skanów", cs: "Zatím žádné skeny", sk: "Zatiaľ žiadne skeny", hu: "Még nincs beolvasás", el: "Δεν υπάρχουν σαρώσεις ακόμη",
    bg: "Все още няма сканирания", hr: "Još nema skeniranja", sr: "Још нема скенирања", sl: "Še ni skeniranj", et: "Skannimisi veel pole", lv: "Pagaidām nav skenēšanu",
    lt: "Kol kas nėra nuskaitymų", tr: "Henüz tarama yok", ru: "Пока нет сканирований", uk: "Поки немає сканувань", ca: "Encara no hi ha escanejos", id: "Belum ada pemindaian",
    vi: "Chưa có lượt quét", th: "ยังไม่มีการสแกน", zh: "暂无扫描", ja: "スキャンはまだありません", ko: "아직 스캔이 없습니다", ar: "لا توجد عمليات مسح بعد", he: "אין סריקות עדיין", hi: "अभी कोई स्कैन नहीं",
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
console.log(`✓ scan-analytics strings added to ${n} locale(s).`);
