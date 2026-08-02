# Play Store submission — Branded Customer Apps (per-tenant runbook)

Unlike the Kitchen/Driver docs, this is a **repeatable per-restaurant runbook**:
every Branded Mobile App tenant gets its own listing in **the restaurant's own
Play org account** ($25 one-time, Luigi's policy choice 2026-08-01 — skips the
personal-account 12-tester/14-day gate, per-tenant upload keys, one tenant's
policy strike can't hurt the fleet). Google's Feb-2025 guidance explicitly
permits white-label apps and recommends exactly this ownership model.

Superadmin tracks each step in `/superadmin/branded-apps/<id>` (Android
platform card checklist mirrors this doc).

## 0. Prerequisites (owner does these, wizard-guided)

- [ ] Play Console **organization** account created with the restaurant's
      legal business info; identity verification passed (can take days —
      started at wizard stage 4).
- [ ] Our publishing address invited as **Admin** on the account.
- [ ] Superadmin: "Verify access" clicked on the platform card once we can
      sign in (`accessVerifiedAt` set).

## 1. Build the AAB (us, local — see docs/CUSTOMER_APP_PIPELINE.md)

```
npx tsx scripts/gen-build-manifest.ts <slug>
node scripts/build-customer-android.mjs store-assets/customer-builds/<slug>/manifest.json
```

- First build generates the tenant's **upload keystore** + INTAKE file →
  passphrase into superadmin credentials (`android_keystore_passphrase`),
  .jks to private Blob, DELETE the intake file.
- Requires the tenant's `google-services.json` in
  `apps/customer-shell/android/app/` (Firebase Android app registered with
  the tenant's applicationId — package name shown on the platform card).
- Verify before upload: `jarsigner -verify` says "jar verified" AND the
  signer is the TENANT key, not Fee Free's (the demo build printed the CN).

## 2. Create the app (us, in THEIR console — API cannot do any of this)

- App name = wizard `appName` (≤30 chars, already validated). Default
  language matches the restaurant's locale. Free / App.
- **App content forms** (all mandatory before first release):
  - Privacy policy URL = wizard `privacyPolicyUrl`.
  - **Data safety**: collected = name, email, phone, delivery address,
    order history (account creation + ordering); payment handled by Stripe
    (not collected by the app); data encrypted in transit; deletion path =
    `https://<tenant-host>/account-deletion` (the per-tenant page — REQUIRED
    field since 2024, per-app public URL).
  - Content rating questionnaire → Everyone (ordering app, no UGC beyond
    order notes).
  - Ads declaration: none. Target audience: 18+ (alcohol may be on menus —
    safest blanket answer; adjust per tenant if they sell none).
- **Store listing**: copy from the approved wizard config (short ≤80 /
  full ≤4000). ⚠️ Google's repetitive-content policy REQUIRES per-tenant
  unique listings — the wizard copy is about THE RESTAURANT (their cuisine,
  their city); never paste a generic platform blurb. Screenshots must show
  the tenant's REAL menu (Playwright generator is a later phase; pilot =
  manual captures from the branded host).
- Graphics: icon 512 + feature graphic come out of the build at
  `store-assets/customer-builds/<slug>/` (`play-icon-512.png`,
  `feature-graphic.png`).

## 3. First release

- Production track (org account → no testing gate) → upload the AAB →
  **opt in to Play App Signing** (default; Google holds the real signing
  key — our upload-key custody is recoverable via Google reset if lost).
- Countries: the restaurant's country (+ neighbors if they want) — NOT
  worldwide by default; it's a local restaurant.
- Submit for review. Typical first-app review: 1–7 days (the "6–10 business
  days after prerequisites" wizard language already covers this — never
  promise a date).

## 4. After it's live (us — REQUIRED for deep links to work)

- [ ] Play Console → Setup → App integrity → **App signing key certificate**
      → copy the SHA-256 → superadmin platform card → set `certSha256`.
      Until this is set, `https://<tenant-host>/.well-known/assetlinks.json`
      serves an empty array and Android app-link verification fails (links
      open the browser instead of the app).
- [ ] Copy the Play listing URL into the platform card (`storeUrl`) —
      transitions the row to `live`, which emails the owner (+ reseller).
- [ ] Record the first build via "Record build" (bumps `nextBuildNumber`).

## 5. Updates

Menu/price/content changes need NO store release (remote-URL shell). A
binary re-release only for: icon/name change, deep-link host change,
target-API deadline (every Aug 31), or shell feature work. Rebuild with the
same manifest flow — versionCode comes from `nextBuildNumber`; upload via
console (Play Publishing API automation is a GA-phase item).

## Rejection handling

Store rejection text goes into the timeline verbatim via superadmin
"Add note" (restaurant-visible, labeled as the store's words), status →
`needs_owner` or back to `building` depending on who must act. Common ones:
data-safety mismatch (re-check the form against what the WebView actually
does), broken privacy-policy URL (tenant let their domain lapse), and
listing-metadata quality (screenshots not from the actual app).
