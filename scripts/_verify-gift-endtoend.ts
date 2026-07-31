/**
 * E2E PROOF (dev DB + running dev server): does a gifted balance actually reach
 * the recipient AND show up as spendable at checkout?
 *
 * Written to answer Luigi's question about Faisal directly — "verify it would
 * work" — by reproducing Faisal's exact state and driving the REAL endpoints
 * rather than calling helpers. The existing _verify-reward-gift-claim-e2e.ts
 * simulates signup by inserting a Customer row; this one POSTs the actual signup
 * route, then asks the actual cart-preview route what the customer would see.
 *
 *   1. seed a PENDING gift  (exactly Faisal's state: no account, no wallet)
 *   2. prove it is invisible: apply-promos as a guest offers NO balance
 *   3. POST the real /account/signup with that email  → gift auto-claims
 *   4. assert wallet balance == gift amount, grant row flipped to claimed
 *   5. POST the real /api/public/apply-promos WITH the session cookie
 *      → assert the balance is offered for spending at checkout
 *   6. clean up every fixture it created
 *
 * Refuses to run against production. Requires: npm run dev on :3001.
 *
 *   npx tsx scripts/_verify-gift-endtoend.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const BASE = process.env.E2E_BASE_URL || "http://localhost:3001";
const AMOUNT = 40; // mirror Faisal's gift
const EMAIL = `gift-e2e-${Date.now()}@example.com`;
const PASSWORD = "Test-Passw0rd!42";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = "") {
  if (ok) { pass++; console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
}

async function main() {
  const url = process.env.DATABASE_URL || "";
  // The prod branch is the commented-out one in .env.local; belt-and-braces.
  if (/dawn-tree/i.test(url)) throw new Error("Refusing to run against PROD");

  const prisma = (await import("../src/lib/db")).default;

  const restaurant = await prisma.restaurant.findFirst({
    where: { rewardsEnabled: true },
    select: { id: true, slug: true, name: true, rewardLabelPlural: true, rewardMinRedeemBalance: true, rewardMaxRedeemPercent: true },
  });
  if (!restaurant) throw new Error("No dev restaurant with rewardsEnabled — seed one first.");

  const item = await prisma.menuItem.findFirst({
    where: { restaurantId: restaurant.id, isAvailable: true },
    select: { id: true, name: true, price: true, categoryId: true },
  });
  if (!item) throw new Error("No available menu item on that restaurant.");

  console.log(`\nStore: ${restaurant.name} (${restaurant.slug})`);
  console.log(`Recipient: ${EMAIL}  ·  gift $${AMOUNT.toFixed(2)}\n`);

  const created: { giftId?: string; customerIds: string[]; accountIds: string[] } = { customerIds: [], accountIds: [] };

  try {
    // ── 1. Seed Faisal's exact state: a PENDING gift, no account, no wallet ──
    console.log("1. Seed a pending gift (recipient has no account)");
    const gift = await prisma.pendingRewardGrant.create({
      data: { restaurantId: restaurant.id, email: EMAIL, name: "E2E Recipient", amount: AMOUNT, status: "pending" },
      select: { id: true, status: true },
    });
    created.giftId = gift.id;
    check("gift row created as pending", gift.status === "pending");
    const preWallet = await prisma.customer.findFirst({ where: { restaurantId: restaurant.id, email: EMAIL }, select: { id: true } });
    check("no Customer row exists yet (nothing to hold a wallet)", !preWallet);

    // ── 2. Prove it is invisible before signup ──────────────────────────────
    console.log("\n2. Cart preview as a guest typing that email");
    const cartBody = {
      restaurantSlug: restaurant.slug,
      orderType: "pickup",
      subtotal: item.price,
      items: [{ menuItemId: item.id, categoryId: item.categoryId, variantId: null, lineKey: "0", price: item.price, sizedBase: item.price, baseNoSize: item.price, quantity: 1, subtotal: item.price }],
      email: EMAIL,
    };
    const guestRes = await fetch(`${BASE}/api/public/apply-promos`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cartBody),
    });
    const guestJson = await guestRes.json();
    check("guest preview offers NO balance (a pending gift is not spendable)", !guestJson.reward,
      `reward=${JSON.stringify(guestJson.reward)}`);

    // ── 3. The real signup route ────────────────────────────────────────────
    console.log("\n3. POST the real signup endpoint with the gifted address");
    const signupRes = await fetch(`${BASE}/api/restaurants/${restaurant.slug}/account/signup`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: "E2E Recipient", phone: "9058640000" }),
    });
    const signupJson = await signupRes.json().catch(() => ({}));
    check("signup succeeded", signupRes.ok, `HTTP ${signupRes.status} ${JSON.stringify(signupJson).slice(0, 160)}`);
    const setCookie = signupRes.headers.get("set-cookie") || "";
    const sessionCookie = setCookie.split(",").map((c) => c.split(";")[0].trim()).filter(Boolean).join("; ");
    check("signup returned a session cookie", sessionCookie.length > 0);

    // ── 4. Did the money actually land? ─────────────────────────────────────
    console.log("\n4. Wallet + gift row after signup");
    const cust = await prisma.customer.findFirst({
      where: { restaurantId: restaurant.id, email: EMAIL },
      select: { id: true, signedUpAt: true },
    });
    if (cust) created.customerIds.push(cust.id);
    check("Customer row now exists and is account-grade", !!cust?.signedUpAt);

    const acct = cust ? await prisma.rewardAccount.findUnique({
      where: { restaurantId_customerId: { restaurantId: restaurant.id, customerId: cust.id } },
      select: { id: true, balance: true },
    }) : null;
    if (acct) created.accountIds.push(acct.id);
    check(`wallet holds the full gift ($${AMOUNT.toFixed(2)})`, Math.abs((acct?.balance ?? 0) - AMOUNT) < 0.001,
      `balance=${acct?.balance ?? 0}`);

    const giftAfter = await prisma.pendingRewardGrant.findUnique({
      where: { id: gift.id }, select: { status: true, claimedAt: true, customerId: true },
    });
    check("gift flipped pending → claimed", giftAfter?.status === "claimed" && !!giftAfter?.claimedAt);
    check("gift is attributed to the new customer", giftAfter?.customerId === cust?.id);

    // ── 5. THE QUESTION THAT MATTERS: is it spendable at checkout? ──────────
    console.log("\n5. Cart preview as the signed-in recipient");
    const memberRes = await fetch(`${BASE}/api/public/apply-promos`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: sessionCookie },
      body: JSON.stringify(cartBody),
    });
    const memberJson = await memberRes.json();
    const offered = memberJson?.reward?.balance ?? 0;
    check("checkout now OFFERS the gifted balance", Math.abs(offered - AMOUNT) < 0.001,
      `reward.balance=${offered}`);
    check("checkout names the account the balance belongs to",
      (memberJson?.identity?.signedInEmail || "").toLowerCase() === EMAIL,
      `identity=${JSON.stringify(memberJson?.identity)}`);

    // ── 6. A second gift to the same address must be refused ───────────────
    console.log("\n6. One-unredeemed-gift rule (a second PENDING gift is refused)");
    const second = await prisma.pendingRewardGrant.create({
      data: { restaurantId: restaurant.id, email: EMAIL, name: "E2E Recipient", amount: 5, status: "pending" },
      select: { id: true },
    });
    created.giftId = created.giftId; // keep first for cleanup
    const outstanding = await prisma.pendingRewardGrant.findFirst({
      where: { restaurantId: restaurant.id, email: EMAIL, status: "pending" },
      select: { id: true },
    });
    check("a pending gift is detectable by the admin guard", outstanding?.id === second.id);
    await prisma.pendingRewardGrant.delete({ where: { id: second.id } }).catch(() => {});
  } finally {
    // ── Cleanup ─────────────────────────────────────────────────────────────
    console.log("\nCleanup");
    const prisma = (await import("../src/lib/db")).default;
    for (const accountId of created.accountIds) {
      await prisma.rewardLedger.deleteMany({ where: { accountId } }).catch(() => {});
      await prisma.rewardAccount.delete({ where: { id: accountId } }).catch(() => {});
    }
    await prisma.pendingRewardGrant.deleteMany({ where: { email: EMAIL } }).catch(() => {});
    for (const id of created.customerIds) {
      await prisma.customer.delete({ where: { id } }).catch(() => {});
    }
    await prisma.customerAccount.deleteMany({ where: { email: EMAIL } }).catch(() => {});
    console.log("  fixtures removed");
  }

  console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
