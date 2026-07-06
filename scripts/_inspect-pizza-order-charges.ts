/** READ-ONLY prod: recent pizza order lines on Luigi's live store — what was
 *  actually charged per topping vs the builder's engine model. */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  const rest = await prisma.restaurant.findFirst({ where: { slug: "luigis-lasagna-pizzeria" }, select: { id: true } });
  const items = await prisma.orderItem.findMany({
    where: {
      order: { restaurantId: rest!.id },
      OR: [{ name: { contains: "Pizza", mode: "insensitive" } }, { name: { contains: "PARTY", mode: "insensitive" } }],
    },
    orderBy: { id: "desc" },
    take: 6,
    select: { name: true, price: true, modifiers: true, order: { select: { orderNumber: true, createdAt: true } } },
  });
  for (const it of items) {
    let mods: any[] = [];
    try { mods = typeof it.modifiers === "string" ? JSON.parse(it.modifiers) : (it.modifiers as any[]) ?? []; } catch { /* */ }
    const modsStr = mods.map((m: any) => `${m.name}=$${m.priceAdjustment}`).join(" | ");
    console.log(`#${it.order.orderNumber} ${it.order.createdAt.toISOString().slice(0, 10)} ${it.name} unit=$${it.price}\n   mods: ${modsStr || "(none)"}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
