/** Backfill a "what we did" reply on the 13 old FIXED reports that lacked one. Keeps status
 *  FIXED; notifies the reporter (Super Admin reports notify no one). Luigi 2026-06-25.
 *    npx tsx scripts/run-on-prod.ts scripts/_backfill-13-replies.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";

const REPLIES: Record<string, string> = {
  // Scheduled Orders Incorrect Timings
  "cmpxeomsa001804jo7b13qpco":
    "Fixed and live. A scheduled (\"order for later\") order now shows the customer the SCHEDULED date + time — not a generic \"ready in ~20 min\" — and it rings/accepts on the correct lifecycle: an order placed while you're open rings immediately, and one placed while closed defers to opening. The kitchen countdown + auto-reject anchor on the alert time, so the timing is no longer scrambled.",
  // Scheduled Table Reservation -> Not Appearing In Kitchen Display Immediately
  "cmpxbvfn1000j04jos776pw6o":
    "Fixed and live. A scheduled table reservation now appears in the kitchen as \"pending acceptance\" right away, and with manual acceptance ON the customer's confirmation is only sent once you ACCEPT it — no more premature confirmation email before you've acted on it.",
  // Billing/Invoicing for Restaurants + Fiscal Information
  "cmpxe5fd2000q04joh3gs6f5h":
    "Done. Restaurants now get billing invoices for paid platform services, and can enter their own fiscal/business details so those invoices carry the correct information for their accounting.",
  // Refund Offer
  "cmpxeh56g000x04kv19kxeibu":
    "Done. From an order paid by card (Stripe) you can now issue a refund — full or partial — directly from order management, and the customer is automatically emailed that the order was canceled/refunded. (Automated refunds apply to card payments; PayPal isn't automated.)",
  // Differentiate "Lost" / "Rejected" order
  "cmq3k0m4d001104l2hgoml7t5":
    "Done. An order the timer auto-rejects now shows as \"Missed\" (in red), clearly distinct from an order you manually \"Rejected\" — so you can tell the two apart in the kitchen and in history.",
  // Marketing Consent Checkbox
  "cmpxekkro001104kvi585qukw":
    "Done. A marketing-consent checkbox now shows at checkout (and on the reservation form), and each customer's consent status (yes/no) appears as a column in your Customers list. It also gates whether a customer can receive marketing emails.",
  // Orders Outside Area
  "cmpxeqj5p001c04jot2v3sxch":
    "Done. When a delivery address falls outside your configured zones, the customer now sees a clear message that you can't deliver there, and there's a setting controlling whether out-of-zone orders are blocked — so you don't have to judge each one manually.",
  // Indicate if it is a customer's first order
  "cmq3knaqj000d04l8asrxw4h7":
    "Done. An order from a first-time customer is now flagged as a first order in the kitchen/order view, so you can spot a new customer at a glance.",
  // Order Alert / Countdown
  "cmpxet3oy001704kvoqnr8qsi":
    "Done. Incoming orders show a clear accept-window countdown with the alert sound, reflecting the correct time remaining before the order is auto-missed.",
  // Inviting New Restaurant -> First Email Has Mistakes
  "cmpy91b64000004lgr31vi71b":
    "Fixed. The formatting/text errors in the new-restaurant invitation email have been corrected.",
  // Visual Enhancement -> No Blank Images
  "cmpxe23kj000o04jo3khvc3kf":
    "Fixed. When a product has no image, the menu and order pages no longer show a broken/placeholder image — the item renders cleanly without one.",
  // Restaurant closed -> warning also in "Table Reservation"
  "cmqfjcnf9000p04l5hxmn0390":
    "Done. The closed / extraordinary-closure warning now also appears on the Table Reservation page, so a direct \"book a table\" link shows the same closure notice customers see on the ordering page.",
  // Link to Kitchen Display from Admin Panel
  "cmpxcpyed000304l9gkuuj4f9":
    "Done. There's now an easy link to the Kitchen Order App from the admin panel sidebar, so the kitchen screen is one click away.",
};

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  let posted = 0, notified = 0;
  for (const [id, body] of Object.entries(REPLIES)) {
    const report = await prisma.resellerReport.findUnique({ where: { id } });
    if (!report) { console.log(`  ⚠️ ${id} not found — skipped`); continue; }
    await prisma.$transaction(async (tx) => {
      await tx.resellerReportComment.create({ data: { reportId: id, authorEmail: SA_EMAIL, authorName: SA_NAME, body } });
      const recipients = new Set<string>();
      if (report.authorEmail) recipients.add(report.authorEmail.toLowerCase());
      if (report.reportedByEmail) recipients.add(report.reportedByEmail.toLowerCase());
      recipients.delete(SA_EMAIL.toLowerCase());
      for (const email of recipients) {
        await tx.resellerNotification.create({
          data: { recipientEmail: email, kind: "report_comment", title: `Update on: ${report.title}`, body, linkUrl: `/reseller-reports/${id}`, reportId: id, actorName: SA_NAME },
        });
        notified++;
      }
    });
    posted++;
    console.log(`  ✓ ${report.title}`);
  }
  console.log(`\nPosted ${posted} replies; ${notified} reporter notification(s) sent.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
