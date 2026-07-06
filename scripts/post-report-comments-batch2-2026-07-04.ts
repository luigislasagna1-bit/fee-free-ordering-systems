/**
 * Three replies (2026-07-04): category-banner setting location (cmr4qj9v5),
 * sold-out order guard shipped (cmr5lb6xy), promo-screen mobile buttons
 * fixed (cmqtmfp2n).
 *   npx tsx scripts/run-on-prod.ts scripts/post-report-comments-batch2-2026-07-04.ts
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
    prefix: "cmr4qj9v5",
    comment: `This is available today — it works exactly as you describe. ✅

- Admin → Website → Theme → "Show category images": turn it OFF and the order page shows plain classic category name headers, exactly how it was before (no image, no colored band).
- Turn it ON and each category can carry its own image: Menu Setup → edit a category → "Category Image" upload. Categories WITH an image show the image banner as currently designed; for categories WITHOUT an image there's a sub-choice right under the toggle (colored band or plain header).

Please try the toggle on your test store and confirm it covers what you had in mind.`,
  },
  {
    prefix: "cmr5lb6xy",
    comment: `Fixed. ✅

Great catch — the sold-out flag was only hiding items from the menu, but an item already sitting in a customer's cart bypassed it completely. Now the server re-checks EVERY item at the moment the order is placed: if something in the cart has been marked sold out in the meantime, the order is refused and the customer sees a clear message naming the dish ("'TARTARE BRANZINO' just sold out — please remove it from your cart to continue"), translated into all languages.

Reproduced your exact scenario before shipping: add item → mark sold out in the backend → return to the site → the order is now blocked with that message.

Please retest and confirm. Grazie!`,
  },
  {
    prefix: "cmqtmfp2n",
    comment: `Fixed. ✅

You were right — on phones, the promotion screen's bottom bar (with "See full menu" and "Go to cart") was being drawn just below the visible screen, because mobile browsers measure the viewport as if the URL bar weren't there. The modal height now tracks the REAL visible screen, so those buttons are always reachable — on every promotion screen, the deal wizards, and the item window.

Two more improvements shipped in the same pass, based on your and Luigi's mobile testing: the step-by-step promo picker now shows one numbered slot per item to pick (a "pick 3" promo shows three slots filling up one by one), and picked items have an explicit "+" button to add another of the same dish.

Please retest on mobile and confirm. Grazie!`,
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
      if (report.status === "FIXED") { console.log(`✗ ${r.prefix} already FIXED — skipped`); continue; }
      await prisma.$transaction(async (tx) => {
        await tx.resellerReportComment.create({
          data: { reportId: report.id, authorEmail: SA_EMAIL, authorName: SA_NAME, body: r.comment },
        });
        const recipients = new Set<string>();
        if (report.authorEmail) recipients.add(report.authorEmail.toLowerCase());
        if ((report as any).reportedByEmail) recipients.add((report as any).reportedByEmail.toLowerCase());
        recipients.delete(SA_EMAIL.toLowerCase());
        for (const email of recipients) {
          await tx.resellerNotification.create({
            data: { recipientEmail: email, kind: "report_status", title: `Update — please retest: ${report.title}`, body: r.comment.slice(0, 240), linkUrl: `/reseller-reports/${report.id}`, reportId: report.id, actorName: SA_NAME },
          });
        }
      });
      console.log(`✅ reply posted on "${report.title}" (${report.id})`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
