/** DEV-ONLY: delete the throwaway dev-i18n-check@example.com account and report. */
import { config } from "dotenv";
config({ path: ".env.local" }); config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const p = new PrismaClient({ adapter } as any);
  const del = await p.customerAccount.deleteMany({ where: { email: "dev-i18n-check@example.com" } });
  const left = await p.customerAccount.count({ where: { email: "dev-i18n-check@example.com" } });
  console.log(`deleted ${del.count}; remaining ${left}`);
}
main();
