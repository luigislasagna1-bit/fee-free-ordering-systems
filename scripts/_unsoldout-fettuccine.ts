/** DEV-ONLY one-off: un-sold-out Fettuccine on the demo store for the
 *  service-conflict repro. Refuses prod. */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("no DATABASE_URL");
  const m = readFileSync(".env.local", "utf8").match(/^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/m);
  if (m && url === m[1]) throw new Error("REFUSING: prod DB");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) } as any);
  const it = await prisma.menuItem.findFirst({
    where: { name: { contains: "Fettuccine" }, restaurant: { slug: "demo-pizza-palace" } },
    select: { id: true, name: true },
  });
  if (it) {
    await prisma.menuItem.update({ where: { id: it.id }, data: { isSoldOut: false } });
    console.log("un-sold-out:", it.name);
  } else {
    console.log("not found");
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
