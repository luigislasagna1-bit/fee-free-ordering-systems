/** READ-ONLY: Luigi's store customDomain + slug for the exact customer URL. */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
const m = readFileSync(".env.local", "utf8").match(/^#\s*DATABASE_URL="(postgresql:\/\/[^"]*ep-dawn-tree[^"]*)"/m);
if (!m) throw new Error("no prod url");
async function main() {
  const p = new PrismaClient({ adapter: new PrismaNeon({ connectionString: m![1] }) } as any);
  const r = await p.restaurant.findUnique({ where: { slug: "luigis-lasagna-pizzeria" }, select: { customDomain: true, slug: true } });
  console.log(JSON.stringify(r));
  await p.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
