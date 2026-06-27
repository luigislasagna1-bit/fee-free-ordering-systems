/** Reply to Fabrizio's "Custom ringtone / Conflict" report — custom sound now plays on the
 *  native app ring (v3.0) — keep IN_TESTING + send the APK link.
 *    npx tsx scripts/run-on-prod.ts scripts/_comment-fabrizio-customsound.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";
const REPORT_ID = "cmqnnt5k9000l04k3wolb1yrk";
const APK = "https://1onxkssoxjxfkvnp.public.blob.vercel-storage.com/fee-free-order-app-MFleBh0c5fciQWplXAI1Gtv0rHNnGK.apk";

const COMMENT = `Hi Fabrizio — thanks for this report and the video, it was really helpful. We went further than the original fix on this one.

The conflict you saw (your custom sound overlapping the default, and not stopping when you opened an order) came from the app having two separate sound engines. We rebuilt it around ONE engine — and, more importantly, we made your CUSTOM sound actually take over the app ring, which is the whole point of choosing one.

On the app now:
• Set a custom Kitchen Alert Sound and the app plays YOUR sound for new orders — loud, and even with the screen off / app in the background.
• It stops the instant you open an order, and resumes if you back out — no more playing on top of itself.
• If no custom sound is set (or one ever fails to load), it automatically falls back to the built-in GloriaFood alarm, so the kitchen is never left silent.

We tested all of this end-to-end on a real Samsung S23: the custom sound rings loud, screen-off, stops on open, and the fallback works.

It's in a NEW app version — v3.0. Please update to test it:
👉 ${APK}

(You may need to allow installing from your browser/Files. It updates your existing app — your login stays. The version shows on the login screen + the 3-dot menu.)

Then set your own custom Kitchen Alert Sound, place a test order, and confirm you hear YOUR sound ring (loud, even with the screen off), stopping when you open the order. Thanks again — let us know how it goes!`;

const NOTIF_BODY = "Big update: your CUSTOM kitchen sound now takes over the app ring — loud, even screen-off, stops when you open an order, with the built-in alarm as an automatic fallback. Verified on a real S23. It's in app v3.0 — update + test with your own sound (link in the comment).";

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const report = await prisma.resellerReport.findUnique({ where: { id: REPORT_ID } });
  if (!report) { console.log(`No report ${REPORT_ID}.`); await prisma.$disconnect(); return; }
  const prev = report.status;
  console.log(`Found: "${report.title}" [${prev}]`);

  await prisma.$transaction(async (tx) => {
    if (prev !== "IN_TESTING") {
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
    if (report.reportedByEmail) recipients.add(report.reportedByEmail.toLowerCase());
    recipients.delete(SA_EMAIL.toLowerCase());
    for (const email of recipients) {
      await tx.resellerNotification.create({
        data: { recipientEmail: email, kind: "report_status", title: `Update on: ${report.title}`, body: NOTIF_BODY, linkUrl: `/reseller-reports/${REPORT_ID}`, reportId: REPORT_ID, actorName: SA_NAME },
      });
    }
    console.log(`  notifying: ${[...recipients].join(", ") || "(no reporter email)"}`);
  });

  console.log(`✅ "${report.title}": comment + v3.0 APK posted (status ${prev === "IN_TESTING" ? "stays" : "→"} IN_TESTING)`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
