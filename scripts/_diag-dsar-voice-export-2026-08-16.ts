/**
 * READ-ONLY: prove the DSAR export bundle carries Nabil calls for a caller.
 * Picks the most recent VoiceCall of a restaurant, derives the voice sentinel
 * email the order path stores for that caller (voice.<digits>@voice.nabil.invalid),
 * runs exportPersonData() for it and prints COUNTS only (no PII).
 *
 *   npx tsx scripts/_diag-dsar-voice-export-2026-08-16.ts --db prod --slug luigis-lasagna-pizzeria
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const db = opt("--db", "dev");
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
  if (db === "prod") process.env.DATABASE_URL = prodUrl();
  // Import AFTER the env is set so @/lib/db opens the right database.
  const { default: prisma } = await import("@/lib/db");
  const { exportPersonData } = await import("@/lib/data-erasure");
  const { sentinelEmailForDigits } = await import("@/lib/voice/sentinel-identity").catch(() => ({ sentinelEmailForDigits: null as null | ((d: string) => string) }));

  const r = await prisma.restaurant.findFirst({ where: { slug }, select: { id: true, name: true } });
  if (!r) throw new Error("no restaurant");
  const call = await prisma.voiceCall.findFirst({
    where: { restaurantId: r.id, fromDigits: { not: null }, orderNumber: { not: null } },
    orderBy: { startedAt: "desc" },
    select: { id: true, fromDigits: true, orderNumber: true },
  });
  if (!call?.fromDigits) throw new Error("no voice call with fromDigits");
  const email = sentinelEmailForDigits ? sentinelEmailForDigits(call.fromDigits) : `voice.${call.fromDigits}@voice.nabil.invalid`;

  const bundle = await exportPersonData({ restaurantId: r.id, email });
  const counts = {
    account: bundle.account ? 1 : 0,
    customers: bundle.customers.length,
    orders: bundle.orders.length,
    addresses: bundle.addresses.length,
    orderItemNotes: bundle.orderItemNotes.length,
    orderRatings: bundle.orderRatings.length,
    reservations: bundle.reservations.length,
    voiceCalls: bundle.voiceCalls.length,
    voiceCallsWithRecordingFlag: bundle.voiceCalls.filter((c: any) => typeof c.hasRecording === "boolean").length,
    voiceCallsLeakingRecordingSid: bundle.voiceCalls.filter((c: any) => "recordingSid" in c).length,
    truncated: bundle.truncated,
  };
  console.log(`[${db}] ${r.name}: latest call ${call.id} (digits ***${call.fromDigits.slice(-4)}) → export for the caller's sentinel identity`);
  console.log(JSON.stringify(counts, null, 1));
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
