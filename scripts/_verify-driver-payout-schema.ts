/** READ-ONLY: confirm DriverShift + DriverPayout exist on both branches. */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

function urls(): string[] {
  const out: string[] = [];
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}
(async () => {
  for (const url of urls()) {
    const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
    const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
    const prisma = new PrismaClient({ adapter } as any);
    try {
      const s = await prisma.driverShift.count();
      const p = await prisma.driverPayout.count();
      console.log(`${url.replace(/:[^:@]+@/, ":***@").slice(0, 52)} → DriverShift(${s}) DriverPayout(${p}) OK`);
    } catch (e: any) {
      console.error("FAIL", e?.message);
    } finally {
      await prisma.$disconnect();
    }
  }
})();
