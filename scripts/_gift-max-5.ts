/**
 * One-off: $5 Luigi Bucks thank-you to Max Bilton for reporting the two slice
 * checkout issues (Luigi, 2026-08-01, OWNER-ACTIONS A36). Mirrors the instant
 * path of _skool-credit-transfer.ts (PendingRewardGrant born `claimed` +
 * atomic wallet grant with `gift:<id>` ledger key). NO email — Luigi tells
 * him directly on Skool. Idempotent via NOTE_MARKER; re-run applies $0.
 *
 *   npx tsx scripts/run-on-prod.ts scripts/_gift-max-5.ts luigis-lasagna-pizzeria
 *   npx tsx scripts/run-on-prod.ts scripts/_gift-max-5.ts luigis-lasagna-pizzeria --apply
 */
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });
dotenvConfig({ path: ".env" });

const NOTE_MARKER = "Thanks for catching the slice checkout issues (Aug 2026)";
const CREATED_BY = "script:gift-max-slice-report-2026-08";
const EMAIL = "maxrbilton@gmail.com";
const NAME = "Max";
const AMOUNT = 5;

const [, , slug, applyFlag] = process.argv;
const APPLY = applyFlag === "--apply";
if (!slug) { console.error("Usage: ... _gift-max-5.ts <slug> [--apply]"); process.exit(1); }

async function main() {
  const { default: prisma } = await import("@/lib/db");
  const { grant, getBalance } = await import("@/lib/reward-ledger");
  const { isAccountCustomer } = await import("@/lib/reward-gifts");

  const r = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true, name: true, rewardsEnabled: true } });
  if (!r) { console.error(`No restaurant "${slug}".`); process.exit(1); }
  if (!r.rewardsEnabled) { console.error("Rewards OFF — aborting."); process.exit(1); }

  const already = await prisma.pendingRewardGrant.findFirst({
    where: { restaurantId: r.id, email: EMAIL, note: NOTE_MARKER },
    select: { id: true, status: true, amount: true },
  });
  if (already) { console.log(`✔ ALREADY GRANTED (${already.status}, $${already.amount.toFixed(2)}) — nothing to do`); return; }

  const existing = await prisma.customer.findFirst({
    where: { restaurantId: r.id, email: { equals: EMAIL, mode: "insensitive" } },
    orderBy: { passwordHash: { sort: "desc", nulls: "last" } },
    select: { id: true, name: true, passwordHash: true, customerAccountId: true, signedUpAt: true },
  });
  if (!existing || !isAccountCustomer(existing)) {
    console.error("Max is not an instant-wallet account customer — stop and use the admin Gift button instead.");
    process.exit(1);
  }
  const balBefore = await getBalance({ restaurantId: r.id, customerId: existing.id });
  console.log(`Customer: ${existing.name ?? NAME} <${EMAIL}> — balance $${balBefore.toFixed(2)}`);

  if (!APPLY) { console.log(`DRY RUN — would credit $${AMOUNT.toFixed(2)} → $${(balBefore + AMOUNT).toFixed(2)} (no email; Luigi tells him on Skool)`); return; }

  const gift = await prisma.pendingRewardGrant.create({
    data: {
      restaurantId: r.id, email: EMAIL, name: NAME, amount: AMOUNT, note: NOTE_MARKER,
      status: "claimed", claimedAt: new Date(), customerId: existing.id, createdBy: CREATED_BY,
    },
  });
  const res = await grant({
    restaurantId: r.id, customerId: existing.id, amount: AMOUNT,
    reason: "grant", note: `Gift: ${NOTE_MARKER}`, orderId: `gift:${gift.id}`,
  });
  if (!res.ok) {
    await prisma.pendingRewardGrant.delete({ where: { id: gift.id } }).catch(() => {});
    console.error("❌ CREDIT FAILED — nothing recorded");
    process.exit(1);
  }
  const balance = await getBalance({ restaurantId: r.id, customerId: existing.id });
  console.log(`✅ CREDITED $${AMOUNT.toFixed(2)} — balance now $${balance.toFixed(2)} (no email sent by design)`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
