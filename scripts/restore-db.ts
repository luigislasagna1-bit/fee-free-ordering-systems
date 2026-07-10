/**
 * Restore a logical backup into a NON-PRODUCTION target (launch-readiness C-2
 * restore drill). HARD-REFUSES to run against the prod host — a restore is a
 * destructive, full-table load and must only ever hit a scratch/dev database.
 *
 *   # point .env.local DATABASE_URL at a SCRATCH db, then:
 *   npx tsx scripts/restore-db.ts backups/<file>.json.gz
 *   npx tsx scripts/restore-db.ts backups/<file>.json.gz --dry-run   # parse + plan only
 *
 * Loads tables parent-first is NOT attempted generically; instead FK checks are
 * deferred for the transaction (session_replication_role) so any order works.
 * This is a recovery tool, not a migration — the schema must already exist
 * (run prisma db push against the scratch target first).
 */
import { config } from "dotenv";
import { PrismaClient, Prisma } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { backupModelNames, delegateOf } from "./_backup-models";

config({ path: ".env.local" });
config({ path: ".env" });

function reviver(_k: string, v: any): any {
  if (v && typeof v === "object" && v.__t === "bigint") return BigInt(v.v);
  if (v && typeof v === "object" && v.__t === "decimal") return new Prisma.Decimal(v.v);
  return v;
}

async function main() {
  const file = process.argv.find((a) => a.endsWith(".json.gz"));
  const dryRun = process.argv.includes("--dry-run");
  if (!file) { console.error("usage: restore-db.ts <backup.json.gz> [--dry-run]"); process.exit(1); }

  const url = process.env.DATABASE_URL!;
  if (/dawn-tree/.test(url)) {
    console.error("REFUSED: DATABASE_URL points at the PRODUCTION host. Restore only into a scratch/dev database.");
    process.exit(1);
  }

  const payload = JSON.parse(gunzipSync(readFileSync(file)).toString("utf8"), reviver);
  const tables: Record<string, any[]> = payload.tables;
  console.log(`restore source: ${file}  (takenAt=${payload.takenAt}, target-at-backup=${payload.target})`);
  console.log(`restore INTO: ${url.replace(/:[^:@/]+@/, ":****@").slice(0, 70)}...`);

  const plan = backupModelNames()
    .map((name) => ({ name, delegate: delegateOf(name), rows: (tables[name] ?? []).length }))
    .filter((t) => t.rows > 0);
  console.log(`\nwould restore ${plan.length} tables, ${plan.reduce((a, t) => a + t.rows, 0)} rows total.`);
  if (dryRun) { console.log("\n--dry-run: no writes performed."); return; }

  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  // Defer FK constraints so table order doesn't matter (best-effort — requires
  // privileges; Neon roles may not allow session_replication_role, in which
  // case a scratch-restore should be done via `pg_restore` on a paid tier).
  try { await prisma.$executeRawUnsafe(`SET session_replication_role = replica`); } catch { /* ignore */ }

  let loaded = 0;
  for (const t of plan) {
    try {
      await (prisma as any)[t.delegate].createMany({ data: tables[t.name], skipDuplicates: true });
      loaded += t.rows;
      console.log(`  ✓ ${t.name}: ${t.rows}`);
    } catch (e) {
      console.log(`  ✗ ${t.name}: ${(e as Error)?.message?.slice(0, 120)}`);
    }
  }
  console.log(`\nrestored ~${loaded} rows. Verify with a COUNT(*) spot-check.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error("RESTORE ERROR:", e?.message?.slice(0, 300)); process.exit(1); });
