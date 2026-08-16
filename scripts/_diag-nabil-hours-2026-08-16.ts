import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
config({ path: ".env.local" });
function prodUrl(): string {
  const env = readFileSync(".env.local", "utf8");
  let url: string | null = null;
  for (const line of env.split(/\r?\n/)) { const m = line.match(/^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/); if (m) url = m[1]; }
  if (!url) throw new Error("no prod url");
  return url;
}
async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: prodUrl() }) } as any);
  const r = await prisma.restaurant.findFirst({ where: { slug: "luigis-lasagna-pizzeria" }, select: { id: true, timezone: true, hoursFormat: true, autoAcceptOrders: true, allowScheduledOrders: true, requireScheduledOrders: true, pickupMinLeadMinutes: true, pickupMaxAdvanceDays: true, deliveryMinLeadMinutes: true, deliveryMaxAdvanceDays: true, openingHours: { orderBy: { dayOfWeek: "asc" } }, voiceAgentConfig: { select: { afterHoursBehavior: true, allowScheduledOrders: true, smsConfirmations: true, canTakeOrders: true } } } });
  console.log(JSON.stringify(r, null, 1));
  await prisma.$disconnect();
}
main();
