/**
 * Quick diagnostic: dump the fields that drive customer-page rendering
 * for a given restaurant slug. Run against PROD when you suspect the
 * UI isn't reflecting recent saves.
 *
 * Usage (against currently-active DATABASE_URL):
 *   npx tsx scripts/debug-restaurant-state.ts luigis-lasagna-pizzeria
 *
 * Usage (against the commented-out prod URL in .env.local):
 *   npx tsx scripts/debug-restaurant-state.ts --prod luigis-lasagna-pizzeria
 */
import { config } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const useProd = args.includes("--prod");
const slug = args.find((a) => !a.startsWith("--"));

if (!slug) {
  console.error("Usage: npx tsx scripts/debug-restaurant-state.ts [--prod] <slug>");
  process.exit(1);
}

const ENV_PATH = ".env.local";
const originalEnv = readFileSync(ENV_PATH, "utf8");
let restored = false;
function restoreEnv() {
  if (restored) return;
  restored = true;
  try { writeFileSync(ENV_PATH, originalEnv, "utf8"); } catch {}
}
process.on("exit", restoreEnv);
process.on("SIGINT", () => { restoreEnv(); process.exit(130); });

if (useProd) {
  // Swap to commented-out (prod) URL for this run only.
  const lines = originalEnv.split(/\r?\n/);
  let prodUrl: string | null = null;
  for (const l of lines) {
    const m = l.match(/^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m) prodUrl = m[1];
  }
  if (!prodUrl) {
    console.error("No commented-out DATABASE_URL in .env.local");
    process.exit(1);
  }
  const rewritten = lines.map((l) => {
    const m = l.match(/^(\s*)(#?)\s*(DATABASE_URL\s*=\s*"([^"]+)".*)$/);
    if (!m) return l;
    return m[4] === prodUrl ? `${m[1]}${m[3]}` : `${m[1]}# ${m[3]}`;
  });
  writeFileSync(ENV_PATH, rewritten.join("\n"), "utf8");
}

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { default: prisma } = await import("../src/lib/db");
  process.on("beforeExit", () => prisma.$disconnect().catch(() => {}));

  const r = await prisma.restaurant.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      publishedAt: true,
      country: true,
      state: true,
      paymentMethods: true,
      taxRate: true,
      stripeAccountId: true,
      stripeAccountStatus: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      acceptsPickup: true,
      acceptsDelivery: true,
      marketplaceListing: {
        select: { isListed: true, billingMode: true, currentMonthOrders: true },
      },
    },
  });

  if (!r) {
    console.error(`No restaurant with slug "${slug}" in this DB.`);
    process.exit(1);
  }

  console.log("\n=== Restaurant state ===");
  console.log(JSON.stringify(r, null, 2));

  // Parse paymentMethods exactly like /order/[slug]/page.tsx does, so
  // the operator sees what acceptedMethods the customer page would
  // compute.
  let parsed: unknown = "(unparseable)";
  if (typeof r.paymentMethods === "string") {
    try { parsed = JSON.parse(r.paymentMethods); }
    catch { parsed = "(invalid JSON)"; }
  }
  console.log("\n=== Parsed paymentMethods ===");
  console.log(parsed);
  console.log("\n  Customer checkout will render buttons for slugs that match:");
  console.log("    'cash'           → Cash on Pickup / Delivery");
  console.log("    'card_in_person' → Card on Pickup / Delivery");
  console.log("    'online_card'    → Pay Online (Card)");
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(2);
});
