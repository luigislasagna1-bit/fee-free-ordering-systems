/** DEV-ONLY: the SERVER must run the same shared-pool walk (2026-08-02).
 *  Three attacks against a pool-6 combo with DISJOINT pizza slots:
 *   1) both pizza children claim extrasFee 0 → server derives the pool math
 *   2) bundleItems REORDERED → same total (canonical slot order, review fix)
 *   3) unknown variantId on a sized pizza child → 400 (review fix)
 *    npx tsx scripts/_verify-pool-server.ts
 */
import { config as cfg } from "dotenv"; cfg({ path: ".env.local" }); cfg({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
const BASE = process.env.VERIFY_BASE_URL || "http://localhost:3001";
const SLUG = "demo-pizza-palace";

type Loaded = {
  id: string; name: string;
  variant: { id: string; name: string } | null;
  topOpt: { id: string; name: string; priceAdjustment: number };
  rate: number;
};

async function loadPizza(id: string, variantIdx: number): Promise<Loaded> {
  const it = await prisma.menuItem.findUnique({
    where: { id },
    select: {
      id: true, name: true, pizzaConfig: true,
      variants: { select: { id: true, name: true } },
      modifierGroups: { select: { id: true, libraryGroupId: true, options: { select: { id: true, name: true, priceAdjustment: true } } } },
      category: { select: { modifierGroups: { select: { id: true, libraryGroupId: true, options: { select: { id: true, name: true, priceAdjustment: true } } } } } },
    },
  });
  if (!it) throw new Error("pizza gone: " + id);
  const pc = JSON.parse(it.pizzaConfig!);
  const groups = [...it.modifierGroups, ...(it.category?.modifierGroups ?? [])];
  const tKeys = new Set((pc.toppingGroupIds ?? []).map(String));
  const tg = groups.find((g) => tKeys.has(g.id) || (g.libraryGroupId && tKeys.has(g.libraryGroupId)));
  if (!tg) throw new Error(`no topping group on ${it.name}`);
  const variant = it.variants[variantIdx] ?? it.variants[0] ?? null;
  const rate = (pc.variantToppingPrices?.[variant?.name ?? ""] ?? pc.extraToppingPrice) || tg.options[0].priceAdjustment;
  return { id: it.id, name: it.name, variant, topOpt: tg.options[0], rate };
}

function mkChild(p: Loaded, n: number, variantOverride?: { id: string; name: string }) {
  const v = variantOverride ?? p.variant;
  return {
    menuItemId: p.id, name: p.name, variantId: v?.id, variantName: v?.name,
    modifiers: Array.from({ length: n }, () => ({ modifierOptionId: p.topOpt.id, name: p.topOpt.name, priceAdjustment: p.topOpt.priceAdjustment })),
    extrasFee: 0, // the lie
    pizzaCustomization: { isHalfHalf: false, toppings: [] },
  };
}

async function main() {
  const combo = await prisma.menuItem.findFirst({
    where: { name: "TEST Double Pizza + 4 Pop Combo", restaurant: { slug: SLUG } },
    select: { id: true, price: true, comboConfig: true },
  });
  if (!combo) throw new Error("run _seed-test-combo.ts --pool 6 first");
  const comboCfg = JSON.parse(combo.comboConfig!);
  if (!(comboCfg.sharedToppings >= 1)) throw new Error("pool is OFF — re-seed with --pool 6");
  const drinkIds: string[] = comboCfg.slots[2].itemIds;
  const drinks = Array.from({ length: 4 }, (_, i) => ({ menuItemId: drinkIds[i % drinkIds.length], name: "pop" }));

  const pA = await loadPizza(comboCfg.slots[0].itemIds[0], 0); // slot 1's pizza
  const pB = await loadPizza(comboCfg.slots[1].itemIds[0], 1); // slot 2's pizza
  const disjoint = pA.id !== pB.id;
  console.log(`slot1: ${pA.name} (${pA.variant?.name}, rate $${pA.rate}) · slot2: ${pB.name} (${pB.variant?.name}, rate $${pB.rate}) · disjoint pools: ${disjoint}`);

  async function post(children: unknown[], label: string) {
    const res = await fetch(`${BASE}/api/orders`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurantSlug: SLUG,
        customerName: `Pool ${label}`, customerEmail: `pool-${label}@example.com`, customerPhone: "9055550177",
        type: "dine_in", paymentMethod: "cash",
        items: [{ isCombo: true, menuItemId: combo!.id, quantity: 1, price: combo!.price, subtotal: combo!.price, bundleItems: children }],
        subtotal: combo!.price, taxAmount: 0, deliveryFee: 0, tip: 0, total: combo!.price,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { status: res.status, data, line: null };
    const order = await prisma.order.findUnique({
      where: { id: data.id ?? data.orderId },
      select: { items: { select: { name: true, price: true, bundleItems: true } } },
    });
    return { status: res.status, data, line: order!.items.find((i) => /TEST Double/.test(i.name))! };
  }

  // 1) honest slot order, tampered fees: A=1 topping, B=6 → 7 vs pool 6 → 1 overage at B's rate.
  const honest = await post([mkChild(pA, 1), mkChild(pB, 6), ...drinks], "server");
  if (!honest.line) { console.log(`honest POST failed: ${honest.status} ${JSON.stringify(honest.data).slice(0, 200)}`); process.exit(1); }
  const kids = honest.line.bundleItems as Array<{ extrasFee?: number; modifiers?: Array<{ priceAdjustment?: number }> }>;
  const okPool = (kids[0].extrasFee ?? 0) === 0 && Math.abs((kids[1].extrasFee ?? 0) - pB.rate) < 0.011;
  console.log(`1) tampered fees → A: ${kids[0].extrasFee ?? 0} · B: ${kids[1].extrasFee ?? 0} (expect ${pB.rate}) · line ${honest.line.price}`);
  console.log(`   → ${okPool ? "PASS — server derived the pool walk" : "CHECK"}`);

  // 2) reordered bundleItems [B, A] — with disjoint pools the greedy slot
  //    assignment is order-independent, so canonical slot-major allocation
  //    must land on the SAME total.
  const flipped = await post([mkChild(pB, 6), mkChild(pA, 1), ...drinks], "reorder");
  if (!flipped.line) { console.log(`reorder POST failed: ${flipped.status}`); }
  else {
    const same = Math.abs(flipped.line.price - honest.line.price) < 0.011;
    console.log(`2) reordered → line ${flipped.line.price} (honest ${honest.line.price})`);
    console.log(`   → ${disjoint ? (same ? "PASS — order cannot shift the pool" : "FAIL — order-dependent pricing!") : "SKIPPED (overlapping pools — any order is honest)"}`);
  }

  // 3) unknown variantId on a sized pizza child → 400.
  const bad = await post([mkChild(pA, 2, { id: "zzz-not-a-variant", name: "XL" }), mkChild(pB, 0), ...drinks], "badvar");
  console.log(`3) unknown pizza variantId → HTTP ${bad.status} ${bad.status === 400 ? "PASS — rejected" : "FAIL — accepted!"}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
