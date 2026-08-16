/**
 * READ-ONLY diagnostic: dump the last N Nabil calls (transcript + timeline
 * events) for a restaurant so a bad call can be diagnosed from evidence.
 *
 *   npx tsx scripts/_read-recent-nabil-calls-2026-08-16.ts --db prod --slug luigis-lasagna-pizzeria --n 5
 *
 * Prints to stdout only. Never writes. Phone digits are shown masked.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { config } from "dotenv";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

const args = process.argv.slice(2);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const db = opt("--db", "dev");
const slug = opt("--slug", "luigis-lasagna-pizzeria");
const n = Number(opt("--n", "5"));
const out = opt("--out", "");

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

const mask = (p: string | null | undefined) => (p ? p.replace(/\d(?=\d{4})/g, "•") : "—");

async function main() {
  const url = db === "prod" ? prodUrl() : process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);
  const lines: string[] = [];
  const log = (s: string) => {
    lines.push(s);
    console.log(s);
  };
  try {
    const r = await prisma.restaurant.findFirst({
      where: { slug },
      select: { id: true, name: true, timezone: true, hoursFormat: true },
    });
    if (!r) throw new Error(`No restaurant with slug ${slug}`);
    log(`# ${r.name} (${r.id}) tz=${r.timezone} hoursFormat=${(r as any).hoursFormat ?? "?"} db=${db}`);

    const calls = await prisma.voiceCall.findMany({
      where: { restaurantId: r.id },
      orderBy: { startedAt: "desc" },
      take: n,
      select: {
        id: true,
        callSid: true,
        startedAt: true,
        endedAt: true,
        durationSeconds: true,
        outcome: true,
        transferReason: true,
        orderNumber: true,
        quotedTotal: true,
        chargedTotal: true,
        summary: true,
        transcript: true,
        agentVersion: true,
        promptVersion: true,
        toolsVersion: true,
        fromNumber: true,
        events: {
          orderBy: { seq: "asc" },
          select: { seq: true, turn: true, type: true, ts: true, payload: true, latencyMs: true },
        },
      },
    });

    for (const c of calls) {
      log(`\n\n================================================================`);
      log(`CALL ${c.id}  sid=${c.callSid}  from=${mask(c.fromNumber)}`);
      log(`start=${c.startedAt.toISOString()} end=${c.endedAt?.toISOString() ?? "—"} dur=${c.durationSeconds ?? "—"}s outcome=${c.outcome ?? "—"} transfer=${c.transferReason ?? "—"} order=${c.orderNumber ?? "—"} quoted=${c.quotedTotal ?? "—"} charged=${c.chargedTotal ?? "—"}`);
      log(`versions agent=${c.agentVersion ?? "—"} prompt=${c.promptVersion ?? "—"} tools=${c.toolsVersion ?? "—"}`);
      log(`summary: ${c.summary ?? "—"}`);
      log(`--- transcript ---`);
      log(c.transcript ?? "(none)");
      log(`--- timeline (${c.events.length} events) ---`);
      for (const e of c.events) {
        const p = e.payload as any;
        let brief = "";
        try {
          brief = JSON.stringify(p);
        } catch {
          brief = String(p);
        }
        if (brief.length > 1500) brief = brief.slice(0, 1500) + "…";
        log(`[${String(e.seq).padStart(3, " ")}] t${e.turn ?? "-"} ${e.type} @${new Date(e.ts).toISOString().slice(11, 23)}${e.latencyMs != null ? ` (${e.latencyMs}ms)` : ""} ${brief}`);
      }
    }
    if (out) writeFileSync(out, lines.join("\n"), "utf8");
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
