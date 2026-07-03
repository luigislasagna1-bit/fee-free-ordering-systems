/**
 * Post the 2026-07-03 completion reply on report cmr1ty0lc (invoices / EU VAT)
 * and notify the reporter in-app. Flips status to IN_TESTING only if it isn't
 * already (FIXED is human-gated — refused). English per Luigi.
 *   npx tsx scripts/run-on-prod.ts scripts/post-report-comment-cmr1ty0lc-2026-07-03.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";
const REPORT_ID = "cmr1ty0lc000004lgc9okgwgz";

const COMMENT = `This is now fully built — you were right on both points, and it works the way the GloriaFood/Oracle invoice you sent does.

1) INVOICE ISSUER — every invoice is legally issued by the platform: Fee Free Ordering Inc. (a Canadian corporation, tax ID GST/HST No: 809409832RT0001), never by the reseller. Your company appears on your restaurants' invoices as "Your local partner" with your logo and your VAT number — prominent, but clearly not the seller of record. This supersedes the earlier reseller-as-issuer approach, exactly per your follow-up.

2) EU VAT / VIES — when a restaurant saves an EU VAT number under Billing → Fiscal details, we validate it LIVE against VIES (the same EU register from your screenshots). The field shows a green "VIES: valid" badge, a red "not registered" badge, or a "Verify now" re-check button — numbers get registered late or lapse (like the JUBIN case you found), so it can be re-verified any time. A VIES-valid number gets invoices at 0% VAT with the Article 44 / Directive 2006/112/EC reverse-charge wording, exactly like your Oracle example.

One deliberate difference from GloriaFood: they are EU-based, so they can charge 22% VAT to EU businesses without a VIES number. We are Canadian with no EU VAT registration, so instead of charging a tax we cannot legally remit, EU restaurants simply need a VIES-registered VAT number before starting a PAID subscription — until then they stay on the free plan. Since virtually every real restaurant has a VAT number, this only blocks accounts that couldn't be invoiced B2B anyway.

3) INVOICE COMPLETENESS — the invoice now carries the full legal layout from your Oracle sample: customer number, payment reference, Nr/Qty/Description/Unit price/Amount line-item table with the restaurant's ID + name + address inside the line, billing period, Sub-Total, an always-visible tax rate & amount row, Total, and a legal footer with the company's registry number, tax number, registered address, contact email, website and the license-terms statement.

PLEASE TEST: (a) save your P.IVA under Billing → Fiscal details on one of your restaurants and confirm the badge turns green "VIES: valid"; (b) open one of that restaurant's invoices and confirm the 0% tax row + the Article 44 reverse-charge note + your company shown as local partner. Grazie!`;

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const report = await prisma.resellerReport.findUnique({ where: { id: REPORT_ID } });
    if (!report) throw new Error(`No report ${REPORT_ID}`);
    if (report.status === "FIXED") { console.log(`Refusing — already FIXED (human-gated): ${report.title}`); return; }
    const prev = report.status;
    const flip = prev !== "IN_TESTING";
    await prisma.$transaction(async (tx) => {
      if (flip) {
        await tx.resellerReport.update({ where: { id: REPORT_ID }, data: { status: "IN_TESTING" } });
        await tx.resellerReportActivity.create({
          data: { reportId: REPORT_ID, actorEmail: SA_EMAIL, actorName: SA_NAME, kind: "STATUS", detail: `${prev} → IN_TESTING` },
        });
      }
      await tx.resellerReportComment.create({
        data: { reportId: REPORT_ID, authorEmail: SA_EMAIL, authorName: SA_NAME, body: COMMENT },
      });
      const recipients = new Set<string>();
      if (report.authorEmail) recipients.add(report.authorEmail.toLowerCase());
      if ((report as any).reportedByEmail) recipients.add((report as any).reportedByEmail.toLowerCase());
      recipients.delete(SA_EMAIL.toLowerCase());
      for (const email of recipients) {
        await tx.resellerNotification.create({
          data: { recipientEmail: email, kind: "report_status", title: `Update on: ${report.title}`, body: COMMENT.slice(0, 240), linkUrl: `/reseller-reports/${REPORT_ID}`, reportId: REPORT_ID, actorName: SA_NAME },
        });
      }
    });
    console.log(`✅ "${report.title}": ${flip ? `${prev} → IN_TESTING, ` : `status kept (${prev}), `}comment posted, reporter notified`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
