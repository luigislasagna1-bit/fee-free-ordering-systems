#!/usr/bin/env node
/**
 * Branded Mobile App — Capacitor config generator (Luigi 2026-08-02).
 * Build manifest JSON → capacitor.customer.config.ts (GITIGNORED — a
 * per-tenant artifact, regenerated per build, never committed).
 *
 *   node scripts/gen-customer-cap-config.mjs store-assets/customer-builds/<slug>/manifest.json
 */
import { readFileSync, writeFileSync } from "node:fs";

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error("Usage: node scripts/gen-customer-cap-config.mjs <manifest.json>");
  process.exit(1);
}
const m = JSON.parse(readFileSync(manifestPath, "utf8"));
for (const k of ["androidApplicationId", "displayName", "serverUrl", "primaryColor", "versionName", "slug"]) {
  if (!m[k]) { console.error(`manifest missing ${k}`); process.exit(1); }
}

// Status-bar icon style from brand-color luminance (dark bg → light icons).
const hex = String(m.primaryColor).replace("#", "");
const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
const statusStyle = luminance < 0.55 ? "DARK" : "LIGHT";

const config = `import type { CapacitorConfig } from "@capacitor/cli";

/**
 * GENERATED per-tenant Capacitor config — DO NOT COMMIT, DO NOT EDIT.
 * Source of truth: the tenant's approved BrandedAppProject config via
 * scripts/gen-build-manifest.ts → scripts/gen-customer-cap-config.mjs.
 * Tenant: ${m.slug} (config v${m.configVersion ?? "?"})
 *
 * Remote-URL shell (the kitchen/driver architecture): the binary wraps a
 * WebView of the tenant's live branded ordering host, so menu/price/promo
 * changes ship via web deploy with no store re-review.
 */
const config: CapacitorConfig = {
  appId: ${JSON.stringify(m.androidApplicationId)},
  appName: ${JSON.stringify(m.displayName)},
  webDir: "public",
  // Version + tenant reporting for a future server-side min-version gate
  // (top-level in Capacitor 8 — not a server.* property).
  appendUserAgent: ${JSON.stringify(`FFOApp/${m.versionName} (${m.slug})`)},
  server: {
    url: ${JSON.stringify(m.serverUrl)},
    androidScheme: "https",
    // Same-origin stays in the WebView; EVERYTHING else opens the system
    // browser (PayPal, oddball 3DS top-level redirects). Deliberately no
    // allowNavigation entries — a wildcard would turn the shell into an
    // open browser (review risk + phishing surface). ADR 2026-08-02.
    errorPath: "offline.html",
  },
  ios: {
    path: "apps/customer-shell/ios",
    contentInset: "never",
    scrollEnabled: true,
  },
  android: {
    path: "apps/customer-shell/android",
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: ${JSON.stringify(m.primaryColor)},
    },
    StatusBar: {
      style: ${JSON.stringify(statusStyle)},
      backgroundColor: ${JSON.stringify(m.primaryColor)},
    },
    PushNotifications: {
      // Foreground pushes surface as system notifications too — the web app
      // has no in-page ring engine for customers (unlike the kitchen).
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
`;

writeFileSync("capacitor.customer.config.ts", config);
console.log(`capacitor.customer.config.ts written for ${m.slug} (${m.androidApplicationId})`);
