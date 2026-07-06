/** Progress reply on cmr803ovq: (a)+(b) shipped, (c) multi-windows coming.
 *  Sets status IN_PROGRESS. Run:
 *  npx tsx scripts/run-on-prod.ts scripts/post-report-comment-cmr803ovq.ts */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";
const PREFIX = "cmr803ovq";
const COMMENT = `Two of your three requests are LIVE now — please test: ✅

1. SHOW-WITH-NOTICE OPTION: Admin → Website → Theme → "Dishes not offered for the selected service". Choose "Hide from menu" (how it's always worked) or "Show with note" — with the note option, your EBI ARGENTINO example stays visible when a customer selects pickup: greyed out, not addable, with "Available for delivery only" under it (translated in every language). Works in all three menu layouts.

2. CATEGORY-LEVEL SERVICE RESTRICTION: editing a category now has the same "Available for pickup" / "Available for delivery" toggles items have — restrict a whole category to one service in one click. The hide-vs-note choice applies to categories the same way.

Also hardened while I was in there: the server now refuses a service-mismatched dish at order time (previously a customer with an old cart could technically order a delivery-only dish as pickup).

3. MULTIPLE TIME WINDOWS (Mon–Thu 10–15 + Fri–Sun 15–20 on one dish/category) — in progress, ships separately. I'll update here when it's live.

Grazie!`;

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const report = await prisma.resellerReport.findFirst({ where: { id: { startsWith: PREFIX } } });
    if (!report) { console.log("✗ report not found"); return; }
    await prisma.$transaction(async (tx) => {
      await tx.resellerReportComment.create({ data: { reportId: report.id, authorEmail: SA_EMAIL, authorName: SA_NAME, body: COMMENT } });
      await tx.resellerReport.update({ where: { id: report.id }, data: { status: "IN_PROGRESS" } });
      const recipients = new Set<string>();
      if (report.authorEmail) recipients.add(report.authorEmail.toLowerCase());
      recipients.delete(SA_EMAIL.toLowerCase());
      for (const email of recipients) {
        await tx.resellerNotification.create({
          data: { recipientEmail: email, kind: "report_status", title: `Update — 2 of 3 live: ${report.title}`, body: COMMENT.slice(0, 240), linkUrl: `/reseller-reports/${report.id}`, reportId: report.id, actorName: SA_NAME },
        });
      }
    });
    console.log(`✅ progress reply posted on "${report.title}"`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
