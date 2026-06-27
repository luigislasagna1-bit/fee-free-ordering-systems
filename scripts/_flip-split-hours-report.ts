/**
 * Flip the "Multiple schedules for the same day" (split hours) report to
 * IN_TESTING, post Fabrizio an update, and ping him via the in-app bell.
 * Comment inline (UTF-8) so accents/dashes are safe.
 *   npx tsx scripts/run-on-prod.ts scripts/_flip-split-hours-report.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";
const REPORT_ID = "cmqsmbow3000204jsfuz8b6ug";
const STATUS = "IN_TESTING";

const COMMENT = `Hi Fabrizio — split hours (multiple time slots per day) is built and live. You can now set MORE THAN ONE open window per day — for example open for lunch 12:00–15:00, close for a break, then reopen for dinner 18:00–23:00.

How it works:
1) In the backend Hours page, each day now has a "+ Add a time slot" button — add as many windows as you need (up to 4 per day). It works for the GENERAL weekly hours AND per service (Pickup / Delivery / Dine-in / Take-out) — each service tab has its own slots.
2) On the customer ordering page, during the break the restaurant correctly shows as closed (e.g. at 16:00 it says "opens at 18:00"), and the scheduled-order time picker only offers lunch + dinner times — nothing during the break. The server also blocks an order placed for a time inside the break.
3) Reservations support split hours too (set them on the reservation tab) — the booking time picker skips the break.

Overnight windows (e.g. open until 2 AM) are supported per slot, and existing single-window restaurants are completely unchanged.

Please test it on your side and let us know if it all works as expected. Thank you for the report!`;

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const report = await prisma.resellerReport.findUnique({ where: { id: REPORT_ID } });
  if (!report) { console.log(`No report ${REPORT_ID} on this DB.`); await prisma.$disconnect(); return; }
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
          body: "Split hours is live — add multiple time slots per day (lunch + dinner), general + per service + reservations. Please re-test.",
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
