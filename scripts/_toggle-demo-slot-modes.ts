/** Dev-only: set demo-pizza-palace pickup+delivery slotModes. Args:
 *  "all" → ["bands","range","exact"]; "off" → remove (legacy default).
 *  npx tsx scripts/_toggle-demo-slot-modes.ts all */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const all = process.argv[2] !== "off";
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) } as any);
  const r = await prisma.restaurant.findUnique({ where: { slug: "demo-pizza-palace" }, select: { id: true, serviceSettings: true } });
  if (!r) throw new Error("demo restaurant not found");
  const ss = r.serviceSettings ? JSON.parse(r.serviceSettings) : {};
  for (const k of ["pickup", "delivery"]) {
    ss[k] = { ...(ss[k] ?? {}) };
    if (all) { ss[k].slotModes = ["bands", "range", "exact"]; ss[k].slotMode = "bands"; }
    else { delete ss[k].slotModes; delete ss[k].slotMode; }
  }
  await prisma.restaurant.update({ where: { id: r.id }, data: { serviceSettings: JSON.stringify(ss) } });
  console.log(`✓ demo slotModes ${all ? '["bands","range","exact"]' : "cleared"} for pickup+delivery`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
