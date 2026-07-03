/**
 * Reply on cmqsn52d2: zoom feature (his ask) is live + new delivery-tile
 * lead-line setting. Comment + in-app notification (no status change).
 *   npx tsx scripts/run-on-prod.ts scripts/post-report-comment-cmqsn52d2-zoom-2026-07-03.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";
const REPORT_PREFIX = "cmqsn52d2";

const COMMENT = `Great to hear it's perfect now — and your zoom idea is already BUILT and live! 🎉

1) ZOOM — exactly as you described: in the Kitchen Order App, tap the gear (settings) → Preferences → "Zoom — text size". Three levels: Standard (the current view), 1.2×, and 1.5×. Everything scales — text, numbers, tiles, badges — and the choice is saved PER DEVICE, so a tablet can run 1.5× for someone who has trouble seeing while a phone stays at Standard. It applies instantly (no restart, no app update needed) and is remembered after the app is closed.

2) ONE MORE NEW OPTION you'll like: the restaurant can now choose WHAT goes on top of a delivery tile. In the admin → Settings → kitchen display section, under the "show customer name on delivery orders" switch there's a new choice: "Customer name on top" (name big and bold, address lighter underneath — the current look) or "Address on top" (the reverse). The formatting always stays the same — top line big and bold, bottom line lighter — only the order flips, and the kitchen display updates live within seconds of changing it.

Please try both on your tablet: set the zoom to 1.5× and back, and flip the name/address order — and tell us if anything else would help. Grazie!`;

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const report = await prisma.resellerReport.findFirst({ where: { id: { startsWith: REPORT_PREFIX } } });
    if (!report) throw new Error(`No report starting with ${REPORT_PREFIX}`);
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
          data: { recipientEmail: email, kind: "report_status", title: `Update on: ${report.title}`, body: COMMENT.slice(0, 240), linkUrl: `/reseller-reports/${report.id}`, reportId: report.id, actorName: SA_NAME },
        });
      }
    });
    console.log(`✅ zoom + lead-line reply posted on "${report.title}" (${report.id}), reporter notified`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
