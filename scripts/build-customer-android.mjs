#!/usr/bin/env node
/**
 * Branded Mobile App — Android build orchestrator (Luigi 2026-08-02).
 * One command from approved config to a Play-uploadable AAB:
 *
 *   1. cap-customer sync android            (regenerates native glue)
 *   2. plugin allowlist guard               (strips fleet plugin bleed — CI-fatal)
 *   3. gen-customer-assets                  (icons/splash from approved branding)
 *   4. per-tenant upload keystore           (generated on first build; Play App
 *      Signing makes a lost upload key recoverable — see runbook)
 *   5. gradlew bundleRelease -Pff*          (tenant identity injected)
 *   6. AAB → store-assets/customer-builds/<slug>/
 *
 *   node scripts/build-customer-android.mjs store-assets/customer-builds/<slug>/manifest.json [--skip-sync]
 *
 * google-services.json: drop the tenant's Firebase config at
 * apps/customer-shell/android/app/google-services.json BEFORE running (push
 * won't register without it; the build itself succeeds either way).
 */
import { execSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

const manifestPath = process.argv[2];
if (!manifestPath || !existsSync(manifestPath)) {
  console.error("Usage: node scripts/build-customer-android.mjs <manifest.json> [--skip-sync]");
  process.exit(1);
}
const m = JSON.parse(readFileSync(manifestPath, "utf8"));
const outDir = path.dirname(manifestPath);
const skipSync = process.argv.includes("--skip-sync");

const run = (cmd, opts = {}) => {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { stdio: "inherit", ...opts });
};

// 1–2. Sync + allowlist (sync regenerates the plugin lists every time).
if (!skipSync) {
  run(`node scripts/gen-customer-cap-config.mjs ${manifestPath}`);
  run("node scripts/cap-customer.mjs sync android");
}
run("node scripts/customer-plugin-allowlist.mjs");
run("node scripts/normalize-customer-mainactivity.mjs");

// 3. Branded assets.
run(`node scripts/gen-customer-assets.js ${manifestPath}`);

// 4. Per-tenant upload keystore. Generated once per tenant into the build
// dir; the passphrase is printed ONCE for superadmin intake into the
// encrypted credential store (kind android_keystore_passphrase) and the .jks
// goes to private Blob storage. NOT committed (gitignored).
const ksPath = path.resolve(outDir, `${m.slug}-upload.jks`);
const ksPropsPath = "apps/customer-shell/android/keystore.properties";
if (!existsSync(ksPath)) {
  const pass = randomBytes(18).toString("base64url");
  // keytool ships with the JDK; on this machine that's Android Studio's JBR
  // (same fallback the gradle step uses below).
  const jbrKeytool = "C:/Program Files/Android/Android Studio1/jbr/bin/keytool.exe";
  const keytool = process.env.KEYTOOL || (existsSync(jbrKeytool) ? jbrKeytool : "keytool");
  const dname = `CN=${m.displayName.replace(/[,+"\\<>;=]/g, " ")}, O=${m.slug}, C=CA`;
  // No shell: an absolute .exe path with spaces ("C:/Program Files/…") gets
  // split by the Windows shell; direct spawn executes it correctly.
  const res = spawnSync(keytool, [
    "-genkeypair", "-v", "-keystore", ksPath, "-alias", "upload",
    "-keyalg", "RSA", "-keysize", "2048", "-validity", "9125",
    "-storepass", pass, "-keypass", pass, "-dname", dname,
  ], { stdio: "inherit" });
  if (res.status !== 0) {
    console.error("keytool failed — is a JDK on PATH? (set KEYTOOL to override)");
    process.exit(1);
  }
  writeFileSync(path.resolve(outDir, `${m.slug}-keystore-INTAKE.txt`),
    `SUPERADMIN INTAKE — enter in /superadmin/branded-apps → credentials\n` +
    `kind: android_keystore_passphrase\nsecret: ${pass}\n` +
    `then upload ${path.basename(ksPath)} to private Blob storage, record the URL\n` +
    `as artifactUrl, and DELETE this file.\n`);
  console.log(`\n⚠ NEW upload keystore generated. Passphrase written to ${m.slug}-keystore-INTAKE.txt — intake + delete it.`);
}
// keystore.properties for gradle (gitignored) — passphrase from intake file
// on first build, or FF_KEYSTORE_PASS env on later builds.
const intakeFile = path.resolve(outDir, `${m.slug}-keystore-INTAKE.txt`);
const pass = process.env.FF_KEYSTORE_PASS
  ?? (existsSync(intakeFile) ? /secret: (.+)/.exec(readFileSync(intakeFile, "utf8"))?.[1] : null);
