/**
 * Audit both DATABASE_URLs in .env.local so we can see which DB has
 * what data. Useful for figuring out which Neon branch is the real
 * production one when there are multiple.
 *
 * Temporarily rewrites .env.local for each DB (same mechanism as
 * push-schema-to-both.ts), restores it at the end.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const ENV_PATH = ".env.local";
const originalContent = readFileSync(ENV_PATH, "utf8");
const lines = originalContent.split(/\r?\n/);

const urls: string[] = [];
for (const line of lines) {
  const m = line.match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
  if (m && !urls.includes(m[1])) urls.push(m[1]);
}

function rewriteEnv(activeUrl: string) {
  const out = lines.map((line) => {
    const m = line.match(/^(\s*)(#?)\s*(DATABASE_URL\s*=\s*"([^"]+)".*)$/);
    if (!m) return line;
    const indent = m[1];
    const trailing = m[3];
    const url = m[4];
    return url === activeUrl ? `${indent}${trailing}` : `${indent}# ${trailing}`;
  });
  writeFileSync(ENV_PATH, out.join("\n"), "utf8");
}

try {
  for (const url of urls) {
    const masked = url.replace(/:[^:@]+@/, ":***@");
    console.log(`\n========================================`);
    console.log(`Auditing: ${masked}`);
    console.log(`========================================`);
    rewriteEnv(url);
    const r = spawnSync("npx", ["tsx", "scripts/audit-users.ts"], {
      stdio: "inherit",
      shell: true,
    });
    if (r.status !== 0) console.error(`  (audit script exited ${r.status})`);
  }
} finally {
  writeFileSync(ENV_PATH, originalContent, "utf8");
  console.log(`\n(.env.local restored)`);
}
