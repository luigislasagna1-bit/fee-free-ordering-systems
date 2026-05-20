/**
 * Run scripts/unpublish-incomplete-restaurants.ts against the PRODUCTION
 * Neon branch (the URL that's currently commented out in .env.local,
 * which by convention is what Vercel reads from its env vars).
 *
 * Auto-swaps .env.local for the duration of the run, then restores it.
 * Same pattern as scripts/reset-password-on-prod.ts and
 * scripts/push-schema-to-both.ts.
 *
 * Usage:
 *   npx tsx scripts/unpublish-incomplete-on-prod.ts          # dry run
 *   npx tsx scripts/unpublish-incomplete-on-prod.ts --apply  # actually write
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

// Belt-and-suspenders restore: register on multiple exit signals so
// .env.local always restores, even if process.exit() or an uncaught
// exception bypasses the synchronous finally below.
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

const passthroughArgs = process.argv.slice(2);
try {
  rewriteEnv(commentedUrl);
  const r = spawnSync(
    "npx",
    ["tsx", "scripts/unpublish-incomplete-restaurants.ts", ...passthroughArgs],
    { stdio: "inherit", shell: true },
  );
  // Non-zero exit from the child is expected sometimes (the inner
  // script's Neon HTTP client triggers a Windows UV assertion on
  // shutdown). Don't propagate the bogus exit code — the output
  // already printed everything the operator needs.
  if (r.status !== 0 && r.status !== 3221226505) {
    console.error(`unpublish-incomplete-restaurants.ts exited with status ${r.status}`);
    restore();
    process.exit(r.status ?? 1);
  }
} finally {
  restore();
}
