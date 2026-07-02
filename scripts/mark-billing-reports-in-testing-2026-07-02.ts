/**
 * Move the two billing NEW reports whose (autonomous) halves shipped 2026-07-02
 * to IN_TESTING with plain-language comments, and notify the reporter.
 *   • cmr1u3qxm — save a card without an active paid service (81ceec91).
 *       PayPal-for-monthly deferred per Luigi (bigger integration).
 *   • cmr1ty0lc — reseller company + VAT + invoice number on invoices (ff86e228).
 *       Fee-Free-issuer half pending Luigi's legal entity + VAT.
 *   npx tsx scripts/run-on-prod.ts scripts/mark-billing-reports-in-testing-2026-07-02.ts
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
    // "Ability to enter the payment method without active services."
    id: "cmr1u3qxm00000aj6xwrvp10n",
    comment:
      "Shipped ✓ — moved to testing. You can now SAVE a payment method in Billing WITHOUT enabling any paid service. There's a new \"Payment method\" card on the Billing page with a \"Save a payment method\" button — it opens the secure card form, completes 3D Secure up front, and stores the card, so the moment you (or a restaurant) enable a paid service it charges instantly with no extra step. The saved card shows as brand •••• last-4 + expiry, with a \"Change card\" option. On PayPal for monthly billing: that's a larger piece (it needs a PayPal merchant / billing-agreement integration), so we've queued it separately — the card option above is live now. Please try saving a card from the Billing page and confirm it works. Grazie!",
  },
  {
    // "Invoices"
    id: "cmr1ty0lc000004lgc9okgwgz",
    comment:
      "Shipped ✓ — moved to testing. Your restaurants' subscription invoices now show YOUR issuing company + VAT number + the invoice number. Set your VAT / tax number under Reseller → Branding → Imprint → \"Invoice details\" (your company name is already the issuer name). Once set, every invoice your restaurants receive shows your company, \"VAT: {your number}\", and the invoice number (INV-YYYY-XXXXXX) — exactly like your Oracle example. Please add your VAT number there and open one of your restaurants' invoices to confirm. (For any restaurant NOT under a reseller, the issuer is Fee Free's own entity — we're adding Fee Free's legal name + VAT for that case next.) Grazie!",
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
            data: { recipientEmail: email, kind: "report_status", title: `Report in testing: ${report.title}`, body: u.comment.slice(0, 240), linkUrl: `/reseller-reports/${u.id}`, reportId: u.id, actorName: SA_NAME },
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
