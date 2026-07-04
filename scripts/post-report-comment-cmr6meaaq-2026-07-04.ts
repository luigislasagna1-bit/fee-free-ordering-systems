/**
 * Reply on cmr6meaaq: stale-tablet accepted→missed flip — root-caused,
 * fixed, and the 3 orders repaired. Comment + notification, no status change.
 *   npx tsx scripts/run-on-prod.ts scripts/post-report-comment-cmr6meaaq-2026-07-04.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";
const REPORT_PREFIX = "cmr6meaaq";

const COMMENT = `Found it and fixed it — great report. ✅

WHAT HAPPENED: your tablet was signed in since the night before. You accepted the 3 orders from your phone at 9:01, but the tablet's own screen still showed them as "pending". When the tablet woke up in the evening (~18:40), its expired timers fired the automatic "missed" rejection for all three — and the server let that overwrite orders that were already accepted (and even completed). We confirmed it in the database: all three were stamped "Auto-rejected" at 18:40:36, in the same second.

HOW IT'S FIXED: the server now refuses to mark an order "missed"/rejected unless it is genuinely still pending. A stale device physically cannot overwrite an accepted or completed order anymore — using the tablet and phone together is fully safe. Duplicate emails from two devices are also gone, and "missed" vs "rejected" now have their own distinct email wording (missed = not accepted in time; rejected = refused by the restaurant), with no more raw English status words.

HOW TO CHECK: your 3 orders are restored to "completed". To verify the fix, repeat the exact scenario — tablet signed in overnight, accept the morning orders from the phone — and no "missed" email should ever arrive. If one ever does for an order you know was accepted, flag it here immediately; on our side every refused overwrite is now logged, so we'd see the attempt too. Grazie!`;

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const report = await prisma.resellerReport.findFirst({ where: { id: { startsWith: REPORT_PREFIX } } });
    if (!report) throw new Error(`No report starting with ${REPORT_PREFIX}`);
    if (report.status === "FIXED") { console.log(`Refusing — already FIXED: ${report.title}`); return; }
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
          data: { recipientEmail: email, kind: "report_status", title: `Fixed — please retest: ${report.title}`, body: COMMENT.slice(0, 240), linkUrl: `/reseller-reports/${report.id}`, reportId: report.id, actorName: SA_NAME },
        });
      }
    });
    console.log(`✅ reply posted on "${report.title}" (${report.id})`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
