/**
 * Reusable reseller-report reply: post a Super-Admin comment (body from FILE,
 * avoids shell mangling), notify the reporter (resellerNotification), write the
 * activity rows, and optionally flip status. Mirrors the canonical
 * post-report-comment-*.ts pattern (Super Admin author + reporter notification).
 * Refuses to touch a FIXED report (human-gated).
 *   npx tsx scripts/run-on-prod.ts scripts/_reply-report.ts <reportId> <bodyFile> [newStatus]
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";
const VALID = ["NEW", "IN_PROGRESS", "IN_TESTING", "FIXED", "WONT_FIX"];

const [, , reportId, bodyFile, newStatus] = process.argv;
const url = process.env.DATABASE_URL;
if (!reportId || !bodyFile || !url) {
  console.error("Usage: _reply-report.ts <reportId> <bodyFile> [newStatus]");
  process.exit(1);
}
const COMMENT = readFileSync(bodyFile, "utf8").trim().slice(0, 5000);

async function main() {
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url!);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url! }) : new PrismaPg({ connectionString: url! });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const report = await prisma.resellerReport.findFirst({ where: { id: { startsWith: reportId } } });
    if (!report) throw new Error(`No report starting with ${reportId}`);
    if (report.status === "FIXED") { console.log(`Refusing — already FIXED (human-gated): ${report.title}`); return; }
    const prev = report.status;
    const want = newStatus && VALID.includes(newStatus) ? newStatus : null;
    const flip = !!want && want !== prev;
    await prisma.$transaction(async (tx) => {
      if (flip) {
        await tx.resellerReport.update({ where: { id: report.id }, data: { status: want! } });
        await tx.resellerReportActivity.create({
          data: { reportId: report.id, actorEmail: SA_EMAIL, actorName: SA_NAME, kind: "STATUS", detail: `${prev} → ${want}` },
        });
      }
      await tx.resellerReportComment.create({
        data: { reportId: report.id, authorEmail: SA_EMAIL, authorName: SA_NAME, body: COMMENT },
      });
      const recipients = new Set<string>();
      if (report.authorEmail) recipients.add(report.authorEmail.toLowerCase());
      if ((report as any).reportedByEmail) recipients.add((report as any).reportedByEmail.toLowerCase());
      recipients.delete(SA_EMAIL.toLowerCase());
      for (const email of recipients) {
        await tx.resellerNotification.create({
          data: { recipientEmail: email, kind: "report_status", title: `Update on: ${report.title}`, body: COMMENT.slice(0, 240), linkUrl: `/reseller-reports/${report.id}`, reportId: report.id, actorName: SA_NAME },
        });
      }
    });
    console.log(`✅ "${report.title}" (${report.id}): ${flip ? `${prev} → ${want}, ` : `status kept (${prev}), `}comment posted, reporter notified`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
