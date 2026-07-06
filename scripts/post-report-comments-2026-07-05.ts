/**
 * Two replies (2026-07-05): Meal Bundle "no eligible items" fixed via
 * serve-time menu-lineage resolution (cmr80t9rk), Expand/Collapse all in
 * Menu Management shipped (cmr809iu8). Marks both FIXED + notifies.
 *   npx tsx scripts/run-on-prod.ts scripts/post-report-comments-2026-07-05.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";

const REPLIES: Array<{ prefix: string; comment: string }> = [
  {
    prefix: "cmr80t9rk",
    comment: `Fixed. ✅ Root cause found — excellent report, and your screenshot told the whole story.

WHAT HAPPENED: your "MENU PRANZO" bundle was created while picking dishes from your original "Main Menu" — but the menu that's LIVE on the ordering site is "Main Menu (copy)". A copied menu gives every dish a new internal identity, so the bundle's item groups pointed at dishes the live menu technically didn't contain → every slot showed "No eligible items".

THE FIX: the system now automatically recognizes that a dish on a copied menu is the same dish as its original (they share an internal lineage), and resolves promotion selections against whatever menu is live — on the customer's ordering page, in the cart discount calculation, AND at charge time, so they always agree. This fixes it for ALL promotion types that target specific dishes or categories, not just meal bundles — and it also protects any restaurant that duplicates a menu in the future.

Your MENU PRANZO promo needs NO changes — I verified against your exact configuration that every group now resolves its dishes on the live menu. Please open the ordering page and build the bundle: each slot should now show its choices. Grazie!`,
  },
  {
    prefix: "cmr809iu8",
    comment: `Done. ✅

Menu Management now has "Expand all | Collapse all" controls in the toolbar right next to the category count — exactly where your screenshot suggested. With your 113 categories, "Collapse all" gives you a compact category list you can scan and reorder; each category still opens individually with its arrow, same as before.

Please try it on your test store and confirm. Grazie!`,
  },
];

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    for (const r of REPLIES) {
      const report = await prisma.resellerReport.findFirst({ where: { id: { startsWith: r.prefix } } });
      if (!report) { console.log(`✗ no report ${r.prefix}`); continue; }
      await prisma.$transaction(async (tx) => {
        await tx.resellerReportComment.create({
          data: { reportId: report.id, authorEmail: SA_EMAIL, authorName: SA_NAME, body: r.comment },
        });
        await tx.resellerReport.update({ where: { id: report.id }, data: { status: "FIXED" } });
        const recipients = new Set<string>();
        if (report.authorEmail) recipients.add(report.authorEmail.toLowerCase());
        if ((report as any).reportedByEmail) recipients.add((report as any).reportedByEmail.toLowerCase());
        recipients.delete(SA_EMAIL.toLowerCase());
        for (const email of recipients) {
          await tx.resellerNotification.create({
            data: { recipientEmail: email, kind: "report_status", title: `Fixed — please retest: ${report.title}`, body: r.comment.slice(0, 240), linkUrl: `/reseller-reports/${report.id}`, reportId: report.id, actorName: SA_NAME },
          });
        }
      });
      console.log(`✅ FIXED + reply posted on "${report.title}" (${report.id})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
