/** DEV-only: print the seeded demo VoiceCall ids for browser verification. */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const rows = await prisma.voiceCall.findMany({
    where: { callSid: { startsWith: "CAdemo" } },
    orderBy: { callSid: "asc" },
    select: { id: true, callSid: true, outcome: true },
  });
  for (const r of rows) console.log(`${r.callSid} ${r.outcome} /admin/phone-ordering/calls/${r.id}`);
}
main().finally(() => prisma.$disconnect());
