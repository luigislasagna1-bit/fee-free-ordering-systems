/**
 * Reply on cmqv33v2o: checkout "You saved" badge now wraps onto its own line.
 * Comment + in-app notification (no status change; FIXED human-gated).
 *   npx tsx scripts/run-on-prod.ts scripts/post-report-comment-cmqv33v2o-badge-wrap-2026-07-04.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";
const REPORT_PREFIX = "cmqv33v2o";

const COMMENT = `Done. ✅

The "You saved X €" badge at checkout now sits on its own line under the item name — exactly how it looks in the cart, as you suggested. Long dish names on mobile no longer squeeze the badge.

While we were in there we also fixed two more mobile issues you'd flagged: the "See full menu" / "Go to cart" buttons inside promotion screens are now always visible on phones (the modal was extending below the visible screen), and tapping outside the checkout no longer closes it accidentally — only the ✕ does.

Please retest on mobile (give the deploy a few minutes) and confirm. Grazie!`;

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const report = await prisma.resellerReport.findFirst({ where: { id: { startsWith: REPORT_PREFIX } } });
    if (!report) throw new Error(`No report starting with ${REPORT_PREFIX}`);
    // Report is already FIXED — Luigi explicitly asked for this follow-up
    // comment (2026-07-04); we post the COMMENT only, never touch status.
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
    console.log(`✅ badge-wrap reply posted on "${report.title}" (${report.id}), reporter notified`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
