/**
 * Import a Reseller Report into the PRODUCTION DB (the commented-out
 * DATABASE_URL in .env.local — the Neon branch Vercel uses).
 *
 * Temporarily flips .env.local so the commented (prod) URL becomes
 * active, runs import-reseller-report.ts, then restores .env.local.
 * Same belt-and-suspenders restore pattern as reset-password-on-prod.ts
 * and seed-addons-on-prod.ts.
 *
 * Screenshots need BLOB_READ_WRITE_TOKEN in .env.local (the blob store
 * is shared, so the same token works regardless of which DB branch).
 *
 * Usage:
 *   npx tsx scripts/import-reseller-report-on-prod.ts <spec.json>
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

const [, , specPath] = process.argv;
if (!specPath) {
  console.error("Usage: npx tsx scripts/import-reseller-report-on-prod.ts <spec.json>");
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
    ["tsx", "scripts/import-reseller-report.ts", specPath],
    { stdio: "inherit", shell: true },
  );
  if (r.status !== 0 && r.status !== 3221226505) {
    console.error(`import-reseller-report exited with status ${r.status}`);
    restore();
    process.exit(r.status ?? 1);
  }
} finally {
  restore();
}
