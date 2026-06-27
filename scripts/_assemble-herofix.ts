/** Fold the 7 re-translated hero keys (_herofix-<code>.json) back into
 *  scripts/i18n-data/home.json, validating the <accent> tag on the title.
 *  Run: npx tsx scripts/_assemble-herofix.ts ; then merge + parity.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SRC = "scripts/i18n-data/home.json";
const KEYS = [
  "marketing.home.v2.hero.title",
  "marketing.home.v2.hero.subtitle",
  "marketing.home.v2.hero.frameAlt",
  "marketing.home.v2.hero.feat1",
  "marketing.home.v2.hero.feat2",
  "marketing.home.v2.hero.feat3",
  "marketing.home.v2.hero.feat4",
];
const LOCALES = ["ar","bg","ca","cs","da","de","el","es","et","fi","fr","he","hi","hr","hu","id","it","ja","ko","lt","lv","nb","nl","pl","pt-BR","pt","ro","ru","sk","sl","sr","sv","th","tr","uk","vi","zh"];

const home = JSON.parse(readFileSync(SRC, "utf8")) as Record<string, Record<string, string>>;
const hasAccent = (s: string) => /<accent>[\s\S]*<\/accent>/.test(s);

let fallback = 0, missing = 0;
for (const loc of LOCALES) {
  const f = `scripts/i18n-data/_herofix-${loc}.json`;
  if (!existsSync(f)) { console.log(`✗ MISSING file: ${loc} (keeping en for 7 keys)`); for (const k of KEYS) home[k][loc] = home[k].en; missing++; continue; }
  let data: Record<string, string>;
  try { data = JSON.parse(readFileSync(f, "utf8")); } catch { console.log(`✗ parse err: ${loc}`); for (const k of KEYS) home[k][loc] = home[k].en; missing++; continue; }
  for (const k of KEYS) {
    const v = data[k];
    if (typeof v !== "string" || !v.trim()) { home[k][loc] = home[k].en; fallback++; continue; }
    if (k.endsWith("hero.title") && !hasAccent(v)) { console.log(`⚠ ${loc} title missing <accent> → en`); home[k][loc] = home[k].en; fallback++; continue; }
    home[k][loc] = v;
  }
}
writeFileSync(SRC, JSON.stringify(home, null, 2) + "\n");
console.log(`herofix folded in. missing files: ${missing} · cell fallbacks: ${fallback}`);
