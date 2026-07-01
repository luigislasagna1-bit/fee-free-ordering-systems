/**
 * Move the three NEW Fabrizio reports whose fixes already shipped (Program 1,
 * commits e8367e49 + 5e32f4ca) to IN_TESTING, each with a plain-language
 * "what we fixed" comment, and notify the reporter (in-app) to verify.
 * Re-read every comment thread first (dump-reseller-reports.ts). Luigi 2026-07-01.
 *   npx tsx scripts/run-on-prod.ts scripts/mark-reports-in-testing-2026-07-01.ts
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
    // "Promotion -> Show which dishes have been discounted"
    id: "cmqv33v2o000104i9bapspfvy",
    comment:
      "Fixed ✓ — moved to testing. When a promotion discounts only specific dishes (not the whole cart), the cart now shows a green \"👍 You saved X\" badge on each discounted line, so the customer sees exactly which items got the discount — GloriaFood-style. Whole-cart promos stay as one clean summary line (no per-item badge needed, as you noted). Please verify 🙏",
  },
  {
    // "Promotion -> Dish categories (menu selection)"
    id: "cmqv36jr0000004la4hx3i5h9",
    comment:
      "Fixed ✓ — moved to testing. When you create a promotion and choose which categories it applies to, the categories are now grouped under a clear sub-header for EACH menu (for stores with more than one menu) — so it's obvious which category belongs to which menu, instead of all of them being mixed together. Please verify 🙏",
  },
  {
    // "Empty cart"
    id: "cmqwkzm0c000004l8e3nyuwo7",
    comment:
      "Fixed ✓ — moved to testing. There's now an \"Empty cart\" button (with a trash icon) at the top of the cart, so a customer can clear the whole cart in a single click — it asks for a quick confirmation first so it can't be tapped by accident. Please verify 🙏",
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
      if (report.status === "FIXED") { console.log(`Refusing #${u.id} — already FIXED (human-gated): ${report.title}`); continue; }
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
        if ((report as any).reportedByEmail) recipients.add((report as any).reportedByEmail.toLowerCase());
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
