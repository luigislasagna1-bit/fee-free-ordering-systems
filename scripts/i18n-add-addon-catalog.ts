/**
 * addOnCatalog.<slug>.{name,description} ×38 (2026-07-21) — localized add-on
 * catalog names + descriptions. These were DB-English (AddOn.name/description
 * from seed-addons.ts) on every owner surface + /pricing; they now resolve via
 * src/lib/addon-catalog-i18n.ts with the DB text as fallback.
 *
 * The en block already lives in src/messages/en.json (hand-added, source of
 * truth — this script validates it, never rewrites it). The 37 non-English
 * packs are ONE FILE PER LOCALE in scripts/i18n-data/addon-catalog/<code>.json
 * (written by the translator workflow), shaped exactly like the en block.
 *
 * Also purges the ORPHANED marketing.pricing.addOns block (zero code
 * consumers; superseded by addOnCatalog) from every locale so parity stays
 * clean now that en.json dropped it.
 *
 * Fails loudly on any missing locale/slug/key, empty value, drifted brand
 * name, or unexpected extra pack key.
 *   npx tsx scripts/i18n-add-addon-catalog.ts
 */
import fs from "fs";
import path from "path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

const SLUGS = [
  "growthnet",
  "unlimited_orders",
  "online_payments",
  "hosted_website",
  "custom_domain",
  "advanced_promos",
  "branded_mobile_app",
  "pos_module",
  "phone_ordering",
  "reservation_deposits",
  "multi_location",
  "marketplace",
  "customer_sms",
  "marketing_studio",
  "kickstarter",
  "contentpilot",
  "driver_pool",
  "kds_screen",
] as const;

// Brand names must survive translation verbatim (standing rule: never
// translate GrowthNet; ContentPilot/Kickstarter are product names too).
const BRAND_NAMES: Record<string, string> = {
  growthnet: "GrowthNet",
  contentpilot: "ContentPilot",
  kickstarter: "Kickstarter",
};

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

const dataDir = path.join(process.cwd(), "scripts", "i18n-data", "addon-catalog");
const dir = path.join(process.cwd(), "src", "messages");

// en.json holds the canonical block — validate completeness, don't rewrite it.
const enJson = JSON.parse(fs.readFileSync(path.join(dir, "en.json"), "utf8"));
for (const slug of SLUGS) {
  const e = enJson.addOnCatalog?.[slug];
  if (typeof e?.name !== "string" || typeof e?.description !== "string") {
    throw new Error(`en.json addOnCatalog.${slug} missing/incomplete — add it before splicing`);
  }
}

let changed = 0;
for (const loc of SUPPORTED_LOCALES) {
  const file = path.join(dir, `${loc}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));

  if (loc !== "en") {
    const packFile = path.join(dataDir, `${loc}.json`);
    if (!fs.existsSync(packFile)) throw new Error(`${loc}: missing pack ${packFile}`);
    const pack = JSON.parse(fs.readFileSync(packFile, "utf8"));

    const block: Record<string, { name: string; description: string }> = {};
    for (const slug of SLUGS) {
      const row = pack[slug];
      if (typeof row?.name !== "string" || !row.name.trim()) {
        throw new Error(`${loc}: ${slug}.name missing/empty`);
      }
      if (typeof row?.description !== "string" || !row.description.trim()) {
        throw new Error(`${loc}: ${slug}.description missing/empty`);
      }
      if (BRAND_NAMES[slug] && row.name.trim() !== BRAND_NAMES[slug]) {
        throw new Error(`${loc}: ${slug}.name must stay "${BRAND_NAMES[slug]}" (got "${row.name}")`);
      }
      block[slug] = { name: decode(row.name).trim(), description: decode(row.description).trim() };
    }
    const extra = Object.keys(pack).filter((k) => !(SLUGS as readonly string[]).includes(k));
    if (extra.length) throw new Error(`${loc}: unexpected extra pack keys: ${extra.join(", ")}`);

    json.addOnCatalog = block; // stable slug order → clean diffs
  }

  // Orphan purge: marketing.pricing.addOns had zero code consumers and is
  // superseded by addOnCatalog; en.json already dropped it.
  if (json.marketing?.pricing?.addOns) delete json.marketing.pricing.addOns;

  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(
  `✅ addOnCatalog (${SLUGS.length} slugs × name+description) spliced + marketing.pricing.addOns purge across ${changed} locale file(s)`,
);
