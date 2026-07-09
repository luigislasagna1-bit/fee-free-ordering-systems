/**
 * Reply to Fabrizio's "Dishes / Categories available for individual service"
 * report (cmr803ovq) with the four category features shipped; keep IN_TESTING +
 * in-app notification. Idempotent via marker.
 * Run: npx tsx scripts/run-on-prod.ts scripts/_reply-fabrizio-categories.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";
const REPORT_ID = "cmr803ovq";
const MARKER = "[category-service-availability-badges-log]";

const COMMENT = `We shipped everything you suggested here. Four improvements went live for menus and categories. ${MARKER}

1) CATEGORY-LEVEL SERVICE LABEL (order page)
When a whole category is set to delivery-only or pickup-only, the note now appears next to the CATEGORY NAME on the customer order page (not only on each dish), across all header styles and the image banner, and it wraps correctly on mobile.

2) BACKEND EXCEPTION LABELS (menu editor)
Every dish and category now shows a small badge when it has an active exception, so you don't forget what you changed:
- a dish shows a "Pickup only" / "Delivery only" badge when its service is restricted;
- a category shows its own "Pickup only / Delivery only" badge, a "Scheduled" badge if it has a scheduled visibility, its own availability window, AND a "N items limited" roll-up telling you how many dishes inside have their own exceptions.

3) CATEGORY-LEVEL AVAILABILITY (days + times)
Categories now support the SAME availability rules as dishes. In a category's settings you can set the days and time window it can be ORDERED FOR (e.g. a "Lunch" section orderable Mon-Fri 11:00-15:00). The window shows on the category on the order page, the customer's time picker only offers valid slots, and the server enforces it — an item is orderable only when BOTH its own window AND its category's window allow the chosen time. A duplicated category now keeps its window too.

4) CHANGE LOG (backend history)
A new "History" button in the menu editor shows a log of the changes made in the backend — what was added, edited or deleted, and when — for menu items and categories, so you can always see what was modified and at what time.

COULD YOU PLEASE RE-TEST:
- Set a category to delivery-only -> the note shows next to the category name on the order page (mobile too).
- In the menu editor, confirm the exception badges appear on the dishes/categories you've restricted.
- Set a category's availability to specific days/times -> as a customer, confirm the category shows the window and the time picker only offers those slots; confirm an order outside the window is refused.
- Open the "History" button and confirm your recent menu edits are listed.

Please let us know how it goes.`;

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const report = await prisma.resellerReport.findFirst({ where: { id: { startsWith: REPORT_ID } }, include: { comments: true } });
  if (!report) { console.log(`No report ${REPORT_ID}.`); await prisma.$disconnect(); return; }
  const fullId = report.id;
  console.log(`Found: "${report.title}"  status=${report.status}  author=${report.authorName} <${report.authorEmail}>  comments=${report.comments.length}`);
  if (report.comments.some((c) => c.body.includes(MARKER))) {
    console.log("⏭  Already posted (marker) — skipping.");
    await prisma.$disconnect(); return;
  }

  const prevStatus = report.status;
  await prisma.$transaction(async (tx) => {
    await tx.resellerReportComment.create({ data: { reportId: fullId, authorEmail: SA_EMAIL, authorName: SA_NAME, body: COMMENT } });
    if (prevStatus !== "IN_TESTING" && prevStatus !== "FIXED" && prevStatus !== "WONT_FIX") {
      await tx.resellerReport.update({ where: { id: fullId }, data: { status: "IN_TESTING" } });
      await tx.resellerReportActivity.create({ data: { reportId: fullId, actorEmail: SA_EMAIL, actorName: SA_NAME, kind: "STATUS_CHANGE", detail: `${prevStatus} -> IN_TESTING` } });
    }
    await tx.resellerReportActivity.create({ data: { reportId: fullId, actorEmail: SA_EMAIL, actorName: SA_NAME, kind: "COMMENTED", detail: "Category service labels + availability + badges + change log shipped" } });
    const recipients = new Set<string>();
    if (report.authorEmail) recipients.add(report.authorEmail.toLowerCase());
    if (report.reportedByEmail) recipients.add(report.reportedByEmail.toLowerCase());
    recipients.delete(SA_EMAIL.toLowerCase());
    for (const email of recipients) {
      await tx.resellerNotification.create({
        data: {
          recipientEmail: email, kind: "report_status",
          title: `Shipped — please re-test: ${report.title}`,
          body: "Category-level service labels + availability windows (days/times), backend exception badges, and a menu change-history log are all live. Please re-test the four points in the comment.",
          linkUrl: `/reseller-reports/${fullId}`, reportId: fullId, actorName: SA_NAME,
        },
      });
    }
    console.log(`  notified: ${[...recipients].join(", ") || "(none)"}`);
  });
  console.log(`✅ Reply posted; status ${prevStatus} -> ${prevStatus === "FIXED" || prevStatus === "WONT_FIX" ? prevStatus : "IN_TESTING"}.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
