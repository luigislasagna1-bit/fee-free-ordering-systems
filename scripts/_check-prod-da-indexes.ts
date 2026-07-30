/** READ-ONLY: confirm the two new A21 indexes exist on PROD DeliveryAssignment. */
import { readFileSync } from "node:fs";
import { Client } from "pg";
const m = readFileSync(".env.local", "utf8").match(/^#\s*DATABASE_URL="(postgresql:\/\/[^"]*ep-dawn-tree[^"]*)"/m);
if (!m) throw new Error("no prod url");
async function main() {
  const c = new Client({ connectionString: m![1] });
  await c.connect();
  const { rows } = await c.query(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'DeliveryAssignment' AND (indexdef LIKE '%settlementId%' OR indexdef LIKE '%deliveredAt%') ORDER BY indexname`
  );
  await c.end();
  for (const r of rows) console.log(" ", r.indexname);
  const hasA = rows.some((r: any) => /restaurantId_status_settlementId/.test(r.indexname));
  const hasB = rows.some((r: any) => /restaurantId_status_deliveredAt/.test(r.indexname));
  console.log(hasA && hasB ? "PASS: both A21 indexes present on prod" : "FAIL: missing A21 index");
  process.exit(hasA && hasB ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
