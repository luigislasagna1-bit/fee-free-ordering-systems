/**
 * Send ONE of each Skool-transfer email (invite + credited) to Luigi's own
 * inbox so he can see them as real delivered emails before the transfer runs.
 * Touches no database rows.
 *
 *   npx tsx scripts/_send-skool-email-samples.ts <toEmail>
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const to = process.argv[2];
  if (!to) { console.error("Usage: ... _send-skool-email-samples.ts <toEmail>"); process.exit(1); }

  const { sendRewardGiftEmail, sendRewardGiftInviteEmail } = await import("../src/lib/email");
  const note = "Skool voucher transfer (Apr-Jul 2026)";
  const restaurantName = "Luigi's Lasagna & Pizzeria";
  const rewardLabel = "Luigi Buck's";
  const restaurantEmail = "info@luigislasagna.com";

  const invite = await sendRewardGiftInviteEmail({
    to, customerName: "Sadaf", restaurantName, rewardLabel, note,
    amountLabel: "$75.00",
    orderUrl: "https://www.luigislasagna.com/order/luigis-lasagna-pizzeria/account/signup",
    restaurantEmail, locale: "en",
  });
  console.log(`invite (no-account) sample → ${to}: ${invite.success ? "SENT" : `FAILED: ${JSON.stringify(invite)}`}`);

  const gift = await sendRewardGiftEmail({
    to, customerName: "Habib", restaurantName, rewardLabel, note,
    amountLabel: "$60.00", balanceLabel: "$75.00",
    orderUrl: "https://www.luigislasagna.com/order/luigis-lasagna-pizzeria",
    restaurantEmail, locale: "en",
  });
  console.log(`credited (has-account) sample → ${to}: ${gift.success ? "SENT" : `FAILED: ${JSON.stringify(gift)}`}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
