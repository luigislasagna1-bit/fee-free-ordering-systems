/**
 * Coupon report (cmqtllluu) — address Fabrizio's last round (2026-06-26):
 * reaffirm the verified fixes (guest email-match, restaurant-sees-coupon,
 * max-uses, auto-email) and honestly track the remaining refinements
 * (per-service, combinable, require-Apply). Comment + in-app notification;
 * stays IN_TESTING for the reporter.
 *   npx tsx scripts/run-on-prod.ts scripts/post-coupon-status-2026-07-02.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";

const ID = "cmqtllluu000x04jsxxm2x33e";
const BODY = `Update on the coupon report — going point-by-point through your last round:

✅ Personal coupon now works for a GUEST (no account needed). Entering the code together with the email the coupon was sent to applies the discount at checkout AND on the placed order — logging in is no longer required. If a DIFFERENT email is entered, it's refused with a clear message ("This code is registered to a different email address"). (Verified on production.)

✅ The restaurant now SEES which coupon was used. The received order shows the applied code + the discount amount — on BOTH the kitchen order detail and the admin order page — so you always know exactly what was applied.

✅ Single-use / "max N uses" codes are counted and blocked once the limit is reached (fixed earlier, atomic so simultaneous orders can't slip past).

✅ The personalized-coupon email is sent automatically when you create the offer (it sends from the live site).

Still refining (tracked): (1) a per-SERVICE option (takeaway / delivery / both) and (2) a "can be combined with other running promotions" choice on a personal offer — the discount engine already supports both (order-type + stacking rule); we're wiring them onto the give-a-personal-offer screen. (3) The coupon box currently applies on paste before you press "Apply" — we'll make it wait for the Apply button.

Could you please re-test the two big ones — a guest applying a personal code by matching email, and the restaurant seeing the applied coupon on the received order — and let us know? Grazie!`;

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const report = await prisma.resellerReport.findUnique({ where: { id: ID } });
    if (!report) { console.log(`No report ${ID}`); return; }
    await prisma.$transaction(async (tx) => {
      await tx.resellerReportComment.create({
        data: { reportId: ID, authorEmail: SA_EMAIL, authorName: SA_NAME, body: BODY },
      });
      const recipients = new Set<string>();
      if (report.authorEmail) recipients.add(report.authorEmail.toLowerCase());
      if ((report as any).reportedByEmail) recipients.add((report as any).reportedByEmail.toLowerCase());
      recipients.delete(SA_EMAIL.toLowerCase());
      for (const email of recipients) {
        await tx.resellerNotification.create({
          data: { recipientEmail: email, kind: "report_comment", title: `Update on: ${report.title}`, body: BODY.slice(0, 240), linkUrl: `/reseller-reports/${ID}`, reportId: ID, actorName: SA_NAME },
        });
      }
    });
    console.log(`✅ #${ID} "${report.title}": coupon status posted (status ${report.status}), notified`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
