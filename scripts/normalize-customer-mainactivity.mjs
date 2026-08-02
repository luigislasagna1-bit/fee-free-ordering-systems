#!/usr/bin/env node
/**
 * Branded Mobile App — MainActivity package normalizer (Luigi 2026-08-02).
 *
 * `cap sync android` relocates MainActivity.java to match capacitor.config's
 * `appId` — which gen-customer-cap-config.mjs deliberately sets to the
 * TENANT's derived applicationId (needed for other Capacitor tooling). But
 * build.gradle's Android `namespace` is a CONSTANT
 * (com.feefreeordering.customershell), never per-tenant, and the manifest's
 * `android:name=".MainActivity"` resolves relative to THAT namespace, not
 * applicationId. Left alone, every sync after the first tenant build leaves
 * MainActivity.java sitting in the wrong (or a stale previous tenant's)
 * package — a real ClassNotFoundException risk at runtime, and if ever
 * committed, it silently bakes one tenant's package into the shared
 * template for every restaurant after them (caught before the first real
 * commit, 2026-08-02 — demo-pizza-palace's build had left the file at
 * com/feefreeordering/customer/demopizzapalace/).
 *
 * Runs after every sync: deletes any tenant-specific java package Capacitor
 * created and ensures the ONE constant-namespace MainActivity.java exists.
 */
import { existsSync, mkdirSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import path from "node:path";

const JAVA_ROOT = "apps/customer-shell/android/app/src/main/java";
const NAMESPACE = "com.feefreeordering.customershell"; // MUST match build.gradle's `namespace`
const canonicalDir = path.join(JAVA_ROOT, ...NAMESPACE.split("."));
const canonicalFile = path.join(canonicalDir, "MainActivity.java");

// Wipe every OTHER top-level package tree under java/ (a stray tenant
// package from a previous sync) — the shell has exactly one Activity, so
// nothing legitimate lives outside the constant namespace.
const topLevel = existsSync(JAVA_ROOT) ? readdirSync(JAVA_ROOT, { withFileTypes: true }) : [];
for (const entry of topLevel) {
  if (entry.isDirectory() && entry.name !== NAMESPACE.split(".")[0]) {
    rmSync(path.join(JAVA_ROOT, entry.name), { recursive: true, force: true });
    console.log(`normalize-customer-mainactivity: removed stray package root ${entry.name}/`);
  }
}
// Also prune inside the root segment down to the exact namespace path, in
// case a sibling sub-package (e.g. com/feefreeordering/customer/<tenant>/)
// was created alongside com/feefreeordering/customershell/.
const rootSeg = path.join(JAVA_ROOT, NAMESPACE.split(".")[0]);
if (existsSync(rootSeg)) {
  for (const entry of readdirSync(rootSeg, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== NAMESPACE.split(".")[1]) {
      rmSync(path.join(rootSeg, entry.name), { recursive: true, force: true });
      console.log(`normalize-customer-mainactivity: removed stray sub-package ${entry.name}/`);
    }
  }
}

mkdirSync(canonicalDir, { recursive: true });
writeFileSync(
  canonicalFile,
  `package ${NAMESPACE};\n\nimport com.getcapacitor.BridgeActivity;\n\npublic class MainActivity extends BridgeActivity {}\n`,
);
console.log(`normalize-customer-mainactivity: MainActivity.java at ${NAMESPACE} (constant namespace, matches build.gradle)`);
