/**
 * Reply on cmqsn52d2 (kitchen tile layout): reverted to two-line name+address,
 * ZIP dropped, names at reservation size — per Fabrizio's 2026-07-03 screenshots.
 * Comment + in-app notification (no status change; FIXED refused).
 *   npx tsx scripts/run-on-prod.ts scripts/post-report-comment-cmqsn52d2-2026-07-03.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";
const REPORT_PREFIX = "cmqsn52d2";

const COMMENT = `Done — laid out exactly per your screenshots:

1) With both the customer's name and the delivery address active, the tile is back to TWO lines: the customer's name on top, the delivery address on its own line underneath — never all on one line.

2) The address line is now "street number, city" WITHOUT the postal code (e.g. "Via Giuseppe Mazzini 13, Varedo"). The word capitalization stays.

3) Customer names for pickup AND delivery are back at the larger size — exactly the same size as the customer's name on a table-reservation tile.

Please take a look on your tablet and confirm it matches what you had in mind. Grazie!`;

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
          data: { recipientEmail: email, kind: "report_status", title: `Update on: ${report.title}`, body: COMMENT.slice(0, 240), linkUrl: `/reseller-reports/${report.id}`, reportId: report.id, actorName: SA_NAME },
        });
      }
    });
    console.log(`✅ "${report.title}" (${report.id}): comment posted, reporter notified`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
