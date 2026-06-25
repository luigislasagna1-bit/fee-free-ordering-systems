// admin.reportsHome.subtotal reuses the already-translated colSubtotal ("Subtotal")
// from admin.reportSalesSummary across all 38 locales — no new translation cycle.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const dir = "src/messages";
const staging: Record<string, Record<string, string>> = { "admin.reportsHome.subtotal": {} };
for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const loc = f.replace(".json", "");
  const j = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
  staging["admin.reportsHome.subtotal"][loc] = j.admin?.reportSalesSummary?.colSubtotal ?? "Subtotal";
}
writeFileSync("scripts/i18n-data/subtotal-reuse.json", JSON.stringify(staging, null, 2) + "\n", "utf8");
console.log(`wrote subtotal staging × ${Object.keys(staging["admin.reportsHome.subtotal"]).length} locales`);
