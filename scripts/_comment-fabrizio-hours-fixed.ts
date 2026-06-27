/** Reply to Fabrizio's re-opened "opening hours per service" report + flip to IN_TESTING.
 *   npx tsx scripts/run-on-prod.ts scripts/_comment-fabrizio-hours-fixed.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";
const REPORT_ID = "cmqnm3hv0000b04i8tvvxx836";

const COMMENT = `Hi Fabrizio, thank you for the detailed re-test — it helped a lot. We recreated your exact setup on a live restaurant and tested it end to end on a real phone (Samsung S23). Here's where it stands:

Confirmed working — when the restaurant is open by its GENERAL hours, an order placed for a service that starts later in the day:
• rings the order app IMMEDIATELY — even with the app in the background and the screen locked,
• the header shows the GENERAL hours (e.g. 9:00 AM – 11:00 PM), not the service's start time,
• and checkout names the SERVICE ("Pickup hasn't started yet — it starts at 6:00 PM"), instead of saying the restaurant is closed.
We even tested it placed while the store was fully closed: it stayed silent and showed "Opens in X min", then rang the moment the general hours opened, and printed correctly on accept.

Why it looked broken on your test restaurant: the GENERAL hours had GAPS on some days (from all the back-and-forth testing) — for example one day was set to 9:00–10:20, then CLOSED 10:20–12:00, then 12:00–23:00. Because the general hours decide whether the restaurant is open, an order placed at 10:40 falls inside that closed gap, so it correctly defers the ring and shows "closed". That's the split-hours feature working as intended — but it looks exactly like the original bug.

Could you re-test for us?
1) Set your GENERAL hours to one CONTINUOUS window per day (e.g. 9:00 AM – 11:00 PM, with no gaps), matching when you're actually open.
2) Keep your per-service hours as you had them (pickup from 2:00 PM, delivery from 3:00 PM).
3) During general hours, before a service starts, place an order for that service → the app should ring immediately, the header should show your general hours, and checkout should say "[service] starts at [time]".

We also polished the checkout while testing (clearer "service hasn't started yet" wording, and switching between pickup/delivery now auto-picks the right earliest time). Thanks again — please let us know how it goes! 🙏`;

const NOTIF_BODY = "Fixed + verified on a real phone — the ring, header and checkout all follow your GENERAL hours (it even rings screen-locked when the store opens). The relapse was gaps in the test hours; set your general hours to one continuous window per day and re-test. Full details + steps in the comment.";

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
    await tx.resellerReport.update({ where: { id: REPORT_ID }, data: { status: "IN_TESTING" } });
    await tx.resellerReportActivity.create({
      data: { reportId: REPORT_ID, actorEmail: SA_EMAIL, actorName: SA_NAME, kind: "STATUS", detail: `${prev} → IN_TESTING` },
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
        data: { recipientEmail: email, kind: "report_status", title: `Report in testing: ${report.title}`, body: NOTIF_BODY, linkUrl: `/reseller-reports/${REPORT_ID}`, reportId: REPORT_ID, actorName: SA_NAME },
      });
    }
    console.log(`  notifying: ${[...recipients].join(", ") || "(no reporter email)"}`);
  });

  console.log(`✅ "${report.title}": ${prev} → IN_TESTING (+comment, notified)`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
