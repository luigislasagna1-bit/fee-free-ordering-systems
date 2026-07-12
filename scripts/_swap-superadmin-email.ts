/**
 * ONE-SHOT (Luigi authorized 2026-07-12): give the superadmin a REAL mailbox.
 *  1. The test-restaurant login holding support@feefreeordering.com
 *     ("FeeFreeOrdering Test 1") moves to support+test1@feefreeordering.com
 *     (plus-addressing still routes to the same inbox).
 *  2. The superadmin (admin@feefreeordering.com — a mailbox that never
 *     existed, so password resets went nowhere) becomes
 *     support@feefreeordering.com.
 * Transactional: both renames or neither. Idempotent: re-run prints state.
 *   npx tsx scripts/run-on-prod.ts scripts/_swap-superadmin-email.ts
 */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const SUPPORT = "support@feefreeordering.com";
const TEST_NEW = "support+test1@feefreeordering.com";
const OLD_ADMIN = "admin@feefreeordering.com";

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  await prisma.$transaction(async (tx) => {
    const holder = await tx.user.findUnique({ where: { email: SUPPORT }, select: { id: true, role: true, restaurant: { select: { slug: true } } } });
    const admin = await tx.user.findUnique({ where: { email: OLD_ADMIN }, select: { id: true, role: true } });

    if (holder && holder.role === "superadmin") {
      console.log("✓ already swapped — superadmin holds support@; nothing to do");
      return;
    }
    if (!admin || admin.role !== "superadmin") throw new Error(`refusing: ${OLD_ADMIN} is not the superadmin (found role=${admin?.role ?? "none"})`);

    if (holder) {
      // Only ever displace the known TEST restaurant login — anything else aborts.
      if (holder.restaurant?.slug !== "feefreeordering-test-1") {
        throw new Error(`refusing: support@ belongs to unexpected account (restaurant=${holder.restaurant?.slug ?? "none"})`);
      }
      await tx.user.update({ where: { id: holder.id }, data: { email: TEST_NEW } });
      console.log(`✓ test-restaurant login moved: ${SUPPORT} → ${TEST_NEW}`);
    }

    await tx.user.update({ where: { id: admin.id }, data: { email: SUPPORT } });
    console.log(`✓ superadmin login moved: ${OLD_ADMIN} → ${SUPPORT}`);
  });

  const after = await prisma.user.findMany({ where: { role: "superadmin" }, select: { email: true } });
  console.log(`superadmin login(s) now: ${after.map((u) => u.email).join(", ")}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
