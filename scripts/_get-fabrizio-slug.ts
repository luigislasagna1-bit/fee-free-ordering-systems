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
  const r = await prisma.restaurant.findUnique({ where: { id: "cmp8jt0kq00000ajshmrhtt3t" }, select: { slug: true, name: true } });
  console.log("SLUG", JSON.stringify(r));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
