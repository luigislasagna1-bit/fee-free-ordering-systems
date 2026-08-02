#!/usr/bin/env node
/**
 * Branded Mobile App — per-tenant asset generator (Luigi 2026-08-02).
 * Parameterized evolution of scripts/gen-driver-assets.js: instead of a
 * hardcoded SVG, the input is the tenant's build manifest (approved icon URL
 * + brand color) and every derived asset the stores/launchers need is
 * generated from that ONE source:
 *
 *   Android: adaptive icon foreground/background + legacy mipmaps + round,
 *            Play 512, feature graphic 1024×500
 *   iOS:     AppIcon 1024 OPAQUE (alpha flattened onto brand color — Apple
 *            rejects transparency, the gen-ios-icon.js lesson)
 *   Splash:  2732×2732 universal (logo ≤25% width, centered on brand color)
 *            + Android 12 themed-splash background color resource
 *
 *   node scripts/gen-customer-assets.js store-assets/customer-builds/<slug>/manifest.json
 */
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const ANDROID_RES = "apps/customer-shell/android/app/src/main/res";

const MIPMAPS = [
  ["mipmap-mdpi", 48], ["mipmap-hdpi", 72], ["mipmap-xhdpi", 96],
  ["mipmap-xxhdpi", 144], ["mipmap-xxxhdpi", 192],
];
const FOREGROUNDS = [
  ["mipmap-mdpi", 108], ["mipmap-hdpi", 162], ["mipmap-xhdpi", 216],
  ["mipmap-xxhdpi", 324], ["mipmap-xxxhdpi", 432],
];

// Defense in depth: the wizard's server-side validation (isValidBlobUrl in
// src/lib/branded-app/validate.ts) already restricts appIconUrl/splashIconUrl
// to our own Blob uploader's hostname before it's ever saved — but this
// script fetches whatever a manifest.json says, and a hand-edited or
// future-mistake manifest shouldn't turn into an SSRF from the build
// machine (internal metadata endpoints, LAN hosts). Same hostname pattern
// as src/app/api/menu/import-pdf/route.ts.
const BLOB_HOST = /^[a-z0-9.-]+\.public\.blob\.vercel-storage\.com$/;
function assertBlobUrl(url) {
  const u = new URL(url);
  if (u.protocol !== "https:" || !BLOB_HOST.test(u.hostname)) {
    throw new Error(`refusing to fetch non-Blob icon URL: ${url}`);
  }
}

