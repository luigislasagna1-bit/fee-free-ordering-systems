/**
 * One-shot: create the demo VoiceNumber for (289) 670-5454.
 * Finds Luigi's restaurant from the existing production VoiceNumber,
 * then creates the demo entry.
 *   npx tsx scripts/_create-demo-voice-number.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);
  try {
    const existing = await prisma.voiceNumber.findFirst({
      where: { isDemo: false, status: "active" },
      select: { phoneNumber: true, restaurantId: true, restaurant: { select: { name: true, slug: true } } },
    });
    if (!existing) {
      console.error("No active production VoiceNumber found");
      process.exit(1);
    }
    console.log(`Production line: ${existing.phoneNumber} → ${existing.restaurant.name} (${existing.restaurant.slug})`);

    const demoPhone = "+12896705454";
    const already = await prisma.voiceNumber.findUnique({ where: { phoneNumber: demoPhone } });
    if (already) {
      console.log(`Demo number ${demoPhone} already exists (id: ${already.id}, isDemo: ${(already as any).isDemo})`);
      if (!(already as any).isDemo) {
        await prisma.voiceNumber.update({ where: { id: already.id }, data: { isDemo: true } as any });
        console.log("Updated isDemo to true");
      }
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
    console.log(`Created demo VoiceNumber: ${row.id} → ${demoPhone} (isDemo: true)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
