/**
 * P1.1 data migration — bring existing Promotion rows onto the VISIBLE/HIDDEN model.
 *   - displayMode "popup" (retired) → "menu_visible".
 *   - HIDDEN rows (`hidden_coupon_only`) → force showOnBanner=false + autoApply=false
 *     (closes the latent banner-leak: a hidden promo could have showOnBanner=true).
 *   - HIDDEN rows with NO couponCode are unreachable → deactivate (isActive=false) + log.
 *
 * DRY RUN (read-only, default):  npx tsx scripts/run-on-prod.ts scripts/migrate-promo-display-mode.ts
 * APPLY (mutates):               APPLY=1 npx tsx scripts/run-on-prod.ts scripts/migrate-promo-display-mode.ts
 * Run against BOTH Neon branches at deploy (run-on-prod targets prod; also run on the dev branch).
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const APPLY = process.env.APPLY === "1";
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  console.log(`mode: ${APPLY ? "APPLY (mutating)" : "DRY RUN (read-only)"}\n`);

  const popup = await prisma.promotion.count({ where: { displayMode: "popup" } });
  const hiddenLeaky = await prisma.promotion.count({ where: { displayMode: "hidden_coupon_only", OR: [{ showOnBanner: true }, { autoApply: true }] } });
  const hiddenNoCode = await prisma.promotion.findMany({
    where: { displayMode: "hidden_coupon_only", isActive: true, OR: [{ couponCode: null }, { couponCode: "" }] },
    select: { id: true, name: true, restaurantId: true },
  });

  console.log(`popup → menu_visible:                 ${popup}`);
  console.log(`hidden rows w/ banner|autoApply on:   ${hiddenLeaky}  (→ force off)`);
  console.log(`hidden rows w/ NO couponCode (active): ${hiddenNoCode.length}  (→ deactivate)`);
  if (hiddenNoCode.length) console.log("  " + hiddenNoCode.map((p: any) => `${p.id} "${p.name}"`).join("\n  "));

  if (APPLY) {
    const a = await prisma.promotion.updateMany({ where: { displayMode: "popup" }, data: { displayMode: "menu_visible" } });
    const b = await prisma.promotion.updateMany({ where: { displayMode: "hidden_coupon_only" }, data: { showOnBanner: false, autoApply: false } });
    let c = 0;
    if (hiddenNoCode.length) {
      const r = await prisma.promotion.updateMany({ where: { id: { in: hiddenNoCode.map((p: any) => p.id) } }, data: { isActive: false } });
      c = r.count;
    }
    console.log(`\nAPPLIED: popup=${a.count}  hidden-coerced=${b.count}  deactivated=${c}`);
  } else {
    console.log("\n(dry run — nothing changed; re-run with APPLY=1 to mutate)");
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
