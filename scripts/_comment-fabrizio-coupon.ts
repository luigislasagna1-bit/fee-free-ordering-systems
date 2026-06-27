/** Reply to Fabrizio's "Coupon" report (usage-limit bug fixed) + flip NEW→IN_TESTING.
 *    npx tsx scripts/run-on-prod.ts scripts/_comment-fabrizio-coupon.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";
const REPORT_ID = "cmqtllluu000x04jsxxm2x33e";

const COMMENT = `Fixed — single-use / "max N uses" coupon codes are now properly enforced.

The bug: the system was checking the usage limit but never COUNTING redemptions, so a "maximum 1 use" code's counter stayed at 0 and the code could be reused forever. We confirmed it on your own TESTCOUPON01X — its limit is 1, but the counter was stuck at 0 despite the repeated reuse.

The fix: every time a coupon/promo is redeemed on an order, its use-count now goes up — atomically, so even simultaneous orders can't slip past the cap — and once it reaches the limit the code is rejected.

To re-test: place an order with a max-1-use code → it works and counts as 1 use → a second order with the same code is now blocked. (Heads-up: the counter starts fresh from now, so a code you already over-used during testing will still allow uses up to its limit going forward — use a fresh code/limit for a clean test.)

Two separate ideas you added on this report — (1) categories from all menus being mixed together when choosing which categories a promotion applies to, and (2) a GloriaFood-style cart summary of which items got the discount — are both good; we've captured them as separate improvements to build. This update covers the usage-limit bug itself.`;

const NOTIF_BODY = "Fixed: single-use / max-uses coupon codes are now enforced — redemptions are counted atomically and the code is rejected once it hits its limit (confirmed on your TESTCOUPON01X, which had limit 1 but a stuck counter). Re-test with a fresh max-1 code. Your 2 promo UX ideas are captured separately.";

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  const report = await prisma.resellerReport.findUnique({ where: { id: REPORT_ID } });
  if (!report) { console.log(`No report ${REPORT_ID}.`); await prisma.$disconnect(); return; }
  const prev = report.status;
  await prisma.$transaction(async (tx) => {
    if (prev !== "IN_TESTING") {
      await tx.resellerReport.update({ where: { id: REPORT_ID }, data: { status: "IN_TESTING" } });
      await tx.resellerReportActivity.create({ data: { reportId: REPORT_ID, actorEmail: SA_EMAIL, actorName: SA_NAME, kind: "STATUS", detail: `${prev} → IN_TESTING` } });
    }
    await tx.resellerReportComment.create({ data: { reportId: REPORT_ID, authorEmail: SA_EMAIL, authorName: SA_NAME, body: COMMENT } });
    const recipients = new Set<string>();
    if (report.authorEmail) recipients.add(report.authorEmail.toLowerCase());
    if (report.reportedByEmail) recipients.add(report.reportedByEmail.toLowerCase());
    recipients.delete(SA_EMAIL.toLowerCase());
    for (const email of recipients)
      await tx.resellerNotification.create({ data: { recipientEmail: email, kind: "report_status", title: `Update on: ${report.title}`, body: NOTIF_BODY, linkUrl: `/reseller-reports/${REPORT_ID}`, reportId: REPORT_ID, actorName: SA_NAME } });
  });
  console.log(`✅ "${report.title}": ${prev} → IN_TESTING (+comment, notified)`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
