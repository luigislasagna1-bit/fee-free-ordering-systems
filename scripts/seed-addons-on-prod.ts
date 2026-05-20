/**
 * Run prisma/seed-addons.ts against the PRODUCTION Neon branch.
 *
 * The seed is upsert-based on slug, so running it against prod is safe
 * — it adds any add-ons missing from the catalog (e.g. marketplace,
 * driver_pool added later) and refreshes the non-Stripe metadata
 * (name, description, displayOrder, enabledFeatures) on existing rows.
 * Stripe productId / priceId / monthlyPriceCents are NOT clobbered.
 *
 * Usage:
 *   npx tsx scripts/seed-addons-on-prod.ts
 *
 * Same auto-swap-.env.local + belt-and-suspenders restore pattern as the
 * other prod scripts (reset-password-on-prod, unpublish-incomplete-on-prod).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const ENV_PATH = ".env.local";
const original = readFileSync(ENV_PATH, "utf8");
const lines = original.split(/\r?\n/);

let commentedUrl: string | null = null;
for (const line of lines) {
  const m = line.match(/^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/);
  if (m) commentedUrl = m[1];
}
if (!commentedUrl) {
  console.error("No commented-out DATABASE_URL found in .env.local — can't identify production DB.");
  process.exit(1);
}
console.log(`Targeting commented-out (production) DB: ${commentedUrl.replace(/:[^:@]+@/, ":***@")}`);

function rewriteEnv(makeActive: string) {
  const out = lines.map((line) => {
    const m = line.match(/^(\s*)(#?)\s*(DATABASE_URL\s*=\s*"([^"]+)".*)$/);
    if (!m) return line;
    const indent = m[1];
    const trailing = m[3];
    const url = m[4];
    return url === makeActive ? `${indent}${trailing}` : `${indent}# ${trailing}`;
  });
  writeFileSync(ENV_PATH, out.join("\n"), "utf8");
}

let restored = false;
function restore() {
  if (restored) return;
  restored = true;
  try {
    writeFileSync(ENV_PATH, original, "utf8");
    console.log(`\n(.env.local restored to original state)`);
  } catch (e) {
    console.error("Failed to restore .env.local:", e);
  }
}
process.on("exit", restore);
process.on("SIGINT", () => { restore(); process.exit(130); });
process.on("SIGTERM", () => { restore(); process.exit(143); });
process.on("uncaughtException", (e) => { console.error(e); restore(); process.exit(1); });

try {
  rewriteEnv(commentedUrl);
  const r = spawnSync(
    "npx",
    ["tsx", "prisma/seed-addons.ts"],
    { stdio: "inherit", shell: true },
  );
  if (r.status !== 0 && r.status !== 3221226505) {
    console.error(`seed-addons exited with status ${r.status}`);
    restore();
    process.exit(r.status ?? 1);
  }
} finally {
  restore();
}
