/**
 * Reply on cmqqxerxs (Home delivery / time slots): feature SHIPPED.
 * Comment + in-app notification (no status change; FIXED human-gated).
 *   npx tsx scripts/run-on-prod.ts scripts/post-report-comment-cmqqxerxs-shipped-2026-07-04.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";
const REPORT_PREFIX = "cmqqxerxs";

const COMMENT = `This is live now. ✅

Time slots work exactly as you described:

- In Setup → Services, each service has a "Time selection" setting with checkboxes: fixed times, time ranges (e.g. 8:15 PM – 8:30 PM), and exact time. The restaurant can enable any one or several — with several enabled, the customer picks their preferred style at checkout. So restaurants that prefer traditional specific times keep them, exactly as you noted.
- When the customer picks a range like 8:15 – 8:30 PM, it means delivery within that timeframe. The countdown runs to 8:15 PM, per your spec.
- If the restaurant extends the order by 10 minutes, the whole window shifts by 10 minutes and the customer gets the usual email.
- The window length follows the slot interval setting (5 minutes up to 1 hour, default 15).
- The chosen window is shown everywhere: checkout, confirmation page, confirmation email, order status page, the Kitchen Order App, and the admin orders list.

Please retest when you have a moment and let us know. Thanks for the detailed spec — the screenshots made this easy to match.`;

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const report = await prisma.resellerReport.findFirst({ where: { id: { startsWith: REPORT_PREFIX } } });
    if (!report) throw new Error(`No report starting with ${REPORT_PREFIX}`);
    if (report.status === "FIXED") { console.log(`Refusing — already FIXED (human-gated): ${report.title}`); return; }
    await prisma.$transaction(async (tx) => {
      await tx.resellerReportComment.create({
        data: { reportId: report.id, authorEmail: SA_EMAIL, authorName: SA_NAME, body: COMMENT },
      });
      const recipients = new Set<string>();
      if (report.authorEmail) recipients.add(report.authorEmail.toLowerCase());
      if ((report as any).reportedByEmail) recipients.add((report as any).reportedByEmail.toLowerCase());
      recipients.delete(SA_EMAIL.toLowerCase());
      for (const email of recipients) {
        await tx.resellerNotification.create({
          data: { recipientEmail: email, kind: "report_status", title: `Shipped — please retest: ${report.title}`, body: COMMENT.slice(0, 240), linkUrl: `/reseller-reports/${report.id}`, reportId: report.id, actorName: SA_NAME },
        });
      }
    });
    console.log(`✅ time-slots shipped reply posted on "${report.title}" (${report.id}), reporter notified`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
