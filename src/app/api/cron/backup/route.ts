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
import { put, list, del } from "@vercel/blob";
import { getSessionUser } from "@/lib/session";
import prisma from "@/lib/db";
import { dumpDatabase, encryptBackup } from "@/lib/db-backup";
import { reportError } from "@/lib/report-error";
import { timingSafeEqualString } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // whole-DB dump; needs Vercel Pro for >10s

const PREFIX = "db-backups/";
const MAX_KEEP = 14;

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
    const modelErrors = Object.keys(errors).length;
    const encrypted = encryptBackup(gz);

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    // A degraded (partial) dump is still uploaded — a partial backup beats none
    // — but marked `.partial.enc` so it's never mistaken for a full one.
    const suffix = modelErrors ? ".partial.enc" : ".enc";
    await put(`${PREFIX}db-${stamp}${suffix}`, encrypted, {
      access: "public", // unguessable URL; contents are AES-256-GCM encrypted
      addRandomSuffix: true,
      contentType: "application/octet-stream",
    });

    // Prune old FULL backups beyond MAX_KEEP — ONLY on a clean run, and never
    // count `.partial.` artifacts, so a degraded run can't evict the last good
    // full backup.
    let pruned = 0;
    if (modelErrors === 0) {
      try {
        const { blobs } = await list({ prefix: PREFIX });
        const full = blobs
          .filter((b) => !b.pathname.includes(".partial."))
          .sort((a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime());
        const excess = full.slice(0, Math.max(0, full.length - MAX_KEEP));
        for (const b of excess) { await del(b.url); pruned++; }
      } catch (e) {
        console.error("[cron/backup] prune failed", e instanceof Error ? e.message : e);
      }
    }

    if (modelErrors) {
      // Incomplete backup → alert (Sentry). Not a 500 (avoids a retry storm on a
      // big dump); the `.partial` artifact is kept for forensics.
      reportError(new Error(`backup degraded: ${modelErrors} model(s) failed to dump`), { cron: "backup", models: Object.keys(errors).join(",").slice(0, 300) });
      console.error(`[cron/backup] DEGRADED — ${modelErrors} model(s) failed: ${Object.keys(errors).join(", ")}`);
      return NextResponse.json({ ok: false, degraded: true, totalRows, modelErrors }, { status: 200 });
    }

    console.log(`[cron/backup] ok — ${totalRows} rows, ${(encrypted.length / 1024).toFixed(0)}KB encrypted, pruned ${pruned}`);
    return NextResponse.json({
      ok: true,
      totalRows,
      tableCount: Object.keys(counts).length,
      encryptedKB: Math.round(encrypted.length / 1024),
      pruned,
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
