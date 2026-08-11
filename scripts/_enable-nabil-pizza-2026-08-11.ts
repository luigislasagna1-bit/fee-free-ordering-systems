/**
 * Turn Nabil AI's pizza/combo building ON for ONE restaurant.
 *
 * `VoiceAgentConfig.allowPizzaCombo` defaults FALSE everywhere — schema,
 * context route, the service's config normaliser and its tool filter — so a
 * store only starts building pizzas by voice when someone runs this. It is the
 * rollout gate, and the whole point is that it is per-store.
 *
 *   DATABASE_URL="<prod branch>" npx tsx scripts/_enable-nabil-pizza-2026-08-11.ts <slug> [--off]
 *
 * Prints the before/after so the change is visible, and refuses to touch a
 * restaurant that has no VoiceAgentConfig row (nothing to enable — Nabil isn't
 * set up for them).
 */
import prisma from "../src/lib/db";

async function main() {
  const slug = (process.argv[2] || "").toLowerCase().trim();
  const turnOff = process.argv.includes("--off");
  if (!slug) {
    console.error("usage: tsx scripts/_enable-nabil-pizza-2026-08-11.ts <restaurant-slug> [--off]");
    process.exit(1);
  }

  const restaurant = await prisma.restaurant.findFirst({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });
  if (!restaurant) {
    console.error(`No restaurant with slug "${slug}".`);
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
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
