/**
 * Render the VIP member-deal email to HTML so the copy can be reviewed by a
 * human before it reaches a customer. Sends nothing, touches no rows.
 *
 *   npx tsx scripts/_render-vip-email-sample.ts <outFile> [locale]
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import fs from "node:fs";

async function main() {
  const out = process.argv[2] || "vip-deal.html";
  const locale = process.argv[3] || "en";

  const { renderEmail } = await import("../src/emails/render");
  const { getDict } = await import("../src/lib/i18n-dict");
  const CouponAssigned = (await import("../src/emails/templates/CouponAssigned")).default;

  const t = await getDict(locale);
  const html = await renderEmail(
    CouponAssigned({
      t,
      customerName: "Sam",
      restaurantName: "Luigi's Lasagna & Pizzeria",
      code: "",
      discountLabel: "20% off",
      // The promo's OWN title — previously dropped for % and $ deals.
      dealName: "20% OFF Menu Wide - VIP MEMBERS",
      description: "Additional 20% OFF all SPECIALS / DAILY DEALS",
      termLines: [],
      memberSpecial: true,
      introOverride: t("email.vipSpecial.intro", {
        memberLabel: "VIP Member",
        restaurantName: "Luigi's Lasagna & Pizzeria",
        discountLabel: "20% off",
      }),
      usageNote: t("email.vipSpecial.usageGuest", {
        discountLabel: "20% off",
        email: "samsrestaurantsystems@gmail.com",
      }),
      accountTip: t("email.vipSpecial.accountTip"),
      orderUrl: "https://www.luigislasagna.com/order/luigis-lasagna-pizzeria",
    } as any),
  );
  fs.writeFileSync(out, html, "utf8");
  console.log("wrote", out);
}

main().catch((e) => { console.error(e); process.exit(1); });
