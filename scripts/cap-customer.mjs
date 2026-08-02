#!/usr/bin/env node
/**
 * Run a Capacitor CLI command against the GENERATED customer-shell config
 * (capacitor.customer.config.ts — produced by gen-customer-cap-config.mjs).
 * Same swap-runner pattern as scripts/cap-driver.mjs: Capacitor 8's CLI only
 * reads capacitor.config.ts, so we swap, run, and ALWAYS restore.
 *
 *   node scripts/cap-customer.mjs add android
 *   node scripts/cap-customer.mjs sync android
 *
 * ⚠️ NEVER run `sync ios` on Windows — it poisons CapApp-SPM/Package.swift
 * with backslash paths (the kitchen CI guard exists for this). iOS syncs
 * happen in the Codemagic customer-ios workflow on macOS.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const MAIN = "capacitor.config.ts";
const CUSTOMER = "capacitor.customer.config.ts";

if (!existsSync(CUSTOMER)) {
  console.error(`${CUSTOMER} not found — run gen-customer-cap-config.mjs first`);
  process.exit(1);
}

const args = process.argv.slice(2);
if (process.platform === "win32" && args.join(" ").includes("ios")) {
  console.error("Refusing to run an iOS cap command on Windows (Package.swift backslash poisoning). Use the Codemagic workflow.");
  process.exit(1);
}

const original = readFileSync(MAIN, "utf8");
let restored = false;
const restore = () => {
  if (restored) return;
  writeFileSync(MAIN, original, "utf8");
  restored = true;
};
process.on("exit", restore);
process.on("SIGINT", () => { restore(); process.exit(130); });
process.on("SIGTERM", () => { restore(); process.exit(143); });

try {
  writeFileSync(MAIN, readFileSync(CUSTOMER, "utf8"), "utf8");
  const res = spawnSync("npx", ["cap", ...args], { stdio: "inherit", shell: true });
  restore();
  process.exit(res.status ?? 1);
} catch (e) {
  restore();
  console.error(e);
  process.exit(1);
}
