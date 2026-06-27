/** Reply to Fabrizio's "Popup" report (built) + flip NEW→IN_TESTING.
 *    npx tsx scripts/run-on-prod.ts scripts/_comment-fabrizio-popup.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";
const REPORT_ID = "cmqp8z9ko000304kykoin8wuw";

const COMMENT = `Done — you can now show a promo popup on your ordering page, just as you described. Go to Profile → "Promo popup": switch it on, then optionally add an image, a title, a message, and a button (with a link). Customers see it once per visit when they open your ordering page, with an "X" to close it (it won't keep popping up after they close it). If you add an absolute link (https://…) the button opens in a new tab so the customer doesn't lose their cart. It's live now — please set one up and try it on your ordering page.`;

const NOTIF_BODY = "Done — set up a promo popup in Profile → \"Promo popup\" (enable + optional image, title, message, button). It shows once per visit on your ordering page with an X to close. Live now — please try it.";

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
