/**
 * Logical database backup — no external tooling (pg_dump absent on Windows).
 * Dumps EVERY Prisma model to a single gzipped JSON file. Pairs with
 * verify-backup.ts (integrity check) and restore-db.ts (restore into a
 * NON-prod target). Closes part of launch-readiness Critical C-2 ("no
 * automated backup, no tested restore").
 *
 *   npx tsx scripts/run-on-prod.ts scripts/backup-db.ts      # backup PROD
 *   npx tsx scripts/backup-db.ts                             # backup dev
 *
 * ⚠️ The output file contains ALL customer PII in plaintext (same as a
 * pg_dump). It is written to backups/ (gitignored) — keep it secure, never
 * commit it, and move a copy OFF this machine. The automated OFF-SITE backup
 * (/api/cron/backup) encrypts with ENCRYPTION_KEY before uploading, because
 * that key only exists in the production environment.
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { gzipSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { backupModelNames, delegateOf } from "./_backup-models";

config({ path: ".env.local" });
config({ path: ".env" });

// Stable, serialisable representation of every non-JSON-native value Prisma
// can return (BigInt, Decimal, Buffer, Date already ISO-serialises).
function replacer(_k: string, v: unknown): unknown {
  if (typeof v === "bigint") return { __t: "bigint", v: v.toString() };
  if (v && typeof v === "object" && v.constructor?.name === "Decimal") return { __t: "decimal", v: String(v) };
  if (v && typeof v === "object" && (v as any).type === "Buffer") return v; // node Buffer toJSON
  return v;
}

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const isProd = /dawn-tree/.test(url); // the prod Neon host
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const models = backupModelNames();
  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  const errors: Record<string, string> = {};

  for (const name of models) {
    try {
      const rows = await (prisma as any)[delegateOf(name)].findMany();
      tables[name] = rows;
      counts[name] = rows.length;
    } catch (e) {
      errors[name] = (e as Error)?.message?.slice(0, 140) ?? "unknown";
    }
  }

  const takenAt = new Date().toISOString();
  const payload = {
    format: "ffo-logical-backup/v1",
    takenAt,
    target: isProd ? "prod" : "dev",
    modelCount: models.length,
    counts,
    errors,
    tables,
  };
  const json = JSON.stringify(payload, replacer);
  const gz = gzipSync(Buffer.from(json, "utf8"), { level: 9 });

  mkdirSync(join(process.cwd(), "backups"), { recursive: true });
  const fname = `backup-${isProd ? "prod" : "dev"}-${takenAt.replace(/[:.]/g, "-")}.json.gz`;
  const fpath = join(process.cwd(), "backups", fname);
  writeFileSync(fpath, gz);

  const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(`\nBACKUP OK → backups/${fname}`);
  console.log(`  target=${payload.target}  models=${models.length}  totalRows=${totalRows}  size=${(gz.length / 1024).toFixed(1)}KB`);
  const nonEmpty = Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  console.log(`  top tables: ${nonEmpty.slice(0, 8).map(([k, n]) => `${k}=${n}`).join("  ")}`);
  if (Object.keys(errors).length) console.log(`  ⚠️ ${Object.keys(errors).length} model(s) failed to dump: ${Object.keys(errors).join(", ")}`);
  console.log(`\n⚠️ Contains PII in plaintext — keep secure, copy OFF this machine, never commit.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error("BACKUP FAILED:", e?.message?.slice(0, 300)); process.exit(1); });
