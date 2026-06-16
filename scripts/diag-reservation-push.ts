/**
 * Diagnostic for "reservation didn't ring": shows the latest reservations
 * (status / alertAt / deposit — i.e. did the push gate pass?) and the
 * registered kitchen push tokens (does the device still have one?).
 *   npx tsx scripts/diag-reservation-push.ts
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const env = readFileSync(".env.local", "utf8");
const urls: string[] = [];
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
  if (m && !urls.includes(m[1])) urls.push(m[1]);
}

async function main() {
  for (const url of urls) {
    const host = (url.match(/@([^/]+)/)?.[1] ?? "?").split(".")[0];
    try {
      const sql = neon(url);
      const tokens = (await sql`SELECT count(*)::int AS n, max("lastSeenAt") AS last FROM "KitchenPushToken"`) as any[];
      const res = (await sql`SELECT "customerName", status, "alertAt", "depositAmount", "depositPaid", "createdAt" FROM "Reservation" ORDER BY "createdAt" DESC LIMIT 4`) as any[];
      console.log(`\n[${host}] tokens=${tokens[0].n} (lastSeen ${tokens[0].last ?? "—"})`);
      console.log(`[${host}] latest reservations:`);
      for (const r of res) {
        console.log(`   ${r.createdAt?.toISOString?.() ?? r.createdAt} | ${r.status} | alertAt=${r.alertAt ? "SET(closed→push skipped)" : "null(open)"} | deposit=${r.depositAmount}/${r.depositPaid ? "paid" : "unpaid"} | ${r.customerName}`);
      }
    } catch (e) {
      console.log(`\n[${host}] ERROR ${e instanceof Error ? e.message : e}`);
    }
  }
}
main();
