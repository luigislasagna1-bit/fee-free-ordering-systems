/**
 * Multi-source import copy (2026-07-14) ×38 — reword the GloriaFood import page
 * to also cover Uber Eats:
 *   admin.importGloriaFood.{pageTitle, pageSubtitleNote, inputLabel, inputHint}
 *   marketing.importPage.{subtitle, linkLabel, linkPlaceholder, linkHint}
 * inputHint keeps its two <strong> rich tags. English inline; 37 non-English
 * packs live in scripts/i18n-data/import-multisource/.
 *   npx tsx scripts/i18n-add-import-multisource.ts
 */
import fs from "fs";
import path from "path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

const ADMIN_KEYS = ["pageTitle", "pageSubtitleNote", "inputLabel", "inputHint"] as const;
const PUBLIC_KEYS = ["subtitle", "linkLabel", "linkPlaceholder", "linkHint"] as const;

const en: Record<string, string> = {
  pageTitle: "Import your menu",
  pageSubtitleNote: "Works with GloriaFood (and FoodBooking white-labels like Sams Restaurant Systems) and Uber Eats.",
  inputLabel: "GloriaFood snippet / URL, or your Uber Eats store link",
  inputHint: "<strong>GloriaFood:</strong> Publish → Ordering Button → copy the HTML snippet (or paste your ordering URL or UID). <strong>Uber Eats:</strong> copy your store link from the Uber Eats page — the one with /store/ in it.",
  subtitle: "Paste your GloriaFood or Uber Eats menu and we’ll build your branded ordering page — photos, sizes and toppings included.",
  linkLabel: "Your GloriaFood or Uber Eats menu link",
  linkPlaceholder: "Paste your GloriaFood or Uber Eats ordering link…",
  linkHint: "GloriaFood: Publish → Ordering Button → copy the snippet. Uber Eats: copy your store link (the one with /store/ in it). Or paste your ordering page URL.",
};

// Some translators emit &lt;strong&gt; for the literal tags — decode back to raw
// so next-intl's t.rich sees real <strong> tags (parity's rich-tag check).
function decode(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}

const dataDir = path.join(process.cwd(), "scripts", "i18n-data", "import-multisource");
const packs: Record<string, Record<string, string>> = { en };
for (const f of fs.readdirSync(dataDir).filter((n) => n.endsWith(".json"))) {
  const group = JSON.parse(fs.readFileSync(path.join(dataDir, f), "utf8"));
  for (const [loc, obj] of Object.entries(group as Record<string, any>)) packs[loc] = obj;
}

const dir = path.join(process.cwd(), "src", "messages");
let changed = 0;
for (const loc of SUPPORTED_LOCALES) {
  const pack = packs[loc];
  if (!pack) throw new Error(`${loc}: missing translations`);
  for (const k of [...ADMIN_KEYS, ...PUBLIC_KEYS]) if (typeof pack[k] !== "string") throw new Error(`${loc}: missing ${k}`);

  const file = path.join(dir, `${loc}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  const admin = (((json.admin ??= {}).importGloriaFood ??= {}));
  for (const k of ADMIN_KEYS) admin[k] = decode(pack[k]);
  const pub = (((json.marketing ??= {}).importPage ??= {}));
  for (const k of PUBLIC_KEYS) pub[k] = decode(pack[k]);

  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(`✅ import multi-source copy (8 keys) written to ${changed} locale file(s)`);
