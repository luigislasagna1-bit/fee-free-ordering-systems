/**
 * READ-ONLY: for every non-released Nabil number, print the numbers each
 * fallback layer would ring (the same precedence as the Fly feed) so the
 * NABIL_FALLBACK_MAP / NABIL_FALLBACK_DEFAULT_NUMBER proposal is made from
 * data, not memory. `--db prod` reads the commented-out prod URL in .env.local.
 */
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const db = process.argv.includes("--db") ? process.argv[process.argv.indexOf("--db") + 1] : "dev";

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
  const url = db === "prod" ? prodUrl() : process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  try {
    const rows = await prisma.voiceNumber.findMany({
      where: { status: { not: "released" } },
      select: {
        phoneNumber: true, status: true, enabled: true, twilioNumberSid: true,
        restaurant: { select: { name: true, slug: true, phone: true, alertPhone: true, voiceAgentConfig: { select: { transferToNumber: true } } } },
      },
    });
    for (const r of rows) {
      const t = (r.restaurant.voiceAgentConfig?.transferToNumber || "").trim();
      const a = (r.restaurant.alertPhone || "").trim();
      const p = (r.restaurant.phone || "").trim();
      console.log(`[${db}] ${r.phoneNumber} (${r.status}${r.enabled ? "" : ", agent off"}; sid ${r.twilioNumberSid ?? "—"}) → ${r.restaurant.name} [${r.restaurant.slug}]`);
      console.log(`     transferToNumber=${t || "—"}  alertPhone=${a || "—"}  phone=${p || "—"}  ⇒ Fly feed dials ${t || a || p || "NOTHING"}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
