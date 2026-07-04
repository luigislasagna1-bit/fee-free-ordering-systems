/**
 * Two replies (Fabrizio 2026-07-04): the delivery-estimate root cause fix.
 *  - cmqqxerxs: "later" first slot ignored delivery Estimated time — fixed.
 *  - cmqt99i8s: time choice shows the configured Estimated time; the zone
 *    line keeps the drive time, now labeled as such (his blue-note spec).
 *   npx tsx scripts/run-on-prod.ts scripts/post-report-comment-timing-fixes-2026-07-04.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";

const REPLIES: Array<{ prefix: string; allowFixed?: boolean; comment: string }> = [
  {
    prefix: "cmqqxerxs",
    comment: `Great catch — found and fixed. ✅

The root cause wasn't the time ranges themselves: once your delivery address resolved to a delivery zone, the ZONE's estimated drive time (~5 min on your zones) was silently replacing the service's configured "Estimated time" (45 min) — which collapsed the first available "later" slot to almost-now. Pickup has no zones, which is why it behaved correctly.

Now the customer-facing delivery estimate is the configured "Estimated time" as a floor — a far-away zone can only increase it, never shrink it. With your setup (45 min, tested at 11:19 AM) the first available later slot lands at ~12:15, and changing the Estimated time in the delivery settings moves it as you'd expect, same as pickup.

Please retest after the deploy (a few minutes) and confirm. Grazie!`,
  },
  {
    prefix: "cmqt99i8s",
    allowFixed: true,
    comment: `Implemented exactly as you proposed. ✅

- The time choice ("As soon as possible · ~X min") and the service buttons now show the value the restaurant enters in "Estimated time" (your 45 minutes) — a true prep + delivery estimate. If a zone's drive time is LONGER than the configured estimate, we show the larger of the two so the promise is never understated.
- The zone line under the address ("You're in TEST 1 — Fee 5,00 €…") keeps the zone's minutes, now labeled as what it is: "~5 min drive from us" — per the blue note in your image.

Please retest when you have a moment. Grazie for the annotated screenshots — they made the fix precise.`,
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
      if (report.status === "FIXED" && !r.allowFixed) { console.log(`✗ ${r.prefix} already FIXED — skipped`); continue; }
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
            data: { recipientEmail: email, kind: "report_status", title: `Fixed — please retest: ${report.title}`, body: r.comment.slice(0, 240), linkUrl: `/reseller-reports/${report.id}`, reportId: report.id, actorName: SA_NAME },
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
