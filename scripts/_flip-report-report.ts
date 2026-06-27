/**
 * Flip the "Report" (numbers / email) report to IN_TESTING + ping Fabrizio.
 *   npx tsx scripts/run-on-prod.ts scripts/_flip-report-report.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";
const REPORT_ID = "cmqsoloe6000605l1cn2344yn";
const STATUS = "IN_TESTING";

const COMMENT = `Hi Fabrizio — thanks for this. We looked into all three parts:

1) The emailed report now shows in your restaurant's CURRENCY (EUR) and LANGUAGE (Italian) — before it was hardcoded to English + $.

2) The email now includes the full SALES BREAKDOWN — subtotal, delivery fees, tips, other fees, tax, and total — exactly like the in-app "end of day report." So the delivery fees you mentioned now appear in the email.

3) The dashboard numbers: on a single restaurant, the top totals and the daily breakdown below are built from the SAME orders (completed orders in the selected range), so they always reconcile. The "2,645.60 / 97" with a "last 30 days" label looks like an OLDER version of the reports page — it has since been rebuilt. Please re-test on the current version; if the top still doesn't match the daily rows for the same "last 7 days" selection, send a fresh screenshot and we'll dig in with your exact data. (We also fixed the trend chart on the chain / multi-location view while we were in there.)

Please re-test the email + the dashboard and let us know. Thank you!`;

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const report = await prisma.resellerReport.findUnique({ where: { id: REPORT_ID } });
  if (!report) { console.log(`No report ${REPORT_ID}.`); await prisma.$disconnect(); return; }
  const prev = report.status;
  console.log(`Found: "${report.title}" [${prev}] id=${report.id}`);

  await prisma.$transaction(async (tx) => {
    await tx.resellerReport.update({ where: { id: REPORT_ID }, data: { status: STATUS } });
    await tx.resellerReportActivity.create({
      data: { reportId: REPORT_ID, actorEmail: SA_EMAIL, actorName: SA_NAME, kind: "STATUS", detail: `${prev} → ${STATUS}` },
    });
    await tx.resellerReportComment.create({
      data: { reportId: REPORT_ID, authorEmail: SA_EMAIL, authorName: SA_NAME, body: COMMENT },
    });
    const recipients = new Set<string>();
    if (report.authorEmail) recipients.add(report.authorEmail.toLowerCase());
    if (report.reportedByEmail) recipients.add(report.reportedByEmail.toLowerCase());
    recipients.delete(SA_EMAIL.toLowerCase());
    for (const email of recipients) {
      await tx.resellerNotification.create({
        data: {
          recipientEmail: email,
          kind: "report_status",
          title: `Report marked ${STATUS}: ${report.title}`,
          body: "Email report now in your currency + language + delivery-fee breakdown. Dashboard reconciles on the current build — please re-test.",
          linkUrl: `/reseller-reports/${REPORT_ID}`,
          reportId: REPORT_ID,
          actorName: SA_NAME,
        },
      });
    }
  });

  console.log(`✅ "${report.title}": ${prev} → ${STATUS} (+comment +notification).`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
