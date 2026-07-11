/**
 * Post a reseller-report comment with the body read from a FILE — multi-line
 * bodies passed as argv get mangled by shell:true concatenation in
 * run-on-prod.ts (spaces/newlines split into extra args). Mirrors
 * post-report-comment.ts exactly otherwise. Optionally deletes a botched
 * comment first (--delete <commentId>).
 *   npx tsx scripts/run-on-prod.ts scripts/_post-comment-from-file.ts <reportId> <bodyFile> [--delete <commentId>]
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";

config({ path: ".env.local" });
config({ path: ".env" });

const [, , reportId, bodyFile, delFlag, delId] = process.argv;
const url = process.env.DATABASE_URL;
if (!reportId || !bodyFile || !url) {
  console.error("Usage: _post-comment-from-file.ts <reportId> <bodyFile> [--delete <commentId>]");
  process.exit(1);
}
const authorName = "Luigi";
const authorEmail = "admin@feefreeordering.com";
const text = readFileSync(bodyFile, "utf8").trim().slice(0, 5_000);

async function main() {
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url!);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url! }) : new PrismaPg({ connectionString: url! });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const report = await prisma.resellerReport.findUnique({ where: { id: reportId }, select: { id: true, title: true } });
    if (!report) { console.error(`No report ${reportId}`); process.exit(1); }

    if (delFlag === "--delete" && delId) {
      const bad = await prisma.resellerReportComment.findUnique({ where: { id: delId }, select: { id: true, reportId: true, body: true } });
      if (bad && bad.reportId === reportId) {
        await prisma.resellerReportComment.delete({ where: { id: delId } });
        console.log(`🗑 deleted botched comment ${delId} (body was: ${JSON.stringify(bad.body).slice(0, 60)})`);
      } else {
        console.log(`(comment ${delId} not found on this report — skipping delete)`);
      }
    }

    const comment = await prisma.resellerReportComment.create({
      data: { reportId, authorEmail, authorName, body: text },
      select: { id: true },
    });
    await prisma.resellerReportActivity.create({
      data: { reportId, actorEmail: authorEmail, actorName: authorName, kind: "COMMENTED" },
    });
    await prisma.resellerReport.update({ where: { id: reportId }, data: { updatedAt: new Date() } });
    console.log(`✅ Comment posted to "${report.title}" — id ${comment.id}, ${text.length} chars`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
