import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
(async () => {
  const p: any = await prisma.promotion.findUnique({ where: { id: "cmr5hkbzz000070vhiz71osno" }, select: { ruleConfig: true, rules: true } });
  let rc: any = p?.ruleConfig;
  if (typeof rc === "string") rc = JSON.parse(rc);
  if (!rc) rc = JSON.parse(p?.rules ?? "{}");
  const groups = [...(rc?.groups ?? []), ...(rc?.itemGroups ?? [])];
  console.log(JSON.stringify(groups.map((g: any) => ({ name: g.name, itemIds: (g.itemIds ?? g.menuItemIds ?? []).length, categoryIds: (g.categoryIds ?? []).length }))));
  await prisma.$disconnect();
})();