if (!pass) {
  console.error("No keystore passphrase: set FF_KEYSTORE_PASS (from the encrypted credential store).");
  process.exit(1);
}
writeFileSync(ksPropsPath,
  `storeFile=${ksPath.replace(/\\/g, "/")}\nstorePassword=${pass}\nkeyAlias=upload\nkeyPassword=${pass}\n`);

// SDK location: inherit the kitchen tree's local.properties (gitignored,
// machine-specific) so the shell tree needs zero manual setup per machine.
const shellLocalProps = "apps/customer-shell/android/local.properties";
if (!existsSync(shellLocalProps) && existsSync("android/local.properties")) {
  copyFileSync("android/local.properties", shellLocalProps);
  console.log("local.properties inherited from the kitchen tree");
}

// 5. Gradle. JAVA_HOME fallback = Android Studio's JBR (the documented local
// setup from PLAY_STORE_SUBMISSION.md).
const env = { ...process.env };
if (!env.JAVA_HOME) {
  const jbr = "C:/Program Files/Android/Android Studio1/jbr";
  if (existsSync(jbr)) env.JAVA_HOME = jbr;
}
// Tenant-controlled display name goes through an ENV VAR, never the command
// line: with shell:true (required below), cmd.exe parses & | ^ < > ( ) as
// its OWN syntax before our quoting is ever seen — a restaurant named e.g.
// "Rico&calc.exe" or "Pizza\" & whoami & \"" would run arbitrary commands on
// the build machine that holds every tenant's upload keystore + .env
// secrets. An env var's VALUE is never re-parsed by cmd — it's set directly
// via CreateProcess's environment block — so it's injection-proof regardless
// of content. build.gradle reads FF_APP_NAME first, falls back to -PffAppName.
env.FF_APP_NAME = m.displayName;
const gradleArgs = [
  "bundleRelease", "--no-daemon",
  `-PffApplicationId=${m.androidApplicationId}`,
  `-PffVersionCode=${m.versionCode}`,
  `-PffVersionName=${m.versionName}`,
  `-PffDeepLinkHost=${m.deepLinkHost}`,
];
console.log(`\n▶ gradlew ${gradleArgs.join(" ")} (FF_APP_NAME=${JSON.stringify(m.displayName)} via env)`);
// Absolute wrapper path (bare "gradlew.bat" resolves against PATH, not cwd)
// + shell:true (Windows cannot spawn a .bat without a shell — node blocks it
// since CVE-2024-27980). The repo path carries no spaces, so no quoting issue.
const gradlew = path.resolve("apps/customer-shell/android", process.platform === "win32" ? "gradlew.bat" : "gradlew");
const g = spawnSync(
  gradlew,
  gradleArgs,
  { cwd: "apps/customer-shell/android", stdio: "inherit", env, shell: process.platform === "win32" },
);
if (g.status !== 0) { console.error("gradle build failed"); process.exit(1); }

// 6. Collect the AAB.
const aabSrc = "apps/customer-shell/android/app/build/outputs/bundle/release/app-release.aab";
const aabDst = path.resolve(outDir, `${m.slug}-v${m.versionCode}.aab`);
mkdirSync(outDir, { recursive: true });
copyFileSync(aabSrc, aabDst);
console.log(`\n✅ AAB → ${aabDst}`);
console.log("Verify signing: jarsigner -verify " + aabDst);
