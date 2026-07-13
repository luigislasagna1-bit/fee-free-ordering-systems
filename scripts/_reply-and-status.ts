/**
 * Post a reseller-report comment (body from FILE — avoids shell mangling) AND
 * optionally move the report status, writing the matching activity rows. Used
 * to reply to a reseller + move the report to IN_TESTING in one prod call.
 *   npx tsx scripts/run-on-prod.ts scripts/_reply-and-status.ts <reportId> <bodyFile> [newStatus]
 * newStatus (optional): NEW | IN_PROGRESS | IN_TESTING | FIXED | WONT_FIX
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";

config({ path: ".env.local" });
config({ path: ".env" });

const [, , reportId, bodyFile, newStatus] = process.argv;
const url = process.env.DATABASE_URL;
if (!reportId || !bodyFile || !url) {
  console.error("Usage: _reply-and-status.ts <reportId> <bodyFile> [newStatus]");
  process.exit(1);
}
const authorName = "Luigi";
const authorEmail = "support@feefreeordering.com"; // current superadmin login
const text = readFileSync(bodyFile, "utf8").trim().slice(0, 5_000);
const VALID = ["NEW", "IN_PROGRESS", "IN_TESTING", "FIXED", "WONT_FIX"];

async function main() {
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url!);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url! }) : new PrismaPg({ connectionString: url! });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const report = await prisma.resellerReport.findUnique({ where: { id: reportId }, select: { id: true, title: true, status: true } });
    if (!report) { console.error(`No report ${reportId}`); process.exit(1); }

    const comment = await prisma.resellerReportComment.create({
      data: { reportId, authorEmail, authorName, body: text },
      select: { id: true },
    });
    await prisma.resellerReportActivity.create({
      data: { reportId, actorEmail: authorEmail, actorName: authorName, kind: "COMMENTED" },
    });

    if (newStatus && VALID.includes(newStatus) && newStatus !== report.status) {
      await prisma.resellerReport.update({ where: { id: reportId }, data: { status: newStatus } });
      await prisma.resellerReportActivity.create({
        data: { reportId, actorEmail: authorEmail, actorName: authorName, kind: "STATUS_CHANGE", detail: `${report.status} → ${newStatus}` },
      });
      console.log(`   status: ${report.status} → ${newStatus}`);
    }
    await prisma.resellerReport.update({ where: { id: reportId }, data: { updatedAt: new Date() } });
    console.log(`✅ Reply posted to "${report.title}" — comment ${comment.id}, ${text.length} chars`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
