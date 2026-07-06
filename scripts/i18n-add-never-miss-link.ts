/** i18n × 38: homepage S6 → /never-miss-an-order teaser link (Luigi 2026-07-06).
 *  Keeps the beloved homepage fully translated (no lone English string).
 *  Run: npx tsx scripts/i18n-add-never-miss-link.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const KEY = "marketing.home.v2.kitchen.neverMissLink";
const VAL: Record<string, string> = {
  en: "See how nothing ever slips through",
  fr: "Découvrez comment rien ne passe à travers",
  es: "Descubre cómo no se escapa ningún pedido",
  it: "Scopri come non sfugge mai nulla",
  pt: "Veja como nada passa despercebido",
  "pt-BR": "Veja como nada passa despercebido",
  de: "So geht keine Bestellung verloren",
  nl: "Ontdek hoe er niets doorheen glipt",
  ro: "Vezi cum nu-ți scapă nicio comandă",
  sv: "Se hur ingenting slinker igenom",
  da: "Se hvordan intet slipper igennem",
  nb: "Se hvordan ingenting slipper gjennom",
  fi: "Katso, miten mikään ei jää huomaamatta",
  pl: "Zobacz, jak nic nie umknie",
  cs: "Podívejte se, jak nic neproklouzne",
  sk: "Pozrite sa, ako nič neprekĺzne",
  hu: "Nézze meg, hogyan nem sikkad el semmi",
  el: "Δείτε πώς τίποτα δεν ξεφεύγει",
  bg: "Вижте как нищо не се изпуска",
  hr: "Pogledajte kako ništa ne promakne",
  sr: "Погледајте како ништа не промакне",
  sl: "Poglejte, kako nič ne uide",
  et: "Vaadake, kuidas miski ei jää märkamata",
  lv: "Skatiet, kā nekas nepaslīd garām",
  lt: "Pažiūrėkite, kaip niekas nepraslysta",
  tr: "Hiçbir siparişin nasıl kaçmadığını görün",
  ru: "Узнайте, как ничего не ускользает",
  uk: "Дивіться, як ніщо не проходить повз",
  ca: "Mira com no se t'escapa res",
  id: "Lihat cara agar tidak ada yang terlewat",
  vi: "Xem cách không đơn nào bị bỏ lỡ",
  th: "ดูว่าไม่มีออร์เดอร์ไหนหลุดรอดได้อย่างไร",
  zh: "看看订单如何绝不遗漏",
  ja: "注文を絶対に見逃さない仕組みを見る",
  ko: "어떤 주문도 놓치지 않는 방법 보기",
  ar: "اطّلع على كيف لا يفوتك أي طلب",
  he: "ראו איך שום הזמנה לא נשמטת",
  hi: "देखें कि कोई ऑर्डर कैसे नहीं छूटता",
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
  setDeep(data, KEY, VAL[loc] ?? VAL.en);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
console.log(`✓ neverMissLink added to ${n} locale(s).`);
