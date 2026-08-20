import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

function connectionString(): string {
  const env = readFileSync(".env.local", "utf8");
  const urls: string[] = [];
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m && !urls.includes(m[1])) urls.push(m[1]);
  }
  return urls[1] ?? urls[0];
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaNeon({ connectionString: connectionString() }),
  } as never);

  const numbers = await prisma.voiceNumber.findMany({
    select: { phoneNumber: true, enabled: true, isDemo: true, restaurantId: true },
  });
  console.log("=== Voice Numbers ===");
  for (const n of numbers) console.log(JSON.stringify(n));

  for (const n of numbers) {
    const cfg = await prisma.voiceAgentConfig.findUnique({
      where: { restaurantId: n.restaurantId },
      select: {
        enabled: true,
        audioPipeline: true,
        ambientNoise: true,
        transferToNumber: true,
      },
    });
    console.log(`\n=== Config for ${n.phoneNumber} ===`);
    console.log(JSON.stringify(cfg));
  }

  const luigis = await prisma.restaurant.findFirst({
    where: { slug: "luigis-lasagna-pizzeria" },
    select: { id: true, phone: true, alertPhone: true },
  });
  if (luigis) {
    console.log(`\n=== Luigi's Restaurant ===`);
    console.log(JSON.stringify(luigis));

    const addons = await prisma.restaurantAddOn.findMany({
      where: { restaurantId: luigis.id },
      select: {
        status: true,
        graceEndsAt: true,
        addOn: { select: { slug: true, enabledFeatures: true } },
      },
    });
    console.log("\n=== Add-ons ===");
    for (const a of addons) console.log(JSON.stringify(a));
  }

  await prisma.$disconnect();
}
main().catch(console.error);
