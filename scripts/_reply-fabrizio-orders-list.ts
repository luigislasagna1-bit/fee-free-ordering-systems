/**
 * Ship-reply for Fabrizio's "Order List" (Partner view) report.
 * Comment + IN_TESTING + activity rows + in-app notification, per the
 * established reseller ship workflow.
 *   npx tsx scripts/run-on-prod.ts scripts/_reply-fabrizio-orders-list.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const REPORT_ID = "cmshrr94z001d04l7x8kpet3z";
const AUTHOR_NAME = "Luigi";
const AUTHOR_EMAIL = "admin@feefreeordering.com";

const BODY = `Hi Fabrizio — this is built and live now. Thank you for the suggestion and for the screenshot, it made the target very clear.

You'll find it in your partner panel under **Restaurants → Orders List**.

What it does:

• **Every restaurant in one list.** All of your restaurants' orders together, newest first, so you no longer have to open each restaurant separately.

• **See the outcome at a glance.** Filter chips across the top show live counts for Accepted, Completed, Pending, Missed, Rejected and Cancelled. "Missed" means the restaurant did not answer the order in time — worth watching, because those are lost sales you can talk to your client about.

• **Search across everything.** Type a customer name, an order ID, a phone number or an email address and it searches every restaurant you manage at once.

• **Table reservations are included too**, alongside orders, with a Type filter so you can show only what you want (Delivery, Pickup, Table reservation, Reservation & Pre-order, On premise, Catering).

• **Click any row to open it.** It expands in place with two tabs: "Order detail" (status, placed / confirmed / fulfilled times, type, payment method, total) and "Order items" (every item with its options and prices, then subtotal, tax, tip and total).

• **Choose your columns.** The small table icon on the right of the header lets you show or hide columns — Name, Company Name, Order ID, Placed at, Status, Type, Total, Payment Method and Fulfilment time. Your choice is remembered.

• **Export.** The Export button opens a dedicated page where you pick the period, the restaurant, the types and statuses, and exactly which fields you want, then download as CSV or Excel.

Two notes:

1. It shows the last 28 days by default, so it stays fast. Use the date picker, or the "Show orders older than 30 days" link, to look further back.

2. If your restaurants use different currencies, each total is shown in that restaurant's own currency and totals are never added together — a mixed-currency sum would be misleading, so we deliberately do not show one.

Please have a look and let us know if anything is missing or behaves differently from what you expected. If it looks right, you can mark it as confirmed on this report.`;

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const report: any = await prisma.resellerReport.findUnique({ where: { id: REPORT_ID } });
  if (!report) { console.error("report not found"); process.exit(1); }

  const recipient = String(report.reportedByEmail ?? report.authorEmail ?? "").toLowerCase();
  console.log(`Report: "${report.title}"  status=${report.status}  → notifying ${recipient}`);

  await prisma.resellerReportComment.create({
    data: { reportId: REPORT_ID, authorEmail: AUTHOR_EMAIL, authorName: AUTHOR_NAME, body: BODY },
  });
  await prisma.resellerReportActivity.create({
    data: { reportId: REPORT_ID, actorEmail: AUTHOR_EMAIL, actorName: AUTHOR_NAME, kind: "COMMENTED" },
  });

  if (report.status !== "IN_TESTING") {
    await prisma.resellerReport.update({ where: { id: REPORT_ID }, data: { status: "IN_TESTING" } });
    await prisma.resellerReportActivity.create({
      data: { reportId: REPORT_ID, actorEmail: AUTHOR_EMAIL, actorName: AUTHOR_NAME, kind: "STATUS_CHANGE" },
    });
  }
  await prisma.resellerReport.update({ where: { id: REPORT_ID }, data: { updatedAt: new Date() } });

  if (recipient) {
    await prisma.resellerNotification.create({
      data: {
        kind: "report_status",
        recipientEmail: recipient,
        title: "Your feature request is ready to test",
        body: `"${report.title}" is now live — Restaurants → Orders List in your partner panel.`,
        linkUrl: `/reseller-reports/${REPORT_ID}`,
      } as any,
    });
  }

  const open = await prisma.resellerReport.findMany({
    where: { status: { notIn: ["FIXED", "WONT_FIX"] } },
    select: { id: true, title: true, status: true, authorName: true },
    orderBy: { updatedAt: "desc" },
  });
  console.log(`\n✅ Replied + moved to IN_TESTING.\n\nStill open (${open.length}):`);
  for (const r of open) console.log(`  [${r.status}] ${r.title} — ${r.authorName}`);

  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
