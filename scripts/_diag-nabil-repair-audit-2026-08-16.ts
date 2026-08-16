import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
config({ path: ".env.local" });
function prodUrl(): string { const env = readFileSync(".env.local","utf8"); let url: string|null=null; for (const line of env.split(/\r?\n/)) { const m=line.match(/^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/); if (m) url=m[1]; } if(!url) throw new Error("no prod url"); return url; }
async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString: prodUrl() }) } as any);
  const audits = await prisma.adminAuditLog.findMany({ where: { action: "voice_number.repair_webhooks" }, orderBy: { createdAt: "desc" }, take: 5 });
  for (const a of audits) console.log(a.createdAt.toISOString(), a.actorEmail, a.entity, JSON.stringify(a.detail));
  const vn = await prisma.voiceNumber.findFirst({ where: { phoneNumber: "+13656581458" }, select: { twilioNumberSid: true, status: true, updatedAt: true } });
  console.log("VoiceNumber:", JSON.stringify(vn));
  await prisma.$disconnect();
}
main();
