/** Reply to Fabrizio's "Promo Get it Now" report (built) + flip NEW→IN_TESTING.
 *    npx tsx scripts/run-on-prod.ts scripts/_comment-fabrizio-getitnow.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";
const REPORT_ID = "cmqtmfp2n000l04i601k71xdc";

const COMMENT = `Done — both parts of your request are now live on the "Get it now" screen of a promotion. (1) Categorized: the eligible products are grouped by their menu category (Pizzas, Pasta, …) instead of being shown all mixed together. (2) Add from that screen: each product now has a button. Simple products show "+ Add" and go straight into the cart without leaving the screen, so a customer can add several quickly. Products that need a choice first (a size, or extras/modifiers) show "Customize", which opens the size/options picker so nothing is added without the required choice. Please open one of your discount promotions, press "Get it now", and try it. (If the promo you had in mind was a "buy one get one" / combo deal, that screen already lets the customer add by completing the deal — just tell me if you'd like the category grouping there too.)`;

const NOTIF_BODY = `Done — the "Get it now" screen now groups products by category and lets customers add them straight to the cart ("+ Add" for simple items, "Customize" for items with sizes/options). Live now — please try it on one of your discount promotions.`;

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
    if ((report as any).authorEmail) recipients.add((report as any).authorEmail.toLowerCase());
    if ((report as any).reportedByEmail) recipients.add((report as any).reportedByEmail.toLowerCase());
    recipients.delete(SA_EMAIL.toLowerCase());
    for (const email of recipients)
      await tx.resellerNotification.create({ data: { recipientEmail: email, kind: "report_status", title: `Update on: ${report.title}`, body: NOTIF_BODY, linkUrl: `/reseller-reports/${REPORT_ID}`, reportId: REPORT_ID, actorName: SA_NAME } });
  });
  console.log(`✅ "${report.title}": ${prev} → IN_TESTING (+comment, notified)`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
