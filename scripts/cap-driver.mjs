#!/usr/bin/env node
/**
 * Run a Capacitor CLI command against the DRIVER config.
 *
 * Capacitor 8's CLI has no --config flag / env var — it only ever reads
 * `capacitor.config.ts` (the Kitchen app). To build the driver app we briefly
 * swap the driver config into that filename, run the cap command, then ALWAYS
 * restore the Kitchen config (even on failure/interrupt) so a crash can never
 * leave the repo pointing the default config at the wrong app.
 *
 *   node scripts/cap-driver.mjs add android
 *   node scripts/cap-driver.mjs sync android
 *   node scripts/cap-driver.mjs open ios
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const MAIN = "capacitor.config.ts";
const DRIVER = "capacitor.driver.config.ts";

if (!existsSync(DRIVER)) {
  console.error(`${DRIVER} not found`);
  process.exit(1);
}

const original = readFileSync(MAIN, "utf8");
let restored = false;
const restore = () => {
  if (restored) return;
  writeFileSync(MAIN, original, "utf8");
  restored = true;
};
// Restore on every exit path (normal, throw, Ctrl-C, kill).
process.on("exit", restore);
process.on("SIGINT", () => { restore(); process.exit(130); });
process.on("SIGTERM", () => { restore(); process.exit(143); });

try {
  writeFileSync(MAIN, readFileSync(DRIVER, "utf8"), "utf8");
  const args = process.argv.slice(2);
  const res = spawnSync("npx", ["cap", ...args], { stdio: "inherit", shell: true });
  restore();
  process.exit(res.status ?? 1);
} catch (e) {
  restore();
  console.error(e);
  process.exit(1);
}
