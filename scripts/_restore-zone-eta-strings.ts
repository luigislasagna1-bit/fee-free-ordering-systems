/** One-off: restore checkout.youreIn + ordering.deliveryAreaHint in ALL 38
 *  locales from commit 9d3eb3cb (pre-"drive" rewording) — the zone minutes
 *  are the TOTAL delivery estimate, not transit (Luigi 2026-07-04).
 *  Run: npx tsx scripts/_restore-zone-eta-strings.ts */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const DIR = join(process.cwd(), "src", "messages");
const KEYS = ["checkout.youreIn", "ordering.deliveryAreaHint"];

function getDeep(obj: any, key: string): unknown {
  return key.split(".").reduce((cur, p) => (cur == null ? undefined : cur[p]), obj);
}
function setDeep(obj: Record<string, unknown>, key: string, value: string) {
  const parts = key.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof cur[p] !== "object" || cur[p] === null) cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

let n = 0;
for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
  const old = JSON.parse(execSync(`git show 9d3eb3cb:src/messages/${f}`, { maxBuffer: 64 * 1024 * 1024 }).toString("utf8"));
  const path = join(DIR, f);
  const cur = JSON.parse(readFileSync(path, "utf8"));
  let changed = false;
  for (const k of KEYS) {
    const v = getDeep(old, k);
    if (typeof v === "string") { setDeep(cur, k, v); changed = true; }
  }
  if (changed) { writeFileSync(path, JSON.stringify(cur, null, 2) + "\n", "utf8"); n++; }
}
console.log(`✓ restored ${KEYS.join(", ")} in ${n} locale(s) from 9d3eb3cb`);
