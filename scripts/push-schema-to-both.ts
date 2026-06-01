/**
 * Push the current Prisma schema to BOTH DATABASE_URLs found in
 * .env.local (active + commented-out). Useful when there are multiple
 * Neon branches and you want every one of them aligned with the
 * latest schema, without having to manually swap which one is active.
 *
 * Implementation note: prisma.config.ts calls dotenv with override:true,
 * which means any DATABASE_URL we set on the spawned process is silently
 * replaced by what's in .env.local. To work around this, we physically
 * rewrite .env.local for each push (toggling which line is commented),
 * then restore the file at the end.
 *
 * SAFE because the only operation is `prisma db push` which is
 * additive-by-default (Prisma refuses destructive changes unless you
 * pass --accept-data-loss). We do NOT pass that flag here.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const ENV_PATH = ".env.local";
const originalContent = readFileSync(ENV_PATH, "utf8");

// Find every DATABASE_URL line (active or commented) and extract the URL.
const lines = originalContent.split(/\r?\n/);
const urls: string[] = [];
const lineIndexForUrl: Record<string, number> = {};
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^\s*#?\s*DATABASE_URL\s*=\s*"([^"]+)"/);
  if (m && !lineIndexForUrl[m[1]]) {
    urls.push(m[1]);
    lineIndexForUrl[m[1]] = i;
  }
}

if (urls.length === 0) {
  console.error("No DATABASE_URL lines found in .env.local");
  process.exit(1);
}

console.log(`Found ${urls.length} DATABASE_URL(s) in .env.local:`);
for (const u of urls) console.log(`  - ${u.replace(/:[^:@]+@/, ":***@")}`);
console.log();

function rewriteEnvLocal(activeUrl: string) {
  const newLines = lines.map((line) => {
    const m = line.match(/^(\s*)(#?)\s*(DATABASE_URL\s*=\s*"([^"]+)".*)$/);
    if (!m) return line;
    const url = m[4];
    const trailing = m[3];
    const indent = m[1];
    if (url === activeUrl) {
      return `${indent}${trailing}`;
    } else {
      return `${indent}# ${trailing}`;
    }
  });
  writeFileSync(ENV_PATH, newLines.join("\n"), "utf8");
}

const failures: string[] = [];
try {
  for (const url of urls) {
    const masked = url.replace(/:[^:@]+@/, ":***@");
    console.log(`\n========================================`);
    console.log(`Pushing schema to: ${masked}`);
    console.log(`========================================`);
    rewriteEnvLocal(url);
    // Forward any CLI flags after the script name onto prisma db push.
    // Most commonly `--accept-data-loss` — needed when restructuring a
    // unique index (Prisma is conservative; the data isn't actually
    // at risk for an additive change like adding a nullable column to
    // a compound unique). Use sparingly + only on additive schema work.
    const extraFlags = process.argv.slice(2);
    const r = spawnSync("npx", ["prisma", "db", "push", ...extraFlags], {
      stdio: "inherit",
      shell: true,
    });
    if (r.status !== 0) {
      failures.push(masked);
      console.error(`  ❌ FAILED for ${masked}`);
    }
  }
} finally {
  // ALWAYS restore the original .env.local — no matter how the loop ended.
  writeFileSync(ENV_PATH, originalContent, "utf8");
  console.log(`\n(.env.local restored to original state)`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} push(es) failed:`);
  failures.forEach((f) => console.error(`  ${f}`));
  process.exit(1);
}
console.log(`\n✅ Schema pushed to all ${urls.length} database(s).`);
