/**
 * One-shot: create the demo VoiceNumber for (289) 670-5454 on the PRODUCTION database.
 * Uses the prod DATABASE_URL (ep-dawn-tree) and finds Luigi's real restaurant
 * from the existing production VoiceNumber (+13656581458).
 *   npx tsx scripts/_create-demo-voice-number-prod.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "fs";

// Find the prod database URL (the pooler one, ep-dawn-tree)
const envContent = fs.readFileSync(".env.local", "utf-8");
const urls = envContent.match(/DATABASE_URL="([^"]+)"/g)?.map(m => m.replace(/DATABASE_URL="|"/g, "")) || [];
const prodUrl = urls.find(u => u.includes("pooler") || u.includes("dawn-tree"));
if (!prodUrl) {
  // If there's only one, or we can't identify prod, use the default
  console.log("Could not identify prod URL, using DATABASE_URL from env");
}
const connectionString = prodUrl || process.env.DATABASE_URL!;
console.log(`Using DB: ...${connectionString.split("@")[1]?.split("/")[0] || "unknown"}`);

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) } as any);
  try {
    // Find the existing production number (Luigi's real line)
    const existing = await prisma.voiceNumber.findFirst({
      where: { isDemo: false, enabled: true },
      select: { phoneNumber: true, restaurantId: true, restaurant: { select: { name: true, slug: true } } },
      orderBy: { createdAt: "asc" },
    });
    if (!existing) {
      console.error("No production VoiceNumber found");
      process.exit(1);
    }
    console.log(`Production line: ${existing.phoneNumber} → ${existing.restaurant.name} (${existing.restaurant.slug})`);

    const demoPhone = "+12896705454";
    const already = await prisma.voiceNumber.findUnique({ where: { phoneNumber: demoPhone } });
    if (already) {
      console.log(`Demo number ${demoPhone} already exists (id: ${already.id})`);
      return;
    }

    const row = await prisma.voiceNumber.create({
      data: {
        restaurantId: existing.restaurantId,
        phoneNumber: demoPhone,
        countryCode: "CA",
        status: "active",
        enabled: true,
        isDemo: true,
      } as any,
    });
    console.log(`Created demo VoiceNumber: ${row.id} → ${demoPhone} (isDemo: true) on PROD`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
