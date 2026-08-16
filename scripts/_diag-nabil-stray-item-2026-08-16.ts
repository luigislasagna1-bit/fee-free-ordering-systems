import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
config({ path: ".env.local" });
function prodUrl(): string { const env = readFileSync(".env.local","utf8"); let url: string|null=null; for (const line of env.split(/\r?\n/)) { const m=line.match(/^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/); if (m) url=m[1]; } if(!url) throw new Error("no prod url"); return url; }
async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: prodUrl() }) } as any);
  const rows = await prisma.menuItem.findMany({ where: { id: { in: ["cmrbkzq9d000204juybtnnw41", "cmpuex13501bc04kvhsx0hrmw"] } }, select: { id: true, name: true, isAvailable: true, isSoldOut: true, isHidden: true, visibilityMode: true, visibleUntil: true, visibleStartDate: true, visibleEndDate: true, visibleDays: true, visibleFrom: true, visibleTo: true, visibleWindows: true, availabilityMode: true, availableDays: true, availableFrom: true, availableTo: true, fulfilDays: true, fulfilWindows: true, forPickup: true, forDelivery: true, lineageId: true, sortOrder: true, updatedAt: true } });
  for (const r of rows) console.log(JSON.stringify(r, null, 1));
  await prisma.$disconnect();
}
main();
