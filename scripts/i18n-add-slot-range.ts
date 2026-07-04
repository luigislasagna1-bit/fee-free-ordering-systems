/** i18n × 38: "Time ranges" option in the per-service time-selection dropdown
 *  (Fabrizio cmqqxerxs). Run: npx tsx scripts/i18n-add-slot-range.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "admin.services.timeSelectionRange": {
    en: "Time ranges (windows like 6:00 – 6:15)",
    fr: "Plages horaires (fenêtres du type 6:00 – 6:15)",
    es: "Rangos horarios (ventanas tipo 6:00 – 6:15)",
    it: "Fasce orarie (finestre tipo 6:00 – 6:15)",
    pt: "Intervalos de tempo (janelas tipo 6:00 – 6:15)",
    "pt-BR": "Faixas de horário (janelas tipo 6:00 – 6:15)",
    de: "Zeitfenster (z. B. 6:00 – 6:15)",
    nl: "Tijdvakken (vensters zoals 6:00 – 6:15)",
    ro: "Intervale orare (ferestre de tip 6:00 – 6:15)",
    sv: "Tidsintervall (fönster som 6:00 – 6:15)",
    da: "Tidsintervaller (vinduer som 6:00 – 6:15)",
    nb: "Tidsintervaller (vinduer som 6:00 – 6:15)",
    fi: "Aikavälit (ikkunat kuten 6:00 – 6:15)",
    pl: "Przedziały czasowe (okna typu 6:00 – 6:15)",
    cs: "Časová rozmezí (okna jako 6:00 – 6:15)",
    sk: "Časové rozpätia (okná ako 6:00 – 6:15)",
    hu: "Idősávok (ablakok, pl. 6:00 – 6:15)",
    el: "Χρονικά διαστήματα (παράθυρα όπως 6:00 – 6:15)",
    bg: "Часови диапазони (прозорци като 6:00 – 6:15)",
    hr: "Vremenski rasponi (prozori poput 6:00 – 6:15)",
    sr: "Временски опсези (прозори попут 6:00 – 6:15)",
    sl: "Časovni razponi (okna kot 6:00 – 6:15)",
    et: "Ajavahemikud (aknad nagu 6:00 – 6:15)",
    lv: "Laika diapazoni (logi kā 6:00 – 6:15)",
    lt: "Laiko intervalai (langai kaip 6:00 – 6:15)",
    tr: "Zaman aralıkları (6:00 – 6:15 gibi pencereler)",
    ru: "Временные диапазоны (окна вида 6:00 – 6:15)",
    uk: "Часові діапазони (вікна на кшталт 6:00 – 6:15)",
    ca: "Franges horàries (finestres com 6:00 – 6:15)",
    id: "Rentang waktu (jendela seperti 6:00 – 6:15)",
    vi: "Khoảng thời gian (khung như 6:00 – 6:15)",
    th: "ช่วงเวลา (หน้าต่างเช่น 6:00 – 6:15)",
    zh: "时间段（如 6:00 – 6:15 的窗口）",
    ja: "時間帯（6:00 – 6:15 のような枠）",
    ko: "시간대(6:00 – 6:15 같은 구간)",
    ar: "نطاقات زمنية (نوافذ مثل 6:00 – 6:15)",
    he: "טווחי זמן (חלונות כמו 6:00 – 6:15)",
    hi: "समय सीमाएँ (जैसे 6:00 – 6:15 की विंडो)",
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
console.log(`✓ Slot-range strings added to ${n} locale(s).`);
