/** Reply to Fabrizio's "Closing days / closed services" report (verified fixed) + keep IN_TESTING.
 *   npx tsx scripts/run-on-prod.ts scripts/_comment-fabrizio-closing-verified.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";
const REPORT_ID = "cmqp8l948000004kys6m8xktn";

const COMMENT = `Hi Fabrizio — we went through this report point by point and have now verified all of it on our side. Here's where each part stands:

1) Reservations closed for a day → FIXED. With table reservations closed for a date, placing a reservation on that date is now blocked ("we're closed for reservations on this date").

2) A service closed for a TIME RANGE → FIXED (this was the main one). We added a "Close a time range" rule, and the ordering page now BLOCKS an order whose time falls inside a closed window. We tested your exact case: pickup closed 16:00–20:00, then a 5:00 PM pickup → it's now rejected ("Pickup is closed 16:00–20:00 on this date"), while a 3:00 PM or 8:00 PM pickup still goes through. Same logic applies to every service and to reservations.

3) The warning banner → FIXED. When a service is closed for part of the day, the ordering website now shows an amber banner at the top — we confirmed it renders as "⏸ Pickup closed 16:00 – 20:00 today". Customers see it up front, not only at the confirm button.

4) The weekday showing in Italian (lunedì) despite English → FIXED. The special-days section now shows the weekday in your BACKEND language, not your phone's/browser's language.

Why it looked broken when you tested: your test was on 22/06, and these fixes went live on 24/06 — so you were on the build from just before the fix.

Could you re-test on the current build? Set a special day with pickup "Closed hours" 16:00–20:00, then: try a 5 PM pickup (should be blocked) and a 2 PM pickup (should work); check the amber banner shows on the website; and confirm the weekday reads in English. For reservations, close them for a date and confirm a booking that day is blocked. Thank you!`;

const NOTIF_BODY = "Verified fixed on our side: closed reservations are blocked, a service closed for a time range now blocks orders in that window (your 5PM pickup case), the amber closed-window banner shows on the website, and the weekday follows your backend language. These went live 24/06 (after your 22/06 test). Re-test steps in the comment.";

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const report = await prisma.resellerReport.findUnique({ where: { id: REPORT_ID } });
  if (!report) { console.log(`No report ${REPORT_ID}.`); await prisma.$disconnect(); return; }
  const prev = report.status;
  console.log(`Found: "${report.title}" [${prev}]`);

  await prisma.$transaction(async (tx) => {
    if (prev !== "IN_TESTING") {
      await tx.resellerReport.update({ where: { id: REPORT_ID }, data: { status: "IN_TESTING" } });
      await tx.resellerReportActivity.create({
        data: { reportId: REPORT_ID, actorEmail: SA_EMAIL, actorName: SA_NAME, kind: "STATUS", detail: `${prev} → IN_TESTING` },
      });
    }
    await tx.resellerReportComment.create({
      data: { reportId: REPORT_ID, authorEmail: SA_EMAIL, authorName: SA_NAME, body: COMMENT },
    });
    const recipients = new Set<string>();
    if (report.authorEmail) recipients.add(report.authorEmail.toLowerCase());
    if (report.reportedByEmail) recipients.add(report.reportedByEmail.toLowerCase());
    recipients.delete(SA_EMAIL.toLowerCase());
    for (const email of recipients) {
      await tx.resellerNotification.create({
        data: { recipientEmail: email, kind: "report_comment", title: `Update on: ${report.title}`, body: NOTIF_BODY, linkUrl: `/reseller-reports/${REPORT_ID}`, reportId: REPORT_ID, actorName: SA_NAME },
      });
    }
    console.log(`  notifying: ${[...recipients].join(", ") || "(no reporter email)"}`);
  });

  console.log(`✅ "${report.title}": comment posted (status ${prev === "IN_TESTING" ? "stays" : "→"} IN_TESTING)`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
