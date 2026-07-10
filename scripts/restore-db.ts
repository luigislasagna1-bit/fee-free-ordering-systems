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
import { readFileSync } from "node:fs";
import { backupModelNames, delegateOf } from "./_backup-models";
import { loadBackupPayload } from "../src/lib/db-backup";

config({ path: ".env.local" });
config({ path: ".env" });

function reviver(_k: string, v: any): any {
  if (v && typeof v === "object" && v.__t === "bigint") return BigInt(v.v);
  if (v && typeof v === "object" && v.__t === "decimal") return new Prisma.Decimal(v.v);
  return v;
}

async function loadFile(arg: string): Promise<Buffer> {
  if (/^https?:\/\//.test(arg)) {
    const res = await fetch(arg);
    if (!res.ok) throw new Error(`fetch ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  return readFileSync(arg);
}

async function main() {
  const file = process.argv.find((a) => a.endsWith(".json.gz") || a.endsWith(".enc") || /^https?:\/\//.test(a));
  const dryRun = process.argv.includes("--dry-run");
  if (!file) { console.error("usage: restore-db.ts <backup.json.gz | backup.enc | https://blob-url> [--dry-run]"); process.exit(1); }

  const url = process.env.DATABASE_URL!;
  if (/dawn-tree/.test(url)) {
    console.error("REFUSED: DATABASE_URL points at the PRODUCTION host. Restore only into a scratch/dev database.");
    process.exit(1);
  }

  // .enc = the encrypted off-site backup (needs ENCRYPTION_KEY); .json.gz =
  // local plaintext. loadBackupPayload handles both.
  const isEncrypted = file.endsWith(".enc");
  const buf = await loadFile(file);
  const raw = loadBackupPayload(buf, isEncrypted); // decrypt (if .enc) + gunzip + parse
  const payload = JSON.parse(JSON.stringify(raw), reviver); // apply bigint/decimal revival
  const tables: Record<string, any[]> = payload.tables;
  console.log(`restore source: ${file}${isEncrypted ? " (encrypted)" : ""}  (takenAt=${payload.takenAt})`);
  console.log(`restore INTO: ${url.replace(/:[^:@/]+@/, ":****@").slice(0, 70)}...`);

  const plan = backupModelNames()
    .map((name) => ({ name, delegate: delegateOf(name), rows: (tables[name] ?? []).length }))
    .filter((t) => t.rows > 0);
  console.log(`\nwould restore ${plan.length} tables, ${plan.reduce((a, t) => a + t.rows, 0)} rows total.`);
  if (dryRun) { console.log("\n--dry-run: no writes performed."); return; }

  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  // MULTI-PASS restore: Neon's role can't SET session_replication_role, so we
  // can't defer FK checks. Instead we retry — each pass inserts every
  // still-pending table; parents succeed first, their children succeed on the
  // next pass, and so on. Stop when a pass makes NO progress (the remaining
  // failures are real, not ordering) and report them loudly. Non-transactional
  // per table (createMany), skipDuplicates for idempotent re-runs.
  let remaining = [...plan];
  let loaded = 0;
  let pass = 0;
  while (remaining.length && pass < 12) {
    pass++;
    const stillFailing: typeof remaining = [];
    let progressed = false;
    for (const t of remaining) {
      try {
        await (prisma as any)[t.delegate].createMany({ data: tables[t.name], skipDuplicates: true });
        loaded += t.rows;
        progressed = true;
        console.log(`  ✓ pass ${pass} · ${t.name}: ${t.rows}`);
      } catch {
        stillFailing.push(t);
      }
    }
    remaining = stillFailing;
    if (!progressed) break; // no table succeeded this pass → real errors, not ordering
  }

  if (remaining.length) {
    console.log(`\n❌ ${remaining.length} table(s) could NOT be restored (real errors, not FK ordering):`);
    for (const t of remaining) {
      try { await (prisma as any)[t.delegate].createMany({ data: tables[t.name], skipDuplicates: true }); }
      catch (e) { console.log(`  ✗ ${t.name}: ${(e as Error)?.message?.slice(0, 140)}`); }
    }
    console.log(`\nrestored ~${loaded} rows across ${pass} passes; ${remaining.length} tables FAILED — restore is INCOMPLETE.`);
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log(`\n✅ restored ~${loaded} rows across ${pass} passes, all ${plan.length} tables. Spot-check with COUNT(*).`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error("RESTORE ERROR:", e?.message?.slice(0, 300)); process.exit(1); });
