/** DEV-only: does the demo owner own the restaurant the Nabil seed populated? */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const u = await prisma.user.findUnique({
    where: { email: "owner@pizzapalace.com" },
    select: { restaurantId: true, restaurant: { select: { slug: true, name: true } } },
  });
  console.log("owner restaurant:", JSON.stringify(u));
  if (!u?.restaurantId) return;
  const [calls, cfg, upsells, faqs] = await Promise.all([
    prisma.voiceCall.count({ where: { restaurantId: u.restaurantId } }),
    prisma.voiceAgentConfig.findUnique({ where: { restaurantId: u.restaurantId }, select: { enabled: true } }),
    prisma.voiceUpsell.count({ where: { restaurantId: u.restaurantId } }),
    prisma.voiceFaq.count({ where: { restaurantId: u.restaurantId } }),
  ]);
  console.log(`voiceCalls=${calls} upsells=${upsells} faqs=${faqs} config=${JSON.stringify(cfg)}`);
}
main().finally(() => prisma.$disconnect());
