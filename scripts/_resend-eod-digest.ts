/**
 * Re-send an end-of-day report for a SPECIFIC day, on demand.
 *
 * Why this exists (Luigi 2026-08-08): the digest sweep marks a day "reported"
 * via `Restaurant.lastEodDigestDate`, and the morning catch-up skips any day
 * already stamped. Until today it stamped that marker even when every send
 * failed — so a day could be lost permanently with no way to get it back. That
 * is now fixed (the marker is only written when a send actually succeeds), but
 * an already-lost day still needs a manual way to recover, and this is also the
 * tool for "please just send me that report again".
 *
 * Reads the SAME builder the cron uses (buildDayReport), so the numbers are
 * identical to what the scheduled report would have contained.
 *
 *   DRY RUN (prints the figures, sends nothing):
 *     npx tsx scripts/run-on-prod.ts scripts/_resend-eod-digest.ts <restaurantId> <YYYY-MM-DD>
 *   SEND:
 *     npx tsx scripts/run-on-prod.ts scripts/_resend-eod-digest.ts <restaurantId> <YYYY-MM-DD> --send
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const [restaurantId, dayKey] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const SEND = process.argv.includes("--send");

async function main() {
  if (!restaurantId || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey ?? "")) {
    console.error("usage: _resend-eod-digest.ts <restaurantId> <YYYY-MM-DD> [--send]");
    process.exit(1);
  }
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as never);

  const { buildDayReport } = await import("../src/lib/digests");
  const { sendDailyDigestEmail, setEmailImprint } = await import("../src/lib/email");

  const r: any = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      id: true, name: true, slug: true, currency: true, defaultLanguage: true, timezone: true,
      lastEodDigestDate: true,
      notificationRecipients: { where: { isActive: true }, select: { email: true, emailLanguage: true, endOfDayReport: true } },
    },
  });
  if (!r) { console.error("restaurant not found"); process.exit(1); }

  console.log(`Restaurant: ${r.name}  (tz ${r.timezone})`);
  console.log(`lastEodDigestDate: ${r.lastEodDigestDate ? r.lastEodDigestDate.toISOString().slice(0, 10) : "(never)"}`);

  const recipients = r.notificationRecipients.filter((x: any) => x.endOfDayReport === true);
  console.log(`Recipients with the end-of-day toggle ON: ${recipients.length}`);
  for (const x of recipients) console.log(`   ${x.email} (${x.emailLanguage || r.defaultLanguage || "en"})`);
  if (recipients.length === 0) { console.error("nobody to send to"); await prisma.$disconnect(); return; }

  const stats = await buildDayReport(restaurantId, dayKey);
  if (!stats) { console.error(`No report could be built for ${dayKey} — no activity?`); await prisma.$disconnect(); return; }

  const s = stats as unknown as Record<string, unknown>;
  console.log(`\nReport for ${dayKey}:`);
  for (const k of ["orders", "sales", "total", "collected", "storeCreditRedeemed", "refundsAmount", "cancelledOrders"]) {
    if (k in s) console.log(`   ${k.padEnd(22)} ${String(s[k])}`);
  }

  if (!SEND) {
    console.log(`\nDRY RUN — nothing sent. Re-run with --send to deliver it.`);
    await prisma.$disconnect();
    return;
  }

  // ⚠️ Outside production, src/lib/email.ts DELIBERATELY logs "[Email
  // placeholder]" and returns { success: true } so local runs can't mail real
  // people. Trusting that flag would report a delivery that never happened —
  // the same false-success trap this codebase has been bitten by repeatedly.
  // Refuse to pretend: require the explicit opt-in AND a usable key.
  if (process.env.ALLOW_DEV_EMAIL !== "1" && process.env.NODE_ENV !== "production") {
    console.error(
      "\n⛔ REFUSING TO CLAIM A SEND.\n" +
        "   Running outside production, email is log-only, so nothing would actually\n" +
        "   be delivered even though the transport returns success.\n" +
        "   Set ALLOW_DEV_EMAIL=1 (and ensure ENCRYPTION_KEY matches the one the saved\n" +
        "   Resend key was encrypted with) to send for real.",
    );
    await prisma.$disconnect();
    process.exit(2);
  }

  const base = process.env.NEXT_PUBLIC_APP_URL || "https://feefreeordering.com";
  let ok = 0;
  setEmailImprint(null);
  for (const x of recipients) {
    try {
      const res: any = await sendDailyDigestEmail({
        to: x.email,
        stats: stats as never,
        dashboardUrl: `${base}/admin/reports/end-of-day`,
        unsubscribeUrl: `${base}/admin/settings/notifications`,
        locale: x.emailLanguage || r.defaultLanguage || undefined,
        currency: r.currency,
      });
      if (res?.success === false) console.error(`   ✗ ${x.email}: ${res?.error ?? "reported failure"}`);
      else { ok++; console.log(`   ✅ sent to ${x.email}`); }
    } catch (e) {
      console.error(`   ✗ ${x.email}:`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`\n${ok}/${recipients.length} delivered.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
