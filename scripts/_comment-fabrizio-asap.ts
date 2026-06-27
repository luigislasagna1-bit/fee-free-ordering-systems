/** Reply to Fabrizio's "Choose ASAP / Scheduled" report + flip NEW→IN_TESTING.
 *    npx tsx scripts/run-on-prod.ts scripts/_comment-fabrizio-asap.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";
const REPORT_ID = "cmqslaus9001f04l27a2lg6gm";

const COMMENT = `Done — the ASAP vs Scheduled choice is now clear, like you asked. At checkout, the time section shows two distinct buttons — "As soon as possible" and "Schedule for later" — and you can switch back to ASAP with a single tap at any time (it's no longer a small hidden link). Choosing "Schedule for later" reveals the date + time picker. It's live now — please try it at checkout and let us know it feels right.`;

const NOTIF_BODY = "Done — the checkout time choice is now two clear buttons (As soon as possible / Schedule for later), and switching back to ASAP is one tap (no more buried link). Live now — please try it at checkout.";

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  const report = await prisma.resellerReport.findUnique({ where: { id: REPORT_ID } });
  if (!report) { console.log(`No report ${REPORT_ID}.`); await prisma.$disconnect(); return; }
  const prev = report.status;
  await prisma.$transaction(async (tx) => {
    if (prev !== "IN_TESTING") {
      await tx.resellerReport.update({ where: { id: REPORT_ID }, data: { status: "IN_TESTING" } });
      await tx.resellerReportActivity.create({ data: { reportId: REPORT_ID, actorEmail: SA_EMAIL, actorName: SA_NAME, kind: "STATUS", detail: `${prev} → IN_TESTING` } });
    }
    await tx.resellerReportComment.create({ data: { reportId: REPORT_ID, authorEmail: SA_EMAIL, authorName: SA_NAME, body: COMMENT } });
    const recipients = new Set<string>();
    if (report.authorEmail) recipients.add(report.authorEmail.toLowerCase());
    if (report.reportedByEmail) recipients.add(report.reportedByEmail.toLowerCase());
    recipients.delete(SA_EMAIL.toLowerCase());
    for (const email of recipients)
      await tx.resellerNotification.create({ data: { recipientEmail: email, kind: "report_status", title: `Update on: ${report.title}`, body: NOTIF_BODY, linkUrl: `/reseller-reports/${REPORT_ID}`, reportId: REPORT_ID, actorName: SA_NAME } });
  });
  console.log(`✅ "${report.title}": ${prev} → IN_TESTING (+comment, notified)`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
