/**
 * Re-send the 15 Skool-transfer emails FOR REAL.
 *
 * Why this exists: the --apply run executed under run-on-prod, where the email
 * transport loads the restaurant's SAVED (encrypted) Resend key from the PROD
 * DB — which cannot be decrypted with the local ENCRYPTION key, so every send
 * silently fell back to "[Email placeholder]" while still returning
 * success:true. The wallet credits and pending gifts all landed correctly;
 * only the notifications never left. This script re-sends them through the
 * env-key transport (dev context — the path that really delivered Luigi's two
 * samples), with the EXACT params the transfer used, including each credited
 * member's post-transfer balance. Touches no database rows.
 *
 *   ALLOW_DEV_EMAIL=1 npx tsx scripts/_resend-skool-transfer-emails.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const NOTE = "Skool voucher transfer (Apr-Jul 2026)";
const RESTAURANT = "Luigi's Lasagna & Pizzeria";
const REWARD_LABEL = "Luigi Buck’s"; // matches the prod label used in the apply run
const RESTAURANT_EMAIL = "info@luigislasagna.com";
const ORDER_URL = "https://www.luigislasagna.com/order/luigis-lasagna-pizzeria";
const SIGNUP_URL = "https://www.luigislasagna.com/order/luigis-lasagna-pizzeria/account/signup";

// Amounts/balances exactly as the 2026-08-01 --apply run printed them.
const INVITES = [
  { name: "Sadaf",     email: "sadafsheikhchaudhry@yahoo.ca",  amount: "$75.00" },
  { name: "Kenn",      email: "kmacfie@me.com",                amount: "$40.00" },
  { name: "Christina", email: "christina.forsyth@hotmail.com", amount: "$70.00" },
  { name: "John",      email: "rockpick101@gmail.com",         amount: "$60.00" },
  { name: "Ellie",     email: "elliemac126@hotmail.ca",        amount: "$60.00" },
];
const CREDITED = [
  { name: "Karen",  email: "karen.j.savich@gmail.com",   amount: "$60.00", balance: "$66.68" },
  { name: "Habib",  email: "estephan.habib@gmail.com",   amount: "$60.00", balance: "$75.00" },
  { name: "Robert", email: "robertquayson21@gmail.com",  amount: "$40.00", balance: "$47.60" },
  { name: "Matt",   email: "matt_white88@hotmail.com",   amount: "$20.00", balance: "$35.00" },
  { name: "David",  email: "lymandavid@hotmail.com",     amount: "$20.00", balance: "$35.00" },
  { name: "Max",    email: "maxrbilton@gmail.com",       amount: "$20.00", balance: "$35.00" },
  { name: "Usman",  email: "usman_20099@hotmail.com",    amount: "$20.00", balance: "$35.00" },
  { name: "Alex",   email: "alexgroz@hotmail.com",       amount: "$20.00", balance: "$35.00" },
  { name: "Zahra",  email: "kotadia@gmail.com",          amount: "$20.00", balance: "$35.00" },
  { name: "Robin",  email: "robinreadgriffin@gmail.com", amount: "$15.00", balance: "$41.55" },
];

async function main() {
  const { sendRewardGiftEmail, sendRewardGiftInviteEmail } = await import("../src/lib/email");
  let sent = 0, failed = 0;

  for (const p of INVITES) {
    const res = await sendRewardGiftInviteEmail({
      to: p.email, customerName: p.name, restaurantName: RESTAURANT,
      amountLabel: p.amount, rewardLabel: REWARD_LABEL, note: NOTE,
      orderUrl: SIGNUP_URL, restaurantEmail: RESTAURANT_EMAIL, locale: "en",
    }).catch((e) => ({ success: false, error: String(e) } as any));
    console.log(`  invite   ${p.name.padEnd(10)} ${p.amount.padStart(7)} → ${p.email}: ${res.success ? "SENT" : "FAILED"}`);
    res.success ? sent++ : failed++;
  }
  for (const p of CREDITED) {
    const res = await sendRewardGiftEmail({
      to: p.email, customerName: p.name, restaurantName: RESTAURANT,
      amountLabel: p.amount, rewardLabel: REWARD_LABEL, balanceLabel: p.balance, note: NOTE,
      orderUrl: ORDER_URL, restaurantEmail: RESTAURANT_EMAIL, locale: "en",
    }).catch((e) => ({ success: false, error: String(e) } as any));
    console.log(`  credited ${p.name.padEnd(10)} ${p.amount.padStart(7)} → ${p.email}: ${res.success ? "SENT" : "FAILED"}`);
    res.success ? sent++ : failed++;
  }
  console.log(`\n  ${sent} sent, ${failed} failed (of ${INVITES.length + CREDITED.length})`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
