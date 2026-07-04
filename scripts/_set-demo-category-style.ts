/** Dev-only: set demo-pizza-palace theme showCategoryImages + categoryNoImageStyle.
 *  npx tsx scripts/_set-demo-category-style.ts <on|off> <band|plain|button|modern> */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const images = process.argv[2] !== "off";
  const style = process.argv[3] ?? "plain";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) } as any);
  const r = await prisma.restaurant.findUnique({ where: { slug: "demo-pizza-palace" }, select: { id: true, themeSettings: true } });
  if (!r) throw new Error("demo not found");
  const t = r.themeSettings ? JSON.parse(r.themeSettings) : {};
  t.showCategoryImages = images;
  t.categoryNoImageStyle = style;
  await prisma.restaurant.update({ where: { id: r.id }, data: { themeSettings: JSON.stringify(t) } });
  console.log(`✓ demo theme: showCategoryImages=${images}, categoryNoImageStyle=${style}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
