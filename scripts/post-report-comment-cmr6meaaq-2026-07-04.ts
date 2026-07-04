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

const COMMENT = `Root-caused and fixed — excellent report, the detail about accepting from your phone while the tablet rang was the key. ✅

What happened: your tablet had been signed in since the night before. When you accepted the 3 orders from your phone at 9:01, the tablet's own (now stale) list still showed them as pending. When the tablet woke up in the evening (~18:40), its expired countdowns fired the automatic "missed" rejection for all three — and the server accepted that write even though the orders had been accepted at 9:01 and had even completed at 10:02. The database confirmed it: all three were stamped "Auto-rejected" at 18:40:36, within the same second.

Fixes now live:
1. The server refuses to reject any order that isn't still pending — a stale device physically cannot overwrite an accepted or completed order anymore, from any screen, ever. Multi-device use (tablet ringing, accept from the phone) is fully safe.
2. Duplicate writes are ignored too — two devices accepting the same order no longer send the customer duplicate emails.
3. Your other point is fixed as well: "missed" and "rejected" emails are now genuinely different. A missed order says "Order not accepted in time" with matching body text; a manual refusal keeps the rejected wording. And the email body no longer shows the raw English status word or a nonsensical "estimated ready" time on negative updates.
4. Your 3 test orders (#724296909, #116497279, #366702546) have been restored to their true state — completed.

Please retest the exact scenario when you can: leave the tablet signed in overnight, accept the morning orders from your phone, and check that no "missed" emails arrive later. Grazie!`;

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
