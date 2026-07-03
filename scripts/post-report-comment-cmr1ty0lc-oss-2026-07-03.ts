/**
 * Comment on cmr1ty0lc: commit to the full model — non-VIES EU clients will be
 * charged their local VAT via a non-Union OSS registration (coming soon).
 * Comment + in-app notification only (no status change).
 *   npx tsx scripts/run-on-prod.ts scripts/post-report-comment-cmr1ty0lc-oss-2026-07-03.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";
const REPORT_ID = "cmr1ty0lc000004lgc9okgwgz";

const COMMENT = `Following up on your note about non-VIES clients: agreed, and we WILL implement the full model soon.

Where it stands today: the VIES-registered half is live — a client with a VIES-valid VAT number is invoiced at 0% with the Article 44 reverse-charge note (self-assessed in Italy), exactly like your Oracle invoice. For clients WITHOUT a VIES registration, the system currently doesn't take their payment at all (they stay on the free plan) — we deliberately won't collect a VAT we're not yet registered to remit.

What's coming: Fee Free Ordering is registering for the EU's non-Union OSS scheme (the One Stop Shop for non-EU suppliers of electronic services). Once that registration is active, non-VIES clients will be charged their own country's VAT — 22% for Italy — collected at checkout and remitted through the quarterly OSS return, and their invoices will show the VAT rate and amount line accordingly. That is precisely how Oracle GloriaFood handles it, and the VIES check that decides which of the two treatments applies is already built and live.

So: nothing changes for your VIES-registered restaurants (0% reverse charge, available today), and non-VIES clients become payable customers as soon as the OSS registration completes. We'll update this thread when it's live. Grazie!`;

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const report = await prisma.resellerReport.findUnique({ where: { id: REPORT_ID } });
    if (!report) throw new Error(`No report ${REPORT_ID}`);
    await prisma.$transaction(async (tx) => {
      await tx.resellerReportComment.create({
        data: { reportId: REPORT_ID, authorEmail: SA_EMAIL, authorName: SA_NAME, body: COMMENT },
      });
      const recipients = new Set<string>();
      if (report.authorEmail) recipients.add(report.authorEmail.toLowerCase());
      if ((report as any).reportedByEmail) recipients.add((report as any).reportedByEmail.toLowerCase());
      recipients.delete(SA_EMAIL.toLowerCase());
      for (const email of recipients) {
        await tx.resellerNotification.create({
          data: { recipientEmail: email, kind: "report_status", title: `Update on: ${report.title}`, body: COMMENT.slice(0, 240), linkUrl: `/reseller-reports/${REPORT_ID}`, reportId: REPORT_ID, actorName: SA_NAME },
        });
      }
    });
    console.log(`✅ OSS commitment comment posted on "${report.title}", reporter notified`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
