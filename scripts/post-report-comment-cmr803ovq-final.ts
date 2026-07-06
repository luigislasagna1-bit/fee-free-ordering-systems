/** Final reply on cmr803ovq: part (c) multi-window fulfilment is live — all
 *  3 requests done. Sets status IN_TESTING (Fabrizio verifies; Luigi marks FIXED).
 *  Run: npx tsx scripts/run-on-prod.ts scripts/post-report-comment-cmr803ovq-final.ts */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";
const PREFIX = "cmr803ovq";
const COMMENT = `Part 3 is LIVE now too — all three of your requests are ready to test: ✅

3. MULTIPLE TIME WINDOWS — in BOTH systems:
• AVAILABILITY (orderable-for windows): edit a dish → Availability tab → set the first window as before, then click "Add another time window" for each extra one. Your exact example works: Mon–Thu 10:00–15:00 PLUS Fri–Sun 15:00–20:00 on one dish. The dish is orderable whenever ANY window matches; customers see the combined schedule under the dish (e.g. "Available Mon–Thu · 10:00–15:00 / Fri–Sun · 15:00–20:00", translated in every language), and the checkout scheduler only offers valid days AND the right times per day (Tuesday shows 10–15 slots, Friday shows 15–20 slots).
• VISIBILITY (show/hide windows): the Visibility tab's "Show only on…" option has the same "Add another time window" button — works on dishes AND whole categories.
Add as many windows as you need; remove one with the ✕.

Recap of what's already live from this report:
1. Show-with-notice for service-restricted dishes (Website → Theme chooser)
2. Pickup/delivery toggles on categories

Please try all three on your test restaurant and let us know — grazie!`;

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const report = await prisma.resellerReport.findFirst({ where: { id: { startsWith: PREFIX } } });
    if (!report) { console.log("✗ report not found"); return; }
    await prisma.$transaction(async (tx) => {
      await tx.resellerReportComment.create({ data: { reportId: report.id, authorEmail: SA_EMAIL, authorName: SA_NAME, body: COMMENT } });
      await tx.resellerReport.update({ where: { id: report.id }, data: { status: "IN_TESTING" } });
      const recipients = new Set<string>();
      if (report.authorEmail) recipients.add(report.authorEmail.toLowerCase());
      recipients.delete(SA_EMAIL.toLowerCase());
      for (const email of recipients) {
        await tx.resellerNotification.create({
          data: { recipientEmail: email, kind: "report_status", title: `All 3 live — please test: ${report.title}`, body: COMMENT.slice(0, 240), linkUrl: `/reseller-reports/${report.id}`, reportId: report.id, actorName: SA_NAME },
        });
      }
    });
    console.log(`✅ final reply posted + IN_TESTING on "${report.title}"`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
