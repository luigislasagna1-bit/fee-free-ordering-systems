/** i18n × 38: Nabil dashboard upgrade — phone-keyed caller history page,
 *  Overview greeting + month headline + top callers, calls-tab filter chips,
 *  call-detail caller links (Luigi 2026-08-22). English baseline lives in
 *  scripts/i18n-data/nabil-callers/en.json; translations in group*.json
 *  (same folder) as { locale: { key: text } }. Idempotent — re-running
 *  overwrites these keys only. Any locale missing a key falls back to English
 *  so parity never breaks; the parity audit then shows it as identical-to-en
 *  rather than missing.
 *
 *    npx tsx scripts/i18n-add-nabil-callers.ts
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

const MESSAGES = join(process.cwd(), "src", "messages");
const DATA = join(process.cwd(), "scripts", "i18n-data", "nabil-callers");

const en = JSON.parse(readFileSync(join(DATA, "en.json"), "utf8")) as Record<string, string>;
const byLocale: Record<string, Record<string, string>> = { en };
for (const f of readdirSync(DATA).filter((x) => /^group\d+\.json$/.test(x))) {
  const group = JSON.parse(readFileSync(join(DATA, f), "utf8")) as Record<string, Record<string, string>>;
  for (const [loc, keys] of Object.entries(group)) byLocale[loc] = { ...(byLocale[loc] ?? {}), ...keys };
}

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

let fallbacks = 0;
for (const loc of SUPPORTED_LOCALES) {
  const path = join(MESSAGES, `${loc}.json`);
  if (!existsSync(path)) throw new Error(`missing dictionary ${path}`);
  const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const strings = byLocale[loc] ?? {};
  for (const [key, enText] of Object.entries(en)) {
    const text = strings[key];
    if (typeof text !== "string" || !text.trim()) {
      if (loc !== "en") fallbacks++;
      setDeep(data, key, enText);
    } else {
      setDeep(data, key, text);
    }
  }
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
}
console.log(`✓ ${Object.keys(en).length} keys written to ${SUPPORTED_LOCALES.length} locale(s)${fallbacks ? ` — ${fallbacks} English fallback(s), translate those` : ""}.`);
