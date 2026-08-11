/**
 * Turn Nabil AI's pizza/combo building ON (or OFF) for ONE restaurant, on a
 * chosen database branch.
 *
 * `VoiceAgentConfig.allowPizzaCombo` defaults FALSE everywhere — schema,
 * context route, the service's config normaliser and its tool filter — so a
 * store only starts building pizzas by voice when someone runs this. It is the
 * rollout gate, and the whole point is that it is per-store.
 *
 *   npx tsx scripts/_enable-nabil-pizza-2026-08-11.ts <slug> [--off] [--dev]
 *
 * Targets the PRODUCTION branch by default (the commented-out DATABASE_URL in
 * .env.local, same convention the read-only prod scripts use) — enabling a
 * feature on the dev branch and calling it shipped is a mistake worth making
 * impossible. `--dev` targets the active branch instead.
 *
 * Prints before/after and refuses a restaurant with no VoiceAgentConfig row
 * (nothing to enable — Nabil isn't set up for them).
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

function databaseUrls(): { active: string; commented: string | null } {
  const env = readFileSync(".env.local", "utf8");
  let active: string | null = null;
  let commented: string | null = null;
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^(\s*#?\s*)DATABASE_URL\s*=\s*"([^"]+)"/);
    if (!m) continue;
    const isComment = m[1].includes("#");
    if (isComment) commented ??= m[2];
    else active ??= m[2];
  }
  if (!active) throw new Error("No active DATABASE_URL in .env.local");
  return { active, commented };
}

async function main() {
  const args = process.argv.slice(2);
  const slug = (args.find((a) => !a.startsWith("--")) || "").toLowerCase().trim();
  const turnOff = args.includes("--off");
  const useDev = args.includes("--dev");
  if (!slug) {
    console.error("usage: tsx scripts/_enable-nabil-pizza-2026-08-11.ts <restaurant-slug> [--off] [--dev]");
    process.exit(1);
  }

  const { active, commented } = databaseUrls();
  const url = useDev ? active : (commented ?? active);
  if (!useDev && !commented) {
    console.error("No commented-out (production) DATABASE_URL found — refusing to guess. Pass --dev to target the active branch.");
    process.exit(1);
  }
  console.log(`DB: ${url.replace(/:[^:@]+@/, ":***@").slice(0, 78)}…  (${useDev ? "DEV" : "PROD"})`);

  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as never);

  try {
    const restaurant = await prisma.restaurant.findFirst({
      where: { slug },
      select: { id: true, name: true, slug: true },
    });
    if (!restaurant) {
      console.error(`No restaurant with slug "${slug}" on this branch.`);
      process.exit(1);
    }

    const before = await prisma.voiceAgentConfig.findUnique({
      where: { restaurantId: restaurant.id },
      select: { enabled: true, allowPizzaCombo: true },
    });
    if (!before) {
      console.error(`${restaurant.name} has no VoiceAgentConfig — Nabil isn't set up for them.`);
      process.exit(1);
    }

    console.log(`${restaurant.name} (${restaurant.slug})`);
    console.log(`  before: enabled=${before.enabled} allowPizzaCombo=${before.allowPizzaCombo}`);

    const after = await prisma.voiceAgentConfig.update({
      where: { restaurantId: restaurant.id },
      data: { allowPizzaCombo: !turnOff },
      select: { enabled: true, allowPizzaCombo: true },
    });
    console.log(`  after:  enabled=${after.enabled} allowPizzaCombo=${after.allowPizzaCombo}`);

    const others = await prisma.voiceAgentConfig.count({
      where: { allowPizzaCombo: true, restaurantId: { not: restaurant.id } },
    });
    console.log(
      others === 0
        ? "\nNo other restaurant has pizza building on. ✓"
        : `\n⚠️  ${others} OTHER restaurant(s) also have allowPizzaCombo on — check that's intended.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
