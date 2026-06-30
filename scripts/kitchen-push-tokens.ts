/**
 * READ-ONLY: list the kitchen push tokens for a restaurant (MONDAY_PLAN test #18,
 * ghost-ring). The ghost-ring fix keeps EXACTLY ONE token per restaurant — the
 * last device to log in; registering deletes every other token, so only the
 * active device gets the screen-off ring. Run this after each login/lock step to
 * confirm the active device owns the single token. Writes nothing.
 *
 * Usage: npx tsx scripts/run-on-prod.ts scripts/kitchen-push-tokens.ts <store-slug>
 */
import { config as cfg } from "dotenv"; cfg({ path: ".env.local" }); cfg({ path: ".env" });
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg"; import { PrismaNeon } from "@prisma/adapter-neon";
const cs = process.env.DATABASE_URL!;
const prisma = new PrismaClient({ adapter: /\.neon\.tech([:/?]|$)/i.test(cs) ? new PrismaNeon({ connectionString: cs }) : new PrismaPg({ connectionString: cs }) } as any);
const slug = process.argv[2];

async function main() {
  if (!slug) { console.error("Usage: ... scripts/kitchen-push-tokens.ts <store-slug>"); process.exit(1); }
  const r = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!r) { console.error(`No restaurant "${slug}".`); process.exit(1); }
  const tokens = await prisma.kitchenPushToken.findMany({
    where: { restaurantId: r.id },
    orderBy: { lastSeenAt: "desc" },
    select: { token: true, platform: true, createdAt: true, lastSeenAt: true },
  });
  console.log(`\n=== ${r.name} — kitchen push tokens: ${tokens.length} ===`);
  console.log(tokens.length === 1 ? "(✓ exactly one — only the active device will ring)" : tokens.length === 0 ? "(no device registered — nothing will ring on screen-off)" : "(⚠ more than one — a superseded device could still ring!)");
  for (const t of tokens) {
    console.log(`  • [${t.platform}] …${t.token.slice(-12)}  created ${t.createdAt.toISOString().slice(0, 19).replace("T", " ")}  lastSeen ${t.lastSeenAt.toISOString().slice(0, 19).replace("T", " ")}`);
  }
  console.log("");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
