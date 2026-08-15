/**
 * Queue a message to the platform owner (Luigi / the superadmins + ops inbox).
 *
 *   npx tsx scripts/send-ops-message.ts "<subject>" <body-file> [--link /path] [--cta "label"] [--db prod|dev]
 *
 *   <body-file>  path to a plain-text file; newlines are preserved (a blank
 *                line starts a new paragraph in the email).
 *   --link       app-relative ("/superadmin/…") or absolute http(s) URL for
 *                the email CTA + in-app bell link.
 *   --cta        CTA button label (only used with --link; defaults to "Open").
 *   --db dev     (default) the ACTIVE DATABASE_URL in .env.local / .env
 *   --db prod    the COMMENTED-OUT production DATABASE_URL in .env.local — the
 *                same line scripts/run-on-prod.ts and nabil-snapshot-menu.ts
 *                recognise — read into process.env only. .env.local is NEVER
 *                rewritten.
 *
 * Nothing is emailed from here (no Resend key needed locally): this only
 * INSERTs an OpsMessage row (src/lib/ops-messages.ts). Production's
 * every-minute eod-digest-closing cron picks it up and emails it to the
 * superadmin audience + support@ within ~1 minute — so `--db prod` is the
 * one that actually reaches Luigi; `--db dev` rows sit in the dev branch
 * until something runs the dispatcher there.
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

config({ path: ".env.local" });
config({ path: ".env" });

// The lib imports the Next-only marker "server-only", which doesn't resolve
// under tsx. Reroute just that specifier to an empty module (same shim as
// scripts/nabil-snapshot-menu.ts).
const req = createRequire(import.meta.url);
const Module = req("module");
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...rest: unknown[]) {
  if (request === "server-only") return req.resolve("./_noop.cjs");
  return origResolve.call(this, request, ...rest);
};

/* ─────────────────────────────── args ──────────────────────────────────── */

const USAGE =
  'Usage: npx tsx scripts/send-ops-message.ts "<subject>" <body-file> [--link /path] [--cta "label"] [--db prod|dev]';

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  let link: string | undefined;
  let cta: string | undefined;
  let db: "prod" | "dev" = "dev";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--link") link = argv[++i];
    else if (a.startsWith("--link=")) link = a.slice("--link=".length);
    else if (a === "--cta") cta = argv[++i];
    else if (a.startsWith("--cta=")) cta = a.slice("--cta=".length);
    else if (a === "--db") db = argv[++i] as "prod" | "dev";
    else if (a.startsWith("--db=")) db = a.slice("--db=".length) as "prod" | "dev";
    else if (a.startsWith("--")) throw new Error(`Unknown flag ${a}\n${USAGE}`);
    else positional.push(a);
  }
  const subject = (positional[0] || "").trim();
  const bodyFile = (positional[1] || "").trim();
  if (!subject || !bodyFile) throw new Error(USAGE);
  if (db !== "prod" && db !== "dev") throw new Error(`--db must be prod or dev, got ${db}`);
  return { subject, bodyFile, link, cta, db };
}

/** The commented-out `# DATABASE_URL="…"` line in .env.local is production
 *  (see scripts/run-on-prod.ts). Read it; never write it back. */
function productionUrlFromEnvLocal(): string {
  const text = readFileSync(".env.local", "utf8");
  let url: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*#\s*DATABASE_URL\s*=\s*"([^"]+)"/);
    if (m) url = m[1];
  }
  if (!url) throw new Error("No commented-out DATABASE_URL found in .env.local — can't identify production DB.");
  return url;
}

const mask = (u: string) => u.replace(/:[^:@]+@/, ":***@");

/* ─────────────────────────────── main ──────────────────────────────────── */

async function main() {
  const { subject, bodyFile, link, cta, db } = parseArgs(process.argv.slice(2));

  if (db === "prod") {
    process.env.DATABASE_URL = productionUrlFromEnvLocal();
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set.");
  console.log(`[ops-message] db=${db} → ${mask(process.env.DATABASE_URL)}`);

  const body = readFileSync(bodyFile, "utf8");

  // Dynamic imports AFTER the URL is decided (src/lib/db.ts reads it at load).
  const [{ default: prisma }, { enqueueOpsMessage }] = await Promise.all([
    import("../src/lib/db"),
    import("../src/lib/ops-messages"),
  ]);

  const { id } = await enqueueOpsMessage({ subject, body, link, ctaLabel: cta });
  console.log(`[ops-message] queued id=${id}`);
  console.log(`[ops-message] subject: ${subject}`);
  console.log(`[ops-message] body: ${body.length} chars from ${bodyFile}${link ? ` · link ${link}` : ""}${cta ? ` · cta "${cta}"` : ""}`);
  console.log(
    db === "prod"
      ? "[ops-message] production's every-minute cron will email it to the superadmins + ops inbox within ~1 minute."
      : "[ops-message] queued on DEV — nothing emails dev rows automatically (Vercel crons run on prod only).",
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
