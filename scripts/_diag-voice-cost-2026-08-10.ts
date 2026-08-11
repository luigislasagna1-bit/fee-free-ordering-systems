/** READ-ONLY: are the per-call cost figures believable? Prints raw token
 *  counts next to the stored costCents so the math can be checked by hand. */
import { config } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaPg } from "@prisma/adapter-pg";

config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.DATABASE_URL!;
  const isNeon = /\.neon\.tech([:/?]|$)/i.test(url);
  const adapter = isNeon ? new PrismaNeon({ connectionString: url }) : new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  const rows = await prisma.voiceCall.findMany({
    where: { tokensIn: { not: null } },
    orderBy: { startedAt: "desc" },
    take: 10,
    select: { callSid: true, durationSeconds: true, tokensIn: true, tokensOut: true, costCents: true, model: true },
  });
  for (const r of rows) {
    const tin = r.tokensIn ?? 0;
    const tout = r.tokensOut ?? 0;
    // Sonnet list price 2026-08: $3 / MTok in, $15 / MTok out.
    const expectedCents = (tin / 1_000_000) * 3 * 100 + (tout / 1_000_000) * 15 * 100;
    console.log(
      `${r.callSid} dur=${r.durationSeconds ?? "-"}s in=${tin} out=${tout} ` +
        `stored=${r.costCents}c expected=${expectedCents.toFixed(2)}c model=${r.model ?? "-"}`,
    );
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
