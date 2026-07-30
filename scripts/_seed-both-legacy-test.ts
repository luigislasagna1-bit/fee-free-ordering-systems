/** DEV-only: put the local demo store's ShipdayConfig into the legacy
 *  deliverySource="both" state to verify the provider-chooser display fix
 *  (both+own must display OWN) and that the embedded panel save no longer
 *  rewrites "both". Usage:
 *    npx tsx scripts/_seed-both-legacy-test.ts            # both + activeDispatchMode=own
 *    npx tsx scripts/_seed-both-legacy-test.ts shipday    # both + activeDispatchMode=shipday
 *    npx tsx scripts/_seed-both-legacy-test.ts read       # just print current state
 *    npx tsx scripts/_seed-both-legacy-test.ts restore <source> <mode>
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
  const r = await prisma.restaurant.findUnique({ where: { slug: "demo-pizza-palace" }, select: { id: true } });
  if (!r) throw new Error("no demo-pizza-palace");
  const before = await prisma.shipdayConfig.findUnique({
    where: { restaurantId: r.id },
    select: { deliverySource: true, activeDispatchMode: true, enabled: true },
  });
  const ffBefore = await prisma.feeFreeDeliveryConfig.findUnique({
    where: { restaurantId: r.id },
    select: { enabled: true, autoSend: true },
  });
  console.log("BEFORE shipday:", JSON.stringify(before), "feefree:", JSON.stringify(ffBefore));
  const arg = process.argv[2];
  if (arg === "read") { await prisma.$disconnect(); return; }
  if (arg === "feefree-delete") {
    await prisma.feeFreeDeliveryConfig.delete({ where: { restaurantId: r.id } });
    console.log("feefree row DELETED (page will recreate on next load)");
    await prisma.$disconnect();
    return;
  }
  if (arg === "feefree-off" || arg === "feefree-on") {
    const a = await prisma.feeFreeDeliveryConfig.update({
      where: { restaurantId: r.id },
      data: { enabled: arg === "feefree-on" },
      select: { enabled: true },
    });
    console.log("AFTER feefree:", JSON.stringify(a));
    await prisma.$disconnect();
    return;
  }
  const data =
    arg === "restore"
      ? { deliverySource: process.argv[3]!, activeDispatchMode: process.argv[4]!,
          // also clear any dummy API key a test save stored
          apiKeyEnc: null, apiKeyIv: null, apiKeyTag: null }
      : { deliverySource: "both", activeDispatchMode: arg === "shipday" ? "shipday" : "own" };
  const after = await prisma.shipdayConfig.upsert({
    where: { restaurantId: r.id },
    create: { restaurantId: r.id, ...data },
    update: data,
    select: { deliverySource: true, activeDispatchMode: true, enabled: true },
  });
  console.log("AFTER: ", JSON.stringify(after));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
