/**
 * Mark a reseller report as FIXED (or any status), optionally posting a comment,
 * recording an activity entry, and notifying the reporter — mirroring what the
 * app does on a superadmin status change.
 *
 *   npx tsx scripts/run-on-prod.ts scripts/mark-report-fixed.ts <reportId> [STATUS] [comment...]
 *
 * STATUS defaults to FIXED. Example:
 *   ... mark-report-fixed.ts cmpx1a6vi000004l1smvmyfle FIXED "Verified on live site."
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";

async function main() {
  const reportId = (process.argv[2] || "").trim();
  const status = (process.argv[3] || "FIXED").trim().toUpperCase();
  const comment = process.argv.slice(4).join(" ").trim();
  if (!reportId) throw new Error("Usage: mark-report-fixed.ts <reportId> [STATUS] [comment]");

  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const report = await prisma.resellerReport.findUnique({ where: { id: reportId } });
  if (!report) { console.log(`No report ${reportId}`); return; }
  const prev = report.status;

  await prisma.$transaction(async (tx) => {
    await tx.resellerReport.update({ where: { id: reportId }, data: { status } });
    await tx.resellerReportActivity.create({
      data: { reportId, actorEmail: SA_EMAIL, actorName: SA_NAME, kind: "STATUS", detail: `${prev} → ${status}` },
    });
    if (comment) {
      await tx.resellerReportComment.create({
        data: { reportId, authorEmail: SA_EMAIL, authorName: SA_NAME, body: comment },
      });
    }
    // Notify the reporter (+ reportedBy if distinct), excluding the SA actor.
    const recipients = new Set<string>();
    if (report.authorEmail) recipients.add(report.authorEmail.toLowerCase());
    if (report.reportedByEmail) recipients.add(report.reportedByEmail.toLowerCase());
    recipients.delete(SA_EMAIL.toLowerCase());
    for (const email of recipients) {
      await tx.resellerNotification.create({
        data: {
          recipientEmail: email,
          kind: "report_status",
          title: `Report marked ${status}: ${report.title}`,
          body: comment || `Status changed ${prev} → ${status}.`,
          linkUrl: `/reseller-reports/${reportId}`,
          reportId,
          actorName: SA_NAME,
        },
      });
    }
  });

  console.log(`✅ #${reportId} "${report.title}": ${prev} → ${status}${comment ? `  (+comment)` : ""}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
