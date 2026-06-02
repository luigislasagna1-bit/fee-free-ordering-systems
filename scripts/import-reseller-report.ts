/**
 * Import a single Reseller Report directly into the database.
 *
 * Built to bulk-load bug reports / feature requests that arrived BEFORE
 * the report center existed (the ones Luigi collected by text/email).
 * Mirrors POST /api/reseller-reports exactly — same validation, same
 * imageUrls JSON encoding, same CREATED activity-log entry — but runs
 * out-of-band so it can target prod from the laptop without a session.
 *
 * Screenshots are uploaded to Vercel Blob under `reseller-reports/<file>`,
 * identical to the live /api/reseller-reports/upload route, so they render
 * the same way on the detail page. Requires BLOB_READ_WRITE_TOKEN in the
 * environment (add it to .env.local) ONLY when the spec has screenshots.
 *
 * Usage:
 *   npx tsx scripts/import-reseller-report.ts <spec.json> [database-url]
 *
 * If database-url is omitted, reads DATABASE_URL from .env.local / .env.
 * To target production, prefer scripts/import-reseller-report-on-prod.ts
 * which flips .env.local to the prod branch for you and restores it after.
 *
 * Spec JSON shape (see import-reseller-report.example.json):
 * {
 *   "title": "Kitchen display freezes on new order",   // required, <=200
 *   "body":  "Steps to reproduce...\n\n1. ...",         // required, <=20000
 *   "type":  "BUG",        // BUG | FEATURE_REQUEST | FEATURE_ADJUSTMENT | FEATURE_UPDATE | FEATURE_FIX
 *   "priority": "HIGH",    // LOW | MEDIUM | HIGH | CRITICAL   (default MEDIUM)
 *   "status": "NEW",       // NEW | IN_PROGRESS | IN_TESTING | FIXED | WONT_FIX (default NEW)
 *   "authorEmail": "admin@feefreeordering.com",  // filer (default: SA below)
 *   "authorName":  "Luigi",
 *   "reportedByEmail": "reseller@example.com",    // optional on-behalf credit
 *   "reportedByName":  "Joe's Pizza",
 *   "screenshots": ["C:/Users/luigi/Pictures/bug1.png"]  // optional local files
 * }
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";

// Pull DATABASE_URL + BLOB_READ_WRITE_TOKEN from env files if present.
config({ path: ".env.local" });
config({ path: ".env" });

const REPORT_TYPES = ["BUG", "FEATURE_REQUEST", "FEATURE_ADJUSTMENT", "FEATURE_UPDATE", "FEATURE_FIX"];
const REPORT_STATUSES = ["NEW", "IN_PROGRESS", "IN_TESTING", "FIXED", "WONT_FIX"];
const REPORT_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

// Matches the allow-list in /api/reseller-reports/upload exactly.
const EXT_BY_MIME: Record<string, string> = {
  ".jpg": "jpg", ".jpeg": "jpg", ".png": "png", ".webp": "webp", ".gif": "gif",
};
const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
};
const MAX_SIZE = 10 * 1024 * 1024;

// Default filer when the spec omits one. Luigi's superadmin account.
const DEFAULT_AUTHOR_EMAIL = "admin@feefreeordering.com";
const DEFAULT_AUTHOR_NAME = "Luigi";

interface Spec {
  title?: string;
  body?: string;
  type?: string;
  priority?: string;
  status?: string;
  authorEmail?: string;
  authorName?: string;
  reportedByEmail?: string;
  reportedByName?: string;
  screenshots?: string[];
}

function die(msg: string): never {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

async function uploadScreenshot(filePath: string, suffix: string): Promise<string> {
  const ext = EXT_BY_MIME[path.extname(filePath).toLowerCase()];
  if (!ext) die(`Unsupported image type: ${filePath} (allowed: jpg, png, webp, gif)`);
  let buffer: Buffer;
  try {
    buffer = readFileSync(filePath);
  } catch {
    die(`Could not read screenshot file: ${filePath}`);
  }
  if (buffer.length === 0) die(`Screenshot file is empty: ${filePath}`);
  if (buffer.length > MAX_SIZE) die(`Screenshot exceeds 10 MB: ${filePath}`);

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    die(
      "BLOB_READ_WRITE_TOKEN is not set, but this report has screenshots.\n" +
        "  Add it to .env.local (copy from Vercel → Storage → Blob → tokens),\n" +
        "  or remove the screenshots from the spec to import text-only.",
    );
  }
  const { put } = await import("@vercel/blob");
  // Same filename scheme as the live upload route: timestamp + random.
  const filename = `${Date.now()}-${suffix}.${ext}`;
  const blob = await put(`reseller-reports/${filename}`, buffer, {
    access: "public",
    addRandomSuffix: false,
    contentType: MIME_BY_EXT[ext],
    token,
  });
  return blob.url;
}

async function main() {
  const [, , specPath, urlArg] = process.argv;
  if (!specPath) die("Usage: npx tsx scripts/import-reseller-report.ts <spec.json> [database-url]");

  const url = urlArg || process.env.DATABASE_URL;
  if (!url) die("No DATABASE_URL — pass it as an arg or set it in .env.local / .env");

  let spec: Spec;
  try {
    spec = JSON.parse(readFileSync(specPath, "utf8"));
  } catch (e) {
    die(`Could not read/parse spec JSON at ${specPath}: ${e instanceof Error ? e.message : e}`);
  }

  // ── Validate, mirroring the POST route ────────────────────────────
  const title = (spec.title ?? "").trim().slice(0, 200);
  const body = (spec.body ?? "").trim().slice(0, 20_000);
  const type = spec.type ?? "";
  const priority = spec.priority ?? "MEDIUM";
  const status = spec.status ?? "NEW";
  if (!title) die("Spec is missing a title.");
  if (!body) die("Spec is missing a body/description.");
  if (!REPORT_TYPES.includes(type)) die(`Invalid type "${type}". One of: ${REPORT_TYPES.join(", ")}`);
  if (!REPORT_PRIORITIES.includes(priority)) die(`Invalid priority "${priority}".`);
  if (!REPORT_STATUSES.includes(status)) die(`Invalid status "${status}".`);

  const authorEmail = (spec.authorEmail ?? DEFAULT_AUTHOR_EMAIL).trim().toLowerCase();
  const authorName = (spec.authorName ?? DEFAULT_AUTHOR_NAME).trim() || authorEmail;

  let reportedByEmail: string | null = null;
  let reportedByName: string | null = null;
  if (spec.reportedByEmail && spec.reportedByEmail.trim()) {
    reportedByEmail = spec.reportedByEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reportedByEmail)) die(`Invalid reportedByEmail "${reportedByEmail}".`);
    reportedByName = (spec.reportedByName ?? "").trim().slice(0, 100) || reportedByEmail;
  }

  // ── Connect (mirror src/lib/db.ts adapter selection) ──────────────
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  console.log(`DB: ${url.replace(/:[^:@]+@/, ":***@")}  (adapter: ${isNeon ? "Neon" : "Pg"})`);

  try {
    // ── Upload screenshots (if any) ─────────────────────────────────
    const screenshots = Array.isArray(spec.screenshots) ? spec.screenshots.filter(Boolean).slice(0, 10) : [];
    const imageUrls: string[] = [];
    for (let i = 0; i < screenshots.length; i++) {
      const filePath = screenshots[i];
      process.stdout.write(`  ↑ uploading screenshot ${i + 1}/${screenshots.length}: ${path.basename(filePath)} … `);
      const u = await uploadScreenshot(filePath, `${i}${Math.random().toString(36).slice(2, 8)}`);
      imageUrls.push(u);
      console.log("done");
    }

    // ── Insert report + CREATED activity (mirrors POST route) ───────
    const report = await prisma.resellerReport.create({
      data: {
        title,
        body,
        type,
        status,
        priority,
        authorEmail,
        authorName,
        reportedByEmail,
        reportedByName,
        imageUrls: imageUrls.length > 0 ? JSON.stringify(imageUrls) : null,
      },
      select: { id: true },
    });

    await prisma.resellerReportActivity.create({
      data: {
        reportId: report.id,
        actorEmail: authorEmail,
        actorName: authorName,
        kind: "CREATED",
        detail: reportedByEmail ? `Filed on behalf of ${reportedByName ?? reportedByEmail}` : null,
      },
    });

    console.log(`\n✅ Imported "${title}"`);
    console.log(`   id:        ${report.id}`);
    console.log(`   type:      ${type}   priority: ${priority}   status: ${status}`);
    console.log(`   author:    ${authorName} <${authorEmail}>`);
    if (reportedByEmail) console.log(`   on behalf: ${reportedByName} <${reportedByEmail}>`);
    console.log(`   screenshots: ${imageUrls.length}`);
    console.log(`   view at:   /reseller-reports/${report.id}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
