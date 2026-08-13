/**
 * Phone-identity repair, in three passes. READ-ONLY unless you pass --apply.
 *
 *   npx tsx scripts/run-on-prod.ts scripts/backfill-phone-identity-2026-08-13.ts
 *   npx tsx scripts/run-on-prod.ts scripts/backfill-phone-identity-2026-08-13.ts --apply
 *
 * WHY
 * ---
 * Twilio hands us "+14168338405"; checkout stores "4168338405" or "(416)
 * 833-8405". Nothing ever reconciled the two, so on 2026-08-13 Roya Safi — a
 * three-order, $181.99 regular — phoned and was treated as a stranger: not
 * recognised, quoted a first-time discount she wasn't entitled to, charged
 * $25.97 after agreeing to $23.37, and left with a SECOND Customer row under a
 * speech-to-text version of her name.
 *
 * PASS 1  Customer.phoneDigits   — the new lookup key, for every existing row.
 * PASS 2  VoiceCall.fromDigits   — the ERASURE key. Without it "delete my data"
 *                                  cannot reach a call record or its Twilio
 *                                  audio, while still reporting success.
 * PASS 3  Merge the forks        — re-point orders and calls from each voice
 *                                  sentinel row onto the real customer, then
 *                                  resync lifetime totals.
 *
 * ⚠️ ORDERING. Pass 3 must run BEFORE the fixed returning-caller lookup is
 * deployed. Today that lookup finds nothing, so a fork is invisible. The moment
 * it works it finds BOTH rows, and the fork wins on `lastOrderAt desc` — Nabil
 * would greet Roya as "Royanne" with none of her history. Merging first is what
 * makes the fix an improvement instead of a louder version of the same bug.
 *
 * Safety: a sentinel row is only ever merged INTO a real row that shares its
 * restaurant and its phone digits. Sentinel-only groups are left alone (there
 * is nothing to merge them into), and the sentinel row is kept, not deleted —
 * anything still pointing at it resolves rather than dangling.
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { phoneDigitsKey } from "../src/lib/phone";
import { VOICE_SENTINEL_DOMAIN } from "../src/lib/voice/sentinel-identity";
// NOTE: customer-totals is imported LAZILY inside main(). It pulls in
// src/lib/db, which reads DATABASE_URL at module load — and ES imports are
// hoisted above the dotenv calls below, so a static import here would blow up
// before .env.local had been read.

config({ path: ".env.local" });
config({ path: ".env" });

const APPLY = process.argv.includes("--apply");

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  console.log(APPLY ? "MODE: APPLY (writes)" : "MODE: DRY RUN (no writes)\n");

  const { syncCustomerLifetimeTotals } = await import("../src/lib/customer-totals");

  // ── PASS 1: Customer.phoneDigits ─────────────────────────────────────────
  //
  // Every customer WITH a phone, not just the ones missing a key: pass 3 needs
  // to find a sentinel's real twin, and in a dry run the keys it would match on
  // have not been written yet. Building the index in memory makes the dry run
  // show exactly what the apply run will do — which is the whole point of
  // having one before touching a real customer's history.
  const customers = await prisma.customer.findMany({
    where: { phone: { not: null } },
    select: {
      id: true, restaurantId: true, phone: true, phoneDigits: true,
      name: true, email: true, totalOrders: true, totalSpent: true,
      signedUpAt: true, createdAt: true,
    },
  });

  /** (restaurantId|digits) → the customer rows sharing that number. */
  const byKey = new Map<string, typeof customers>();
  for (const c of customers) {
    const key = phoneDigitsKey(c.phone);
    if (!key) continue;
    const k = `${c.restaurantId}|${key}`;
    const bucket = byKey.get(k);
    if (bucket) bucket.push(c);
    else byKey.set(k, [c]);
  }

  let p1 = 0;
  for (const c of customers) {
    const key = phoneDigitsKey(c.phone);
    if (!key || c.phoneDigits === key) continue;
    p1++;
    if (APPLY) await prisma.customer.update({ where: { id: c.id }, data: { phoneDigits: key } });
  }
  console.log(
    `PASS 1  Customer.phoneDigits: ${p1} row(s)${APPLY ? " written" : " would be written"} ` +
      `(of ${customers.length} with a phone)`,
  );

  // ── PASS 2: VoiceCall.fromDigits ─────────────────────────────────────────
  const calls = await prisma.voiceCall.findMany({
    where: { fromDigits: null },
    select: { id: true, fromNumber: true },
  });
  let p2 = 0;
  for (const v of calls) {
    // "REDACTED" is what erasure already wrote — leave it alone.
    const key = phoneDigitsKey(v.fromNumber);
    if (!key) continue;
    p2++;
    if (APPLY) await prisma.voiceCall.update({ where: { id: v.id }, data: { fromDigits: key } });
  }
  console.log(`PASS 2  VoiceCall.fromDigits: ${p2} row(s)${APPLY ? " written" : " would be written"}\n`);

  // ── PASS 3: merge the forks ──────────────────────────────────────────────
  const sentinels = await prisma.customer.findMany({
    where: { email: { endsWith: VOICE_SENTINEL_DOMAIN } },
    select: { id: true, restaurantId: true, name: true, email: true, phone: true, totalOrders: true, totalSpent: true },
  });
  console.log(`PASS 3  ${sentinels.length} voice sentinel row(s) found`);

  let merged = 0;
  let orphaned = 0;
  let ambiguous = 0;
  for (const s of sentinels) {
    const key = phoneDigitsKey(s.phone);
    if (!key) {
      console.log(`  · ${s.email} — no usable phone, skipped`);
      continue;
    }
    const siblings = (byKey.get(`${s.restaurantId}|${key}`) ?? []).filter((x) => x.id !== s.id);
    // Never merge into another sentinel.
    const realCandidates = siblings.filter((x) => !(x.email ?? "").endsWith(VOICE_SENTINEL_DOMAIN));
    if (realCandidates.length === 0) {
      orphaned++;
      console.log(`  · ${s.email} — no real customer with these digits; leaving as-is`);
      continue;
    }
    // 🚨 More than one real row behind a number is NOT a fork we can resolve.
    // A phone can genuinely belong to several people — a household line, a
    // shared work number, or (here) one test number reused across a dozen
    // accounts. Picking "the best" of them would move somebody's orders,
    // lifetime spend and reward wallet onto a stranger, which is a worse
    // outcome than the split we are repairing. Print and leave it for a human.
    if (realCandidates.length > 1) {
      ambiguous++;
      console.log(
        `  ⚠ ${s.email} — ${realCandidates.length} real customers share this number; NOT merging.\n` +
          realCandidates
            .map((x) => `      · ${x.name} <${x.email ?? "no email"}> ${x.totalOrders} orders / $${x.totalSpent.toFixed(2)}`)
            .join("\n"),
      );
      continue;
    }
    const real = realCandidates[0];

    const orders = await prisma.order.findMany({ where: { customerId: s.id }, select: { orderNumber: true, total: true } });
    const voiceCalls = await prisma.voiceCall.count({ where: { customerId: s.id } });
    console.log(
      `  ✓ "${s.name}" (${s.email}) → "${real.name}" (${real.email})\n` +
        `      ${orders.length} order(s) [${orders.map((o) => o.orderNumber).join(", ") || "none"}], ${voiceCalls} call(s)\n` +
        `      survivor before: ${real.totalOrders} orders / $${real.totalSpent.toFixed(2)}`,
    );

    if (APPLY) {
      await prisma.order.updateMany({ where: { customerId: s.id }, data: { customerId: real.id } });
      await prisma.voiceCall.updateMany({ where: { customerId: s.id }, data: { customerId: real.id } });
      // Zero the fork so its counters can never be double-counted in a report,
      // and mark it clearly for anyone who finds it later.
      await prisma.customer.update({
        where: { id: s.id },
        data: { totalOrders: 0, totalSpent: 0, notes: `Merged into ${real.id} on 2026-08-13 (voice identity fork).` },
      });
      // Recount from the orders themselves rather than adding the fork's
      // counters to the survivor's — the fork's numbers are exactly what we
      // stopped trusting.
      await syncCustomerLifetimeTotals(real.id);
      // syncCustomerLifetimeTotals deliberately leaves lastOrderAt alone
      // (customer-totals.ts:27-28), but the merged orders may well be the most
      // recent this person has placed — and the win-back ladder keys off it.
      const newest = await prisma.order.findFirst({
        where: { customerId: real.id },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      if (newest) await prisma.customer.update({ where: { id: real.id }, data: { lastOrderAt: newest.createdAt } });
      const after = await prisma.customer.findUnique({
        where: { id: real.id },
        select: { totalOrders: true, totalSpent: true },
      });
      console.log(`      survivor after:  ${after?.totalOrders} orders / $${after?.totalSpent.toFixed(2)}`);
    }
    merged++;
  }

  console.log(
    `\nPASS 3  ${merged} merge(s)${APPLY ? " applied" : " would be applied"}, ` +
      `${orphaned} with no real twin, ${ambiguous} ambiguous (needs a human).`,
  );
  if (!APPLY) console.log("\nNothing was written. Re-run with --apply once the list above looks right.");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
