/**
 * READ-ONLY: who are the superadmins (and what email would platform
 * notifications land on), plus the platform email-sending config.
 *   npx tsx scripts/run-on-prod.ts scripts/diag-superadmins.ts
 */
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

  const sas = await prisma.user.findMany({
    where: { role: "superadmin" },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  console.log(`\nSUPERADMIN users (${sas.length}):`);
  for (const u of sas) console.log(`   • ${u.email}   (name=${u.name ?? "—"}, id=${u.id})`);

  // Is there a User at the ops address at all?
  const support = await prisma.user.findFirst({
    where: { email: { equals: "support@feefreeordering.com", mode: "insensitive" } },
    select: { email: true, role: true },
  });
  console.log(`\nsupport@feefreeordering.com user: ${support ? `${support.email} (role=${support.role})` : "— none —"}`);

  // Platform email config (don't print secrets — just whether they're set).
  try {
    const ps: any = await (prisma as any).platformSettings.findFirst({
      select: { emailFrom: true, resendApiKeyEnc: true },
    });
    console.log(`\nPlatformSettings.emailFrom: ${ps?.emailFrom ?? "— not set (falls back to EMAIL_FROM env) —"}`);
    console.log(`PlatformSettings.resendApiKey set in DB: ${ps?.resendApiKeyEnc ? "YES" : "no (falls back to RESEND_API_KEY env)"}`);
  } catch (e) {
    console.log(`\n(platformSettings read failed: ${(e as Error).message})`);
  }
  console.log(`\nenv RESEND_API_KEY present: ${process.env.RESEND_API_KEY ? "YES" : "no"}`);
  console.log(`env EMAIL_FROM: ${process.env.EMAIL_FROM ?? "— not set —"}`);
  console.log(`env REPORTS_OPS_EMAIL: ${process.env.REPORTS_OPS_EMAIL ?? "— not set (defaults support@feefreeordering.com) —"}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
