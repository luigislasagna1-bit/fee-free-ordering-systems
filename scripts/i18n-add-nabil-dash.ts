/**
 * Nabil dashboard i18n baseline merge.
 *
 * Reads every manifest at scripts/i18n-data/nabil-dash/keys-*.json
 * ({ "full.key.path": "English source" }) written by the build workstreams and
 * inserts each key into ALL 38 locale files (src/messages/<code>.json) with the
 * ENGLISH text as the baseline, so i18n-parity-all passes immediately.
 * Real translations are applied afterwards by the wf-translate-keys workflow —
 * this script is idempotent and NEVER overwrites an existing value (so re-runs
 * after translation don't clobber translated strings).
 *
 *   npx tsx scripts/i18n-add-nabil-dash.ts          # write
 *   npx tsx scripts/i18n-add-nabil-dash.ts --check  # report only, exit 1 on missing
 */
import fs from "node:fs";
import path from "node:path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

const ROOT = path.join(__dirname, "..");
const MANIFEST_DIR = path.join(__dirname, "i18n-data", "nabil-dash");
const MESSAGES_DIR = path.join(ROOT, "src", "messages");
const CHECK = process.argv.includes("--check");

function deepSet(obj: Record<string, any>, dotted: string, value: string): boolean {
  const parts = dotted.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] === undefined) cur[p] = {};
    if (typeof cur[p] !== "object" || cur[p] === null || Array.isArray(cur[p])) {
      throw new Error(`Key path conflict at "${parts.slice(0, i + 1).join(".")}" (non-object in the way) for "${dotted}"`);
    }
    cur = cur[p];
  }
  const leaf = parts[parts.length - 1];
  if (cur[leaf] !== undefined) return false; // never overwrite (translated or pre-existing)
  cur[leaf] = value;
  return true;
}

function main() {
  if (!fs.existsSync(MANIFEST_DIR)) {
    console.error(`No manifest dir at ${MANIFEST_DIR} — nothing to merge.`);
    process.exit(1);
  }
  const manifests = fs.readdirSync(MANIFEST_DIR).filter((f) => /^keys-[A-Z]\.json$/.test(f));
  const keys: Record<string, string> = {};
  for (const f of manifests) {
    const data = JSON.parse(fs.readFileSync(path.join(MANIFEST_DIR, f), "utf8"));
    for (const [k, v] of Object.entries(data)) {
      if (typeof v !== "string" || !v.trim()) throw new Error(`${f}: "${k}" has a non-string/empty value`);
      if (keys[k] !== undefined && keys[k] !== v) throw new Error(`Manifest conflict on "${k}": "${keys[k]}" vs "${v}"`);
      keys[k] = v;
    }
  }
  const keyCount = Object.keys(keys).length;
  console.log(`Merged ${manifests.length} manifests → ${keyCount} unique keys.`);
  if (keyCount === 0) process.exit(CHECK ? 1 : 0);

  let totalAdded = 0;
  const missingByLocale: Record<string, number> = {};
  for (const code of SUPPORTED_LOCALES) {
    const file = path.join(MESSAGES_DIR, `${code}.json`);
    const json = JSON.parse(fs.readFileSync(file, "utf8"));
    let added = 0;
    for (const [k, v] of Object.entries(keys)) {
      if (CHECK) {
        // report-only: count keys that would be added
        const parts = k.split(".");
        let cur: any = json;
        for (const p of parts) { cur = cur?.[p]; if (cur === undefined) break; }
        if (cur === undefined) added++;
      } else if (deepSet(json, k, v)) {
        added++;
      }
    }
    if (!CHECK && added > 0) {
      fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
    }
    missingByLocale[code] = added;
    totalAdded += added;
  }
  const nonZero = Object.entries(missingByLocale).filter(([, n]) => n > 0);
  console.log(
    CHECK
      ? `--check: ${totalAdded} key-slots missing across ${nonZero.length} locales.`
      : `Added ${totalAdded} key-slots across ${nonZero.length} locales (English baseline).`,
  );
  if (CHECK && totalAdded > 0) process.exit(1);
}

main();
