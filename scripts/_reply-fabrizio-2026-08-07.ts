/**
 * Replies to Fabrizio on BOTH open reports (2026-08-07):
 *   cmshrr94z001d04l7x8kpet3z — "Order List" (Partner view): column alignment
 *   cms0gyexp00010aksy3v8s69c — Various translations: #15 + #16
 *
 * English only (standing rule for reseller replies).
 *   npx tsx scripts/run-on-prod.ts scripts/_reply-fabrizio-2026-08-07.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const AUTHOR_NAME = "Luigi";
const AUTHOR_EMAIL = "admin@feefreeordering.com";

const ORDERS_LIST_ID = "cmshrr94z001d04l7x8kpet3z";
const TRANSLATIONS_ID = "cms0gyexp00010aksy3v8s69c";

const ORDERS_LIST_BODY = `Hi Fabrizio — thank you, you were right, and the cause was a real structural mistake on our side.

**The columns are now aligned.** Every header sits exactly above its own data, to the pixel.

What was wrong: each row of the list was being built as its own separate table inside the page. So the browser worked out the column widths **once for the header, and again independently for every single row** — which is why "PAYMENT METHOD" sat far to the left of "Cash on pickup", and why no two rows lined up with each other either. It looked like a spacing problem but it was the underlying structure.

The whole list is now a single table, so there is one set of column widths for the entire grid. We measured it after the fix: the drift between every header and its column is exactly 0 pixels, and it stays at 0 when you expand a row.

Expanding a row still works exactly as before — it opens underneath across the full width, with the "Order detail" and "Order items" tabs.

Two other things landed in the same change, from a parallel review of the same screen:

• **A "Customer" column.** The list was already searching by customer name, phone and email, but never showed you who placed the order — you had to expand the row to find out. It's now a column of its own, next to Restaurant.

• **The duplicated name column is gone.** "Name" and "Company Name" were printing the identical text for any restaurant that isn't part of a multi-location brand. Company Name now only appears when it genuinely differs from the restaurant name.

Please reload the page once (your browser may hold the old column layout for a moment) and let us know if anything still looks off.`;

const TRANSLATIONS_BODY = `Hi Fabrizio — two things: your **#16** is fixed, and I owe you an overdue answer on **#15**.

---

## #16 — the delay email showed a nonsensical time

You were right that it made no sense, and the cause was a genuine bug.

Your order #ORD-984075479 was due at **23:06**. You added 15 minutes, so the new time was **23:21**. The email told the customer **9:21 PM**.

9:21 PM is 21:21 — which is exactly 23:21 expressed in **UTC**. The email was printing the new time in our server's clock instead of your restaurant's. Because Italy is two hours ahead of UTC in summer, the customer was told a time *earlier* than the one they were already expecting.

This is fixed: the new estimated time is now rendered in the restaurant's own timezone and 12h/24h preference, exactly like every other order email. We added an automated test using your exact numbers (23:06 + 15 min in Rome) so this specific mistake cannot come back.

We also found and fixed **the same bug in the SMS** version of the delay and "order accepted" texts — if you have SMS enabled, those were quoting the wrong clock too.

## #16 — the yellow box in the order app

Also fixed, and it was worse than it looked. That box is the **customer's notes** field, and we were writing a machine line into it:

    [Delayed +15m at 2026-08-07T20:37:23.405Z]

Untranslated, with a raw UTC timestamp, mixed in with whatever the guest had actually written, and printed on the kitchen ticket.

Now the delay is stored separately (never in the customer's notes) and shown as its own clearly-marked amber line under the times it changed — in your language: **"Ritardo di 15 min"**, with the reason underneath if the kitchen typed one. If an order is pushed back more than once it sums them and tells you how many changes were made. The customer's notes box goes back to containing only what the customer wrote.

---

## #15 — this was built, and we never confirmed it to you. Apologies.

Everything you asked for on 1 August shipped, but the reply never went out. Here is exactly what it does now, so you can verify it:

• **Pending order email** — now reads "with the **pickup** time currently estimated at XX min" for takeaway, and "with the **delivery** time currently estimated at XX min" for delivery, instead of the generic "ready time".

• **"Ready time" is gone everywhere it was wrong.** Every email now says pickup or delivery according to the order type — this was your main point, and it applies to the accepted email, the delay email and the pending email.

• **Accepted email** — the date is spelled out in full and capitalised, as you wrote it: "**Sabato 1 Agosto, 13:48**", not the abbreviated "sab 1 ago".

• **Accepted email** — now includes the line you asked for: if there's a delay, we'll email the new estimated time.

• **Completed email** — no longer shows "Pronto previsto: …". A finished order has no future ready time, exactly as you said.

---

## Still open from this report: #3 (spam)

I want to be straight with you rather than mark this closed. The **code** half is done — plain-text part on every email, replies routing to the restaurant, consistent sender identity. The remaining half is domain/DNS reputation (DMARC in particular), which only the platform owner can change, and that session is still outstanding. Please keep telling us where new test emails land — inbox or spam — because that's the only real measure.

Everything else on this report is done and confirmed.

**Worth re-testing:** delay an order by 15 minutes and check the customer's email now shows the correct clock time, and that the order app shows the amber "Ritardo di 15 min" line instead of the raw text.

Grazie as always — #16 in particular was a bug that would have quietly misinformed real customers.`;

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as never);

  for (const [id, body, label] of [
    [ORDERS_LIST_ID, ORDERS_LIST_BODY, "Orders List (column alignment)"],
    [TRANSLATIONS_ID, TRANSLATIONS_BODY, "Translations (#15 + #16)"],
  ] as const) {
    const report: any = await prisma.resellerReport.findUnique({ where: { id } });
    if (!report) { console.error(`  ✗ report ${id} not found`); continue; }

    // Guard against the double-post mistake made on this report before: refuse
    // if an identical first line was already posted.
    const firstLine = body.split("\n")[0].slice(0, 60);
    const existing = await prisma.resellerReportComment.findMany({
      where: { reportId: id, authorEmail: AUTHOR_EMAIL },
      select: { body: true },
    });
    if (existing.some((c) => (c.body ?? "").startsWith(firstLine))) {
      console.log(`  ⚠ ${label}: an identical reply is already posted — skipping.`);
      continue;
    }

    await prisma.resellerReportComment.create({
      data: { reportId: id, authorEmail: AUTHOR_EMAIL, authorName: AUTHOR_NAME, body },
    });
    await prisma.resellerReportActivity.create({
      data: { reportId: id, actorEmail: AUTHOR_EMAIL, actorName: AUTHOR_NAME, kind: "COMMENTED" },
    });
    await prisma.resellerReport.update({ where: { id }, data: { updatedAt: new Date() } });

    const recipient = String(report.reportedByEmail ?? report.authorEmail ?? "").toLowerCase();
    if (recipient) {
      await prisma.resellerNotification.create({
        data: {
          kind: "report_status",
          recipientEmail: recipient,
          title: "Your report has an update",
          body: `"${report.title}" — we've replied with the latest fixes.`,
          linkUrl: `/reseller-reports/${id}`,
        } as never,
      });
    }
    console.log(`  ✅ ${label}: replied + notified ${recipient || "(no recipient)"}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
