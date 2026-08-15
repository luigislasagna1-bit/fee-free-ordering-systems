/**
 * THE NABIL RELEASE GATE (directive §28).
 *
 *   npx tsx scripts/nabil-release.ts [--deploy] [--repeat 3] [--concurrency 4] [--skip-sim]
 *
 * Runs, in order, and STOPS at the first red:
 *   1. voice-service typecheck                       (npm run typecheck:voice)
 *   2. deterministic voice tests                     (vitest src/lib/voice)
 *   3. the CRITICAL + INJECTION simulation suites    (nabil:sim, real model, N× each)
 * then prints a go/no-go table, appends one line to reports/nabil-sim/HISTORY.md,
 * and only with --deploy AND green runs `fly deploy --app nabil-voice` from
 * services/nabil-voice with the git SHA as the build arg (→ agentVersion).
 *
 * The LLM suite is never part of `npm run preflight` (cost + key); it is this
 * script's job. Vercel must be deployed BEFORE Fly for a change that touches
 * both (build-line is additive; the Fly side may need the new kinds).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, appendFileSync, readFileSync } from "node:fs";
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

function run(label: string, cmd: string, cmdArgs: string[]): boolean {
  console.log(`\n━━━ ${label}: ${cmd} ${cmdArgs.join(" ")}`);
  const r = spawnSync(cmd, cmdArgs, { stdio: "inherit", shell: process.platform === "win32" });
  const ok = r.status === 0;
  console.log(ok ? `✅ ${label} passed` : `❌ ${label} FAILED (exit ${r.status})`);
  return ok;
}

const sha = (() => {
  const r = spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8", shell: process.platform === "win32" });
  return (r.stdout || "").trim() || "unknown";
})();
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const results: Array<[string, boolean]> = [];

results.push(["typecheck:voice", run("typecheck:voice", "npm", ["run", "typecheck:voice"])]);
if (results.every(([, ok]) => ok)) results.push(["voice unit tests", run("voice unit tests", "npx", ["vitest", "run", "src/lib/voice"])]);
if (results.every(([, ok]) => ok) && !flag("--skip-sim")) {
  results.push([
    "critical+injection sim",
    run("critical+injection sim", "npx", ["tsx", "scripts/nabil-sim.ts", "--suite", "critical", "--repeat", repeat, "--concurrency", concurrency, "--out", reportsDir, "--name", `${stamp}-release`]),
  ]);
}

const green = results.every(([, ok]) => ok);
console.log("\n━━━ GO / NO-GO");
for (const [label, ok] of results) console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
console.log(`  ${green ? "🟢 GO" : "🔴 NO-GO"}  sha ${sha}`);

const historyPath = join(reportsDir, "HISTORY.md");
if (!existsSync(historyPath)) appendFileSync(historyPath, "# Nabil release history\n\n| when (UTC) | sha | result | repeat | notes |\n|---|---|---|---|---|\n");
appendFileSync(historyPath, `| ${new Date().toISOString()} | ${sha} | ${green ? "GO" : "NO-GO"} | ${repeat}× | ${results.map(([l, ok]) => `${l}:${ok ? "ok" : "FAIL"}`).join(", ")} |\n`);

if (!green) process.exit(1);
if (flag("--deploy")) {
  const fly = process.env.FLYCTL || join(process.env.USERPROFILE || process.env.HOME || "", ".fly", "bin", process.platform === "win32" ? "flyctl.exe" : "flyctl");
  const ok = run("fly deploy", fly, ["deploy", "--app", "nabil-voice", "--build-arg", `AGENT_VERSION=${sha}`, "--config", "services/nabil-voice/fly.toml", "--dockerfile", "services/nabil-voice/Dockerfile", "services/nabil-voice"]);
  if (!ok) process.exit(1);
  console.log("Deployed. Verify: curl https://nabil-voice.fly.dev/health → 200 ok, then one live smoke call.");
} else {
  console.log("Not deploying (pass --deploy). Vercel first, then: npx tsx scripts/nabil-release.ts --deploy");
}
void readFileSync;
