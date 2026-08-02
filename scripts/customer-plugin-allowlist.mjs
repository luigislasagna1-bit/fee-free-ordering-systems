#!/usr/bin/env node
/**
 * Branded Mobile App — plugin allowlist guard (Luigi 2026-08-02).
 *
 * `cap sync` regenerates the native plugin lists from EVERY Capacitor plugin
 * in the shared node_modules — so the driver's background-geolocation and any
 * kitchen-only plugin bleed into the customer shell. On iOS that exact bleed
 * caused ITMS-90683 (binary references location APIs → Apple demands
 * NSLocation*UsageDescription); on Android it invites Play's location-
 * permission review for an app that never uses location.
 *
 * Run AFTER every `cap-customer.mjs add|sync android` (and in the Codemagic
 * iOS workflow after its sync): strips everything not on the ALLOWLIST from
 *   - apps/customer-shell/android/capacitor.settings.gradle
 *   - apps/customer-shell/android/app/capacitor.build.gradle
 *   - apps/customer-shell/ios/App/CapApp-SPM/Package.swift   (when present)
 *
 * Exits non-zero if a non-allowlisted plugin survives (CI-fatal).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

// The customer shell's ENTIRE native surface. Adding a plugin here is a
// deliberate capability decision (and an Apple re-review consideration).
const ALLOW = [
  "capacitor-android",
  "capacitor-cordova-android-plugins",
  "capacitor-network",
  "capacitor-preferences",
  "capacitor-push-notifications",
  "capacitor-splash-screen",
  "capacitor-status-bar",
  "capacitor-app",
  "capacitor-browser",
];
const ALLOW_SPM = [
  "CapacitorCordova", "CapacitorApp", "CapacitorBrowser", "CapacitorNetwork",
  "CapacitorPreferences", "CapacitorPushNotifications", "CapacitorSplashScreen",
  "CapacitorStatusBar",
];

let failed = false;

function pruneGradleSettings(path) {
  if (!existsSync(path)) return;
  const src = readFileSync(path, "utf8");
  // Blocks are "include ':name'\nproject(':name')...\n" pairs.
  const blocks = src.split(/\n\s*\n/);
  const kept = [];
  const stripped = [];
  for (const block of blocks) {
    const m = block.match(/include ':([^']+)'/);
    if (!m || ALLOW.includes(m[1])) kept.push(block);
    else stripped.push(m[1]);
  }
  writeFileSync(path, kept.join("\n\n") + "\n");
  if (stripped.length) console.log(`[allowlist] ${path}: stripped ${stripped.join(", ")}`);
}

function pruneGradleBuild(path) {
  if (!existsSync(path)) return;
  const src = readFileSync(path, "utf8");
  const lines = src.split("\n");
  const kept = [];
  const stripped = [];
  for (const line of lines) {
    const m = line.match(/implementation project\(':([^']+)'\)/);
    if (m && !ALLOW.includes(m[1])) { stripped.push(m[1]); continue; }
    kept.push(line);
  }
  writeFileSync(path, kept.join("\n"));
  if (stripped.length) console.log(`[allowlist] ${path}: stripped ${stripped.join(", ")}`);
}

function pruneSpm(path) {
  if (!existsSync(path)) return;
  let src = readFileSync(path, "utf8");
  // Windows-poisoning guard (the kitchen CI lesson): backslash paths break
  // xcodebuild with a bare exit 74.
  if (src.includes("\\\\") || /["'][A-Za-z]:\\/.test(src)) {
    console.error(`[allowlist] ${path}: BACKSLASH PATHS — a Windows cap sync poisoned this file. Re-sync on macOS.`);
    failed = true;
  }
  const stripped = [];
  // .package(name: "X", path: "...") entries + product references.
  src = src.replace(/\s*\.package\(name: "([^"]+)"[^)]*\),?/g, (full, name) => {
    if (ALLOW_SPM.includes(name) || name === "Capacitor") return full;
    stripped.push(name);
    return "";
  });
  src = src.replace(/\s*\.product\(name: "([^"]+)"[^)]*\),?/g, (full, name) => {
    if (ALLOW_SPM.includes(name) || name === "Capacitor" || name === "Cordova") return full;
    return "";
  });
  writeFileSync(path, src);
  if (stripped.length) console.log(`[allowlist] ${path}: stripped ${stripped.join(", ")}`);
}

pruneGradleSettings("apps/customer-shell/android/capacitor.settings.gradle");
pruneGradleBuild("apps/customer-shell/android/app/capacitor.build.gradle");
pruneSpm("apps/customer-shell/ios/App/CapApp-SPM/Package.swift");

// Final verification — fail CI if anything non-allowlisted survived.
for (const p of ["apps/customer-shell/android/capacitor.settings.gradle", "apps/customer-shell/android/app/capacitor.build.gradle"]) {
  if (!existsSync(p)) continue;
  const src = readFileSync(p, "utf8");
  for (const m of src.matchAll(/':(capacitor[^']*)'/g)) {
    if (!ALLOW.includes(m[1])) { console.error(`[allowlist] VIOLATION in ${p}: ${m[1]}`); failed = true; }
  }
}
if (failed) process.exit(1);
console.log("[allowlist] customer shell plugin surface is clean");
