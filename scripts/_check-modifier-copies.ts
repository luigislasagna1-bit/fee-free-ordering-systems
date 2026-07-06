/** DEV: show a library group + its attached copies' options (sync check). */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const name = process.argv.slice(2).find((a) => !a.endsWith(".ts")) || "Toppings";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) } as any);
  const matches = await prisma.modifierGroup.findMany({
    where: { name: { contains: name, mode: "insensitive" }, restaurantId: { not: null }, menuItemId: null, categoryId: null },
    select: { id: true, name: true, _count: { select: { options: true } }, restaurant: { select: { name: true } } },
  });
  console.log("MATCHES:", JSON.stringify(matches.map((m: any) => ({ id: m.id, name: m.name, options: m._count.options, restaurant: m.restaurant?.name }))));
  const exact = matches.find((m: any) => m.name.toUpperCase() === name.toUpperCase());
  // A cuid-looking arg = direct id lookup (run-on-prod splits quoted args).
  const byId = /^c[a-z0-9]{20,}$/.test(name) ? name : null;
  const lib = await prisma.modifierGroup.findFirst({
    where: { id: byId ?? (exact ?? matches[0])?.id ?? "-" },
    include: { options: { orderBy: { sortOrder: "asc" } } },
  });
  if (!lib) { console.log("library group not found"); return; }
  console.log(`USING "${lib.name}"`);
  console.log(`LIBRARY ${lib.id}:`, lib.options.map((o: any) => `${o.name}@${o.priceAdjustment}`).join(", "));
  const copies = await prisma.modifierGroup.findMany({
    where: { libraryGroupId: lib.id },
    include: { options: { orderBy: { sortOrder: "asc" } } },
  });
  for (const c of copies) {
    console.log(`COPY ${c.id} (${c.menuItemId ? "item" : "category"}):`, c.options.map((o: any) => `${o.name}@${o.priceAdjustment}`).join(", "));
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
