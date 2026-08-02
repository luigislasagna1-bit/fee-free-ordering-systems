# Branded Mobile App — pipeline runbook (2026-08-02)

The white-label per-restaurant customer apps: how a project moves from the
owner's wizard to a store listing, what's automated, what's manual, and how
to recover when things break. The product plan + ADR live in the plan file
history; store-policy facts below were verified against the June-2026
guidelines.

## Architecture in one paragraph

Each restaurant's app is a **Capacitor 8 remote-URL shell** (the proven
kitchen/driver architecture) pointing at the tenant's branded host — content
updates ship via web deploy with **no store re-review**. ONE committed native
template (`apps/customer-shell/`) serves every restaurant; tenant identity is
injected at build time (gradle `-Pff*` props / iOS pbxproj+entitlements edits
in CI). The v1 binary clears Apple 4.2 with real native capability:
order-status push, verified deep links, branded splash/status bar, offline
screen. **iOS apps are submitted from each restaurant's own Apple Developer
org account** (Apple 4.2.6 — no alternative); Android from restaurant-owned
Play org accounts (Luigi's choice; skips Google's 12-tester gate).

## The status machine (src/lib/branded-app/status.ts)

`draft → submitted → building → in_store_review → live` with `needs_owner`
and `suspended` branches. Every state maps 1:1 to who owns the next action.
ALL transitions go through `transitionPlatformStatus()` — legality-checked,
race-idempotent, event-writing, notification-fanning. Superadmin force
overrides exist and are separately audit-logged.

## Per-tenant Android build (WORKS TODAY — produced demo-pizza-palace-v1.aab)

```
npx tsx scripts/gen-build-manifest.ts <slug>        # approved config → manifest.json
node scripts/build-customer-android.mjs store-assets/customer-builds/<slug>/manifest.json
```

The orchestrator: config gen → `cap-customer.mjs sync android` → **plugin
allowlist guard** (strips the driver's background-geolocation etc. — the
iOS ITMS-90683 lesson; CI-fatal on violation) → branded assets from the
approved icon (`gen-customer-assets.js`: adaptive icons, round, Play 512,
feature graphic, iOS 1024 opaque, 2732 splash) → per-tenant upload keystore
(first build generates it + an INTAKE file; enter the passphrase in
superadmin credentials as `android_keystore_passphrase`, upload the .jks to
private Blob, DELETE the intake file) → `gradlew bundleRelease` with
injected identity → signed AAB.

Windows quirks already handled in the scripts: keytool from Android
Studio's JBR, .bat needs shell:true, quoted spaced args, apostrophes escaped
for AAPT, local.properties inherited from the kitchen tree.

**Push**: drop the tenant's `google-services.json` (from the Firebase app
registration) into `apps/customer-shell/android/app/` before building.
Firebase sharding: ~12 tenants (Android+iOS pairs) per Firebase project;
`src/lib/push.ts`'s service account is per-project — generalize when the
second shard opens.

## Per-tenant iOS build (Codemagic `customer-ios` workflow)

Runs on macOS only (Windows `cap sync ios` poisons Package.swift — the
runner refuses). Per-run env vars: `FF_MANIFEST_JSON` (base64 manifest),
`TENANT_ASC_KEY_P8/KEY_ID/ISSUER_ID` (the RESTAURANT's App Store Connect API
key — from the encrypted credential store), `FF_GSERVICE_PLIST_B64`.
The workflow scaffolds the iOS tree on first run, syncs, allowlist-strips,
injects bundle id + display name + `applinks:` entitlement, signs on the
TENANT team (one reused `IOS_SIGNING_KEY_PEM` mints one cert per team), and
publishes to the tenant's TestFlight. Manual UI runs for the pilot;
REST-triggered (`POST /builds` with environment.variables) at GA.

## What is MANUAL, per store (the wizard guides the owner; superadmin verifies)

**Apple (owner)**: D-U-N-S → org enrollment ($99/yr; legal name, own-domain
email, live site) → accept agreements (Account Holder only) → invite our
publishing email as Admin+Certs → generate ASC API key → create the FIRST
app record + age rating (with our help). **Apple (us)**: verify access,
intake the ASC key, create the tenant's APNs auth key in their portal and
upload it to our Firebase iOS registration (~5 min, once), record the Team
ID (needed by the AASA route).

**Google (owner)**: Play org account ($25) → identity verification → invite
our email as Admin. **Google (us)**: create the app in Play Console, first
AAB upload, data-safety form (account-deletion URL =
`https://<tenant-host>/account-deletion`), content rating, listing, first
publish. After first publish, record the **App signing key SHA-256** from
Play Console → App integrity into superadmin (`certSha256`) — verified app
links (`/.well-known/assetlinks.json`, dynamic per host) don't work until
this is set. Updates automatable later via the Publishing API.

## Deep links

Dynamic routes resolve the request Host → tenant:
`/.well-known/assetlinks.json` (package + certSha256) and
`/.well-known/apple-app-site-association` (teamId.bundleId — teamId from the
apple_asc_key credential row). `src/proxy.ts` excludes `.well-known/` from
host rewriting. iOS's applinks domain is compiled into the binary → a
custom-domain change requires an iOS rebuild.

## Credentials & custody

Everything sensitive lives in `BrandedAppStoreCredential` (AES-256-GCM,
3-column pattern; plaintext never returned by any API) or private Blob
(.jks). Play App Signing holds the real app signing keys — a lost upload
key is a Google-assisted reset, not a catastrophe. The fleet's one iOS
distribution private key is Codemagic secure var `IOS_SIGNING_KEY_PEM`.
Access: superadmin only, audit-logged (`branded-app.credential` — kind only,
never the secret).

## Recovery / gotchas

- Build fails at allowlist: a new plugin joined node_modules — either add it
  to the ALLOW list deliberately (capability decision!) or fix the bleed.
- `Task 'X' not found`: a spaced gradle -P arg lost its quotes.
- AAPT "invalid escape": app name apostrophes — handled in build.gradle.
- Play rejects DEBUG-signed AAB: keystore.properties missing (orchestrator
  writes it; check FF_KEYSTORE_PASS / intake file).
- Recurring store deadlines: Apple SDK bump every ~April (Xcode/iOS SDK),
  Play target-API every Aug 31, Apple agreement re-acceptance per tenant
  (blocks THEIR submissions silently — surface in superadmin at GA).

## Launch switch (keep DARK until the pilot app is live)

1. Pilot: comp-grant `branded_mobile_app` (permanent-comp shape, NOT the
   expiring trial), run both store flows on Luigi's restaurant.
2. Launch: superadmin sets $59 `monthlyPriceCents` → Sync → `comingSoon`
   false; same change: seed-addons.ts price/flag, remove the hardcoded
   sidebar `comingSoon: true`, keep out of GrowthNet; COSTS.md note.
