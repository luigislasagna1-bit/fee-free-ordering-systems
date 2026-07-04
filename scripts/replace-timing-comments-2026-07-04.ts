/**
 * Delete this morning's two INCORRECT Super Admin comments (they called the
 * zone minutes "drive time") and post corrected ones (Luigi 2026-07-04: a
 * zone's Std. Time is the TOTAL per-zone delivery estimate and correctly
 * overrides the service default; the fix was admin-side clarity).
 *   npx tsx scripts/run-on-prod.ts scripts/replace-timing-comments-2026-07-04.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";

const REPLACEMENTS: Array<{ prefix: string; deleteMarker: string; comment: string }> = [
  {
    prefix: "cmqqxerxs",
    deleteMarker: "Great catch — found and fixed",
    comment: `Thanks for the report — here's what's actually happening, and it's working as designed once one setting is understood:

The first available "later" slot for delivery follows the estimated delivery time of the customer's DELIVERY ZONE. Each zone in Setup → Delivery Zones has its own "Std. Time" — that's the TOTAL estimated delivery time (preparation + travel) for addresses in that zone, and it intentionally overrides the delivery service's default "Estimated time" (that's why changing the service setting didn't move the slots: your zones are set to ~5 min, so the system was honoring 5 minutes).

Set the zone's Std. Time to a realistic value (e.g. 45–60 min) and the first "later" slot will land exactly like pickup does. The service's Estimated time still applies before an address matches a zone.

We agree this wasn't discoverable — the Delivery Zones editor now explains right under the Std. Time field what the number means and where it's used, so it can't be mistaken for drive time again. Please update your zones and retest. Grazie!`,
  },
  {
    prefix: "cmqt99i8s",
    deleteMarker: "Implemented exactly as you proposed",
    comment: `Small correction to the earlier note, after reviewing with Luigi:

The "~5 min" you saw isn't transit time — it's your delivery ZONE's "Std. Time" (Setup → Delivery Zones), which is the TOTAL estimated delivery time (preparation + travel) for addresses in that zone. It's a deliberate per-zone refinement of the delivery promise, so it intentionally takes the place of the service's default Estimated time once the address matches a zone. Your zones are currently set to ~5 min, which is why checkout showed ~5 minutes.

Set each zone's Std. Time to a realistic total (e.g. 45–60 min) and checkout will show exactly that — per zone, which is more precise than one blanket number. The service's Estimated time remains the default before a zone matches.

The gap was that nothing explained this in the admin — the Delivery Zones editor now describes the field and where it's used, right under the input. Please adjust your zones and retest. Grazie!`,
  },
];

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    for (const r of REPLACEMENTS) {
      const report = await prisma.resellerReport.findFirst({ where: { id: { startsWith: r.prefix } } });
      if (!report) { console.log(`✗ no report ${r.prefix}`); continue; }
      const bad = await prisma.resellerReportComment.findFirst({
        where: { reportId: report.id, authorEmail: SA_EMAIL, body: { startsWith: r.deleteMarker } },
        orderBy: { createdAt: "desc" },
      });
      await prisma.$transaction(async (tx) => {
        if (bad) await tx.resellerReportComment.delete({ where: { id: bad.id } });
        await tx.resellerReportComment.create({
          data: { reportId: report.id, authorEmail: SA_EMAIL, authorName: SA_NAME, body: r.comment },
        });
        const recipients = new Set<string>();
        if (report.authorEmail) recipients.add(report.authorEmail.toLowerCase());
        if ((report as any).reportedByEmail) recipients.add((report as any).reportedByEmail.toLowerCase());
        recipients.delete(SA_EMAIL.toLowerCase());
        for (const email of recipients) {
          await tx.resellerNotification.create({
            data: { recipientEmail: email, kind: "report_status", title: `Updated explanation: ${report.title}`, body: r.comment.slice(0, 240), linkUrl: `/reseller-reports/${report.id}`, reportId: report.id, actorName: SA_NAME },
          });
        }
      });
      console.log(`✅ ${r.prefix}: ${bad ? "old comment deleted, " : "old comment NOT FOUND, "}corrected comment posted`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
