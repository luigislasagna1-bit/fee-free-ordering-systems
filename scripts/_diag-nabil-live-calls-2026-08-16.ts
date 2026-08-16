import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
config({ path: ".env.local" });
function prodUrl(): string { const env = readFileSync(".env.local","utf8"); let url: string|null=null; for (const line of env.split(/\r?\n/)) { const m=line.match(/^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/); if (m) url=m[1]; } if(!url) throw new Error("no prod url"); return url; }
async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: prodUrl() }) } as any);
  const since = new Date(Date.now() - 20 * 60 * 1000);
  const rows = await prisma.voiceCall.findMany({ where: { OR: [{ endedAt: null, startedAt: { gte: new Date(Date.now() - 3600_000) } }, { startedAt: { gte: since } }] }, orderBy: { startedAt: "desc" }, take: 5, select: { id: true, startedAt: true, endedAt: true, outcome: true, durationSeconds: true } });
  console.log(`now=${new Date().toISOString()} recent/live calls: ${rows.length}`);
  for (const r of rows) console.log(" ", r.id, r.startedAt.toISOString(), r.endedAt ? `ended ${r.endedAt.toISOString()}` : "LIVE (no endedAt)", r.outcome ?? "—", r.durationSeconds ?? "—");
  await prisma.$disconnect();
}
main();
