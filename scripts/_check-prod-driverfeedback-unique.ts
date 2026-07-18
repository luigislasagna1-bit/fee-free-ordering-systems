/**
 * READ-ONLY prod check: does the PROD Neon branch (dawn-tree) actually have
 * the unique index on DriverFeedback(assignmentId, source)?
 *
 * Phase 8's feedback route uses prisma.driverFeedback.upsert on
 * @@unique([assignmentId, source]) — the upsert REQUIRES the DB constraint
 * to exist, and both the atomicity guarantee and the P2002 double-submit
 * retry depend on it. Schema was pushed to both branches with Phase 2
 * (cd68a19b); this verifies prod really has it before the route deploys.
 *
 * SELECT-only (pg_indexes). No writes of any kind.
 *
 * npx tsx scripts/_check-prod-driverfeedback-unique.ts
 */
import { readFileSync } from "node:fs";
import { Client } from "pg";

const envText = readFileSync(".env.local", "utf8");
const m = envText.match(/^#\s*DATABASE_URL="(postgresql:\/\/[^"]*ep-dawn-tree[^"]*)"/m);
if (!m) throw new Error("Prod (dawn-tree) URL not found in .env.local comments.");

async function main() {
  const client = new Client({ connectionString: m![1] });
  await client.connect();
  const { rows } = await client.query(
    `SELECT indexname, indexdef
       FROM pg_indexes
      WHERE tablename = 'DriverFeedback'
      ORDER BY indexname`,
  );
  await client.end();

  console.log(`DriverFeedback indexes on PROD (${rows.length}):`);
  for (const r of rows) console.log(`  ${r.indexname}\n    ${r.indexdef}`);

  const unique = rows.find(
    (r: any) =>
      /UNIQUE/i.test(r.indexdef) &&
      /assignmentId/.test(r.indexdef) &&
      /source/.test(r.indexdef),
  );
  console.log(
    unique
      ? `\nPASS: unique (assignmentId, source) index present: ${unique.indexname}`
      : "\nFAIL: unique (assignmentId, source) index MISSING on prod",
  );
  process.exit(unique ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
