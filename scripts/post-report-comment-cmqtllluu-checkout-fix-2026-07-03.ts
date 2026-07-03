/**
 * Reply on cmqtllluu: checkout Apply-button bug found + fixed. Comment +
 * in-app notification (no status change; FIXED is human-gated).
 *   npx tsx scripts/run-on-prod.ts scripts/post-report-comment-cmqtllluu-checkout-fix-2026-07-03.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";
const REPORT_PREFIX = "cmqtllluu";

const COMMENT = `Good catch — found and FIXED. ✅

You were right: the "Apply" button on the CHECKOUT screen was completely dead, while the same box in the cart worked. The two buttons were wired slightly differently, and the checkout one passed the wrong thing into the apply function, which made it fail silently before it ever contacted the server. Both are now wired the same way, and the apply function itself was hardened so this class of bug can't come back.

Verified end-to-end before shipping: item in cart → Proceed to Checkout → "Promo code" → typed a test code → Apply → the discount appears instantly in the totals ("−10%" line), exactly like in the cart.

And yes — your workflow works exactly as you described: create a promotion that's redeemable only via its coupon code (set "Only once per client" for the max-1-use), send the code to the customer by email/SMS, and they type it at checkout. Assigning it from VIP Groups also auto-emails the customer the code with redemption instructions.

Please retest the Apply button at checkout (give the deploy a few minutes) and confirm. Grazie!`;

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const report = await prisma.resellerReport.findFirst({ where: { id: { startsWith: REPORT_PREFIX } } });
    if (!report) throw new Error(`No report starting with ${REPORT_PREFIX}`);
    if (report.status === "FIXED") { console.log(`Refusing — already FIXED (human-gated): ${report.title}`); return; }
    await prisma.$transaction(async (tx) => {
      await tx.resellerReportComment.create({
        data: { reportId: report.id, authorEmail: SA_EMAIL, authorName: SA_NAME, body: COMMENT },
      });
      const recipients = new Set<string>();
      if (report.authorEmail) recipients.add(report.authorEmail.toLowerCase());
      if ((report as any).reportedByEmail) recipients.add((report as any).reportedByEmail.toLowerCase());
      recipients.delete(SA_EMAIL.toLowerCase());
      for (const email of recipients) {
        await tx.resellerNotification.create({
          data: { recipientEmail: email, kind: "report_status", title: `Fixed — please retest: ${report.title}`, body: COMMENT.slice(0, 240), linkUrl: `/reseller-reports/${report.id}`, reportId: report.id, actorName: SA_NAME },
        });
      }
    });
    console.log(`✅ checkout-fix reply posted on "${report.title}" (${report.id}), reporter notified`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
