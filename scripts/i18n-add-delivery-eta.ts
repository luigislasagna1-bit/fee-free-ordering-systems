/** i18n: kitchen delivery distance/ETA strings × 38 locales.
 *   kitchen.{openInMaps,calculatingEta,etaTrafficNote}
 *   npx tsx scripts/i18n-add-delivery-eta.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");

const KEYS: Record<string, Record<string, string>> = {
  "kitchen.openInMaps": {
    en: "Open in Maps", fr: "Ouvrir dans Maps", es: "Abrir en Maps", it: "Apri in Maps", pt: "Abrir no Maps", "pt-BR": "Abrir no Maps",
    de: "In Maps öffnen", nl: "Openen in Maps", ro: "Deschide în Maps", sv: "Öppna i Maps", da: "Åbn i Maps", nb: "Åpne i Maps",
    fi: "Avaa Mapsissa", pl: "Otwórz w Mapach", cs: "Otevřít v Mapách", sk: "Otvoriť v Mapách", hu: "Megnyitás a Térképen", el: "Άνοιγμα στους Χάρτες",
    bg: "Отвори в Карти", hr: "Otvori u Kartama", sr: "Отвори у Картама", sl: "Odpri v Zemljevidih", et: "Ava Mapsis", lv: "Atvērt Maps",
    lt: "Atidaryti Maps", tr: "Haritalar'da aç", ru: "Открыть в Картах", uk: "Відкрити в Картах", ca: "Obre a Maps", id: "Buka di Maps",
    vi: "Mở trong Maps", th: "เปิดในแผนที่", zh: "在地图中打开", ja: "マップで開く", ko: "지도에서 열기", ar: "افتح في الخرائط", he: "פתח במפות", hi: "मैप्स में खोलें",
  },
  "kitchen.calculatingEta": {
    en: "Calculating distance…", fr: "Calcul de la distance…", es: "Calculando distancia…", it: "Calcolo distanza…", pt: "A calcular distância…", "pt-BR": "Calculando distância…",
    de: "Entfernung wird berechnet…", nl: "Afstand berekenen…", ro: "Se calculează distanța…", sv: "Beräknar avstånd…", da: "Beregner afstand…", nb: "Beregner avstand…",
    fi: "Lasketaan etäisyyttä…", pl: "Obliczanie odległości…", cs: "Výpočet vzdálenosti…", sk: "Výpočet vzdialenosti…", hu: "Távolság számítása…", el: "Υπολογισμός απόστασης…",
    bg: "Изчисляване на разстояние…", hr: "Izračun udaljenosti…", sr: "Израчунавање удаљености…", sl: "Računanje razdalje…", et: "Vahemaa arvutamine…", lv: "Aprēķina attālumu…",
    lt: "Skaičiuojamas atstumas…", tr: "Mesafe hesaplanıyor…", ru: "Расчёт расстояния…", uk: "Розрахунок відстані…", ca: "Calculant distància…", id: "Menghitung jarak…",
    vi: "Đang tính khoảng cách…", th: "กำลังคำนวณระยะทาง…", zh: "正在计算距离…", ja: "距離を計算中…", ko: "거리 계산 중…", ar: "جارٍ حساب المسافة…", he: "מחשב מרחק…", hi: "दूरी की गणना…",
  },
  "kitchen.etaTrafficNote": {
    en: "Drive time with current traffic", fr: "Temps de trajet avec le trafic actuel", es: "Tiempo de viaje con el tráfico actual", it: "Tempo di guida con il traffico attuale", pt: "Tempo de condução com o trânsito atual", "pt-BR": "Tempo de viagem com o trânsito atual",
    de: "Fahrzeit mit aktuellem Verkehr", nl: "Rijtijd met huidig verkeer", ro: "Timp de condus cu traficul actual", sv: "Körtid med aktuell trafik", da: "Køretid med aktuel trafik", nb: "Kjøretid med dagens trafikk",
    fi: "Ajoaika nykyisellä liikenteellä", pl: "Czas jazdy przy obecnym ruchu", cs: "Doba jízdy při aktuálním provozu", sk: "Čas jazdy pri aktuálnej premávke", hu: "Menetidő a jelenlegi forgalommal", el: "Χρόνος οδήγησης με την τρέχουσα κίνηση",
    bg: "Време за път при текущия трафик", hr: "Vrijeme vožnje uz trenutni promet", sr: "Време вожње уз тренутни саобраћај", sl: "Čas vožnje glede na trenutni promet", et: "Sõiduaeg praeguse liiklusega", lv: "Brauciena laiks pašreizējā satiksmē",
    lt: "Kelionės laikas esant dabartiniam eismui", tr: "Mevcut trafikle sürüş süresi", ru: "Время в пути с учётом текущего трафика", uk: "Час у дорозі з урахуванням поточного трафіку", ca: "Temps de conducció amb el trànsit actual", id: "Waktu berkendara dengan lalu lintas saat ini",
    vi: "Thời gian lái xe theo giao thông hiện tại", th: "เวลาขับขี่ตามการจราจรปัจจุบัน", zh: "按当前路况的驾车时间", ja: "現在の交通状況での所要時間", ko: "현재 교통 상황 기준 운전 시간", ar: "وقت القيادة وفقًا لحركة المرور الحالية", he: "זמן נסיעה לפי התנועה הנוכחית", hi: "मौजूदा ट्रैफ़िक के साथ ड्राइव समय",
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
console.log(`✓ delivery-eta strings added to ${n} locale(s).`);
