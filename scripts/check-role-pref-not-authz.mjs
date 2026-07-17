#!/usr/bin/env node
/**
 * Guard: `ffd-role-pref` is a RENDERING PREFERENCE cookie (which shell the
 * dual-role Fee Free Delivery app shows). It must NEVER become an authorization
 * input — no API route may read it. Runs as part of `npm run preflight`
 * (driver-app v1.1 plan §2.3, "enforcement, not a comment").
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const API_ROOT = "src/app/api";
const NEEDLE = "ffd-role-pref";

const offenders = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx|js|mjs)$/.test(name) && readFileSync(p, "utf8").includes(NEEDLE)) offenders.push(p);
  }
}
walk(API_ROOT);

if (offenders.length) {
  console.error(`ERROR: ${NEEDLE} is a rendering preference and must never reach an API route. Offenders:`);
  for (const f of offenders) console.error("  - " + f);
  process.exit(1);
}
console.log(`role-pref guard OK — no ${NEEDLE} reads under ${API_ROOT}`);
