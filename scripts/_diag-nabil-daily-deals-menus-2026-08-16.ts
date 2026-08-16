import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
config({ path: ".env.local" });
function prodUrl(): string { const env = readFileSync(".env.local","utf8"); let url: string|null=null; for (const line of env.split(/\r?\n/)) { const m=line.match(/^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/); if (m) url=m[1]; } if(!url) throw new Error("no prod url"); return url; }
async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: prodUrl() }) } as any);
  const rid = "cmp7xhd3900000al2jz0db5vi";
  const menus = await prisma.menu.findMany({ where: { restaurantId: rid }, select: { id: true, name: true, isActive: true, isArchived: true, publishedAt: true, availableDays: true, availableFrom: true, availableTo: true, availableWindows: true, createdAt: true } , orderBy: { createdAt: "asc" } });
  console.log("MENUS:"); for (const m of menus) console.log(" ", JSON.stringify(m));
  const cats = await prisma.menuCategory.findMany({ where: { restaurantId: rid, name: { contains: "Daily", mode: "insensitive" } }, select: { id: true, name: true, menuId: true, isActive: true, createdAt: true, menuItems: { select: { id: true, name: true, price: true, isAvailable: true, fulfilDays: true, createdAt: true }, orderBy: { sortOrder: "asc" } } } });
  console.log("CATEGORIES named *Daily*:");
  for (const c of cats) { console.log(`  cat ${c.id} "${c.name}" menuId=${c.menuId} isActive=${c.isActive} created=${c.createdAt.toISOString()}`); for (const it of c.menuItems) console.log(`     - ${it.name} $${it.price} avail=${it.isAvailable} fulfilDays=${it.fulfilDays ?? "null"} id=${it.id} created=${it.createdAt.toISOString().slice(0,10)}`); }
  const it = await prisma.menuItem.findUnique({ where: { id: "cmrbkzq9d000204juybtnnw41" }, select: { id: true, name: true, categoryId: true, menuId: true, isAvailable: true, isActive: true, deletedAt: true } as any });
  console.log("STRAY ITEM:", JSON.stringify(it));
  await prisma.$disconnect();
}
main();
