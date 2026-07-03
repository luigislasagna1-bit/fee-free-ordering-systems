/**
 * Reply on cmqv33v2o: per-item "You saved" badges now ALSO in the cart drawer.
 * Comment + in-app notification (no status change; FIXED human-gated).
 *   npx tsx scripts/run-on-prod.ts scripts/post-report-comment-cmqv33v2o-cart-badges-2026-07-03.ts
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

const COMMENT = `Done — the itemized breakdown now appears in the CART as well, not just at checkout. ✅

Each discounted dish shows its own "👍 You saved X €" badge directly on its cart line, using the exact same per-line attribution as the checkout screen — so when only SOME items are discounted (your exact point), the cart makes it obvious which dishes the promotion hit and which it didn't. Undiscounted lines stay clean; whole-cart discounts (with no per-dish part) continue to show in the totals as before.

Verified before shipping with a mixed cart: a dish covered by a 20% promotion showed "You saved 2,60" on its line while an uncovered dessert showed no badge, and the badge amounts summed exactly to the Discount row.

Please retest in the cart (give the deploy a few minutes) and confirm. Grazie!`;

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
          data: { recipientEmail: email, kind: "report_status", title: `Update — please retest: ${report.title}`, body: COMMENT.slice(0, 240), linkUrl: `/reseller-reports/${report.id}`, reportId: report.id, actorName: SA_NAME },
        });
      }
    });
    console.log(`✅ cart-badges reply posted on "${report.title}" (${report.id}), reporter notified`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
