/**
 * Shared logical-backup core (launch-readiness C-2). Enumerates every Prisma
 * model and dumps all rows to a gzipped JSON buffer. Used by the automated
 * off-site cron (/api/cron/backup). The standalone dev scripts in scripts/*
 * keep their own copy so they run without the app runtime.
 *
 * SCALE NOTE: this loads the whole database into memory. Fine at current scale
 * (~58k rows / <2MB gzip) inside a serverless function; for a large database
 * move to a streamed pg_dump run from a scheduled worker (documented in
 * docs/launch-readiness/10-release-and-rollback-plan.md).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import type { PrismaClient } from "@/generated/prisma/client";

export function backupModelNames(): string[] {
  const schema = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8");
  const names: string[] = [];
  const re = /^model\s+(\w+)\s*\{/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(schema))) names.push(m[1]);
  return names;
}

function replacer(_k: string, v: unknown): unknown {
  if (typeof v === "bigint") return { __t: "bigint", v: v.toString() };
  if (v && typeof v === "object" && (v as any).constructor?.name === "Decimal") return { __t: "decimal", v: String(v) };
  return v;
}

export async function dumpDatabase(prisma: PrismaClient): Promise<{
  gz: Buffer;
  counts: Record<string, number>;
  totalRows: number;
  errors: Record<string, string>;
}> {
  const tables: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  const errors: Record<string, string> = {};
  for (const name of backupModelNames()) {
    const delegate = name.charAt(0).toLowerCase() + name.slice(1);
    try {
      const rows = await (prisma as any)[delegate].findMany();
      tables[name] = rows;
      counts[name] = rows.length;
    } catch (e) {
      errors[name] = (e as Error)?.message?.slice(0, 140) ?? "unknown";
    }
  }
  const payload = {
    format: "ffo-logical-backup/v1",
    takenAt: new Date().toISOString(),
    counts,
    errors,
    tables,
  };
  const gz = gzipSync(Buffer.from(JSON.stringify(payload, replacer), "utf8"), { level: 9 });
  return { gz, counts, totalRows: Object.values(counts).reduce((a, b) => a + b, 0), errors };
}
