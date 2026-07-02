/**
 * Follow-up comments after shipping the last open sub-items on two IN_TESTING
 * Fabrizio reports (Get-it-now redundant button removed; ASAP delivery estimate
 * clarified at checkout) — both are now fully complete. Comment + in-app
 * notification; status stays IN_TESTING for the reporter to Confirm Working.
 *   npx tsx scripts/run-on-prod.ts scripts/post-report-followups-2026-07-02.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";

const COMMENTS: { id: string; body: string }[] = [
  {
    id: "cmqtmfp2n000l04i601k71xdc", // Promo "Get it Now"
    body: `Follow-up ✓ — done. The redundant full-width green button at the bottom of the "Get it now" screen has been removed, since every eligible product now has its own inline "+ Add" / "Customize" button. So this report is now fully addressed (category grouping + per-product buttons + the cleaned-up footer). Please re-check the "Get it now" screen and, if it all looks right, mark it Confirmed Working. Grazie!`,
  },
  {
    id: "cmqt99i8s001b04jvy9uj7xjn", // Delivery / pickup timeframes on the homepage
    body: `Follow-up ✓ — done. At checkout, when a DELIVERY order is set to ASAP, there is now a clear note explaining that the "~X min" is only an approximate prep + travel estimate, NOT a guaranteed delivery time — and that the restaurant confirms your actual delivery time after accepting the order (translated into all languages). So both parts of this report are now complete: hiding the times on the homepage, and clarifying the estimate at checkout. Please re-test and, if good, mark it Confirmed Working. Grazie!`,
  },
];

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    for (const c of COMMENTS) {
      const report = await prisma.resellerReport.findUnique({ where: { id: c.id } });
      if (!report) { console.log(`No report ${c.id} — skipped`); continue; }
      await prisma.$transaction(async (tx) => {
        await tx.resellerReportComment.create({
          data: { reportId: c.id, authorEmail: SA_EMAIL, authorName: SA_NAME, body: c.body },
        });
        const recipients = new Set<string>();
        if (report.authorEmail) recipients.add(report.authorEmail.toLowerCase());
        if ((report as any).reportedByEmail) recipients.add((report as any).reportedByEmail.toLowerCase());
        recipients.delete(SA_EMAIL.toLowerCase());
        for (const email of recipients) {
          await tx.resellerNotification.create({
            data: { recipientEmail: email, kind: "report_comment", title: `Update on: ${report.title}`, body: c.body.slice(0, 240), linkUrl: `/reseller-reports/${c.id}`, reportId: c.id, actorName: SA_NAME },
          });
        }
      });
      console.log(`✅ #${c.id} "${report.title}": follow-up posted (status ${report.status}), notified`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
