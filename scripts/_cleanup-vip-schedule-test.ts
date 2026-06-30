/** TEST CLEANUP (throwaway): remove the VIP scheduler test artifacts —
 *  the "Schedule Tester" group (cascades its automation/schedule + members)
 *  and the auto-created sched-test@ guest customer (cascades wallet + ledger).
 *  Leaves Sameem's real account alone. Luigi 2026-06-29 / fixed 2026-06-30.
 *
 *  Values are HARDCODED (not CLI args) because run-on-prod.ts forwards args
 *  through a shell, which split the quoted "Schedule Tester" into two tokens
 *  and made the previous run a no-op. Run with NO extra args:
 *    npx tsx scripts/run-on-prod.ts scripts/_cleanup-vip-schedule-test.ts */
import { config as cfg } from "dotenv"; cfg({ path: ".env.local" }); cfg({ path: ".env" });
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg"; import { PrismaNeon } from "@prisma/adapter-neon";

const SLUG = "luigis-lasagna-pizzeria";
const GROUP_NAME = "Schedule Tester";
const TEST_EMAIL = "sched-test@example.com";

const cs = process.env.DATABASE_URL!;
const prisma = new PrismaClient({ adapter: /\.neon\.tech([:/?]|$)/i.test(cs) ? new PrismaNeon({ connectionString: cs }) : new PrismaPg({ connectionString: cs }) } as any);

async function main() {
  const r = await prisma.restaurant.findUnique({ where: { slug: SLUG }, select: { id: true } });
  if (!r) { console.error(`No restaurant "${SLUG}".`); process.exit(1); }

  const groups = await prisma.customerGroup.findMany({ where: { restaurantId: r.id, name: GROUP_NAME }, select: { id: true } });
  if (!groups.length) console.log(`No group named "${GROUP_NAME}" found (already cleaned?).`);
  for (const g of groups) { await prisma.customerGroup.delete({ where: { id: g.id } }); console.log(`Deleted group ${g.id} "${GROUP_NAME}" (cascades automation/schedule + members).`); }

  const cust = await prisma.customer.findFirst({ where: { restaurantId: r.id, email: { equals: TEST_EMAIL, mode: "insensitive" } }, select: { id: true } });
  if (cust) { await prisma.customer.delete({ where: { id: cust.id } }); console.log(`Deleted test customer ${TEST_EMAIL} (cascades wallet + ledger).`); }
  else console.log(`No test customer ${TEST_EMAIL} to delete.`);
  console.log("Cleanup done.");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
