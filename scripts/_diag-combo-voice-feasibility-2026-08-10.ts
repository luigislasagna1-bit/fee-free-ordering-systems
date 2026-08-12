/**
 * READ-ONLY: could Nabil actually SELL the combos, or is the pizza builder the
 * only genuinely hard case? Breaks the "transfer-only" items into:
 *   - pizza-builder items (half/half + topping pools — genuinely hard)
 *   - combos whose slots are plain item picks (voice-feasible)
 *   - combos that contain a pizza child (hard, inherits the builder problem)
 *   npx tsx scripts/run-on-prod.ts scripts/_diag-combo-voice-feasibility-2026-08-10.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SLUG = process.argv[2] || "luigis-lasagna-pizzeria";

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const r = await prisma.restaurant.findFirst({ where: { slug: SLUG }, select: { id: true, name: true } });
  if (!r) return;

  const items = await prisma.menuItem.findMany({
    where: { restaurantId: r.id, isAvailable: true },
    select: { id: true, name: true, price: true, pizzaConfig: true, comboConfig: true, categoryId: true },
  });
  const byId = new Map(items.map((i) => [i.id, i]));
  const isPizzaItem = (id: string) => !!byId.get(id)?.pizzaConfig;

  const pizzas = items.filter((i) => i.pizzaConfig && !i.comboConfig);
  const combos = items.filter((i) => i.comboConfig);

  console.log(`restaurant: ${r.name}`);
  console.log(`pizza-builder items: ${pizzas.length}`);
  console.log(`combo items: ${combos.length}\n`);

  let simple = 0;
  let withPizza = 0;
  for (const c of combos) {
    let cfg: any = c.comboConfig;
    if (typeof cfg === "string") { try { cfg = JSON.parse(cfg); } catch { cfg = null; } }
    const slots: any[] = Array.isArray(cfg?.slots) ? cfg.slots : [];

    // Does any slot admit a pizza-builder item? Slots list itemIds and/or categoryIds.
    let pizzaCapable = false;
    const slotDesc: string[] = [];
    for (const s of slots) {
      const ids: string[] = [
        ...(Array.isArray(s.itemIds) ? s.itemIds : []),
        ...(Array.isArray(s.menuItemIds) ? s.menuItemIds : []),
      ];
      const cats: string[] = Array.isArray(s.categoryIds) ? s.categoryIds : [];
      const catItems = cats.length ? items.filter((i) => i.categoryId && cats.includes(i.categoryId)) : [];
      const choices = [...ids.map((id) => byId.get(id)).filter(Boolean), ...catItems] as typeof items;
      if (choices.some((ch) => !!ch.pizzaConfig)) pizzaCapable = true;
      slotDesc.push(`${s.name ?? "slot"}(${choices.length} choices${choices.some((c2) => !!c2.pizzaConfig) ? ", incl PIZZA" : ""})`);
    }
    if (pizzaCapable) withPizza++; else simple++;
    console.log(`  ${pizzaCapable ? "HARD" : "OK  "}  ${c.name} — ${slots.length} slots: ${slotDesc.join(" | ") || "(no slots configured)"}`);
  }

  console.log(`\nVOICE-FEASIBLE combos (plain item picks): ${simple}`);
  console.log(`HARD combos (a slot admits a pizza builder): ${withPizza}`);
  console.log(`HARD standalone pizza builders: ${pizzas.length}`);
  console.log(`\nWhat /api/orders needs per combo: menuItemId (parent) + children [{menuItemId, variantId?}].`);
  console.log(`Slot assignment, eligibility, size defaults and ALL pricing are server-side already.`);
  void isPizzaItem;
}

main().catch((e) => { console.error(e); process.exit(1); });
