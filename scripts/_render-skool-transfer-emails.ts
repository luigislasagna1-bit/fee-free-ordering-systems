/**
 * Render the two emails the Skool credit transfer will send, with the
 * transfer's real data, so Luigi can eyeball them before --apply.
 * Sends nothing, touches no database rows.
 *
 *   npx tsx scripts/_render-skool-transfer-emails.ts <outDir>
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import fs from "node:fs";
import path from "node:path";

async function main() {
  const outDir = process.argv[2] || ".";
  fs.mkdirSync(outDir, { recursive: true });

  const { renderEmail } = await import("../src/emails/render");
  const { getDict } = await import("../src/lib/i18n-dict");
  const RewardGiftInvite = (await import("../src/emails/templates/RewardGiftInvite")).default;
  const RewardGift = (await import("../src/emails/templates/RewardGift")).default;

  const t = await getDict("en");
  const note = "Skool voucher transfer (Apr-Jul 2026)";
  const restaurantName = "Luigi's Lasagna & Pizzeria";
  const rewardLabel = "Luigi Buck's";

  // No-account member (e.g. Sadaf $75): the sign-up teaching email.
  const inviteHtml = await renderEmail(
    RewardGiftInvite({
      t, customerName: "Sadaf", restaurantName, rewardLabel, note,
      amountLabel: "$75.00", giftEmail: "sadafsheikhchaudhry@yahoo.ca",
      orderUrl: "https://www.luigislasagna.com/order/luigis-lasagna-pizzeria/account/signup",
    }),
  );
  const invitePath = path.join(outDir, "skool-transfer-email-NO-ACCOUNT-sadaf.html");
  fs.writeFileSync(invitePath, inviteHtml, "utf8");
  console.log("wrote", invitePath);

  // Account holder (e.g. Habib $60 on top of his $15): instant-credit email.
  const giftHtml = await renderEmail(
    RewardGift({
      t, customerName: "Habib", restaurantName, rewardLabel, note,
      amountLabel: "$60.00", balanceLabel: "$75.00", giftEmail: "estephan.habib@gmail.com",
      orderUrl: "https://www.luigislasagna.com/order/luigis-lasagna-pizzeria",
    }),
  );
  const giftPath = path.join(outDir, "skool-transfer-email-HAS-ACCOUNT-habib.html");
  fs.writeFileSync(giftPath, giftHtml, "utf8");
  console.log("wrote", giftPath);
}

main().catch((e) => { console.error(e); process.exit(1); });
