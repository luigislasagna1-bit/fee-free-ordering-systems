/**
 * E2E PROOF (dev DB + running dev server): does an ADVERTISED promo actually
 * apply when the customer does what its email told them to do?
 *
 * Luigi's bar, 2026-07-31: "any special advertised or promo given needs to work
 * when the customer tries it. They need clear instructions and it should never
 * fail." Reading the engine is not enough — this drives the REAL cart-preview
 * endpoint as an anonymous guest and asserts what actually comes back.
 *
 * Each case maps to a row of the table the customer is shown:
 *
 *   A. VIP promo targeted at an EMAIL, Client type "any"      -> MUST apply
 *   B. the same promo with Client type "member"               -> MUST NOT apply
 *      (this is the silent trap: the VIP email used to promise it would)
 *   C. VIP promo targeted at a GROUP the email belongs to     -> MUST apply
 *   D. an untargeted stranger's address                       -> MUST NOT apply
 *   E. Reward Dollars balance for a guest                     -> MUST NOT be offered
 *
 * Refuses to run against production and deletes every fixture it creates.
 *
 *   npx tsx scripts/_verify-promo-redemption-e2e.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const BASE = process.env.E2E_BASE_URL || "http://localhost:3001";
const STAMP = Date.now();
const TARGET_EMAIL = `promo-e2e-${STAMP}@example.com`;
const STRANGER_EMAIL = `promo-e2e-stranger-${STAMP}@example.com`;

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = "") {
  if (ok) { pass++; console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`); }
}

async function main() {
  if (/dawn-tree/i.test(process.env.DATABASE_URL || "")) throw new Error("Refusing to run against PROD");
  const prisma = (await import("../src/lib/db")).default;

  const restaurant = await prisma.restaurant.findFirst({
    where: { rewardsEnabled: true },
    select: { id: true, slug: true, name: true },
  });
  if (!restaurant) throw new Error("No dev restaurant with rewardsEnabled");
  const item = await prisma.menuItem.findFirst({
    where: { restaurantId: restaurant.id, isAvailable: true },
    select: { id: true, name: true, price: true, categoryId: true },
  });
  if (!item) throw new Error("No available menu item");

  console.log(`\nStore: ${restaurant.name} (${restaurant.slug})`);
  console.log(`Item : ${item.name} @ ${item.price}`);
  console.log(`Guest: ${TARGET_EMAIL}\n`);

  const madePromos: string[] = [];
  const madeGroups: string[] = [];

  /** Cart preview exactly as the ordering page sends it — anonymous, no cookie. */
  async function previewAsGuest(email: string) {
    const res = await fetch(`${BASE}/api/public/apply-promos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        restaurantSlug: restaurant!.slug,
        orderType: "pickup",
        subtotal: item!.price,
        items: [{
          menuItemId: item!.id, categoryId: item!.categoryId, variantId: null, lineKey: "0",
          price: item!.price, sizedBase: item!.price, baseNoSize: item!.price,
          quantity: 1, subtotal: item!.price,
        }],
        email,
      }),
    });
    return res.json();
  }

  const namesApplied = (j: any) => ((j?.applied ?? []) as any[]).map((p) => p.name);

  try {
    // ── A. VIP promo targeted at the EMAIL, Client type "any" ───────────────
    console.log("A. VIP promo targeted at the email, Client type = Any");
    const promoAny = await prisma.promotion.create({
      data: {
        restaurantId: restaurant.id,
        name: `E2E VIP any ${STAMP}`,
        promotionType: "percentage_off",
        ruleConfig: { discountPercent: 25 },
        customerType: "any",
        isActive: true,
        autoApply: true,
        displayMode: "menu_visible",
      },
      select: { id: true, name: true },
    });
    madePromos.push(promoAny.id);
    await prisma.customerGroupPromotion.create({
      data: { promotionId: promoAny.id, restaurantId: restaurant.id, email: TARGET_EMAIL },
    });

    let j = await previewAsGuest(TARGET_EMAIL);
    check("guest typing the targeted email GETS the VIP discount",
      namesApplied(j).includes(promoAny.name),
      `applied=[${namesApplied(j).join(" | ")}] discount=${j.totalDiscount}`);

    // ── D. a stranger must NOT get it ───────────────────────────────────────
    console.log("\nD. A different (untargeted) address");
    j = await previewAsGuest(STRANGER_EMAIL);
    check("an untargeted address does NOT get the VIP discount",
      !namesApplied(j).includes(promoAny.name),
      `applied=[${namesApplied(j).join(" | ")}]`);

    // ── B. the SAME promo flipped to "Members only" ─────────────────────────
    console.log("\nB. The same promo switched to Client type = Members only");
    await prisma.promotion.update({ where: { id: promoAny.id }, data: { customerType: "member" } });
    j = await previewAsGuest(TARGET_EMAIL);
    const stillApplies = namesApplied(j).includes(promoAny.name);
    check("Members-only DOES refuse a guest who only types their email (the trap is real)",
      !stillApplies,
      stillApplies ? "it applied — the trap does NOT exist and the email copy fix was unnecessary"
                   : "refused, exactly as the corrected email now warns");
    // put it back so case C isn't polluted
    await prisma.promotion.update({ where: { id: promoAny.id }, data: { customerType: "any" } });

    // ── C. targeted via GROUP membership rather than a direct email link ────
    console.log("\nC. VIP promo targeted at a GROUP the address belongs to");
    const group = await prisma.customerGroup.create({
      data: { restaurantId: restaurant.id, name: `E2E group ${STAMP}` },
      select: { id: true },
    });
    madeGroups.push(group.id);
    await prisma.customerGroupMember.create({
      data: { groupId: group.id, restaurantId: restaurant.id, email: TARGET_EMAIL, name: "E2E Member" },
    });
    const promoGroup = await prisma.promotion.create({
      data: {
        restaurantId: restaurant.id,
        name: `E2E VIP group ${STAMP}`,
        promotionType: "percentage_off",
        ruleConfig: { discountPercent: 15 },
        customerType: "any",
        isActive: true,
        autoApply: true,
        displayMode: "menu_visible",
      },
      select: { id: true, name: true },
    });
    madePromos.push(promoGroup.id);
    await prisma.customerGroupPromotion.create({
      data: { promotionId: promoGroup.id, restaurantId: restaurant.id, groupId: group.id },
    });

    j = await previewAsGuest(TARGET_EMAIL);
    check("group membership by email ALSO unlocks the deal for a guest",
      namesApplied(j).includes(promoGroup.name),
      `applied=[${namesApplied(j).join(" | ")}]`);

    // ── E. wallet stays invisible to a guest ────────────────────────────────
    console.log("\nE. Reward Dollars for a guest");
    check("no wallet balance is offered to a guest (stored value needs a session)",
      !j.reward, `reward=${JSON.stringify(j.reward)}`);
  } finally {
    console.log("\nCleanup");
    const prisma2 = (await import("../src/lib/db")).default;
    await prisma2.customerGroupPromotion.deleteMany({ where: { promotionId: { in: madePromos } } }).catch(() => {});
    await prisma2.promotion.deleteMany({ where: { id: { in: madePromos } } }).catch(() => {});
    await prisma2.customerGroupMember.deleteMany({ where: { groupId: { in: madeGroups } } }).catch(() => {});
    await prisma2.customerGroup.deleteMany({ where: { id: { in: madeGroups } } }).catch(() => {});
    console.log("  fixtures removed");
  }

  console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
