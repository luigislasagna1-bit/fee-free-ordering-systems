/**
 * GET/POST /api/cron/backup — automated OFF-SITE database backup
 * (launch-readiness Critical C-2). Runs on production (where ENCRYPTION_KEY
 * and the Blob token live), dumps the whole DB, ENCRYPTS it (AES-256-GCM,
 * ENCRYPTION_KEY), and uploads to Vercel Blob. Encryption is mandatory:
 * Vercel Blob URLs are unguessable but public, so a plaintext PII backup
 * there would be a data-exposure risk.
 *
 * Backup-failure alerting: any failure calls reportError (Sentry) and returns
 * 500 so a cron-monitor/dead-man's-switch (LR-OPS) fires.
 *
 * Auth: Vercel cron via Authorization: Bearer $CRON_SECRET, or a signed-in
 * superadmin for manual runs. Timing-safe compare.
 *
 * Retention: keeps the most recent MAX_KEEP backups, prunes older.
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { put, list, del } from "@vercel/blob";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { dumpDatabase } from "@/lib/db-backup";
import { reportError } from "@/lib/report-error";
import { timingSafeEqualString } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // whole-DB dump; needs Vercel Pro for >10s

const PREFIX = "db-backups/";
const MAX_KEEP = 14;

function encryptBuffer(plain: Buffer): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY not set — cannot encrypt backup");
  const key = Buffer.from(raw, "hex");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  // Self-describing envelope: [iv(12)][tag(16)][ciphertext]
  return Buffer.concat([iv, cipher.getAuthTag(), ct]);
}

async function handle(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && authHeader.startsWith("Bearer ") &&
    timingSafeEqualString(authHeader.slice(7), cronSecret);
  if (!isCron) {
    const user = await getSessionUser();
    if (user?.role !== "superadmin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new Error("BLOB_READ_WRITE_TOKEN not set — no off-site backup destination");
    }
    const { gz, totalRows, counts, errors } = await dumpDatabase(prisma);
    const encrypted = encryptBuffer(gz);

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const { url } = await put(`${PREFIX}db-${stamp}.enc`, encrypted, {
      access: "public", // unguessable URL; contents are AES-256-GCM encrypted
      addRandomSuffix: true,
      contentType: "application/octet-stream",
    });

    // Prune old backups beyond MAX_KEEP (oldest first).
    let pruned = 0;
    try {
      const { blobs } = await list({ prefix: PREFIX });
      const sorted = blobs.sort((a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime());
      const excess = sorted.slice(0, Math.max(0, sorted.length - MAX_KEEP));
      for (const b of excess) { await del(b.url); pruned++; }
    } catch (e) {
      // Pruning failure must not fail the backup itself.
      console.error("[cron/backup] prune failed", e instanceof Error ? e.message : e);
    }

    const modelErrors = Object.keys(errors).length;
    console.log(`[cron/backup] ok — ${totalRows} rows, ${(encrypted.length / 1024).toFixed(0)}KB encrypted, pruned ${pruned}${modelErrors ? `, ${modelErrors} model errors` : ""}`);
    return NextResponse.json({
      ok: true,
      totalRows,
      tableCount: Object.keys(counts).length,
      encryptedKB: Math.round(encrypted.length / 1024),
      pruned,
      modelErrors,
      // never return the blob URL in a shared response — it grants read access
    });
  } catch (e) {
    reportError(e, { cron: "backup" });
    console.error("[cron/backup] FAILED", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "backup failed" }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
