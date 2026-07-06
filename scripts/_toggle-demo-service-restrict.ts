/** DEV-only: make demo "Spaghetti Bolognese" delivery-only + set the theme's
 *  serviceRestrictedDisplay. Usage:
 *    npx tsx scripts/_toggle-demo-service-restrict.ts label   (delivery-only + label mode)
 *    npx tsx scripts/_toggle-demo-service-restrict.ts hide    (delivery-only + hide mode)
 *    npx tsx scripts/_toggle-demo-service-restrict.ts off     (restore both)
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const mode = process.argv[2] ?? "label";
  const r = await prisma.restaurant.findUnique({ where: { slug: "demo-pizza-palace" }, select: { id: true, themeSettings: true } });
  if (!r) throw new Error("demo not found");
  const theme = (() => { try { return JSON.parse(r.themeSettings ?? "{}"); } catch { return {}; } })();
  if (mode === "off") {
    delete theme.serviceRestrictedDisplay;
    await prisma.menuItem.updateMany({ where: { restaurantId: r.id, name: "Spaghetti Bolognese" }, data: { forPickup: true, forDelivery: true } });
  } else {
    theme.serviceRestrictedDisplay = mode; // "label" | "hide"
    await prisma.menuItem.updateMany({ where: { restaurantId: r.id, name: "Spaghetti Bolognese" }, data: { forPickup: false, forDelivery: true } });
  }
  await prisma.restaurant.update({ where: { id: r.id }, data: { themeSettings: JSON.stringify(theme) } });
  console.log(`✓ mode=${mode} — Spaghetti Bolognese ${mode === "off" ? "unrestricted" : "delivery-only"}, theme.serviceRestrictedDisplay=${theme.serviceRestrictedDisplay ?? "(unset)"}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
