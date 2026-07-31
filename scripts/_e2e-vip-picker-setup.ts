/** DEV-ONLY: ensure the local demo store has a VIP group + a few searchable
 *  customers (some with accounts, one already a member) so the picker can be
 *  exercised in the browser. Prints the group URL. RESET=1 removes the seeds. */
import { config } from "dotenv";
config({ path: ".env.local" }); config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";

const SEEDS = [
  { name: "Picker Test Alice", email: "picker-alice@example.com", withAccount: true },
  { name: "Picker Test Bob", email: "picker-bob@example.com", withAccount: true },
  { name: "Picker Test Carol", email: "picker-carol@example.com", withAccount: false },
  { name: "Picker Test Dave", email: "picker-dave@example.com", withAccount: true },
];

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const p = new PrismaClient({ adapter } as any);
  const r = await p.restaurant.findFirst({ where: { slug: "demo-pizza-palace" }, select: { id: true } });
  if (!r) throw new Error("demo store missing");

  if (process.env.RESET === "1") {
    const custs = await p.customer.findMany({ where: { restaurantId: r.id, email: { in: SEEDS.map(s => s.email) } }, select: { id: true } });
    const ids = custs.map(c => c.id);
    await p.customerGroupMember.deleteMany({ where: { customerId: { in: ids } } });
    await p.customer.deleteMany({ where: { id: { in: ids } } });
    await p.customerGroup.deleteMany({ where: { restaurantId: r.id, name: "Picker Test Club" } });
    console.log(`reset: removed ${ids.length} seeded customer(s) + the test group`);
    return;
  }

  let group = await p.customerGroup.findFirst({ where: { restaurantId: r.id, name: "Picker Test Club" }, select: { id: true } });
  if (!group) {
    group = await p.customerGroup.create({
      data: { restaurantId: r.id, name: "Picker Test Club", description: "Seeded for the picker e2e" },
      select: { id: true },
    });
  }

  const made: string[] = [];
  for (const s of SEEDS) {
    let c = await p.customer.findFirst({ where: { restaurantId: r.id, email: s.email }, select: { id: true } });
    if (!c) {
      c = await p.customer.create({
        data: {
          restaurantId: r.id, name: s.name, email: s.email,
          passwordHash: s.withAccount ? "!seeded-no-login" : null,
        },
        select: { id: true },
      });
    }
    made.push(c.id);
  }
  // Make the FIRST one already a member so the "Already a member" state renders.
  const existing = await p.customerGroupMember.findFirst({ where: { groupId: group.id, customerId: made[0] } });
  if (!existing) {
    await p.customerGroupMember.create({ data: { groupId: group.id, restaurantId: r.id, customerId: made[0] } });
  }

  console.log(`group: http://localhost:3001/admin/customer-groups/${group.id}`);
  console.log(`search for: "Picker Test"  → Alice should show as already a member; Bob/Dave have accounts; Carol does not.`);
}
main();
