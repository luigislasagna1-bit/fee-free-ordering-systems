/**
 * Move R3–R6 (the four still-NEW Fabrizio reports) to IN_TESTING, each with a
 * plain-language "what we fixed" comment, and notify the reporter to verify.
 * R1 + R2 are already IN_TESTING (move-eod-kitchen-testing.ts). Run AFTER the
 * fixes are live. Luigi 2026-06-14.
 *   npx tsx scripts/run-on-prod.ts scripts/mark-reports-in-testing.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";

const UPDATES: { id: string; comment: string }[] = [
  {
    // R3 — "Marketing acceptance box"
    id: "cmqdm80tz000k04l453tqfgmu",
    comment:
      "Fixed ✓ — moved to testing. The table-reservation form now shows the marketing-consent checkbox (it appears once an email is entered), and a reservation opt-in is saved to the customer's record just like an order — so it flips the Customers marketing badge and feeds autopilot. Please verify 🙏",
  },
  {
    // R4 — "The customer is unable to choose later times."
    id: "cmqdmdh5x000o04jvnn6qelk4",
    comment:
      "Fixed ✓ — moved to testing. When a dish that can only be ordered on certain days/times is in the cart, the available order times are limited to that dish's window — and we now clearly explain WHY, naming the dish in both the cart and at checkout, plus an \"Order ahead · <window>\" note under each restricted dish. So instead of just being unable to pick certain times, the customer sees the reason. Please verify 🙏",
  },
  {
    // R5 — "Restriction on that specific dish"
    id: "cmqdn4ixl000g04jox18ci9o5",
    comment:
      "Fixed ✓ — moved to testing. The admin Menu list now shows the day/time restriction badge from the dish's Fulfilment Time settings — previously it read the old availability fields, so a fulfilment restriction never showed a badge. Set a dish's Fulfilment Time (e.g. Tue 12:00–15:00) and its row now shows the amber clock badge with the window. Please verify 🙏",
  },
  {
    // R6 — "Optional / mandatory fields"
    id: "cmqdnh8nk000n04lbn42bnzzo",
    comment:
      "Fixed ✓ — moved to testing. The last-name field at checkout is now actually enforced — it showed a \"*\" but let single-name orders through; now both the browser and the server require a first AND last name. (The fuller per-service \"choose which fields are required\" settings panel is planned for after launch; this fixes the enforcement bug you reported.) Please verify 🙏",
  },
];

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    for (const u of UPDATES) {
      const report = await prisma.resellerReport.findUnique({ where: { id: u.id } });
      if (!report) { console.log(`No report ${u.id} — skipped`); continue; }
      const prev = report.status;
      await prisma.$transaction(async (tx) => {
        await tx.resellerReport.update({ where: { id: u.id }, data: { status: "IN_TESTING" } });
        await tx.resellerReportActivity.create({
          data: { reportId: u.id, actorEmail: SA_EMAIL, actorName: SA_NAME, kind: "STATUS", detail: `${prev} → IN_TESTING` },
        });
        await tx.resellerReportComment.create({
          data: { reportId: u.id, authorEmail: SA_EMAIL, authorName: SA_NAME, body: u.comment },
        });
        const recipients = new Set<string>();
        if (report.authorEmail) recipients.add(report.authorEmail.toLowerCase());
        if (report.reportedByEmail) recipients.add(report.reportedByEmail.toLowerCase());
        recipients.delete(SA_EMAIL.toLowerCase());
        for (const email of recipients) {
          await tx.resellerNotification.create({
            data: { recipientEmail: email, kind: "report_status", title: `Report in testing: ${report.title}`, body: u.comment, linkUrl: `/reseller-reports/${u.id}`, reportId: u.id, actorName: SA_NAME },
          });
        }
      });
      console.log(`✅ #${u.id} "${report.title}": ${prev} → IN_TESTING (+comment, notified)`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
