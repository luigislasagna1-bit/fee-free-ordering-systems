/** i18n × 38: admin Menu Management bulk "Expand all" / "Collapse all"
 *  (Fabrizio cmr809iu8 — 113-category menus need bulk collapse).
 *  Run: npx tsx scripts/i18n-add-menu-expand-collapse.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const DIR = join(process.cwd(), "src", "messages");

const K: Record<string, Record<string, string>> = {
  "admin.menuEditor.expandAll": {
    en: "Expand all", fr: "Tout déplier", es: "Expandir todo", it: "Espandi tutto",
    pt: "Expandir tudo", "pt-BR": "Expandir tudo", de: "Alle ausklappen", nl: "Alles uitklappen",
    ro: "Extinde tot", sv: "Expandera alla", da: "Udvid alle", nb: "Utvid alle",
    fi: "Laajenna kaikki", pl: "Rozwiń wszystko", cs: "Rozbalit vše", sk: "Rozbaliť všetko",
    hu: "Összes kibontása", el: "Ανάπτυξη όλων", bg: "Разгъни всички", hr: "Proširi sve",
    sr: "Прошири све", sl: "Razširi vse", et: "Laienda kõik", lv: "Izvērst visu",
    lt: "Išskleisti viską", tr: "Tümünü genişlet", ru: "Развернуть все", uk: "Розгорнути все",
    ca: "Expandeix-ho tot", id: "Perluas semua", vi: "Mở rộng tất cả", th: "ขยายทั้งหมด",
    zh: "全部展开", ja: "すべて展開", ko: "모두 펼치기", ar: "توسيع الكل", he: "הרחב הכול",
    hi: "सभी विस्तृत करें",
  },
  "admin.menuEditor.collapseAll": {
    en: "Collapse all", fr: "Tout replier", es: "Contraer todo", it: "Comprimi tutto",
    pt: "Recolher tudo", "pt-BR": "Recolher tudo", de: "Alle einklappen", nl: "Alles inklappen",
    ro: "Restrânge tot", sv: "Fäll ihop alla", da: "Skjul alle", nb: "Skjul alle",
    fi: "Supista kaikki", pl: "Zwiń wszystko", cs: "Sbalit vše", sk: "Zbaliť všetko",
    hu: "Összes összecsukása", el: "Σύμπτυξη όλων", bg: "Свий всички", hr: "Sažmi sve",
    sr: "Скупи све", sl: "Strni vse", et: "Ahenda kõik", lv: "Sakļaut visu",
    lt: "Suskleisti viską", tr: "Tümünü daralt", ru: "Свернуть все", uk: "Згорнути все",
    ca: "Redueix-ho tot", id: "Ciutkan semua", vi: "Thu gọn tất cả", th: "ยุบทั้งหมด",
    zh: "全部折叠", ja: "すべて折りたたむ", ko: "모두 접기", ar: "طي الكل", he: "כווץ הכול",
    hi: "सभी संक्षिप्त करें",
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
console.log(`✓ expand/collapse-all added to ${n} locale(s).`);
