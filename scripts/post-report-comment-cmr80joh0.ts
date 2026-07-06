/** FIXED reply on cmr80joh0 (pin-to-top + category accent color).
 *  npx tsx scripts/run-on-prod.ts scripts/post-report-comment-cmr80joh0.ts */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";
const PREFIX = "cmr80joh0";
const COMMENT = `Done — both ideas shipped. ✅

1. PIN TO TOP: editing a dish now has a "Pin to top of menu" toggle (next to Sold out / Available for pickup / delivery). A pinned dish — your MENU PRANZO — appears as a prominent tile in a "Featured" strip at the VERY top of the ordering page, right above the promotions, in every menu layout. Tapping it opens the dish normally (choices and additions included). It respects all the usual rules — sold-out, visibility, service restrictions.

2. CATEGORY ACCENT COLOR: editing a category now has an "Accent color" picker. The color highlights that category's header on the order page (the banner band, or the modern accent style) so a signature section stands out from the rest. Leave it unset to keep the theme color.

Please try both on your test store — pin MENU PRANZO and give a category a color — and confirm. Grazie!`;

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
      await tx.resellerReport.update({ where: { id: report.id }, data: { status: "FIXED" } });
      const recipients = new Set<string>();
      if (report.authorEmail) recipients.add(report.authorEmail.toLowerCase());
      recipients.delete(SA_EMAIL.toLowerCase());
      for (const email of recipients) {
        await tx.resellerNotification.create({
          data: { recipientEmail: email, kind: "report_status", title: `Fixed — please retest: ${report.title}`, body: COMMENT.slice(0, 240), linkUrl: `/reseller-reports/${report.id}`, reportId: report.id, actorName: SA_NAME },
        });
      }
    });
    console.log(`✅ FIXED + reply posted on "${report.title}"`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
