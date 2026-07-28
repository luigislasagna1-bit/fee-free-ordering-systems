/** READ-ONLY: who actually uses PrintNode? Both branches. */
import { readFileSync } from "node:fs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

function urls(): string[] {
  const out: string[] = [];
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

async function main() {
  for (const url of urls()) {
    const branch = url.includes("dawn-tree") ? "PROD" : "dev";
    const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: url }) } as any);
    try {
      const enabled = await prisma.restaurant.findMany({
        where: { printNodeEnabled: true },
        select: { slug: true },
      });
      // The credentials live on a settings side-model (schema:2668) — find its rows.
      const withKeys = await prisma.restaurant.findMany({
        where: { printerSettings: { printNodeApiKeyEnc: { not: null } } },
        select: { slug: true, printerSettings: { select: { printNodeConnected: true, printNodeAccountName: true } } },
      }).catch(() => "no printerSettings relation — will locate model");
      console.log(`[${branch}] printNodeEnabled=true: ${enabled.map((r) => r.slug).join(", ") || "(none)"}`);
      console.log(`[${branch}] with stored API keys:`, JSON.stringify(withKeys));
    } catch (e: any) {
      console.error(`[${branch}] FAIL`, e?.message?.slice(0, 200));
    } finally {
      await prisma.$disconnect();
    }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
