/**
 * Reply to Fabrizio's promo EXCLUSIVE-stacking report with the fix write-up,
 * set status → IN_TESTING (so his re-test can auto-close it to FIXED), log an
 * activity + in-app notification. Does NOT touch the secondary UI-requests.
 * Idempotent: skips if the fix comment (by marker) is already present.
 * Run: npx tsx scripts/run-on-prod.ts scripts/_reply-fabrizio-stacking.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";
const REPORT_ID = "cmr80t9rk000304jslfwbu6tn";
const MARKER = "[promo-exclusive-stacking-fix]";

const COMMENT = `Thanks for the detailed, precise testing — you were right on all three points, and they are now fixed. Here is what was happening and what we changed. ${MARKER}

WHAT WE FOUND (root cause)
When a customer builds the Menu Bundle, it becomes a single fixed-price line in the cart with the bundle discount already included in its price. To make sure that discount is never applied twice, the system deliberately sets that bundle line aside before it runs the promotion calculator. That safeguard had an unintended side effect: because the bundle was set aside, the calculator could not "see" that an EXCLUSIVE deal was active on the order. It treated the cart as if no exclusive existed — so it applied the Standard "20% ASPORTO", showed the "add 10 more to unlock" banner, and allowed a second exclusive. The exclusivity rules themselves were correct; they simply were not running while a built bundle was in the cart.

WHAT WE CHANGED
The calculator now receives a signal that an exclusive bundle is committed (without feeding the bundle's discount back in, so there is no risk of double-discounting). With that signal it enforces the exclusivity rules for built bundles too. This runs identically on both the live cart preview and the final charge, and the exclusivity is verified on our server so it cannot be manipulated from the browser.

HOW IT BEHAVES NOW
- Exclusive bundle blocks Standard promos: with the Menu Bundle in the cart, "20% ASPORTO" no longer applies. It is shown as "Can't combine with TEST MENU BUNDLE" — exactly the message you suggested.
- No more misleading nudge: the "Add 10 more to unlock 20% ASPORTO" banner no longer appears while an exclusive bundle is committed. (Standard-promo nudges are suppressed; only Master deals, which are allowed to stack, can still nudge.)
- One exclusive per order: a second exclusive can no longer stack — a second exclusive bundle is refused, and any other exclusive is offered as a switch instead of being applied on top.
- "Use this instead" now works: because switching from the bundle to the Standard means giving up the bundle, tapping it asks you to confirm ("Remove the bundle to use this deal?"), then removes the bundle so the Standard applies.
- Master deals still stack (e.g. free delivery), as expected (Exclusive + Master combine).
- Preserved behaviour: a Standard deal a customer already has is never silently downgraded just because an Exclusive could apply — the Exclusive is offered as a switch, not forced on.

COULD YOU PLEASE RE-TEST
1. Build the bundle + add regular menu items -> confirm the 20% does NOT apply.
2. Confirm the "add 10 more" banner does NOT appear with the bundle in the cart.
3. Confirm you CANNOT stack two exclusives.
4. Try "Use this instead" -> confirm -> the bundle is removed and the 20% applies.

Please let us know how it goes.`;

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const report = await prisma.resellerReport.findUnique({
    where: { id: REPORT_ID },
    include: { comments: true },
  });
  if (!report) { console.log(`No report ${REPORT_ID}.`); await prisma.$disconnect(); return; }
  console.log(`Found: "${report.title}"`);
  console.log(`  status=${report.status}  author=${report.authorName} <${report.authorEmail}>  reportedBy=${report.reportedByName ?? "-"} <${report.reportedByEmail ?? "-"}>`);
  console.log(`  existing comments=${report.comments.length}`);

  if (report.comments.some((c) => c.body.includes(MARKER))) {
    console.log("⏭  Fix comment already posted (marker found) — skipping to avoid a duplicate.");
    await prisma.$disconnect();
    return;
  }

  const prevStatus = report.status;
  await prisma.$transaction(async (tx) => {
    await tx.resellerReportComment.create({
      data: { reportId: REPORT_ID, authorEmail: SA_EMAIL, authorName: SA_NAME, body: COMMENT },
    });
    if (prevStatus !== "IN_TESTING" && prevStatus !== "FIXED" && prevStatus !== "WONT_FIX") {
      await tx.resellerReport.update({ where: { id: REPORT_ID }, data: { status: "IN_TESTING" } });
      await tx.resellerReportActivity.create({
        data: { reportId: REPORT_ID, actorEmail: SA_EMAIL, actorName: SA_NAME, kind: "STATUS_CHANGE", detail: `${prevStatus} -> IN_TESTING` },
      });
    }
    await tx.resellerReportActivity.create({
      data: { reportId: REPORT_ID, actorEmail: SA_EMAIL, actorName: SA_NAME, kind: "COMMENTED", detail: "Promo exclusive-stacking fix shipped — please re-test" },
    });
    const recipients = new Set<string>();
    if (report.authorEmail) recipients.add(report.authorEmail.toLowerCase());
    if (report.reportedByEmail) recipients.add(report.reportedByEmail.toLowerCase());
    recipients.delete(SA_EMAIL.toLowerCase());
    for (const email of recipients) {
      await tx.resellerNotification.create({
        data: {
          recipientEmail: email,
          kind: "report_status",
          title: `Fix shipped — please re-test: ${report.title}`,
          body: "Exclusive-promo stacking is fixed: a committed exclusive bundle now blocks Standard promos + the nudge, only one exclusive applies per order, and 'Use this instead' now works. Please re-test the four scenarios in the comment.",
          linkUrl: `/reseller-reports/${REPORT_ID}`,
          reportId: REPORT_ID,
          actorName: SA_NAME,
        },
      });
    }
    console.log(`  notified: ${[...recipients].join(", ") || "(none)"}`);
  });

  console.log(`✅ Reply posted; status ${prevStatus} -> ${prevStatus === "FIXED" || prevStatus === "WONT_FIX" ? prevStatus : "IN_TESTING"}.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
