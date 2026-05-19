/**
 * Reset a user's password on the PRODUCTION DB (whichever one is
 * commented out in .env.local — typically the dawn-tree Neon branch
 * that Vercel uses).
 *
 * Auto-detects which URL is production by picking the one NOT currently
 * active. If both are commented or both are active, errors out.
 *
 * Usage:
 *   npx tsx scripts/reset-password-on-prod.ts <email> <new-password>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const ENV_PATH = ".env.local";
const original = readFileSync(ENV_PATH, "utf8");
const lines = original.split(/\r?\n/);

let activeUrl: string | null = null;
let commentedUrl: string | null = null;
for (const line of lines) {
  const active = line.match(/^\s*DATABASE_URL\s*=\s*"([^"]+)"/);
  if (active) {
    activeUrl = active[1];
    continue;
  }
  const commented = line.match(/^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/);
  if (commented) commentedUrl = commented[1];
}

if (!commentedUrl) {
  console.error("No commented-out DATABASE_URL found in .env.local — can't identify production DB.");
  process.exit(1);
}

const [, , email, password] = process.argv;
if (!email || !password) {
  console.error("Usage: npx tsx scripts/reset-password-on-prod.ts <email> <new-password>");
  process.exit(1);
}

console.log(`Target (commented-out / production): ${commentedUrl.replace(/:[^:@]+@/, ":***@")}`);
console.log(`Resetting: ${email}`);

// Temporarily flip .env.local to make the commented URL active, run the
// reset, then restore. Same pattern as push-schema-to-both.ts.
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

try {
  rewriteEnv(commentedUrl);
  const r = spawnSync(
    "npx",
    ["tsx", "scripts/reset-password.ts", email, password],
    { stdio: "inherit", shell: true },
  );
  if (r.status !== 0) {
    console.error(`reset-password.ts exited with status ${r.status}`);
    process.exit(r.status ?? 1);
  }
} finally {
  writeFileSync(ENV_PATH, original, "utf8");
  console.log(`\n(.env.local restored to original state)`);
}
