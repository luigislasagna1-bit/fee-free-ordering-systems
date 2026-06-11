/** Remove the now-unused admin.orders.{confirmReject,actionFailed} keys × 38.
 *  (Accept/Reject buttons were reverted in favour of clear-on-view.)
 *    npx tsx scripts/i18n-remove-orders-actions.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");
const REMOVE = ["confirmReject", "actionFailed"];

let n = 0;
for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  const path = join(DIR, f);
  const data = JSON.parse(readFileSync(path, "utf8")) as Record<string, any>;
  const orders = data?.admin?.orders;
  if (orders && typeof orders === "object") {
    for (const k of REMOVE) delete orders[k];
  }
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8");
  n++;
}
console.log(`✓ removed ${REMOVE.join(", ")} from ${n} locale(s).`);
