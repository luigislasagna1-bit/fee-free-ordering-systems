/** READ-ONLY: every restaurant currently showing a dunning banner
 *  (graceEndsAt > now), + which restaurant Luigi's user account loads.
 *  Usage: npx tsx scripts/run-on-prod.ts scripts/_diag-any-grace.ts */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const prisma = (await import("../src/lib/db")).default;
  const now = new Date();
  const inGrace = await prisma.restaurant.findMany({
    where: { graceEndsAt: { gt: now } },
    select: { id: true, slug: true, name: true, graceEndsAt: true, subscriptionStatus: true },
  });
  console.log(`Restaurants CURRENTLY in a dunning banner (graceEndsAt > now): ${inGrace.length}`);
  for (const r of inGrace) console.log(`  ${r.name} (${r.slug}) grace→${r.graceEndsAt?.toISOString().slice(0, 16)} status=${r.subscriptionStatus}`);

  const users = await prisma.user.findMany({
    where: { email: { in: ["luigislasagna1@gmail.com", "info@luigislasagna.com", "support@feefreeordering.com"] } },
    select: { email: true, role: true, restaurantId: true },
  });
  console.log(`\nLuigi's user accounts → which restaurant their admin loads:`);
  for (const u of users) {
    if (!u.restaurantId) { console.log(`  ${u.email} (${u.role}) → no restaurant (superadmin/reseller)`); continue; }
    const r = await prisma.restaurant.findUnique({ where: { id: u.restaurantId }, select: { slug: true, name: true, graceEndsAt: true, subscriptionStatus: true } });
    const banner = !!r?.graceEndsAt && r.graceEndsAt > now;
    console.log(`  ${u.email} (${u.role}) → ${r?.name} (${r?.slug}) status=${r?.subscriptionStatus} ${banner ? "⚠️ BANNER" : "clean, no banner"}`);
  }
  await prisma.$disconnect();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
