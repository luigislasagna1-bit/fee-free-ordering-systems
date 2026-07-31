/**
 * Render the gift emails to HTML files so a human can actually LOOK at them.
 * Sends nothing, touches no database rows.
 *
 *   npx tsx scripts/_render-gift-email-sample.ts <outDir> [locale]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import fs from "node:fs";
import path from "node:path";

async function main() {
  const outDir = process.argv[2] || ".";
  const locale = process.argv[3] || "en";
  fs.mkdirSync(outDir, { recursive: true });

  const { renderEmail } = await import("../src/emails/render");
  const { getDict } = await import("../src/lib/i18n-dict");
  const RewardGiftInvite = (await import("../src/emails/templates/RewardGiftInvite")).default;
  const RewardGift = (await import("../src/emails/templates/RewardGift")).default;

  const t = await getDict(locale);
  const common = {
    customerName: "Faisal",
    restaurantName: "Luigi's Lasagna & Pizzeria",
    amountLabel: "$40.00",
    rewardLabel: "Luigi Buck's",
    note: "Sorry for the trouble — enjoy one on us!",
    giftEmail: "faisalzia@live.ca",
  };

  const inviteHtml = await renderEmail(
    RewardGiftInvite({
      t,
      ...common,
      orderUrl: "https://www.luigislasagna.com/order/luigis-lasagna-pizzeria/account/signup",
    }),
  );
  const invitePath = path.join(outDir, `gift-email-NO-ACCOUNT-${locale}.html`);
  fs.writeFileSync(invitePath, inviteHtml, "utf8");
  console.log("wrote", invitePath);

  const giftHtml = await renderEmail(
    RewardGift({
      t,
      ...common,
      balanceLabel: "$40.00",
      orderUrl: "https://www.luigislasagna.com/order/luigis-lasagna-pizzeria",
    }),
  );
  const giftPath = path.join(outDir, `gift-email-HAS-ACCOUNT-${locale}.html`);
  fs.writeFileSync(giftPath, giftHtml, "utf8");
  console.log("wrote", giftPath);
}

main().catch((e) => { console.error(e); process.exit(1); });
