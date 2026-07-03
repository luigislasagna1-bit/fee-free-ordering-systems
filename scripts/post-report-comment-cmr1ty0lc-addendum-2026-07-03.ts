/**
 * Addendum comment on cmr1ty0lc: reseller VAT numbers now get the same live
 * VIES validation. Comment + in-app notification only (no status change).
 *   npx tsx scripts/run-on-prod.ts scripts/post-report-comment-cmr1ty0lc-addendum-2026-07-03.ts
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

const COMMENT = `One more addition: YOUR OWN VAT number is now VIES-validated too. When you save your VAT number under Reseller → Branding → Imprint → "Invoice details" (the number shown on the "local partner" line of your restaurants' invoices), we check it live against VIES the same way — you'll see a green "VIES: valid" badge, a red "not registered" badge, or a "Verify now" re-check button if VIES was down at the time. Please save your P.IVA there and confirm the badge turns green.`;

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
    console.log(`✅ addendum posted on "${report.title}", reporter notified`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
