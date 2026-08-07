/**
 * New keys for the "store credit is a tender, not income" change (2026-08-07).
 *
 * English baseline into all 38 locales; the translation pass runs after via
 * scripts/wf-translate-keys.js. Idempotent — re-running is a no-op.
 *
 *   npx tsx scripts/i18n-add-collected-keys.ts
 */
import fs from "node:fs";
import path from "node:path";
import { SUPPORTED_LOCALES } from "../src/lib/locales";

/** dotted key path → English text. */
const KEYS: Record<string, string> = {
  // The GROSS value of the orders, before any store credit was applied. Shown
  // beside "Collected" so an owner can still see what the food was worth.
  "admin.reportsHome.kpiOrderValue": "Order value",
  // Customers list: the single blended "Total spent" splits into three.
  "admin.customersList.colOrderValue": "Order value",
  "admin.customersList.colCreditSpent": "{label} spent",
  // Staff "order rejected / canceled / missed" emails — these carried no money
  // at all, so the owner never learned what the dead order was worth or that
  // store credit had gone back to the customer's wallet.
  "money.orderValue": "Order value",
  "email.staffOrderDead.creditReturned":
    "{amount} paid with {label} has been returned to the customer's wallet.",
};

const DIR = path.join(process.cwd(), "src", "messages");

function setDeep(obj: Record<string, any>, dotted: string, value: string): boolean {
  const parts = dotted.split(".");
  let node = obj;
  for (const p of parts.slice(0, -1)) {
    if (typeof node[p] !== "object" || node[p] === null) node[p] = {};
    node = node[p];
  }
  const leaf = parts[parts.length - 1];
  if (typeof node[leaf] === "string") return false; // already present — never clobber a translation
  node[leaf] = value;
  return true;
}

let touched = 0;
for (const locale of SUPPORTED_LOCALES) {
  const file = path.join(DIR, `${locale}.json`);
  const json = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, any>;
  let added = 0;
  for (const [dotted, en] of Object.entries(KEYS)) {
    if (setDeep(json, dotted, en)) added++;
  }
  if (added > 0) {
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
    touched++;
  }
  console.log(`  ${locale}: +${added}`);
}

console.log(`\n✅ ${touched}/${SUPPORTED_LOCALES.length} locale files updated with ${Object.keys(KEYS).length} key(s).`);
