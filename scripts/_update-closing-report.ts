/**
 * Post Fabrizio's update on the "Closing days / closed services" report (#1),
 * keep it IN_TESTING, and ping him via the in-app ResellerNotification bell.
 * Comment is inline (UTF-8) so accents/dashes/parens are safe — no cmd escaping.
 *
 *   npx tsx scripts/run-on-prod.ts scripts/_update-closing-report.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";

const COMMENT = `Hi Fabrizio — thanks for the detailed re-test on this one. We have made three fixes and they are now live:

1) Warning banner for partial / per-service closures. The amber warning banner on the ordering page now ALWAYS appears, not only for a full closure. If you set an exceptional CLOSED TIME RANGE on a single service (for example pickup closed 16:00–20:00), or special opening hours for just one service, the customer now sees the warning at the top of the page immediately — before they try to confirm. It works whether you close all services or only one.

2) Pause banner now translated. The yellow "service paused" banner was showing in English only — it is now fully translated into all 38 languages, including Italian, and the service names inside it are translated too.

3) Pause services from the backend. You can now pause services from the admin panel, not only from the app. Open the Services page in the backend and you will see a new "Pause services" control: pick the services, choose 30 min / 1 hour / 2 hours / rest of day, and "Resume now" when you are ready. It auto-resumes when the time is up. Pausing reservations now also blocks new bookings (before, the banner showed but bookings could still come through — that is fixed too).

Everything is deployed. Could you please re-test on your side: (a) set an exceptional closed time range on a single service and confirm the banner appears, (b) check the pause banner shows in Italian, and (c) try the new Pause control on the backend Services page — and let us know if it all looks correct. Thank you for the great report, it helped a lot!`;

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const report = await prisma.resellerReport.findFirst({
    where: { title: { contains: "Closing days" } },
    select: { id: true, title: true, status: true, authorEmail: true, reportedByEmail: true },
  });
  if (!report) { console.log("No 'Closing days' report found on this DB."); await prisma.$disconnect(); return; }
  console.log(`Found: "${report.title}" [${report.status}] id=${report.id}`);

  await prisma.$transaction(async (tx) => {
    await tx.resellerReportComment.create({
      data: { reportId: report.id, authorEmail: SA_EMAIL, authorName: SA_NAME, body: COMMENT },
    });
    await tx.resellerReportActivity.create({
      data: { reportId: report.id, actorEmail: SA_EMAIL, actorName: SA_NAME, kind: "COMMENTED" },
    });
    await tx.resellerReport.update({ where: { id: report.id }, data: { updatedAt: new Date() } });

    const recipients = new Set<string>();
    if (report.authorEmail) recipients.add(report.authorEmail.toLowerCase());
    if (report.reportedByEmail) recipients.add(report.reportedByEmail.toLowerCase());
    recipients.delete(SA_EMAIL.toLowerCase());
    for (const email of recipients) {
      await tx.resellerNotification.create({
        data: {
          recipientEmail: email,
          kind: "report_status",
          title: `Update on: ${report.title}`,
          body: "Three fixes are live — partial/per-service closure banner, translated pause banner, and pause-from-the-backend. Please re-test.",
          linkUrl: `/reseller-reports/${report.id}`,
          reportId: report.id,
          actorName: SA_NAME,
        },
      });
    }
  });

  console.log(`✅ Comment + notification posted to "${report.title}" (kept ${report.status}).`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
