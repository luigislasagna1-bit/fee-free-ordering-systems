/**
 * Marketplace = free/included copy (2026-07-14) ×38 — reword the strings that
 * still RENDER and framed the marketplace as paid, now that it's free + included:
 *   admin.marketplaceSettings.billingHeading  (reworded)
 *   admin.marketplaceSettings.includedFree     (new — replaces the price card)
 *   admin.marketplaceSettings.includedDetail   (new)
 *   marketing.home.v2.addons.marketplace.body  (reworded, "low-cost" → free)
 * English inline; 37 non-English packs in scripts/i18n-data/marketplace-free-copy/.
 *   npx tsx scripts/i18n-add-marketplace-free-copy.ts
 */
import fs from "fs";
import path from "path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

const KEYS = ["billingHeading", "includedFree", "includedDetail", "marketplaceBody"] as const;

const en: Record<string, string> = {
  billingHeading: "Your marketplace listing",
  includedFree: "Included — free",
  includedDetail: "No monthly or per-order fee. Customers within 15 km can find and order from you.",
  marketplaceBody: "Get discovered on the Fee Free marketplace — a free new-customer channel, no 30% fees.",
};

function decode(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

const dataDir = path.join(process.cwd(), "scripts", "i18n-data", "marketplace-free-copy");
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
  for (const k of KEYS) if (typeof pack[k] !== "string") throw new Error(`${loc}: missing ${k}`);

  const file = path.join(dir, `${loc}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));

  const ms = (((json.admin ??= {}).marketplaceSettings ??= {}));
  ms.billingHeading = decode(pack.billingHeading);
  ms.includedFree = decode(pack.includedFree);
  ms.includedDetail = decode(pack.includedDetail);

  const mkt = ((((((json.marketing ??= {}).home ??= {}).v2 ??= {}).addons ??= {}).marketplace ??= {}));
  mkt.body = decode(pack.marketplaceBody);

  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}
console.log(`✅ marketplace free/included copy (${KEYS.length}) written to ${changed} locale file(s)`);
