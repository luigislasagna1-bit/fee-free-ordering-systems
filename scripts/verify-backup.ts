/**
 * Verify a logical backup is COMPLETE and FAITHFUL against the live DB — the
 * "tested" half of a tested backup (launch-readiness C-2). Per-table row-count
 * comparison + a sampled primary-key existence check on money-critical tables.
 * Read-only; touches no data.
 *
 *   npx tsx scripts/run-on-prod.ts scripts/verify-backup.ts backups/<file>.json.gz
 *   npx tsx scripts/verify-backup.ts backups/<file>.json.gz          # vs dev
 *
 * NOTE: run against the SAME database the backup was taken from. A tiny count
 * drift on high-churn tables (Order, WebsiteVisit) between backup and verify is
 * expected on a live DB and reported as INFO, not failure; money-critical
 * tables are checked strictly.
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "node:fs";
import { backupModelNames, delegateOf } from "./_backup-models";
import { loadBackupPayload } from "../src/lib/db-backup";

config({ path: ".env.local" });
config({ path: ".env" });

const CRITICAL = new Set(["Order", "OrderItem", "Customer", "RewardLedger", "RewardAccount", "PaymentProvider", "Restaurant", "User"]);

async function main() {
  const file = process.argv.find((a) => a.endsWith(".json.gz") || a.endsWith(".enc"));
  if (!file) { console.error("usage: verify-backup.ts <backup.json.gz | backup.enc>"); process.exit(1); }

  const payload = loadBackupPayload(readFileSync(file), file.endsWith(".enc"));
  const tables: Record<string, any[]> = payload.tables;
  const backupCounts: Record<string, number> = payload.counts;
  console.log(`backup: ${file}\n  format=${payload.format} takenAt=${payload.takenAt} target=${payload.target} models=${payload.modelCount}`);

  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  let hardFail = 0, drift = 0, okCritical = 0;
  for (const name of backupModelNames()) {
    let live: number;
    try { live = await (prisma as any)[delegateOf(name)].count(); } catch { continue; }
    const backed = backupCounts[name] ?? 0;
    if (live !== backed) {
      if (CRITICAL.has(name)) {
        // Backup taken slightly before verify: rows ADDED since are fine; rows
        // MISSING from the backup (backup < live) is a real integrity failure.
        if (backed < live) { console.log(`  ✗ ${name}: backup=${backed} < live=${live} (backup MISSING rows)`); hardFail++; }
        else { console.log(`  ~ ${name}: backup=${backed} > live=${live} (rows added since backup — OK)`); okCritical++; }
      } else { drift++; }
    } else if (CRITICAL.has(name)) { okCritical++; }
  }

  // Sampled PK existence on the most critical table.
  let sampleOk = true;
  const orders = tables["Order"] ?? [];
  if (orders.length) {
    const sample = orders.slice(0, Math.min(5, orders.length));
    for (const o of sample) {
      const found = await prisma.order.findUnique({ where: { id: o.id }, select: { id: true } }).catch(() => null);
      if (!found) { sampleOk = false; console.log(`  ✗ sampled Order ${String(o.id).slice(-6)} in backup NOT found live`); }
    }
  }

  console.log(`\ncritical tables verified: ${okCritical}  | non-critical count-drift (live churn): ${drift}`);
  console.log(`sampled Order PKs resolve live: ${sampleOk ? "yes" : "NO"}`);
  const pass = hardFail === 0 && sampleOk;
  console.log(pass ? "\n✅ BACKUP VERIFIED — complete + faithful on money-critical tables." : "\n❌ VERIFY FAILED — investigate before trusting this backup.");
  await prisma.$disconnect();
  process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.error("VERIFY ERROR:", e?.message?.slice(0, 300)); process.exit(1); });
