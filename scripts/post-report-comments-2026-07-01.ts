/**
 * Post an honest "what's done / what's still open" comment on the 4 IN_TESTING
 * Fabrizio reports that a completeness review found still have an unaddressed
 * follow-up sub-item — so he doesn't mark them Confirmed Working prematurely.
 * Comment + in-app notification only; status stays IN_TESTING. Luigi 2026-07-01.
 *   npx tsx scripts/run-on-prod.ts scripts/post-report-comments-2026-07-01.ts
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
    body: `Ciao Fabrizio — quick status. Everything from the earlier rounds is in and device-tested: per-service hours now gate ordering (Pickup 14:00 hides ASAP before 14:00 and makes 14:00 the earliest slot), the general hours still drive the header/open sign and the order-app ring, and checkout names the service ("Pickup hasn't started yet — it starts at 2:00 PM") instead of saying the restaurant is closed. The storefront hours are also grouped by service.

Your most recent request — the special/extraordinary-day case — is NOT done yet. Today the checkout shows the same "…starts at 2:00 PM" text whether that time comes from your normal weekly hours or from a one-off special schedule. We still need to add the distinct wording you asked for, e.g. "Pickup will open TODAY at 2:00 PM", shown only when the start time comes from an extraordinary/special-day schedule. We're picking that up now (translated into all languages) and will tell you the moment it's live — please hold off on "Confirmed Working" until then. Grazie!`,
  },
  {
    id: "cmqp8l948000004kys6m8xktn", // Closing days / closed services
    body: `Thanks Fabrizio — almost everything on this report is now confirmed working: the Italian weekday label, closed-reservations blocking a booking, the per-service "closed time range" blocking an order/reservation inside the window, the warning banner always showing for a single-service closure (up front, not just at confirm), the Italian pause banner, pausing from the backend Services page (reservations included), and the custom customer message now showing on a per-service closure. Please re-verify those.

One item is NOT yet fixed and we're keeping this open for it: when you set EXTRAORDINARY OPEN hours for a single service (your example: delivery open 10:00–20:00 today), the checkout time picker still only offers slots from that service's normal weekly hours (18:00 onward), so the special open window is ignored. The extraordinary hours must take precedence in the picker. We'll wire the special-day open windows into the checkout slot list + the per-service open-now status, then ask you to re-test. Sorry that one slipped through — the earlier fix covered "closed range blocks orders" but not "special OPEN hours widen the picker".`,
  },
  {
    id: "cmqt99i8s001b04jvy9uj7xjn", // Delivery / pickup timeframes on the homepage
    body: `Thanks Fabrizio! The homepage part is done and live: the "Show service times on the ordering page" toggle (Taking Orders page) removes the "· 20 min" next to Pickup / Delivery / Dine-in / Take-out on the main page — including the delivery button after an address is entered — while keeping the time at checkout. Please confirm that side works for you.

On your follow-up: you're right that the "about X min" shown at checkout can be misread as "delivered in X minutes." We have NOT yet added the clarification — that's still open. We'll label it clearly so it reads as an estimated time, with a note that the restaurant confirms the actual ASAP delivery timeframe after accepting the order. We'll update this report once that copy is live (translated). Keeping it in testing for the toggle; the checkout wording is the remaining piece.`,
  },
  {
    id: "cmqtmfp2n000l04i601k71xdc", // Promo "Get it Now"
    body: `Thanks Fabrizio. The two original parts are live: the eligible products on the "Get it now" screen are grouped by menu category, and each product has its own button — "+ Add" for simple items (straight into the cart) and "Customize" for items that need a size/extras. Please verify those two.

On your follow-up — you're right that with a button now on every product, the big green button at the bottom of that screen is redundant. That change hasn't been made yet; the bottom button is still there. We'll remove/rework it so the screen isn't cluttered, then move this back to testing for you.`,
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
      console.log(`✅ #${c.id} "${report.title}": comment posted (status left ${report.status}), notified`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
