/**
 * One-shot: correct the Driver Pool price in admin copy across ALL 38 locale
 * files — $19.99 → $9.99 (prod AddOn table charges $9.99; the $19.99 admin
 * strings predate the final pricing). Scoped to the five affected key paths
 * so no other string containing 19.99 is touched. Handles both "19.99" and
 * comma-decimal "19,99" renderings. Idempotent.
 *   npx tsx scripts/_fix-driverpool-price.ts
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const KEYS = [
  "admin.driverPool.lockedNotice",
  "admin.driverPoolLocked.ctaGetDriverPool",
  "admin.marketplaceLocked.featureDriverPoolBody",
  "admin.paygOptInPage.terms.driverPoolNotIncluded",
  "admin.paygOptInPage.switch.timelineAfterBody",
];

const dir = join(process.cwd(), "src", "messages");
let totalChanged = 0;
for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const path = join(dir, file);
  const data = JSON.parse(readFileSync(path, "utf8"));
  let changed = 0;
  for (const keyPath of KEYS) {
    const parts = keyPath.split(".");
    let node: any = data;
    for (let i = 0; i < parts.length - 1; i++) node = node?.[parts[i]];
    const leaf = parts[parts.length - 1];
    const val = node?.[leaf];
    if (typeof val === "string" && (val.includes("19.99") || val.includes("19,99"))) {
      node[leaf] = val.replace(/19\.99/g, "9.99").replace(/19,99/g, "9,99");
      changed++;
    }
  }
  if (changed > 0) {
    writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
    totalChanged += changed;
    console.log(`  ${file}: ${changed} string(s) fixed`);
  }
}
console.log(`✓ ${totalChanged} strings corrected across locales`);
