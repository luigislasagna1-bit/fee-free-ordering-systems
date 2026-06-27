/** Fold the 30 new soft-launch + 4-card translations (_newsec-<code>.json) into
 *  scripts/i18n-data/home.json, validating the <accent> tag on softlaunch.title.
 *  Run: npx tsx scripts/_assemble-newsec.ts ; then merge + parity.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SRC = "scripts/i18n-data/home.json";
const P = "marketing.home.v2.";
const KEYS = [
  "softlaunch.eyebrow", "softlaunch.title", "softlaunch.body", "softlaunch.tick1", "softlaunch.tick2",
  "softlaunch.tick3", "softlaunch.cta", "softlaunch.imgAlt",
  "cards.reports.eyebrow", "cards.reports.title", "cards.reports.b1", "cards.reports.b2", "cards.reports.b3", "cards.reports.b4",
  "cards.app.eyebrow", "cards.app.title", "cards.app.body",
  "cards.growth.eyebrow", "cards.growth.title", "cards.growth.b1", "cards.growth.b2", "cards.growth.b3", "cards.growth.b4",
  "cards.data.eyebrow", "cards.data.title", "cards.data.body", "cards.data.b1", "cards.data.b2", "cards.data.b3", "cards.data.b4",
].map((k) => P + k);
const LOCALES = ["ar","bg","ca","cs","da","de","el","es","et","fi","fr","he","hi","hr","hu","id","it","ja","ko","lt","lv","nb","nl","pl","pt-BR","pt","ro","ru","sk","sl","sr","sv","th","tr","uk","vi","zh"];

const home = JSON.parse(readFileSync(SRC, "utf8")) as Record<string, Record<string, string>>;
const accentKey = P + "softlaunch.title";
const hasAccent = (s: string) => /<accent>[\s\S]*<\/accent>/.test(s);

let fallback = 0, missing = 0;
for (const loc of LOCALES) {
  const f = `scripts/i18n-data/_newsec-${loc}.json`;
  if (!existsSync(f)) { console.log(`✗ MISSING file: ${loc}`); for (const k of KEYS) home[k][loc] = home[k].en; missing++; continue; }
  let data: Record<string, string>;
  try { data = JSON.parse(readFileSync(f, "utf8")); } catch { console.log(`✗ parse err: ${loc}`); for (const k of KEYS) home[k][loc] = home[k].en; missing++; continue; }
  for (const k of KEYS) {
    const v = data[k];
    if (typeof v !== "string" || !v.trim()) { home[k][loc] = home[k].en; fallback++; continue; }
    if (k === accentKey && !hasAccent(v)) { console.log(`⚠ ${loc} softlaunch.title missing <accent> → en`); home[k][loc] = home[k].en; fallback++; continue; }
    home[k][loc] = v;
  }
}
writeFileSync(SRC, JSON.stringify(home, null, 2) + "\n");
console.log(`newsec folded in. missing files: ${missing} · cell fallbacks: ${fallback}`);
