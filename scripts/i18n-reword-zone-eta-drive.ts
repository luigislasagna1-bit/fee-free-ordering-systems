/** i18n × 38 (Fabrizio cmqt99i8s, 2026-07-04): the delivery-zone line keeps
 *  showing the zone's minutes but labeled as DRIVE/travel time — the big
 *  time-choice estimate now uses the service's configured Estimated time.
 *  Rewrites 2 existing keys. Run: npx tsx scripts/i18n-reword-zone-eta-drive.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "checkout.youreIn": {
    en: "You're in {zone} — Fee {fee}, ~{minutes} min drive from us.",
    fr: "Vous êtes dans {zone} — Frais {fee}, ~{minutes} min de route depuis chez nous.",
    es: "Estás en {zone} — Tarifa {fee}, ~{minutes} min en coche desde el local.",
    it: "Sei nella zona {zone} — Costo {fee}, ~{minutes} min di strada da noi.",
    pt: "Está em {zone} — Taxa {fee}, ~{minutes} min de viagem desde o restaurante.",
    "pt-BR": "Você está em {zone} — Taxa {fee}, ~{minutes} min de trajeto do restaurante.",
    de: "Sie sind in {zone} — Gebühr {fee}, ~{minutes} Min. Fahrt von uns.",
    nl: "Je zit in {zone} — Kosten {fee}, ~{minutes} min rijden vanaf ons.",
    ro: "Sunteți în {zone} — Taxă {fee}, ~{minutes} min de drum de la noi.",
    sv: "Du är i {zone} — Avgift {fee}, ~{minutes} min körning från oss.",
    da: "Du er i {zone} — Gebyr {fee}, ~{minutes} min kørsel fra os.",
    nb: "Du er i {zone} — Gebyr {fee}, ~{minutes} min kjøring fra oss.",
    fi: "Olet alueella {zone} — Maksu {fee}, ~{minutes} min ajomatka meiltä.",
    pl: "Jesteś w {zone} — Opłata {fee}, ~{minutes} min jazdy od nas.",
    cs: "Jste v {zone} — Poplatek {fee}, ~{minutes} min jízdy od nás.",
    sk: "Ste v {zone} — Poplatok {fee}, ~{minutes} min jazdy od nás.",
    hu: "Ön itt van: {zone} — Díj {fee}, ~{minutes} perc autóút tőlünk.",
    el: "Είστε στη ζώνη {zone} — Χρέωση {fee}, ~{minutes} λεπτά οδικώς από εμάς.",
    bg: "Намирате се в {zone} — Такса {fee}, ~{minutes} мин път от нас.",
    hr: "U zoni ste {zone} — Naknada {fee}, ~{minutes} min vožnje od nas.",
    sr: "У зони сте {zone} — Накнада {fee}, ~{minutes} мин вожње од нас.",
    sl: "Ste v {zone} — Pristojbina {fee}, ~{minutes} min vožnje od nas.",
    et: "Olete tsoonis {zone} — Tasu {fee}, ~{minutes} min sõitu meist.",
    lv: "Jūs esat zonā {zone} — Maksa {fee}, ~{minutes} min brauciena no mums.",
    lt: "Esate zonoje {zone} — Mokestis {fee}, ~{minutes} min kelio nuo mūsų.",
    tr: "{zone} bölgesindesiniz — Ücret {fee}, bizden ~{minutes} dk sürüş.",
    ru: "Вы в зоне {zone} — Сбор {fee}, ~{minutes} мин езды от нас.",
    uk: "Ви в зоні {zone} — Плата {fee}, ~{minutes} хв дороги від нас.",
    ca: "Ets a {zone} — Tarifa {fee}, ~{minutes} min en cotxe des d'aquí.",
    id: "Anda berada di {zone} — Biaya {fee}, ~{minutes} mnt berkendara dari kami.",
    vi: "Bạn ở {zone} — Phí {fee}, ~{minutes} phút lái xe từ nhà hàng.",
    th: "คุณอยู่ใน {zone} — ค่าส่ง {fee} ใช้เวลาขับ ~{minutes} นาทีจากร้าน",
    zh: "您在{zone} — 配送费 {fee}，距我们约 {minutes} 分钟车程。",
    ja: "{zone} 内です — 料金 {fee}、当店から車で約 {minutes} 分。",
    ko: "{zone} 구역입니다 — 요금 {fee}, 매장에서 차로 약 {minutes}분.",
    ar: "أنت في {zone} — الرسوم {fee}، حوالي {minutes} دقيقة بالسيارة من عندنا.",
    he: "אתם ב-{zone} — עמלה {fee}, כ-{minutes} דק' נסיעה מאיתנו.",
    hi: "आप {zone} में हैं — शुल्क {fee}, हमसे ~{minutes} मिनट की ड्राइव।",
  },
  "ordering.deliveryAreaHint": {
    en: "{zone} · ~{minutes} min drive",
    fr: "{zone} · ~{minutes} min de route",
    es: "{zone} · ~{minutes} min en coche",
    it: "{zone} · ~{minutes} min di strada",
    pt: "{zone} · ~{minutes} min de viagem",
    "pt-BR": "{zone} · ~{minutes} min de trajeto",
    de: "{zone} · ~{minutes} Min. Fahrt",
    nl: "{zone} · ~{minutes} min rijden",
    ro: "{zone} · ~{minutes} min de drum",
    sv: "{zone} · ~{minutes} min körning",
    da: "{zone} · ~{minutes} min kørsel",
    nb: "{zone} · ~{minutes} min kjøring",
    fi: "{zone} · ~{minutes} min ajomatka",
    pl: "{zone} · ~{minutes} min jazdy",
    cs: "{zone} · ~{minutes} min jízdy",
    sk: "{zone} · ~{minutes} min jazdy",
    hu: "{zone} · ~{minutes} perc autóút",
    el: "{zone} · ~{minutes} λεπτά οδικώς",
    bg: "{zone} · ~{minutes} мин път",
    hr: "{zone} · ~{minutes} min vožnje",
    sr: "{zone} · ~{minutes} мин вожње",
    sl: "{zone} · ~{minutes} min vožnje",
    et: "{zone} · ~{minutes} min sõitu",
    lv: "{zone} · ~{minutes} min brauciens",
    lt: "{zone} · ~{minutes} min kelio",
    tr: "{zone} · ~{minutes} dk sürüş",
    ru: "{zone} · ~{minutes} мин езды",
    uk: "{zone} · ~{minutes} хв дороги",
    ca: "{zone} · ~{minutes} min en cotxe",
    id: "{zone} · ~{minutes} mnt berkendara",
    vi: "{zone} · ~{minutes} phút lái xe",
    th: "{zone} · ขับ ~{minutes} นาที",
    zh: "{zone} · 约 {minutes} 分钟车程",
    ja: "{zone} · 車で約 {minutes} 分",
    ko: "{zone} · 차로 약 {minutes}분",
    ar: "{zone} · ~{minutes} دقيقة بالسيارة",
    he: "{zone} · כ-{minutes} דק' נסיעה",
    hi: "{zone} · ~{minutes} मिनट ड्राइव",
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
console.log(`✓ Zone drive-time wording applied to ${n} locale(s).`);
