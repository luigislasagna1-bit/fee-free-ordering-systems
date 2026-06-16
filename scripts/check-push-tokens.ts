/**
 * Diagnostic: list registered KitchenPushToken rows in each DB branch found in
 * .env.local, so we can confirm a kitchen tablet registered its push token.
 *   npx tsx scripts/check-push-tokens.ts
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const content = readFileSync(".env.local", "utf8");
const urls: string[] = [];
for (const line of content.split(/\r?\n/)) {
  const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
  if (m && !urls.includes(m[1])) urls.push(m[1]);
}

async function main() {
  for (const url of urls) {
    const host = (url.match(/@([^/]+)/)?.[1] ?? "?").split(".")[0];
    try {
      const sql = neon(url);
      const counts = (await sql`SELECT count(*)::int AS n, max("lastSeenAt") AS last FROM "KitchenPushToken"`) as any[];
      console.log(`\n[${host}] ${counts[0].n} token(s); most recent lastSeenAt=${counts[0].last ?? "—"}`);
      const recent = (await sql`SELECT "restaurantId", platform, "createdAt", left(token, 14) AS token_prefix FROM "KitchenPushToken" ORDER BY "lastSeenAt" DESC LIMIT 5`) as any[];
      for (const r of recent) {
        console.log(`   restaurant=${r.restaurantId}  platform=${r.platform}  created=${r.createdAt}  token=${r.token_prefix}…`);
      }
    } catch (e) {
      console.log(`\n[${host}] ERROR: ${e instanceof Error ? e.message : e}`);
    }
  }
}
main();
