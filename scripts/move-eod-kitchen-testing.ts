/**
 * Move the EOD-report (R1) + kitchen-panel (R2) reseller reports to IN_TESTING,
 * each with a plain-language "what we fixed" comment, and notify the reporter to
 * verify. Mirrors mark-report-fixed.ts. Run AFTER both fixes are live (R2 part B
 * needs the Reservation.alertAt schema pushed first). Luigi 2026-06-14.
 *   npx tsx scripts/run-on-prod.ts scripts/move-eod-kitchen-testing.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";

const UPDATES: { id: string; comment: string }[] = [
  {
    id: "cmqdbgmk4000104jsdpqx9942",
    comment:
      "Fixed ✓ — moved to testing. The End-of-Day report now: follows your store hours (e.g. a 2am close counts those orders in that business day), matches the GloriaFood layout (Sales performance + Sales breakdown: Subtotal / fees / tips / Tax / Total), lets you step back through the last 7 days and print any of them, and shows each restaurant's own currency. Find it on the kitchen tablet (Settings → End of Day report) or in admin (Reports → End of Day). Please verify 🙏",
  },
  {
    id: "cmqdlwe4u000704l473ng2tgz",
    comment:
      "Fixed ✓ — moved to testing. Kitchen panel: the status label (pending / confirmed / completed) now sits next to the customer name like reservations; every not-yet-accepted order now shows the amber pending background even while closed (no more white); and a table reservation made while closed no longer rings the kitchen — it shows highlighted + calm with an OPENS IN… badge and only rings when opening hours start, exactly like takeaway/delivery. Fabrizio, please verify all three 🙏",
  },
];

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    for (const u of UPDATES) {
      const report = await prisma.resellerReport.findUnique({ where: { id: u.id } });
      if (!report) { console.log(`No report ${u.id} — skipped`); continue; }
      const prev = report.status;
      await prisma.$transaction(async (tx) => {
        await tx.resellerReport.update({ where: { id: u.id }, data: { status: "IN_TESTING" } });
        await tx.resellerReportActivity.create({
          data: { reportId: u.id, actorEmail: SA_EMAIL, actorName: SA_NAME, kind: "STATUS", detail: `${prev} → IN_TESTING` },
        });
        await tx.resellerReportComment.create({
          data: { reportId: u.id, authorEmail: SA_EMAIL, authorName: SA_NAME, body: u.comment },
        });
        const recipients = new Set<string>();
        if (report.authorEmail) recipients.add(report.authorEmail.toLowerCase());
        if (report.reportedByEmail) recipients.add(report.reportedByEmail.toLowerCase());
        recipients.delete(SA_EMAIL.toLowerCase());
        for (const email of recipients) {
          await tx.resellerNotification.create({
            data: { recipientEmail: email, kind: "report_status", title: `Report in testing: ${report.title}`, body: u.comment, linkUrl: `/reseller-reports/${u.id}`, reportId: u.id, actorName: SA_NAME },
          });
        }
      });
      console.log(`✅ #${u.id} "${report.title}": ${prev} → IN_TESTING (+comment, notified)`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
