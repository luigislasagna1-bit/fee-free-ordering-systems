/**
 * READ-ONLY: capture info@luigislasagna.com's CURRENT customer + kitchen receipt
 * templates and write them to scripts/captured-receipt-config.json, so they can
 * be baked into receipt-schema.ts as the platform DEFAULTS (new accounts + the
 * "Reset to default" action). Luigi 2026-06-13.
 *
 * Reads the PROD branch (the COMMENTED DATABASE_URL in .env.local) explicitly,
 * regardless of which branch is currently active — Luigi edits his live receipt
 * on prod. Does NOT write to any database and does NOT modify .env.local.
 * Override the target with CAPTURE_DATABASE_URL if needed.
 *
 *   npx tsx scripts/capture-receipt-defaults.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const OWNER_EMAIL = "info@luigislasagna.com";
const OUT = "scripts/captured-receipt-config.json";

function resolveDbUrl(): string {
  if (process.env.CAPTURE_DATABASE_URL) return process.env.CAPTURE_DATABASE_URL;
  const content = readFileSync(".env.local", "utf8");
  let active: string | null = null;
  let commented: string | null = null;
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^(\s*)(#?)\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (!m) continue;
    if (m[2] === "#") { if (!commented) commented = m[3]; }
    else if (!active) active = m[3];
  }
  // Convention: active = dev, commented = prod. Prefer prod; fall back to the
  // only URL present.
  const url = commented ?? active;
  if (!url) throw new Error("No DATABASE_URL found in .env.local");
  return url;
}

async function main() {
  const url = resolveDbUrl();
  console.log(`Reading from: ${url.replace(/:[^:@]+@/, ":***@")}`);
  const adapter = new PrismaNeon({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  try {
    const user = await prisma.user.findFirst({
      where: { email: OWNER_EMAIL },
      select: { restaurantId: true },
    });
    if (!user?.restaurantId) throw new Error(`No user/restaurant found for ${OWNER_EMAIL}`);
    const restaurantId = user.restaurantId;

    const [cust, kit, restaurant] = await Promise.all([
      prisma.receiptTemplate.findFirst({ where: { restaurantId, type: "customer", isDefault: true }, select: { template: true } }),
      prisma.receiptTemplate.findFirst({ where: { restaurantId, type: "kitchen", isDefault: true }, select: { template: true } }),
      prisma.restaurant.findUnique({ where: { id: restaurantId }, select: { name: true } }),
    ]);

    if (!cust?.template) throw new Error("No default CUSTOMER receipt template saved for this store.");
    if (!kit?.template) throw new Error("No default KITCHEN receipt template saved for this store.");

    const customer = JSON.parse(cust.template);
    const kitchen = JSON.parse(kit.template);

    writeFileSync(
      OUT,
      JSON.stringify({ capturedFrom: OWNER_EMAIL, restaurantName: restaurant?.name ?? null, customer, kitchen }, null, 2),
      "utf8",
    );

    const summarize = (label: string, cfg: any) => {
      const secs = Array.isArray(cfg?.sections) ? cfg.sections : [];
      const boxed = secs.filter((s: any) => s?.style?.boxed).map((s: any) => s.type);
      console.log(`  ${label}: ${secs.length} sections; boxed = [${boxed.join(", ") || "none"}]`);
    };
    console.log(`\nCaptured ${restaurant?.name ?? "store"} (${OWNER_EMAIL}) -> ${OUT}`);
    summarize("customer", customer);
    summarize("kitchen", kitchen);
    console.log(`\nDone. Tell Claude it's ready and I'll bake it in as the default.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
