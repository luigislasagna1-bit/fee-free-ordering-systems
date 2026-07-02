/**
 * Follow-up comments after shipping the LAST open item on the two coupled
 * hours reports (special/extraordinary per-service OPEN hours: distinct
 * "opens TODAY" wording + special window driving the checkout picker /
 * open-now status / earliest slot). Shipped in 70f6cd56. Both reports are
 * now fully addressed → comment + in-app notification; status stays
 * IN_TESTING for Fabrizio to Confirm Working.
 *   npx tsx scripts/run-on-prod.ts scripts/post-report-followups-2026-07-02b.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SA_EMAIL = "admin@feefreeordering.com";
const SA_NAME = "Super Admin";

const COMMENTS: { id: string; body: string }[] = [
  {
    id: "cmqnm3hv0000b04i8tvvxx836", // Opening hours per single service
    body: `Follow-up ✓ — the last open item is now live. When a service's start time TODAY comes from a special/extraordinary schedule (not your normal weekly hours), checkout now shows a distinct message — "🕒 {Service} opens TODAY at {time} (special hours) — please choose a time from then on" — instead of the generic "hasn't started yet". It's translated into all languages. Everything else on this report was already device-confirmed: per-service hours gate ordering (Pickup 14:00 hides ASAP and makes 14:00 the earliest slot), the GENERAL hours still drive the header/open sign and the order-app ring, checkout names the SERVICE, and the storefront hours are grouped by service. So this report is now fully addressed — please re-test the special-day wording and, if all good, tap "Confirmed Working". Grazie!`,
  },
  {
    id: "cmqp8l948000004kys6m8xktn", // Closing days / closed services
    body: `Follow-up ✓ — the last open item is now live. When you set EXTRAORDINARY OPEN hours for a single service today (your example: delivery open 10:00–20:00), the customer open-now status, the earliest available time, AND the checkout time-slot picker now ALL honour that special window — the service's normal weekly hours (e.g. 18:00) no longer override it. Extraordinary hours take precedence, exactly as you asked. All the earlier items on this report were already fixed: the Italian weekday label, closed reservations blocking a booking, a per-service "closed time range" blocking an order/reservation inside the window, the warning banner always showing up front for a single-service closure, the Italian pause banner, pausing from the backend Services page (reservations included), and the custom customer message on a per-service closure. So this report is now fully addressed — please re-test the special OPEN-hours case and, if good, tap "Confirmed Working". Grazie!`,
  },
];

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    for (const c of COMMENTS) {
      const report = await prisma.resellerReport.findUnique({ where: { id: c.id } });
      if (!report) { console.log(`No report ${c.id} — skipped`); continue; }
      await prisma.$transaction(async (tx) => {
        await tx.resellerReportComment.create({
          data: { reportId: c.id, authorEmail: SA_EMAIL, authorName: SA_NAME, body: c.body },
        });
        const recipients = new Set<string>();
        if (report.authorEmail) recipients.add(report.authorEmail.toLowerCase());
        if ((report as any).reportedByEmail) recipients.add((report as any).reportedByEmail.toLowerCase());
        recipients.delete(SA_EMAIL.toLowerCase());
        for (const email of recipients) {
          await tx.resellerNotification.create({
            data: { recipientEmail: email, kind: "report_comment", title: `Update on: ${report.title}`, body: c.body.slice(0, 240), linkUrl: `/reseller-reports/${c.id}`, reportId: c.id, actorName: SA_NAME },
          });
        }
      });
      console.log(`✅ #${c.id} "${report.title}": follow-up posted (status ${report.status}), notified`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
