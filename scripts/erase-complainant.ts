/**
 * One-off: honor a specific customer's CASL/GDPR "delete my data" request
 * immediately, using the canonical erasure engine (anonymize, keep anonymized
 * tax records). Idempotent. Also writes the unified do-not-email suppression.
 *
 *   Dry-run/verify on the active (dev) branch:
 *     npx tsx scripts/erase-complainant.ts jay.ventura1@gmail.com
 *   Against PRODUCTION (only with the owner's go-ahead):
 *     npx tsx scripts/run-on-prod.ts scripts/erase-complainant.ts jay.ventura1@gmail.com
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const email = (process.argv[2] || "jay.ventura1@gmail.com").trim().toLowerCase();
  // Import AFTER dotenv so @/lib/db picks up the right DATABASE_URL.
  const { anonymizePersonEverywhere } = await import("../src/lib/data-erasure");
  console.log(`Anonymizing ALL data for ${email} ...`);
  const res = await anonymizePersonEverywhere(email, { actor: { via: "superadmin" } });
  console.log(JSON.stringify(res, null, 2));
  console.log("Done. (Re-run is a safe no-op — the operation is idempotent.)");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
