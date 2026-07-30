/** Read-only: is PlatformSettings.companyAddress set? (A27 step 6) */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
config({ path: ".env.local" }); config({ path: ".env" });
async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const p = new PrismaClient({ adapter } as any);
  const s = await p.platformSettings.findUnique({ where: { id: "singleton" }, select: { companyAddress: true, emailFrom: true } });
  console.log("companyAddress:", s?.companyAddress ? "SET" : "EMPTY");
  console.log("emailFrom:", s?.emailFrom || "(unset)");
}
main();
