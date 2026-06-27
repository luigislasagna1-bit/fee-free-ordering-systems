/** Reply to Fabrizio's "Delivery/pickup timeframes on the homepage" report + flip NEW→IN_TESTING.
 *    npx tsx scripts/run-on-prod.ts scripts/_comment-fabrizio-hometimes.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";
const REPORT_ID = "cmqt99i8s001b04jvy9uj7xjn";

const COMMENT = `Done — you can now hide the estimated times next to the service names on the ordering page. There's a new setting on the Taking Orders (Order Handling) page: "Show service times on the ordering page". Turn it off and the "· 20 min" disappears from the Pickup / Delivery / Dine-in / Take-out buttons on the main page — the times still appear at checkout. It's a per-restaurant setting, so it's entirely your choice (default is on, so nothing changes unless you turn it off). Live now — please try it.`;

const NOTIF_BODY = "Done — new setting on the Taking Orders page (\"Show service times on the ordering page\"). Turn it off to hide the \"· 20 min\" next to the service names on the ordering page (still shown at checkout). Per-restaurant, default on. Live now.";

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
