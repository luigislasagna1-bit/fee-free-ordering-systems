/**
 * One-shot i18n patch for the VIP-aware Autopilot audience controls
 * (Luigi 2026-08-11, from Ben Bilton's report — a VIP club member was emailed a
 * 5%-off win-back on top of his 30% club discount).
 *
 * Adds, across all 38 locales:
 *   admin.customerGroups.autopilot*   — the per-group "already gets club pricing" switch
 *   admin.autopilotClient.audience*   — who-gets-offers summary (replaces the
 *                                        old "Segment targeting — Coming Soon" card)
 *   admin.autopilotClient.vipMode*    — the per-campaign three-way policy
 *   emailFooter.memberPerk.*          — the CUSTOMER-facing card that replaces the
 *                                        coupon block for a club member
 *
 * Translations live beside this file in `_vip-i18n-table.json` so the copy can be
 * reviewed as data rather than buried in code. "Autopilot" is a product name and
 * is never translated; {count}/{groups}/{group} placeholders are verified below
 * before anything is written — a lost placeholder would render a broken sentence
 * to a real customer, so this refuses to write rather than ship one.
 *
 *   npx tsx scripts/i18n-add-vip-autopilot.ts
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");
const TABLE = JSON.parse(
  readFileSync(join(process.cwd(), "scripts", "_vip-i18n-table.json"), "utf8"),
) as { en: Record<string, string>; keys: string[]; locales: Record<string, Record<string, string>> };

const { en, keys, locales } = TABLE;

/** Placeholders that MUST survive translation, per key. */
const REQUIRED_PLACEHOLDERS: Record<string, string[]> = {
  "admin.autopilotClient.audienceSkipping": ["{count}", "{groups}"],
  "emailFooter.memberPerk.body": ["{group}"],
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

// ── Verify BEFORE writing anything ──────────────────────────────────────────
const files = readdirSync(DIR).filter((f) => f.endsWith(".json"));
const problems: string[] = [];
for (const f of files) {
  const loc = f.replace(".json", "");
  const table = loc === "en" ? en : locales[loc];
  if (!table) { problems.push(`${loc}: no translations supplied`); continue; }
  for (const k of keys) {
    const v = table[k];
    if (typeof v !== "string" || !v.trim()) { problems.push(`${loc}.${k}: missing`); continue; }
    for (const p of REQUIRED_PLACEHOLDERS[k] ?? []) {
      if (!v.includes(p)) problems.push(`${loc}.${k}: lost placeholder ${p}`);
    }
    if (en[k].includes("Autopilot") && !v.includes("Autopilot")) {
      problems.push(`${loc}.${k}: product name "Autopilot" was translated`);
    }
  }
}
if (problems.length) {
  console.error(`✗ REFUSING TO WRITE — ${problems.length} problem(s):`);
  for (const p of problems.slice(0, 40)) console.error(`   ${p}`);
  process.exit(1);
}

let n = 0;
for (const f of files) {
  const loc = f.replace(".json", "");
  const table = loc === "en" ? en : locales[loc];
  const path = join(DIR, f);
  const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  for (const k of keys) setDeep(data, k, table[k]);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
console.log(`✓ ${keys.length} VIP/Autopilot keys written to ${n} locale(s).`);
