/** DEV-only: delete gift-* test fixtures created by the browser E2E. */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  if ((process.env.DATABASE_URL || "").includes("dawn-tree")) throw new Error("Refusing PROD");
  const prisma = (await import("../src/lib/db")).default;
  const del = await prisma.pendingRewardGrant.deleteMany({ where: { email: { startsWith: "gift-" } } });
  console.log("cleaned", del.count, "test gift(s)");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
