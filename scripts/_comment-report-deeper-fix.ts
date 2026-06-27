/**
 * Add a follow-up comment to the "Report" report about the deeper dashboard fix.
 * Keeps status IN_TESTING. Run: npx tsx scripts/run-on-prod.ts scripts/_comment-report-deeper-fix.ts
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

const COMMENT = `Follow-up on the dashboard numbers — we went deeper than the email fix and rebuilt the whole reporting area. We found two real reasons figures didn't add up:

1) Reports were calculated in our server's timezone, not your restaurant's — so "today" / "last 7 days" could capture the wrong window.
2) Different parts of the dashboard counted orders differently (the top "Orders" number counted every order, including rejected/test ones, while revenue counted only fully-completed orders) — so the headline never matched the breakdown below it.

Now the dashboard, the sales breakdown, and the orders/clients lists ALL use ONE consistent rule — real orders only (no test/rejected/cancelled), in your restaurant's timezone — and they reconcile exactly with each other and with the end-of-day report.

We also added, GloriaFood-style: a full Sales Summary breakdown table (subtotal / tax / delivery fee / tips / other fees / total) that you can group by day, week, month, payment method or order type, with a bold totals row; all-time figures on the dashboard cards; and a search box + a "per page" selector on the Orders and Clients lists.

Heads-up: because we corrected the timezone AND the order-counting, some totals will look different than before — that's the fix, not a regression. They now match your end-of-day report. Please open Reports and let us know it looks right. Thank you!`;

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const report = await prisma.resellerReport.findUnique({ where: { id: REPORT_ID } });
  if (!report) { console.log(`No report ${REPORT_ID}.`); await prisma.$disconnect(); return; }
  console.log(`Found: "${report.title}" [${report.status}]`);

  await prisma.$transaction(async (tx) => {
    await tx.resellerReportComment.create({
      data: { reportId: REPORT_ID, authorEmail: SA_EMAIL, authorName: SA_NAME, body: COMMENT },
    });
    await tx.resellerReportActivity.create({
      data: { reportId: REPORT_ID, actorEmail: SA_EMAIL, actorName: SA_NAME, kind: "COMMENT", detail: "Deeper dashboard fix — reports now reconcile" },
    });
    const recipients = new Set<string>();
    if (report.authorEmail) recipients.add(report.authorEmail.toLowerCase());
    if (report.reportedByEmail) recipients.add(report.reportedByEmail.toLowerCase());
    recipients.delete(SA_EMAIL.toLowerCase());
    for (const email of recipients) {
      await tx.resellerNotification.create({
        data: {
          recipientEmail: email,
          kind: "report_comment",
          title: `Update on: ${report.title}`,
          body: "Deeper fix shipped — dashboard, sales breakdown + lists now reconcile (timezone + consistent order-counting), GloriaFood-style breakdown table added. Please re-check Reports.",
          linkUrl: `/reseller-reports/${REPORT_ID}`,
          reportId: REPORT_ID,
          actorName: SA_NAME,
        },
      });
    }
  });

  console.log(`✅ Comment + notification posted (status stays ${report.status}).`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
