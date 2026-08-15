/**
 * ONE-OFF (Luigi, 2026-08-15): move Luigi's Lasagna & Pizzeria's Nabil voice
 * off the legacy ElevenLabs "Rachel" id at 1.1× speed — what he heard as
 * "slightly too robotic" on his first live call — to Jessica at 1.0×.
 * Jessica = cgSgspJ2msm6clMCkdW9 (verified in NABIL_VOICES, elevenlabs-voices.ts).
 *
 *   npx tsx scripts/_set-nabil-voice-2026-08-15.ts [--db prod|dev] [--voice <id>] [--speed 1.0] [--slug luigis-lasagna-pizzeria]
 *
 * --db prod reads the COMMENTED-OUT production DATABASE_URL in .env.local
 * (same convention as scripts/send-ops-message.ts); .env.local is never
 * rewritten. Prints before/after; touches exactly one VoiceAgentConfig row.
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";
import { NABIL_VOICES } from "../src/lib/voice/elevenlabs-voices";

config({ path: ".env.local" });
config({ path: ".env" });

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const db = opt("--db", "dev");
const voice = opt("--voice", "cgSgspJ2msm6clMCkdW9");
const speed = Number(opt("--speed", "1.0"));
const slug = opt("--slug", "luigis-lasagna-pizzeria");

function prodUrl(): string {
  const env = readFileSync(".env.local", "utf8");
  let url: string | null = null;
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m) url = m[1];
  }
  if (!url) throw new Error("No commented-out production DATABASE_URL in .env.local");
  return url;
}

async function main() {
  const known = NABIL_VOICES.find((v) => v.id === voice);
  if (!known) throw new Error(`Voice id ${voice} is not in NABIL_VOICES — refusing (an unknown id kills the call before the greeting).`);
  if (!(speed >= 0.7 && speed <= 1.2)) throw new Error("speed must be 0.7..1.2");
  const url = db === "prod" ? prodUrl() : process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const r = await prisma.restaurant.findFirst({ where: { slug }, select: { id: true, name: true } });
    if (!r) throw new Error(`No restaurant with slug ${slug}`);
    const before = await prisma.voiceAgentConfig.findFirst({ where: { restaurantId: r.id }, select: { id: true, voice: true, voiceSpeed: true } });
    if (!before) throw new Error(`No VoiceAgentConfig for ${r.name}`);
    console.log(`[${db}] ${r.name}: voice ${before.voice ?? "(default)"} @ ${before.voiceSpeed}× → ${known.name} (${voice}) @ ${speed}×`);
    const after = await prisma.voiceAgentConfig.update({ where: { id: before.id }, data: { voice, voiceSpeed: speed }, select: { voice: true, voiceSpeed: true, updatedAt: true } });
    console.log("updated:", JSON.stringify(after));
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
