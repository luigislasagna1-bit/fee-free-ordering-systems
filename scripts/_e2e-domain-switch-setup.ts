/** DEV-ONLY setup for the zero-downtime domain-switch e2e on demo-pizza-palace:
 *  grant the custom-domain add-on + seed a fake live customDomain.
 *  RESET=1 removes both. */
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
  if (!r) throw new Error("demo store missing");

  const addOn = await p.addOn.findFirst({
    where: { enabledFeatures: { contains: "custom_domain_routing" } },
    select: { id: true, slug: true },
  });
  if (!addOn) throw new Error("no add-on grants custom_domain_routing");

  if (process.env.RESET === "1") {
    await p.restaurantAddOn.deleteMany({ where: { restaurantId: r.id, addOnId: addOn.id } });
    await p.restaurant.update({
      where: { id: r.id },
      data: { customDomain: null, customDomainStatus: "none", pendingCustomDomain: null, previousCustomDomain: null, customDomainAddedAt: null, customDomainError: null },
    });
    console.log("reset done");
    return;
  }

  const existing = await p.restaurantAddOn.findFirst({ where: { restaurantId: r.id, addOnId: addOn.id } });
  if (!existing) {
    await p.restaurantAddOn.create({ data: { restaurantId: r.id, addOnId: addOn.id, status: "active" } });
  } else {
    await p.restaurantAddOn.update({ where: { id: existing.id }, data: { status: "active" } });
  }
  await p.restaurant.update({
    where: { id: r.id },
    data: { customDomain: "demo-live.test", customDomainStatus: "verified", pendingCustomDomain: null, previousCustomDomain: null },
  });
  console.log(`granted ${addOn.slug}; live domain = demo-live.test`);
}
main();
