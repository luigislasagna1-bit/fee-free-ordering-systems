/**
 * Skool → Luigi Bucks credit transfer (Luigi, 2026-08-01).
 *
 * Moves each ACTIVE Skool member's UNUSED "SKOOL Voucher" balance (GloriaFood
 * self-made promos, Apr–Jul 2026, verified page-by-page with Luigi) onto the
 * new site as Reward Dollars, through the EXACT same machinery as the admin
 * "Gift Reward Dollars" button (verified end-to-end with Faisal's $40):
 *
 *   - email already an ACCOUNT customer → wallet credited instantly
 *     (PendingRewardGrant born `claimed`) + RewardGift email with balance
 *   - no account yet → PendingRewardGrant waits `pending` + RewardGiftInvite
 *     teaching email; signup/activation hooks auto-claim it
 *
 * Idempotency (safe to re-run): each member is guarded by NOTE_MARKER — if a
 * PendingRewardGrant with this exact note already exists for their email (any
 * status), the row is SKIPPED. The wallet credit additionally carries the
 * `gift:<id>` ledger key, the same backstop the button uses.
 *
 * DRY-RUN by default — prints the full plan and touches nothing.
 *
 *   npx tsx scripts/run-on-prod.ts scripts/_skool-credit-transfer.ts <slug>
 *   npx tsx scripts/run-on-prod.ts scripts/_skool-credit-transfer.ts <slug> --apply
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

const NOTE_MARKER = "Skool voucher transfer (Apr-Jul 2026)";
const CREATED_BY = "script:skool-credit-transfer-2026-08";

type PlanRow = {
  name: string;
  email: string | null; // null = Luigi hasn't supplied it yet
  amount: number;
  months: string; // which unused vouchers make up the amount (audit trail)
  hold?: string; // non-empty = do NOT apply yet, and why
};

// Verified with Luigi 2026-08-01 (~2:30 AM) from the GloriaFood promo list:
// used=0 vouchers only; Rick DL excluded (no longer an active member);
// Tina + Christina are one person; Rob=Robert Quayson; Ken=Kenn.
const PLAN: PlanRow[] = [
  { name: "Sadaf",     email: "sadafsheikhchaudhry@yahoo.ca",   amount: 75, months: "Apr $15 + May/Jun/Jul $20" },
  { name: "Kenn",      email: "kmacfie@me.com",                 amount: 40, months: "Jun + Jul $20 each" },
  { name: "Karen",     email: "karen.j.savich@gmail.com",       amount: 60, months: "Apr $20 + Jun + Jul" },
  { name: "Christina", email: "christina.forsyth@hotmail.com",  amount: 70, months: "Apr $10 (Christina) + May/Jun/Jul $20 (Tina)" },
  { name: "John",      email: "rockpick101@gmail.com",          amount: 60, months: "May + Jun + Jul $20 each" },
  { name: "Ellie",     email: "elliemac126@hotmail.ca",         amount: 60, months: "May + Jun + Jul $20 each" },
  { name: "Habib",     email: "estephan.habib@gmail.com",       amount: 60, months: "May + Jun + Jul $20 each" },
  { name: "Robert",    email: "robertquayson21@gmail.com",      amount: 40, months: "Jun (Robert) + Jul (Rob) $20 each" },
  { name: "Matt",      email: "matt_white88@hotmail.com",       amount: 20, months: "Jul" },
  { name: "David",     email: "lymandavid@hotmail.com",         amount: 20, months: "Jul" },
  { name: "Max",       email: "maxrbilton@gmail.com",           amount: 20, months: "Jul" },
  { name: "Usman",     email: "usman_20099@hotmail.com",        amount: 20, months: "Jul" },
  { name: "Alex",      email: "alexgroz@hotmail.com",           amount: 20, months: "Jul" },
  { name: "Zahra",     email: "kotadia@gmail.com",              amount: 20, months: "Jul" },
  { name: "Robin",     email: "robinreadgriffin@gmail.com",     amount: 15, months: "Apr $15" },
];

const [, , slug, applyFlag] = process.argv;
const APPLY = applyFlag === "--apply";
if (!slug) { console.error("Usage: ... _skool-credit-transfer.ts <slug> [--apply]"); process.exit(1); }

async function main() {
  // Dynamic imports AFTER dotenv: @/lib/db reads DATABASE_URL at module load.
  const { default: prisma } = await import("@/lib/db");
  const { grant, getBalance } = await import("@/lib/reward-ledger");
  const { isAccountCustomer } = await import("@/lib/reward-gifts");
  const { sendRewardGiftEmail, sendRewardGiftInviteEmail } = await import("@/lib/email");
  const { formatCurrency } = await import("@/lib/utils");
  const { restaurantOrderUrl } = await import("@/lib/restaurant-url");

  const r = await prisma.restaurant.findUnique({
    where: { slug },
    select: {
      id: true, rewardsEnabled: true, name: true, email: true, slug: true,
      subdomain: true, customDomain: true, customDomainStatus: true,
      defaultLanguage: true, currency: true, rewardLabelSingular: true, rewardLabelPlural: true,
    },
  });
  if (!r) { console.error(`No restaurant "${slug}".`); process.exit(1); }
  if (!r.rewardsEnabled) { console.error("Rewards are OFF for this restaurant — aborting."); process.exit(1); }

  const rewardLabel = r.rewardLabelPlural?.trim() || r.rewardLabelSingular?.trim() || "Reward Dollars";
  const orderUrl = restaurantOrderUrl(r as any, "");
  const signupUrl = restaurantOrderUrl(r as any, "/account/signup");
  const locale = r.defaultLanguage || "en";

  console.log(`\n=== Skool credit transfer — ${r.name} — ${APPLY ? "APPLY (writing!)" : "DRY RUN (read-only)"} ===\n`);

  let plannedTotal = 0, readyTotal = 0, applied = 0, appliedTotal = 0;
  for (const row of PLAN) {
    plannedTotal += row.amount;
    const label = `${row.name.padEnd(10)} $${row.amount.toFixed(2).padStart(6)}`;

    if (!row.email) { console.log(`  ⏸  ${label}  HOLD — ${row.hold}`); continue; }
    const email = row.email.trim().toLowerCase();

    // Idempotency guard: this transfer already recorded for this email?
    const already = await prisma.pendingRewardGrant.findFirst({
      where: { restaurantId: r.id, email, note: NOTE_MARKER },
      select: { id: true, status: true, amount: true },
    });
    if (already) {
      console.log(`  ✔  ${label}  ALREADY TRANSFERRED (${already.status}, $${already.amount.toFixed(2)}) — skipping`);
      continue;
    }

    // Same resolution as the admin gift route: prefer the credentialed row.
    const existing = await prisma.customer.findFirst({
      where: { restaurantId: r.id, email: { equals: email, mode: "insensitive" } },
      orderBy: { passwordHash: { sort: "desc", nulls: "last" } },
      select: { id: true, name: true, signedUpAt: true, passwordHash: true, customerAccountId: true },
    });
    const instant = !!existing && isAccountCustomer(existing);
    const path = instant ? "INSTANT → wallet now + gift email" : "INVITE → pending + signup email";

    // One-unredeemed-gift rule (same as the route) for the invite path.
    const outstanding = instant ? null : await prisma.pendingRewardGrant.findFirst({
      where: { restaurantId: r.id, email, status: "pending" },
      select: { id: true, amount: true },
    });
    if (outstanding) {
      console.log(`  ⚠️  ${label}  CONFLICT — already has an unredeemed $${outstanding.amount.toFixed(2)} gift pending; resolve first`);
      continue;
    }

    if (row.hold) { console.log(`  ⏸  ${label}  HOLD — ${row.hold}  (would be: ${path})`); continue; }
    readyTotal += row.amount;

    if (!APPLY) {
      const bal = instant && existing ? await getBalance({ restaurantId: r.id, customerId: existing.id }) : 0;
      console.log(`  ▶  ${label}  ${email.padEnd(36)} ${path}${instant ? `  (balance now $${bal.toFixed(2)})` : ""}  [${row.months}]`);
      continue;
    }

    // ── APPLY ──────────────────────────────────────────────────────────────
    const amountLabel = formatCurrency(row.amount, r.currency);
    if (instant && existing) {
      const gift = await prisma.pendingRewardGrant.create({
        data: {
          restaurantId: r.id, email, name: row.name, amount: row.amount, note: NOTE_MARKER,
          status: "claimed", claimedAt: new Date(), customerId: existing.id, createdBy: CREATED_BY,
        },
      });
      const res = await grant({
        restaurantId: r.id, customerId: existing.id, amount: row.amount,
        reason: "grant", note: `Gift: ${NOTE_MARKER}`, orderId: `gift:${gift.id}`,
      });
      if (!res.ok) {
        await prisma.pendingRewardGrant.delete({ where: { id: gift.id } }).catch(() => {});
        console.log(`  ❌ ${label}  CREDIT FAILED — nothing recorded, investigate before retrying`);
        continue;
      }
      const balance = await getBalance({ restaurantId: r.id, customerId: existing.id });
      const sent = await sendRewardGiftEmail({
        to: email, customerName: row.name || existing.name || "", restaurantName: r.name,
        amountLabel, rewardLabel, balanceLabel: formatCurrency(balance, r.currency),
        note: NOTE_MARKER, orderUrl, restaurantEmail: r.email, locale,
      }).catch((e) => ({ success: false, error: String(e) } as any));
      await prisma.pendingRewardGrant.update({
        where: { id: gift.id }, data: { emailSentAt: sent.success ? new Date() : null },
      }).catch(() => {});
      console.log(`  ✅ ${label}  CREDITED — balance now $${balance.toFixed(2)}, email ${sent.success ? "sent" : "FAILED (use resend button)"}`);
    } else {
      const gift = await prisma.pendingRewardGrant.create({
        data: { restaurantId: r.id, email, name: row.name, amount: row.amount, note: NOTE_MARKER, status: "pending", createdBy: CREATED_BY },
      });
      const sent = await sendRewardGiftInviteEmail({
        to: email, customerName: row.name, restaurantName: r.name,
        amountLabel, rewardLabel, note: NOTE_MARKER, orderUrl: signupUrl, restaurantEmail: r.email, locale,
      }).catch((e) => ({ success: false, error: String(e) } as any));
      await prisma.pendingRewardGrant.update({
        where: { id: gift.id }, data: { emailSentAt: sent.success ? new Date() : null },
      }).catch(() => {});
      console.log(`  ✅ ${label}  PENDING GIFT created — invite email ${sent.success ? "sent" : "FAILED (use resend button)"}; auto-claims at signup`);
    }
    applied += 1;
    appliedTotal += row.amount;
  }

  console.log(`\n  Plan total (all 15): $${plannedTotal.toFixed(2)}`);
  console.log(`  Ready now          : $${readyTotal.toFixed(2)}`);
  if (APPLY) console.log(`  Applied this run   : ${applied} members, $${appliedTotal.toFixed(2)}`);
  else console.log(`  (dry run — nothing written; re-run with --apply after Luigi's go)`);
  console.log("");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => {
    const { default: prisma } = await import("@/lib/db");
    await prisma.$disconnect();
  });
