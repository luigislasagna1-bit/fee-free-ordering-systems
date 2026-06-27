/** Replace the popup report's now-inaccurate comment: DELETE the old "Profile → Promo popup"
 *  comment + post the corrected one (moved to Marketing + links to a promo/coupon). Keeps IN_TESTING.
 *    npx tsx scripts/run-on-prod.ts scripts/_comment-fabrizio-popup-v2.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";
const REPORT_ID = "cmqp8z9ko000304kykoin8wuw";

const NEW_COMMENT = `Update — the Promo Popup now has its own home and does more.

1) It MOVED to its own page: Admin → Marketing → Promo Popup (it's no longer inside Profile).

2) The button can now do one of three things, not just open a URL:
   • open a link (URL),
   • OPEN one of your promotions — it opens that promo's "Get it now" screen for the customer, or
   • APPLY one of your coupons straight to the order — one tap and the discount is locked in for checkout, with a "coupon applied" confirmation.

You pick the promotion or coupon from a dropdown, so there's nothing to copy or paste. It still appears once per visit with an "X" to close. It's live — please set one up under Marketing → Promo Popup and try linking the button to a promo or a coupon.`;

const NOTIF_BODY = `The Promo Popup moved to Marketing → Promo Popup, and its button can now open one of your promotions or apply one of your coupons directly (not just a URL). Live now — please try it.`;

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  const report = await prisma.resellerReport.findUnique({ where: { id: REPORT_ID } });
  if (!report) { console.log(`No report ${REPORT_ID}.`); await prisma.$disconnect(); return; }

  // Delete the old, now-inaccurate "Profile → Promo popup" comment(s) from the super-admin.
  const existing = await prisma.resellerReportComment.findMany({ where: { reportId: REPORT_ID, authorEmail: SA_EMAIL } });
  const stale = existing.filter((c: any) => /Go to Profile|Profile\s*(?:→|->)\s*"?Promo popup/i.test(c.body || ""));
  for (const c of stale) await prisma.resellerReportComment.delete({ where: { id: c.id } });
  console.log(`Deleted ${stale.length} stale comment(s).`);

  await prisma.resellerReportComment.create({ data: { reportId: REPORT_ID, authorEmail: SA_EMAIL, authorName: SA_NAME, body: NEW_COMMENT } });
  const recipients = new Set<string>();
  if ((report as any).authorEmail) recipients.add((report as any).authorEmail.toLowerCase());
  if ((report as any).reportedByEmail) recipients.add((report as any).reportedByEmail.toLowerCase());
  recipients.delete(SA_EMAIL.toLowerCase());
  for (const email of recipients)
    await prisma.resellerNotification.create({ data: { recipientEmail: email, kind: "report_status", title: `Update on: ${report.title}`, body: NOTIF_BODY, linkUrl: `/reseller-reports/${REPORT_ID}`, reportId: REPORT_ID, actorName: SA_NAME } });

  console.log(`✅ Posted corrected comment + notified (status stays ${report.status}).`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
