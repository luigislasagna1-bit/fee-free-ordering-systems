/**
 * Orders List column rename, across all 38 locales.
 *
 *   reseller.ordersList.colName  →  colRestaurant   (it was always the STORE)
 *   + reseller.ordersList.colCustomer                (net-new — who placed it)
 *
 * The old `colName` was ambiguous and the table rendered the restaurant name
 * under it while the search box searched the CUSTOMER — Luigi reported the
 * mismatch 2026-08-07. Key order is preserved so the diff stays readable.
 *
 *   npx tsx scripts/i18n-orders-list-columns.ts
 */
import fs from "node:fs";
import path from "node:path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

/** English baseline. Non-English files inherit English until the translation
 *  pass runs (the whole reseller.ordersList block is still English-only). */
const EN = { colRestaurant: "Restaurant", colCustomer: "Customer" };

const DIR = path.join(process.cwd(), "src", "messages");

let changed = 0;
for (const locale of SUPPORTED_LOCALES) {
  const file = path.join(DIR, `${locale}.json`);
  const raw = fs.readFileSync(file, "utf8");
  const json = JSON.parse(raw) as Record<string, any>;
  const block = json?.reseller?.ordersList as Record<string, string> | undefined;
  if (!block) {
    console.error(`  ${locale}: no reseller.ordersList block — skipped`);
    continue;
  }
  if (block.colRestaurant && block.colCustomer) {
    console.log(`  ${locale}: already migrated`);
    continue;
  }

  // Rebuild in place so colRestaurant/colCustomer land exactly where colName was.
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(block)) {
    if (k === "colName") {
      next.colRestaurant = block.colRestaurant ?? EN.colRestaurant;
      next.colCustomer = block.colCustomer ?? EN.colCustomer;
      continue;
    }
    if (k === "colRestaurant" || k === "colCustomer") continue; // re-added above
    next[k] = v;
  }
  if (!next.colRestaurant) {
    next.colRestaurant = EN.colRestaurant;
    next.colCustomer = EN.colCustomer;
  }

  json.reseller.ordersList = next;
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  changed++;
}

console.log(`\n✅ ${changed}/${SUPPORTED_LOCALES.length} locale files updated (colName → colRestaurant, + colCustomer).`);