async function fetchIcon(url) {
  assertBlobUrl(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`icon fetch failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const manifestPath = process.argv[2];
  if (!manifestPath) {
    console.error("Usage: node scripts/gen-customer-assets.js <manifest.json>");
    process.exit(1);
  }
  const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (!m.appIconUrl) { console.error("manifest has no appIconUrl"); process.exit(1); }
  const color = m.primaryColor || "#10b981";
  const outDir = path.join(path.dirname(manifestPath), "store");
  fs.mkdirSync(outDir, { recursive: true });

  const srcBuf = await fetchIcon(m.appIconUrl);
  // Normalize the master to 1024² once.
  const master = await sharp(srcBuf).resize(1024, 1024, { fit: "cover" }).png().toBuffer();

  // ── Android launcher icons ────────────────────────────────────────────
  for (const [dir, size] of MIPMAPS) {
    const d = path.join(ANDROID_RES, dir);
    fs.mkdirSync(d, { recursive: true });
    const square = await sharp(master).resize(size, size).png().toBuffer();
    fs.writeFileSync(path.join(d, "ic_launcher.png"), square);
    // Round variant: circular mask.
    const r = size / 2;
    const circle = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`);
    fs.writeFileSync(
      path.join(d, "ic_launcher_round.png"),
      await sharp(square).composite([{ input: circle, blend: "dest-in" }]).png().toBuffer(),
    );
  }
  // Adaptive foreground: logo scaled into the 66% safe zone on transparency.
  for (const [dir, size] of FOREGROUNDS) {
    const d = path.join(ANDROID_RES, dir);
    fs.mkdirSync(d, { recursive: true });
    const inner = Math.round(size * 0.6);
    const pad = Math.round((size - inner) / 2);
    fs.writeFileSync(
      path.join(d, "ic_launcher_foreground.png"),
      await sharp(master).resize(inner, inner)
        .extend({ top: pad, bottom: size - inner - pad, left: pad, right: size - inner - pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png().toBuffer(),
    );
  }
  // Adaptive background color resource + Android 12 themed splash color.
  const valuesDir = path.join(ANDROID_RES, "values");
  fs.mkdirSync(valuesDir, { recursive: true });
  fs.writeFileSync(
    path.join(valuesDir, "ic_launcher_background.xml"),
    `<?xml version="1.0" encoding="utf-8"?>\n<!-- GENERATED per tenant by gen-customer-assets.js — do not commit tenant values. -->\n<resources>\n    <color name="ic_launcher_background">${color}</color>\n    <color name="ff_splash_background">${color}</color>\n</resources>\n`,
  );
  const anydpi = path.join(ANDROID_RES, "mipmap-anydpi-v26");
  fs.mkdirSync(anydpi, { recursive: true });
  for (const name of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
    fs.writeFileSync(
      path.join(anydpi, name),
      `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/ic_launcher_background"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n`,
    );
  }

  // ── Splash 2732×2732 (Capacitor universal) ────────────────────────────
  const logoOnColor = async (canvas, logoRatio) => {
    const logoSize = Math.round(canvas * logoRatio);
    const logo = await sharp(m.splashIconUrl && m.splashIconUrl !== m.appIconUrl
      ? await fetchIcon(m.splashIconUrl)
      : master
    ).resize(logoSize, logoSize, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    return sharp({ create: { width: canvas, height: canvas, channels: 4, background: color } })
      .composite([{ input: logo, gravity: "center" }])
      .png().toBuffer();
  };
  const splash = await logoOnColor(2732, 0.24);
  const drawableDirs = ["drawable", "drawable-land-hdpi", "drawable-land-mdpi", "drawable-land-xhdpi", "drawable-land-xxhdpi", "drawable-land-xxxhdpi", "drawable-port-hdpi", "drawable-port-mdpi", "drawable-port-xhdpi", "drawable-port-xxhdpi", "drawable-port-xxxhdpi"];
  for (const dir of drawableDirs) {
    const d = path.join(ANDROID_RES, dir);
    if (fs.existsSync(d)) {
      const target = path.join(d, "splash.png");
      if (fs.existsSync(target)) fs.writeFileSync(target, splash);
    }
  }
  fs.writeFileSync(path.join(ANDROID_RES, "drawable", "splash.png"), splash);

  // ── Store assets → Blob-uploadable local out dir ──────────────────────
  // Play icon 512 (full-bleed) + feature graphic 1024×500 + iOS 1024 opaque.
  fs.writeFileSync(path.join(outDir, "play-icon-512.png"), await sharp(master).resize(512, 512).png().toBuffer());
  const feature = await sharp({ create: { width: 1024, height: 500, channels: 4, background: color } })
    .composite([{ input: await sharp(master).resize(360, 360).png().toBuffer(), left: 80, top: 70 }])
    .png().toBuffer();
  fs.writeFileSync(path.join(outDir, "feature-graphic-1024x500.png"), feature);
  // iOS: flatten any alpha onto the brand color (Apple rejects transparency).
  const iosIcon = await sharp(master).flatten({ background: color }).resize(1024, 1024).png().toBuffer();
  fs.writeFileSync(path.join(outDir, "ios-appicon-1024.png"), iosIcon);
  fs.writeFileSync(path.join(outDir, "splash-2732.png"), splash);

  // ALSO install it into the Xcode project itself (same path convention as
  // gen-driver-assets.js's ios-driver install) — writing it only to the
  // store-listing outDir above never reaches the actual binary: the
  // codemagic customer-ios workflow scaffolds a FRESH default Capacitor iOS
  // template on first run (`cap add ios`, no committed iOS tree — Windows
  // can't run cap sync ios), so the appiconset that ships is the generic
  // Capacitor placeholder unless something overwrites it. This step runs
  // AFTER the scaffold step in codemagic.yaml, so the directory exists by
  // the time we get here; it's a silent no-op on the Windows Android build
  // box where apps/customer-shell/ios never exists.
  const iosAppIcon = path.join("apps/customer-shell/ios/App/App/Assets.xcassets/AppIcon.appiconset", "AppIcon-512@2x.png");
  if (fs.existsSync(path.dirname(iosAppIcon))) {
    fs.writeFileSync(iosAppIcon, iosIcon);
    console.log(`iOS AppIcon installed: ${iosAppIcon}`);
  }

  console.log(`assets generated for ${m.slug}: android res + ${outDir}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
