/**
 * THE NABIL RELEASE GATE (directive §28).
 *
 *   npx tsx scripts/nabil-release.ts [--deploy] [--target staging|current] [--image <ref>]
 *                                    [--repeat 3] [--concurrency 4] [--skip-sim]
 *
 * Runs, in order, and STOPS at the first red:
 *   1. voice-service typecheck                       (npm run typecheck:voice)
 *   2. deterministic voice tests                     (vitest src/lib/voice)
 *   3. the CRITICAL + INJECTION simulation suites    (nabil:sim, real model, N× each)
 * then prints a go/no-go table, appends one line to reports/nabil-sim/HISTORY.md,
 * and only when deploying AND green runs `fly deploy`.
 *
 * TWO LANES (Luigi 2026-08-22 — nothing reaches the live line untested;
 * docs/NABIL-RELEASE-CHECKLIST.md):
 *   --target staging   (default when deploying) builds from the working tree
 *                      and deploys to nabil-voice-staging (fly.staging.toml),
 *                      git SHA baked in as agentVersion. Test it on the staging
 *                      phone line first.
 *   --target current   the LIVE app. Requires --image <ref> — the image the
 *                      staging lane already proved — so promotion never rebuilds
 *                      (and rollback is the previous image ref from HISTORY.md).
 *                      --allow-build-on-current is the documented escape hatch.
 *   --image <ref>      deploy an already-built image (promote / roll back).
 * Every deploy appends a `DEPLOY <target>` row with the image ref to HISTORY.md.
 *
 * The LLM suite is never part of `npm run preflight` (cost + key); it is this
 * script's job. Vercel must be deployed BEFORE Fly for a change that touches
 * both (build-line is additive; the Fly side may need the new kinds).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, appendFileSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(n);
const opt = (n: string, d: string) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const repeat = opt("--repeat", "3");
const concurrency = opt("--concurrency", "4");
const reportsDir = join(process.cwd(), "reports", "nabil-sim");
mkdirSync(reportsDir, { recursive: true });

function run(label: string, cmd: string, cmdArgs: string[], cwd?: string): boolean {
  console.log(`\n━━━ ${label}: ${cmd} ${cmdArgs.join(" ")}${cwd ? ` (in ${cwd})` : ""}`);
  const r = spawnSync(cmd, cmdArgs, { stdio: "inherit", shell: process.platform === "win32", cwd });
  const ok = r.status === 0;
  console.log(ok ? `✅ ${label} passed` : `❌ ${label} FAILED (exit ${r.status})`);
  return ok;
}

const sha = (() => {
  const r = spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8", shell: process.platform === "win32" });
  return (r.stdout || "").trim() || "unknown";
})();
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const runStartedAt = Date.now();
const results: Array<[string, boolean]> = [];
void stamp;

results.push(["typecheck:voice", run("typecheck:voice", "npm", ["run", "typecheck:voice"])]);
if (results.every(([, ok]) => ok)) results.push(["voice unit tests", run("voice unit tests", "npx", ["vitest", "run", "src/lib/voice"])]);
if (results.every(([, ok]) => ok) && !flag("--skip-sim")) {
  results.push([
    "critical+injection sim",
    run("critical+injection sim", "npx", ["tsx", "scripts/nabil-sim.ts", "--suite", "critical", "--repeat", repeat, "--concurrency", concurrency, "--out", reportsDir]),
  ]);
}

// COST GATE (Luigi 2026-08-15): ≤ 40¢ per call-minute ALL-IN. Twilio
// ConversationRelay + inbound voice take ~8¢, so the model share must stay
// under 30¢ per estimated call-minute (turns × 10 s). Read off the report we
// just wrote.
if (results.every(([, ok]) => ok) && !flag("--skip-sim")) {
  try {
    // The CLI names reports by its own timestamp — take the newest critical report written since this run started.
    const files = readdirSync(reportsDir).filter((f) => f.endsWith(".json") && f.includes("critical") && statSync(join(reportsDir, f)).mtimeMs >= runStartedAt);
    const latest = files.sort().pop();
    if (latest) {
      const m = JSON.parse(readFileSync(join(reportsDir, latest), "utf8")).metrics ?? {};
      const cpm = Number(m.modelCentsPerEstMinute ?? 0);
      // Luigi 2026-08-15 (after the first live call): quality and reliability
      // first — going a little over the 40¢/min mark is acceptable. So: WARN
      // past the 30¢ model share (≈ 40¢ all-in), FAIL only past 40¢ model
      // share (≈ 48¢ all-in), which is where "a little over" stops.
      const ok = cpm <= 40;
      const warn = cpm > 30;
      console.log(`\n━━━ cost gate: model ${cpm.toFixed(1)}¢ per est. call-minute → ${ok ? (warn ? "⚠️ over the 30¢ target (allowed: quality first)" : "✅") : "❌ OVER THE HARD CEILING (40¢ model share)"}`);
      results.push(["cost ≤ 40¢/min model share (warn > 30¢)", ok]);
      const robotic = Number(m.roboticUtteranceRate ?? 0);
      console.log(`━━━ naturalness: robotic-utterance rate ${(robotic * 100).toFixed(1)}% (target 0)${robotic > 0 ? " — see the report's 'Robotic utterances' section" : ""}`);
      results.push(["robotic-utterance rate ≤ 2%", robotic <= 0.02]);
    }
  } catch (e) {
    console.warn("cost gate: could not read the report", e);
  }
}

const green = results.every(([, ok]) => ok);
console.log("\n━━━ GO / NO-GO");
for (const [label, ok] of results) console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
console.log(`  ${green ? "🟢 GO" : "🔴 NO-GO"}  sha ${sha}`);

const historyPath = join(reportsDir, "HISTORY.md");
if (!existsSync(historyPath)) appendFileSync(historyPath, "# Nabil release history\n\n| when (UTC) | sha | result | repeat | notes |\n|---|---|---|---|---|\n");
appendFileSync(historyPath, `| ${new Date().toISOString()} | ${sha} | ${green ? "GO" : "NO-GO"} | ${repeat}× | ${results.map(([l, ok]) => `${l}:${ok ? "ok" : "FAIL"}`).join(", ")} |\n`);

if (!green) process.exit(1);

const targetArg = opt("--target", "");
const deploying = flag("--deploy") || !!targetArg;
const target = targetArg || "staging";
const image = opt("--image", "");
if (deploying && target !== "staging" && target !== "current") {
  console.error(`❌ --target must be "staging" or "current" (got "${target}")`);
  process.exit(1);
}

if (deploying) {
  const fly = process.env.FLYCTL || join(process.env.USERPROFILE || process.env.HOME || "", ".fly", "bin", process.platform === "win32" ? "flyctl.exe" : "flyctl");
  const app = target === "staging" ? "nabil-voice-staging" : "nabil-voice";
  const configArgs = target === "staging" ? ["--config", "fly.staging.toml"] : [];

  // PROMOTION RULE (2026-08-22): the live app only ever receives an image the
  // staging lane already proved. Building straight onto `current` is the one
  // thing this script makes hard.
  if (target === "current" && !image && !flag("--allow-build-on-current")) {
    console.error(
      `\n❌ --target current needs --image <ref> (the image ref the staging lane ran — see the DEPLOY staging row in HISTORY.md).\n` +
        `   Promotion never rebuilds: the bytes Luigi heard on the staging line are the bytes customers get.\n` +
        `   Escape hatch (documented, off-hours only): --allow-build-on-current.\n`,
    );
    process.exit(1);
  }

  if (target === "current") {
    // ── SINGLE-MACHINE GUARD (2026-08-15) ──────────────────────────────────
    // src/server.ts now drains on SIGTERM and fly.toml deploys rolling, so a
    // deploy no longer has to cut live calls — but ONLY if there is a second
    // machine to take them. With `count 1`, rolling has nothing to roll to and
    // every in-progress call is still warm-transferred mid-order. That hazard
    // used to live in a memory file; enforce it where the deploy actually is.
    const st = spawnSync(fly, ["status", "--app", app, "--json"], {
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    let machines: number | null = null;
    try {
      const parsed = JSON.parse(st.stdout || "{}");
      const list = parsed?.Machines ?? parsed?.machines;
      if (Array.isArray(list)) machines = list.length;
    } catch {
      /* flyctl not installed, not logged in, or a shape change — don't block on it */
    }
    if (machines === null) {
      console.warn("⚠️  Could not read the machine count from flyctl — proceeding without the single-machine check.");
    } else if (machines < 2 && !flag("--allow-single-machine")) {
      console.error(
        `\n❌ ${app} has ${machines} machine — this deploy WILL interrupt every live call.\n` +
          `   Rolling deploys need somewhere to roll to. Fix it once:\n\n` +
          `     fly scale count 2 --app ${app}\n\n` +
          `   (~+US$5–7/mo, and it also removes the single point of failure.)\n` +
          `   To deploy anyway — off-hours, accepting the interruption — pass --allow-single-machine.\n`,
      );
      process.exit(1);
    } else if (machines < 2) {
      console.warn(`⚠️  Deploying onto ${machines} machine with --allow-single-machine: live calls will be interrupted.`);
    } else {
      console.log(`✅ ${machines} machines — rolling deploy will drain one at a time.`);
    }
  }

  // Record the image that is live RIGHT NOW before replacing it — that is the
  // rollback target, and it must be written down before anything changes.
  const before = currentImageRef(fly, app);
  if (before) console.log(`ℹ️  ${app} currently runs ${before} (rollback target)`);

  // Run from the service directory so flyctl picks up the toml + Dockerfile itself.
  const deployArgs = image
    ? ["deploy", "--app", app, ...configArgs, "--image", image]
    : ["deploy", "--app", app, ...configArgs, "--build-arg", `AGENT_VERSION=${sha}`, "--build-arg", `GIT_SHA=${sha}`];
  const ok = run(`fly deploy (${target})`, fly, deployArgs, join(process.cwd(), "services", "nabil-voice"));
  if (!ok) process.exit(1);

  const after = currentImageRef(fly, app);
  appendFileSync(
    historyPath,
    `| ${new Date().toISOString()} | ${sha} | DEPLOY ${target} | — | app=${app} image=${after ?? "?"} previous=${before ?? "?"}${image ? " (promoted image, no rebuild)" : ""} |\n`,
  );
  const host = target === "staging" ? "nabil-voice-staging.fly.dev" : "nabil-voice.fly.dev";
  console.log(`Deployed ${app}${after ? ` (${after})` : ""}. Verify: curl https://${host}/health → 200 "ok … channel=${target} agent=…", then real calls on the ${target === "staging" ? "STAGING line" : "live line (watch the first 20)"}.`);
  if (target === "staging") {
    console.log(`Promote later with: npx tsx scripts/nabil-release.ts --target current --image ${after ?? "<image ref>"} --skip-sim`);
  } else if (before) {
    console.log(`Rollback with:       npx tsx scripts/nabil-release.ts --target current --image ${before} --skip-sim`);
  }
} else {
  console.log("Not deploying (pass --target staging|current). Vercel first, then: npx tsx scripts/nabil-release.ts --target staging");
}

/** The image ref the app's newest release runs — flyctl's JSON shape has shifted
 *  before, so look for the one string that reads like a registry ref. */
function currentImageRef(fly: string, app: string): string | null {
  const r = spawnSync(fly, ["releases", "--app", app, "--json"], { encoding: "utf8", shell: process.platform === "win32" });
  try {
    const parsed = JSON.parse(r.stdout || "[]");
    const first = Array.isArray(parsed) ? parsed[0] : null;
    if (!first || typeof first !== "object") return null;
    for (const v of Object.values(first as Record<string, unknown>)) {
      if (typeof v === "string" && /^registry\.fly\.io\//.test(v)) return v;
      if (v && typeof v === "object") {
        for (const inner of Object.values(v as Record<string, unknown>)) {
          if (typeof inner === "string" && /^registry\.fly\.io\//.test(inner)) return inner;
        }
      }
    }
  } catch {
    /* not logged in / shape change — the HISTORY row says "?" and a human fills it in */
  }
  return null;
}
void readFileSync;
