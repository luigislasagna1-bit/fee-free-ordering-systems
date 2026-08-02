/** DEV-ONLY: prove the combo pizza-child money hole is CLOSED (2026-08-02).
 *  Posts real /api/orders combo checkouts with TAMPERED extrasFee values and
 *  reads back what the server actually charged/stored.
 *    A) underpay: paid toppings but claims extrasFee 0  → server charges anyway
 *    B) overpay-junk: no toppings, claims extrasFee 99  → server derives 0
 *    npx tsx scripts/_verify-combo-pricing.ts
 */
import { config as cfg } from "dotenv"; cfg({ path: ".env.local" }); cfg({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
const BASE = process.env.VERIFY_BASE_URL || "http://localhost:3001";
const SLUG = "demo-pizza-palace";

async function main() {
  const combo = await prisma.menuItem.findFirst({
    where: { name: "TEST Double Pizza + 4 Pop Combo", restaurant: { slug: SLUG } },
    select: { id: true, price: true, comboConfig: true },
  });
  if (!combo) { console.error("run _seed-test-combo.ts first"); process.exit(1); }
  const comboCfg = JSON.parse(combo.comboConfig!);
  const pizzaId: string = comboCfg.slots[0].itemIds[0];
  const drinkIds: string[] = comboCfg.slots[2].itemIds;

  const pizza = await prisma.menuItem.findUnique({
    where: { id: pizzaId },
    select: {
      id: true, name: true, price: true, pizzaConfig: true,
      variants: { select: { id: true, name: true, price: true } },
      modifierGroups: { select: { id: true, libraryGroupId: true, name: true, options: { select: { id: true, name: true, priceAdjustment: true } } } },
      category: { select: { modifierGroups: { select: { id: true, libraryGroupId: true, name: true, options: { select: { id: true, name: true, priceAdjustment: true } } } } } },
    },
  });
  if (!pizza) throw new Error("pizza item gone");
  const pc = JSON.parse(pizza.pizzaConfig!);
  const groups = [...pizza.modifierGroups, ...(pizza.category?.modifierGroups ?? [])];
  const toppingKeys = new Set((pc.toppingGroupIds ?? []).map(String));
  const toppingGroup = groups.find((g) => toppingKeys.has(g.id) || (g.libraryGroupId && toppingKeys.has(g.libraryGroupId)));
  if (!toppingGroup) throw new Error("no topping group resolved");
  const paidTopping = toppingGroup.options.find((o) => o.priceAdjustment > 0) ?? toppingGroup.options[0];
  const variant = pizza.variants[0] ?? null;
  const flat = (pc.variantToppingPrices?.[variant?.name ?? ""] ?? pc.extraToppingPrice) || 0;
  const included = Number(pc.includedToppings) || 0;
  console.log(`pizza "${pizza.name}" variant ${variant?.name ?? "-"} · flat $${flat} · included ${included} · topping "${paidTopping.name}" ($${paidTopping.priceAdjustment})`);

  // Enough topping LINES to exceed any included allowance: included + 2 wholes.
  const nWholes = included + 2;
  const toppingMods = Array.from({ length: nWholes }, () => ({
    modifierOptionId: paidTopping.id, name: paidTopping.name, priceAdjustment: paidTopping.priceAdjustment,
  }));
  const mkChild = (mods: unknown[], lieFee: number) => ({
    menuItemId: pizza.id, name: pizza.name,
    variantId: variant?.id, variantName: variant?.name,
    modifiers: mods, extrasFee: lieFee,
    pizzaCustomization: { isHalfHalf: false, toppings: [] }, // marks it a pizza build
  });
  const drinks = Array.from({ length: 4 }, (_, i) => ({ menuItemId: drinkIds[i % drinkIds.length], name: "pop" }));

  async function post(children: unknown[], label: string) {
    const res = await fetch(`${BASE}/api/orders`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantSlug: SLUG,
        customerName: "Combo Tamper", customerEmail: `combo-tamper-${label}@example.com`, customerPhone: "9055550188",
        type: "dine_in", paymentMethod: "cash",
        items: [{ isCombo: true, menuItemId: combo!.id, quantity: 1, price: combo!.price, subtotal: combo!.price, bundleItems: children }],
        subtotal: combo!.price, taxAmount: 0, deliveryFee: 0, tip: 0, total: combo!.price,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { console.log(`${label}: HTTP ${res.status} ${JSON.stringify(data).slice(0, 200)}`); return null; }
    const order = await prisma.order.findUnique({
      where: { id: data.id ?? data.orderId },
      select: { subtotal: true, items: { select: { name: true, price: true, bundleItems: true } } },
    });
    return order;
  }

  // A) UNDERPAY: included+2 paid topping lines, claims extrasFee 0.
  const a = await post([mkChild(toppingMods, 0), mkChild([], 0), ...drinks], "underpay");
  if (a) {
    const line = a.items.find((i) => /TEST Double/.test(i.name))!;
    const kids = line.bundleItems as Array<{ name: string; extrasFee?: number; modifiers?: Array<{ priceAdjustment?: number }> }>;
    const pz = kids[0];
    const expectExtra = 2 * (flat > 0 ? flat : paidTopping.priceAdjustment); // 2 beyond allowance
    console.log(`A) underpay  → combo line price ${line.price} (base ${combo.price})`);
    console.log(`   server-derived extrasFee on pizza 1: ${pz.extrasFee ?? 0} (expected ≈ ${expectExtra})`);
    console.log(`   display charges: [${(pz.modifiers ?? []).map((m) => m.priceAdjustment ?? 0).join(", ")}]`);
    console.log(`   → ${Math.abs((pz.extrasFee ?? 0) - expectExtra) < 0.011 && line.price > combo.price ? "PASS — tampered 0 ignored, server charged" : "CHECK MANUALLY"}`);
  }

  // B) OVERPAY-JUNK: clean pizzas, claims extrasFee 99 each.
  const b = await post([mkChild([], 99), mkChild([], 99), ...drinks], "overpay");
  if (b) {
    const line = b.items.find((i) => /TEST Double/.test(i.name))!;
    const kids = line.bundleItems as Array<{ extrasFee?: number }>;
    console.log(`B) overpay   → combo line price ${line.price} (base ${combo.price})`);
    console.log(`   stored extrasFees: [${kids.slice(0, 2).map((k) => k.extrasFee ?? 0).join(", ")}]`);
    // Symmetric-mode note: an under-included bare pizza can legitimately derive
    // a small negative→clamped-0 credit; the point is the 99 is GONE.
    console.log(`   → ${line.price <= combo.price + 0.01 ? "PASS — fabricated $99 fees ignored" : "FAIL — client fee leaked into the charge"}`);
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
