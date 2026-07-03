/**
 * Completion reply on cmqtmfp2n (promo "Get it Now" follow-up): qty steppers
 * shipped + category grouping confirmed + the oncePerOrder math explanation.
 * Flips to IN_TESTING if not already; FIXED refused (human-gated).
 *   npx tsx scripts/run-on-prod.ts scripts/post-report-comment-cmqtmfp2n-2026-07-03.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";
const REPORT_ID = "cmqtmfp2n";

const COMMENT = `All three parts of your follow-up are now addressed:

1) QUANTITY STEPPERS ON THE PROMOTION SCREEN — shipped. On the "Get it Now" screen, once you add a simple item its "+ Add" button becomes a −/quantity/+ stepper, so you can add or remove several units without leaving the promotion screen (just like GloriaFood). The quantity stays in sync with the cart, and repeated adds now merge into ONE cart line instead of stacking duplicate lines. Items with sizes or extras still open the customizer first (a customized line can't be reduced blindly — you edit it from the cart instead).

2) ITEMS GROUPED BY CATEGORY — confirmed working: the eligible-items list on the promotion screen is grouped under category headers (e.g. PIZZAS / PASTA / SALADS), no longer mixed together. If you still see a mixed list on a specific promotion, tell us which one and we'll look at its configuration.

3) THE €1.20 vs €20.40 MATH — that promotion has "Only allowed once per order" ticked. For a percentage promotion that setting means: discount only the SINGLE most expensive qualifying item (20% of one €6 dish = €1.20), not 20% of everything. The cart now names exactly which item was discounted, and the promotion editor explains this next to the checkbox. If you want the 20% to apply to ALL qualifying items (€20.40 on that cart), edit the promotion and UNTICK "Only allowed once per order".

PLEASE TEST: open a percentage promotion's "Get it Now" screen → add a simple item → the button becomes − / qty / + → set a quantity and check the cart shows one line with that quantity and the discount applied. Grazie!`;

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const report = await prisma.resellerReport.findFirst({ where: { id: { startsWith: REPORT_ID } } });
    if (!report) throw new Error(`No report starting with ${REPORT_ID}`);
    if (report.status === "FIXED") { console.log(`Refusing — already FIXED (human-gated): ${report.title}`); return; }
    const prev = report.status;
    const flip = prev !== "IN_TESTING";
    await prisma.$transaction(async (tx) => {
      if (flip) {
        await tx.resellerReport.update({ where: { id: report.id }, data: { status: "IN_TESTING" } });
        await tx.resellerReportActivity.create({
          data: { reportId: report.id, actorEmail: SA_EMAIL, actorName: SA_NAME, kind: "STATUS", detail: `${prev} → IN_TESTING` },
        });
      }
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
    console.log(`✅ "${report.title}" (${report.id}): ${flip ? `${prev} → IN_TESTING, ` : `status kept (${prev}), `}comment posted, reporter notified`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
