/**
 * Generic "run this script against the PRODUCTION DB" wrapper.
 *
 * Flips .env.local so the commented-out (production) DATABASE_URL becomes
 * active, runs `npx tsx <script> [args...]`, then restores .env.local —
 * same belt-and-suspenders restore pattern as reset-password-on-prod.ts.
 * Use for the reseller-report triage scripts (list/comment) so they read
 * and write the live data resellers see.
 *
 * Usage:
 *   npx tsx scripts/run-on-prod.ts scripts/list-open-reports.ts
 *   npx tsx scripts/run-on-prod.ts scripts/post-report-comment.ts <id> "comment"
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

const [, , script, ...rest] = process.argv;
if (!script) {
  console.error("Usage: npx tsx scripts/run-on-prod.ts <script.ts> [args...]");
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
  const r = spawnSync("npx", ["tsx", script, ...rest], { stdio: "inherit", shell: true });
  if (r.status !== 0 && r.status !== 3221226505) {
    console.error(`${script} exited with status ${r.status}`);
    restore();
    process.exit(r.status ?? 1);
  }
} finally {
  restore();
}
