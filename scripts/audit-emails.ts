/**
 * Email + auth diagnostic. Checks:
 *   1. Is Resend (email service) configured?
 *   2. What users exist on this DB?
 *   3. Recent password reset tokens — were they created? Used?
 *
 * Usage:
 *   npx tsx scripts/audit-emails.ts <db-url>
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";

const url = process.argv[2];
if (!url) { console.error("Usage: npx tsx scripts/audit-emails.ts <db-url>"); process.exit(1); }

function ok(s: string) { console.log("\x1b[32m✅\x1b[0m " + s); }
function bad(s: string) { console.log("\x1b[31m❌\x1b[0m " + s); }
function warn(s: string) { console.log("\x1b[33m⚠️ \x1b[0m " + s); }
function info(s: string) { console.log("   " + s); }
function section(s: string) { console.log("\n" + "═".repeat(70) + "\n " + s + "\n" + "═".repeat(70)); }

async function main() {
  const adapter = new PrismaNeon({ connectionString: url });
  const prisma = new PrismaClient({ adapter } as any);

  section("1. Resend (email) Configuration  (/superadmin/settings/email)");
  const settings = await prisma.platformSettings.findUnique({ where: { id: "singleton" } });
  if (!settings) {
    bad("PlatformSettings row missing");
  } else {
    const hasKey = !!settings.resendApiKeyEnc && !!settings.resendApiKeyIv && !!settings.resendApiKeyTag;
    const hasFrom = !!settings.emailFrom;
    console.log(`Resend API key (encrypted in DB): ${hasKey ? "✅ present" : "❌ MISSING"}`);
    console.log(`Email From address:               ${settings.emailFrom || "❌ MISSING"}`);
    if (!hasKey) {
      bad("Resend API key is not set — NO emails will send from prod");
      info("Fix: go to /superadmin/settings/email, paste Resend API key (re_...) + a From address");
      info("Get key from https://resend.com/api-keys");
    }
    if (!hasFrom) {
      bad("Email From address is not set");
      info("Format: 'Fee Free Ordering <hello@yourdomain.com>' — must be a domain you've verified at resend.com/domains");
    }
    // Env fallback?
    if (!hasKey && process.env.RESEND_API_KEY) {
      warn("RESEND_API_KEY env var is set locally but not in production");
    }
  }

  section("2. User Accounts on this DB");
  const users = await prisma.user.findMany({
    select: {
      email: true, role: true, isActive: true, emailVerifiedAt: true,
      passwordHash: true, createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Total users: ${users.length}\n`);
  console.log("Active | Verified | Role                  | Email                                   | PwAlgo | Created");
  console.log("-".repeat(120));
  for (const u of users) {
    const active = u.isActive ? "✅    " : "❌ NO!";
    const ver = u.emailVerifiedAt ? "✅      " : "❌      ";
    const pw = u.passwordHash ? u.passwordHash.slice(0, 7) : "(none) ";
    console.log(`${active} | ${ver} | ${u.role.padEnd(21)} | ${u.email.padEnd(39)} | ${pw} | ${u.createdAt.toISOString().slice(0, 10)}`);
  }

  section("3. Password Reset Tokens (recent activity)");
  const tokens = await prisma.passwordResetToken.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { user: { select: { email: true } } },
  });
  if (tokens.length === 0) {
    warn("No password reset tokens ever created — either nobody used forgot-password, or the route isn't writing tokens");
  } else {
    console.log(`Recent reset tokens: ${tokens.length}`);
    for (const t of tokens) {
      const used = t.usedAt ? `used ${t.usedAt.toISOString().slice(0, 16)}` : "unused";
      const expired = t.expiresAt < new Date() ? " (EXPIRED)" : "";
      console.log(`  ${t.user.email.padEnd(40)} created=${t.createdAt.toISOString().slice(0, 16)}  ${used}${expired}`);
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
