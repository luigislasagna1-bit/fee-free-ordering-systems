import { config } from "dotenv";
config({ path: ".env.local" }); config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";
async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const p = new PrismaClient({ adapter } as any);
  const r = await p.restaurant.findFirst({ where: { slug: "demo-pizza-palace" }, select: { id: true } });
  const data = process.argv[2] === "reset"
    ? { customDomain: null, customDomainStatus: "none", previousCustomDomain: null, pendingCustomDomain: null }
    : { customDomain: "new.test", customDomainStatus: "verified", previousCustomDomain: "old.test", pendingCustomDomain: null };
  const u = await p.restaurant.update({ where: { id: r!.id }, data, select: { customDomain: true, previousCustomDomain: true } });
  console.log(JSON.stringify(u));
  await p.$disconnect();
}
main();
