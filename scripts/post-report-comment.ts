/**
 * Post a comment to a reseller report — used to drop triage notes
 * (root-cause area, duplicate links, status updates) onto a report
 * (Phase 2). Mirrors POST /api/reseller-reports/[id]/comments: inserts
 * the comment, writes a COMMENTED activity row, and touches updatedAt.
 *
 * Plain DB write — does NOT send notification emails (triage notes are
 * internal; we don't want to ping resellers on every engineering note).
 *
 * Usage (against prod):
 *   npx tsx scripts/run-on-prod.ts scripts/post-report-comment.ts <reportId> "comment body" [authorName] [authorEmail]
 *
 * Defaults author to Luigi / admin@feefreeordering.com when omitted.
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";

config({ path: ".env.local" });
config({ path: ".env" });

const [, , reportId, body, authorNameArg, authorEmailArg] = process.argv;
const url = process.env.DATABASE_URL;

if (!reportId || !body) {
  console.error('Usage: npx tsx scripts/post-report-comment.ts <reportId> "comment body" [authorName] [authorEmail]');
  process.exit(1);
}
if (!url) {
  console.error("No DATABASE_URL — set it in .env.local / .env (or run via scripts/run-on-prod.ts).");
  process.exit(1);
}

const authorName = (authorNameArg || "Luigi").trim();
const authorEmail = (authorEmailArg || "admin@feefreeordering.com").trim().toLowerCase();
const text = body.trim().slice(0, 5_000);

async function main() {
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url!);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url! }) : new PrismaPg({ connectionString: url! });
  const prisma = new PrismaClient({ adapter } as any);

  try {
    const report = await prisma.resellerReport.findUnique({ where: { id: reportId }, select: { id: true, title: true } });
    if (!report) {
      console.error(`No report with id ${reportId} on this DB.`);
      process.exit(1);
    }

    const comment = await prisma.resellerReportComment.create({
      data: { reportId, authorEmail, authorName, body: text },
      select: { id: true },
    });
    await prisma.resellerReportActivity.create({
      data: { reportId, actorEmail: authorEmail, actorName: authorName, kind: "COMMENTED" },
    });
    await prisma.resellerReport.update({ where: { id: reportId }, data: { updatedAt: new Date() } });

    console.log(`✅ Comment posted to "${report.title}"`);
    console.log(`   comment id: ${comment.id}`);
    console.log(`   by:         ${authorName} <${authorEmail}>`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
