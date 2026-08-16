import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
config({ path: ".env.local" });
function prodUrl(): string { const env = readFileSync(".env.local","utf8"); let url: string|null=null; for (const line of env.split(/\r?\n/)) { const m=line.match(/^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/); if (m) url=m[1]; } if(!url) throw new Error("no prod url"); return url; }
async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: prodUrl() }) } as any);
  const cat = await prisma.menuCategory.findUnique({ where: { id: "cmr6yztsk000004if40on972s" }, include: { menuItems: { orderBy: { sortOrder: "asc" } } } });
  console.log(`Category "${cat?.name}" (${cat?.id}) createdAt=${cat?.createdAt?.toISOString()} isActive=${(cat as any)?.isActive} sortOrder=${cat?.sortOrder}`);
  for (const it of cat?.menuItems ?? []) console.log(` - ${it.name} $${it.price} avail=${it.isAvailable} soldOut=${it.isSoldOut} fulfilDays=${it.fulfilDays ?? "null"} created=${it.createdAt.toISOString()} updated=${it.updatedAt.toISOString()} id=${it.id} desc=${JSON.stringify((it.description||"").slice(0,80))}`);
  const deals = await prisma.menuItemDeal.findMany({ where: { restaurantId: cat!.restaurantId }, include: { dealItem: true, standardItem: true } });
  console.log(`MenuItemDeal rows: ${deals.length}`);
  for (const d of deals) console.log(` - active=${d.active} standard="${d.standardItem?.name}" ← deal="${d.dealItem?.name}" (deal fulfilDays=${d.dealItem?.fulfilDays})`);
  await prisma.$disconnect();
}
main();
