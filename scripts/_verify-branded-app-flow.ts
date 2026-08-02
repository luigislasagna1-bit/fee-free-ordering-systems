/** DEV-ONLY: exercise the branded-app fulfillment machinery below the auth
 *  layer (2026-08-02) — transition legality/idempotency, credential encrypt
 *  round-trip, and the event trail — against the demo project created via
 *  the wizard browser test.
 *    npx tsx scripts/_verify-branded-app-flow.ts
 */
import { config as cfg } from "dotenv"; cfg({ path: ".env.local" }); cfg({ path: ".env" });
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encrypt, decrypt } from "../src/lib/encrypt";
import { canTransition } from "../src/lib/branded-app/status";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) } as any);

async function main() {
  const project = await prisma.brandedAppProject.findFirst({
    where: { restaurant: { slug: "demo-pizza-palace" } },
    include: { platforms: true },
  });
  if (!project) { console.error("no demo project — run the wizard first"); process.exit(1); }
  const android = project.platforms.find((p) => p.platform === "android")!;
  console.log(`project ${project.id} v${project.approvedConfigVersion} · android=${android.status}`);

  // 1) Illegal transition must be refused by the pure machine.
  console.log(`1) submitted→live legal? ${canTransition("submitted", "live")} (expect false)`);

  // 2) Conditional-update idempotency: simulate two racing identical
  //    transitions — exactly ONE updateMany may win.
  const [a, b] = await Promise.all([
    prisma.brandedAppPlatform.updateMany({ where: { id: android.id, status: "submitted" }, data: { status: "building" } }),
    prisma.brandedAppPlatform.updateMany({ where: { id: android.id, status: "submitted" }, data: { status: "building" } }),
  ]);
  console.log(`2) racing transitions won: ${a.count}+${b.count} (expect exactly 1 total) → ${a.count + b.count === 1 ? "PASS" : "FAIL"}`);
  // put it back for the real superadmin flow later
  await prisma.brandedAppPlatform.update({ where: { id: android.id }, data: { status: "submitted" } });

  // 3) Credential encrypt → store → read → decrypt round-trip; ciphertext only in DB.
  const secret = JSON.stringify({ type: "service_account", private_key: "TEST-NOT-REAL-" + Date.now() });
  const { enc, iv, tag } = encrypt(secret);
  await prisma.brandedAppStoreCredential.upsert({
    where: { projectId_kind: { projectId: project.id, kind: "google_service_account" } },
    update: { secretEnc: enc, secretIv: iv, secretTag: tag, addedByUserId: "dev-script" },
    create: { projectId: project.id, kind: "google_service_account", secretEnc: enc, secretIv: iv, secretTag: tag, addedByUserId: "dev-script" },
  });
  const stored = await prisma.brandedAppStoreCredential.findUnique({
    where: { projectId_kind: { projectId: project.id, kind: "google_service_account" } },
  });
  const roundTrip = decrypt(stored!.secretEnc, stored!.secretIv, stored!.secretTag);
  console.log(`3) credential round-trip: ${roundTrip === secret ? "PASS" : "FAIL"} · ciphertext differs from plaintext: ${stored!.secretEnc !== secret ? "PASS" : "FAIL"}`);

  // 4) Event trail from the wizard run.
  const events = await prisma.brandedAppEvent.findMany({
    where: { projectId: project.id },
    orderBy: { createdAt: "asc" },
    select: { type: true, platform: true, visibility: true, messageKey: true },
  });
  console.log(`4) events: ${events.map((e) => `${e.type}${e.platform ? ":" + e.platform : ""}(${e.visibility})`).join(", ")}`);
  const visibleCount = events.filter((e) => e.visibility === "restaurant").length;
  console.log(`   restaurant-visible: ${visibleCount} (expect ≥3: approve + 2× submitted) → ${visibleCount >= 3 ? "PASS" : "FAIL"}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
