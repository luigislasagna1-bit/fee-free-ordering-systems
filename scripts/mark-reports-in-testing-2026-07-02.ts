/**
 * Move the two NEW Fabrizio reports whose fixes shipped 2026-07-02 to
 * IN_TESTING, each with a plain-language "what we fixed" comment, and notify
 * the reporter (in-app) to verify. Re-read every comment thread first
 * (dump-reseller-reports.ts).
 *   • cmqsn52d2 — house number after street name (407737cb)
 *   • cmqwds5jt — kitchen reservation detail: localized date + clickable
 *     phone + email shown (407737cb)
 *   npx tsx scripts/run-on-prod.ts scripts/mark-reports-in-testing-2026-07-02.ts
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
    // "Street name improvement for home delivery"
    id: "cmqsn52d2000404l4w620032x",
    comment:
      "Fixed ✓ — moved to testing. The delivery address now shows the house number AFTER the street name for Italy (and the rest of continental Europe) — e.g. \"Via Giuseppe Mazzini 13\" instead of \"13 Via Giuseppe Mazzini\" — matching how the address is written locally. It applies wherever the customer enters the address (the free map search AND Google autocomplete) and to the saved addresses in their account, so every new order reads street-then-number. Stores in number-first countries (US, Canada, UK, France…) keep \"13 Main St\". On the CITY: the kitchen order list leads with the street; the city is stored separately and shows in the full order detail — say the word if you'd like the city appended on the list tiles too (it can get long, as you mentioned). Please re-test with an Italian address and confirm the order reads street-then-number. Grazie!",
  },
  {
    // "Table Reservation"
    id: "cmqwds5jt000g04ihb9fzcuee",
    comment:
      "Fixed ✓ — moved to testing. On the kitchen table-reservation screen: (1) the date now shows the localized weekday, day and month in your backend language — e.g. \"sabato 27 giugno 2026\" — instead of the raw \"2026-06-27\", exactly like the takeaway/delivery \"order for later\" line; (2) the customer's phone number is now tap-to-call (a tel: link); and (3) the customer's EMAIL now appears on the screen (tap to open a mail). Please re-open a reservation in the kitchen app and confirm the date reads in Italian, the phone dials on tap, and the email shows. Grazie!",
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
