/** Generate a CLEARLY DISTINCT alternating two-tone WAV (a "wee-woo", nothing like the
 *  melodic GloriaFood alarm), upload it to Vercel Blob, and set it as Luigi's custom
 *  Kitchen Alert Sound — so any overlap in the S23 test is unmistakable by ear.
 *    npx tsx scripts/run-on-prod.ts scripts/_make-set-test-sound.ts
 *  (Clear afterwards with: scripts/run-on-prod.ts scripts/_set-luigi-custom-sound.ts --clear)
 */
import { config } from "dotenv";
import { put } from "@vercel/blob";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

function makeWav(): Buffer {
  const sampleRate = 44100;
  const seconds = 4;
  const n = sampleRate * seconds;
  const data = Buffer.alloc(n * 2);
  const seg = Math.floor(sampleRate * 0.25); // 0.25s per tone → fast "wee-woo"
  for (let i = 0; i < n; i++) {
    const tone = Math.floor(i / seg) % 2 === 0 ? 700 : 950; // alternate 700/950 Hz
    let s = Math.sin(2 * Math.PI * tone * (i / sampleRate)) * 0.9;
    const pos = i % seg;
    const fade = Math.min(pos, seg - pos, 220) / 220; // edge fade → no clicks
    s *= fade;
    data.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(s * 32767))), i * 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24); h.writeUInt32LE(sampleRate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) { console.error("✗ BLOB_READ_WRITE_TOKEN missing in .env.local"); process.exit(1); }
  const wav = makeWav();
  const blob = await put("test-sounds/distinct-weewoo.wav", wav, {
    access: "public", contentType: "audio/wav", addRandomSuffix: true, token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  console.log(`✓ Uploaded distinct test sound (${(wav.length / 1024).toFixed(0)} KB): ${blob.url}`);

  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  const r = await prisma.restaurant.findFirst({ where: { slug: "luigis-lasagna-pizzeria" }, select: { id: true, name: true } });
  if (!r) { console.log("restaurant not found"); await prisma.$disconnect(); return; }
  await prisma.restaurant.update({ where: { id: r.id }, data: { kitchenAlertSoundUrl: blob.url } });
  console.log(`✓ ${r.name} kitchenAlertSoundUrl → ${blob.url}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
