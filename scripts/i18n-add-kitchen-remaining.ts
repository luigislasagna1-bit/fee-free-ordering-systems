/**
 * Kitchen remaining-surfaces i18n ×38 (2026-07-23): PrinterSetupModal (kitchen.pn*)
 * + KitchenWorkflowToggle (admin.kitchenWorkflow.*). STAGED-MAP design: the
 * editor agents wrote flat { "full.dot.path": "english" } maps to
 * scripts/i18n-data/kitchen-remaining/en-printnode.json + en-workflow.json
 * (single-writer discipline — nobody but THIS script touches messages files).
 * Locale packs are one merged flat file per locale in the same dir.
 *
 * Writes ALL 38 files (en gets the staged English verbatim). Validates:
 * every en key present in every pack, no extras, ICU {args} in the en value
 * survive translation. Fails loudly.
 *   npx tsx scripts/i18n-add-kitchen-remaining.ts
 */
import fs from "fs";
import path from "path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

const dataDir = path.join(process.cwd(), "scripts", "i18n-data", "kitchen-remaining");
const dir = path.join(process.cwd(), "src", "messages");

const en: Record<string, string> = {
  ...JSON.parse(fs.readFileSync(path.join(dataDir, "en-printnode.json"), "utf8")),
  ...JSON.parse(fs.readFileSync(path.join(dataDir, "en-workflow.json"), "utf8")),
};
const KEYS = Object.keys(en);
if (KEYS.length === 0) throw new Error("staged en maps are empty");
// ICU arg names per key, extracted from the en value (strip plural/select bodies first — simple args only expected here)
const argsOf = (v: string): string[] => [...v.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]);

function decode(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function setDeep(obj: Record<string, any>, dotPath: string, value: string) {
  const parts = dotPath.split(".");
  let o = obj;
  for (const p of parts.slice(0, -1)) o = o[p] ??= {};
  o[parts[parts.length - 1]] = value;
}

let changed = 0;
for (const loc of SUPPORTED_LOCALES) {
  let pack: Record<string, string>;
  if (loc === "en") {
    pack = en;
  } else {
    const packFile = path.join(dataDir, `${loc}.json`);
    if (!fs.existsSync(packFile)) throw new Error(`${loc}: missing pack ${packFile}`);
    pack = JSON.parse(fs.readFileSync(packFile, "utf8"));
    const extra = Object.keys(pack).filter((k) => !(k in en));
    if (extra.length) throw new Error(`${loc}: extra keys not in en maps: ${extra.slice(0, 5).join(", ")}${extra.length > 5 ? "…" : ""}`);
  }

  const file = path.join(dir, `${loc}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const k of KEYS) {
    const v = pack[k];
    if (typeof v !== "string" || !v.trim()) throw new Error(`${loc}: ${k} missing/empty`);
    const clean = decode(v).trim();
    for (const a of argsOf(en[k])) {
      if (!clean.includes(`{${a}}`)) throw new Error(`${loc}: ${k} lost ICU arg {${a}}`);
    }
    setDeep(json, k, clean);
  }
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(`✅ kitchen-remaining (${KEYS.length} keys) written to ${changed} locale file(s) incl. en`);
