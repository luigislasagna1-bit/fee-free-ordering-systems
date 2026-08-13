/**
 * Kitchen first-run tour i18n ×38 (Fabrizio report cmrldhwep follow-up,
 * 2026-07-23) — KitchenFirstRunTour.tsx (the 6-slide first-run overlay) was
 * hardcoded English. en.json holds the canonical values (hand-added,
 * validated here); 37 flat packs in scripts/i18n-data/kitchen-tour/<code>.json
 * written by the translator fleet.
 *
 * Fails loudly on missing locale/key/empty value or dropped rich-tag pieces.
 *   npx tsx scripts/i18n-add-kitchen-tour.ts
 */
import fs from "fs";
import path from "path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

/** key → required literal fragments that must survive translation */
const KEYS: Record<string, string[]> = {
  tourSkip: [], tourSkipAria: [], tourBack: [], tourNext: [], tourGotIt: [],
  tourWelcomeTitle: ["Kitchen Order App"],
  tourWelcomeBody: [],
  tourNewOrderTitle: [],
  tourNewOrderBody: ["<flash>", "</flash>", "<accept>", "</accept>"],
  tourFlowTitle: [],
  tourFlowBody: ["<b>", "</b>"],
  tourRejectTitle: [],
  tourRejectBody: ["<reject>", "</reject>"],
  tourPrintingTitle: [],
  tourPrintingBody: ["<gear></gear>"],
  tourPrintingHint: [],
  tourDoneTitle: [],
  tourDoneBody: [],
};

function decode(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

const dataDir = path.join(process.cwd(), "scripts", "i18n-data", "kitchen-tour");
const dir = path.join(process.cwd(), "src", "messages");

// Validate en.json completeness first (source of truth, never rewritten).
const enKitchen = JSON.parse(fs.readFileSync(path.join(dir, "en.json"), "utf8")).kitchen;
for (const k of Object.keys(KEYS)) {
  if (typeof enKitchen?.[k] !== "string") throw new Error(`en.json kitchen.${k} missing`);
}

let changed = 0;
for (const loc of SUPPORTED_LOCALES) {
  if (loc === "en") continue;
  const packFile = path.join(dataDir, `${loc}.json`);
  if (!fs.existsSync(packFile)) throw new Error(`${loc}: missing pack ${packFile}`);
  const pack = JSON.parse(fs.readFileSync(packFile, "utf8")) as Record<string, string>;

  const file = path.join(dir, `${loc}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const kitchen = (json.kitchen ??= {});

  for (const [k, frags] of Object.entries(KEYS)) {
    const v = pack[k];
    if (typeof v !== "string" || !v.trim()) throw new Error(`${loc}: ${k} missing/empty`);
    const clean = decode(v).trim();
    for (const f of frags) {
      if (!clean.includes(f)) throw new Error(`${loc}: ${k} lost required fragment "${f}"`);
    }
    kitchen[k] = clean;
  }
  // tourFlowBody has THREE <b>…</b> pairs (Preparing / Ready / Out for
  // delivery) — the parity audit only compares tag SETS, so enforce the
  // count here where a dropped pair would silently lose a highlight.
  const bOpens = (decode(pack.tourFlowBody).match(/<b>/g) ?? []).length;
  const bCloses = (decode(pack.tourFlowBody).match(/<\/b>/g) ?? []).length;
  if (bOpens !== 3 || bCloses !== 3) throw new Error(`${loc}: tourFlowBody must keep exactly 3 <b>…</b> pairs (got ${bOpens}/${bCloses})`);

  const extra = Object.keys(pack).filter((k) => !(k in KEYS));
  if (extra.length) throw new Error(`${loc}: unexpected extra pack keys: ${extra.join(", ")}`);

  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(`✅ kitchen first-run tour strings (${Object.keys(KEYS).length} keys) spliced into ${changed} locale file(s) (+ en hand-added)`);
