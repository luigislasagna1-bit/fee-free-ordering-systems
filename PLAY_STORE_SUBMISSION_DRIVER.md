# Play Store submission — Fee Free Delivery (driver app)

Package: `com.feefreeordering.driver` · **versionCode 1 / versionName 1.0**
Signed AAB: `android-driver/app/build/outputs/bundle/release/app-release.aab` (41.4 MB, rebuilt 2026-07-16 with the final brand icon — icon presence inside the bundle verified by extraction)
Release signature — VERIFIED 2026-07-16 after the icon rebuild (`jarsigner -verify` → "jar verified"):
- Signer: `CN=Fee Free Ordering Systems, O=Fee Free Ordering Systems, L=Milton, ST=Ontario, C=CA`
- Cert SHA-256: `20:96:12:86:BB:2F:C9:B0:40:54:8B:10:67:BE:FD:02:B5:86:03:C8:D2:AC:84:11:5E:16:08:51:D6:E5:B0:AF`
- **Same upload key as the Kitchen app** (deliberately reused — one key to back up). Read from `android-driver/keystore.properties`, whose `storeFile` points at `android/app/feefree-release.jks`.

Developer account: **Fee Free Ordering Inc. (Organization)** · D-U-N-S `243370724` · account ID `7291944516964290458`.
> ✅ Org account = no closed-testing gate — this app can go straight to a **Production** release.

---

## ⚠️ READ FIRST — background location makes this a scrutinized submission

This app requests **`ACCESS_BACKGROUND_LOCATION`** (GPS keeps streaming with the phone
locked / in the driver's pocket, so live customer tracking survives a screen-off). Google
reviews every app that requests it far more strictly, and the #1 rejection cause is a
missing **Location permissions declaration**. Before you can publish you MUST:

1. **Play Console → App content → Location permissions declaration** — complete it. Say the
   app accesses location in the background to **share a delivery driver's live location with
   the customer and the restaurant during an active delivery**, and that it is **core to the
   app's primary function** (live delivery tracking).
2. **Record a short demo video** (Google requires it here) showing: driver signs in →
   accepts a job → the app asks for location "Allow all the time" → the driver drives with
   the app in the background / screen locked → the customer's tracking page shows the pin
   moving. Upload it (unlisted YouTube link is fine) in the declaration.
3. **Prominent in-app disclosure + runtime consent** — the app already requests location at
   runtime via the OS "Allow all the time" prompt when a driver goes on shift; the store
   listing's full description (below) states the background-location use in plain language,
   which satisfies the prominent-disclosure text requirement.

If you skip step 1/2, Play rejects with a "background location access" policy notice. Nothing
about the build changes — it's a console form + a video.

---

## Store listing copy

**App name** (≤30 chars): `Fee Free Delivery`

**Short description** (≤80 chars):
> Accept delivery jobs, navigate, and share live GPS — the Fee Free driver app.

**Full description** (≤4000 chars):
> Fee Free Delivery is the driver and dispatch app for restaurants that deliver with the
> Fee Free Ordering platform. Sign in as a driver to work the job queue, or as a restaurant
> owner to assign and track your deliveries — one app, both roles.
>
> FOR DRIVERS
> • See available delivery jobs near you and accept the ones you want.
> • One-tap navigation to the restaurant, then to the customer, with the address, order
>   details, and a direct call button on every stop.
> • Move each job through the real workflow — accepted, picked up, delivered — with a tap.
> • Your live location is shared with the customer and the restaurant only while you're on
>   an active delivery, and it keeps updating even when your phone is locked or in your
>   pocket, so the customer's tracking map stays accurate the whole way. Location sharing
>   stops the moment the delivery is complete.
>
> FOR RESTAURANTS
> • Open the same app, sign in with your existing Fee Free Ordering dashboard login, and get
>   the dispatch view: assign orders to a driver, watch deliveries in progress on a live map,
>   and see what you owe for the week at a glance.
>
> Fee Free Ordering lets restaurants take online orders and run their own in-house delivery
> without paying 30% commissions to third-party apps. This app is the delivery-side companion
> — you'll need a Fee Free Ordering driver account (your restaurant sets you up) or a
> restaurant account to sign in. Learn more at feefreeordering.com.
>
> Location note: this app collects precise location in the background to power live delivery
> tracking for the customer and restaurant during an active delivery. Background location is
> used for no other purpose and is not shared for advertising.

**Category:** Business (alt: Maps & Navigation)
**Tags:** delivery, driver, gps tracking, restaurant, logistics
**Contact email:** support@feefreeordering.com
**Website:** https://www.feefreeordering.com
**Privacy policy:** https://www.feefreeordering.com/privacy

---

## Graphics — ✅ ALL DONE 2026-07-16
- **App icon** 512×512 → `store-assets/driver-app-icon-512.png` — the brand-family mark
  (location pin over a takeout box + motion dashes, two-tone FF, same green gradient as the
  Kitchen bell icon). The launcher icons inside the .aab were regenerated to match
  (`android-driver/.../mipmap-*`, adaptive bg `#54B135`), plus the iOS 1024 and the PWA
  `public/icons/driver-icon.svg`. Regenerate everything via `node scripts/gen-driver-assets.js`.
- **Feature graphic** 1024×500 → `store-assets/driver-feature-1024x500.png`.
- **Phone screenshots** → `store-assets/play-screenshots/driver-1-queue.png` +
  `driver-2-active-delivery.png` (regenerate via `scripts/_capture-play-shots.ts`).

---

## Data safety form (answers)
- **Does the app collect/share data?** Yes (collects; does not sell/share with third parties for ads).
- **Location — Precise location:** Collected. **Also collected in the background.** Purpose:
  App functionality (live delivery tracking). Shared: with the customer and restaurant of the
  active delivery only — declare as "shared" for App functionality, NOT for advertising.
- **Personal info:** Name, email, phone (driver's own login +, for the dispatch role, the
  restaurant account). Purpose: App functionality, account management.
- **App activity:** Delivery jobs handled. Purpose: App functionality.
- **Encrypted in transit?** Yes (HTTPS).
- **Can users request deletion?** Yes — via support@feefreeordering.com (privacy policy, 90-day purge).

## Content rating
- Questionnaire → "Business / Productivity"; no violence/sexual/gambling content → **Everyone**.

---

## Demo account (App access) — for reviewers
Reviewers must be able to sign in and reach the driver queue. Two options:

1. **Driver login (shows the delivery queue — recommended for reviewers).** A demo driver must
   exist **on production**. Create one at `feefreeordering.com/superadmin → Delivery Drivers →
   New driver` (or via `npx tsx scripts/run-on-prod.ts scripts/_create-demo-driver.ts` if you
   adapt it for prod). Put its email + password in Play Console → **App access**. Driver app
   sign-in is at the app's login screen (email + password).
2. **Restaurant login (shows the dispatch view).** The existing demo restaurant
   `demo@feefreeordering.com` works — sign in via the "Restaurant owner?" link on the driver
   login screen.

App-access reviewer instructions (paste):
> Open the app → sign in with the demo DRIVER credentials above. You'll see the delivery job
> queue. The app requests location "Allow all the time" — this powers live delivery tracking
> that continues while the phone is locked (core to the app). To see a job flow, a restaurant
> using Fee Free Ordering assigns a delivery to the driver; the driver accepts → picked up →
> delivered, and the customer's order page shows the live map. Restaurants use the SAME app —
> tap "Restaurant owner?" on the login screen and sign in with a restaurant dashboard login to
> get the dispatch view.

---

## Submission steps (org account → straight to Production)
1. **Play Console → Create app** — name "Fee Free Delivery", language English, type App, Free.
2. **App content** — privacy policy URL, **Location permissions declaration (+ demo video — see top of this file)**, data safety (above), content rating, target audience, app access (demo driver).
3. **Store listing** — copy + graphics above.
4. **Production → Create new release → upload the AAB** (`android-driver/app/build/outputs/bundle/release/app-release.aab`) → release notes → **Review → Start rollout to Production.**

Rebuild command (bump `versionCode` in `android-driver/app/build.gradle` before each new upload):
`JAVA_HOME="C:\Program Files\Android\Android Studio1\jbr"  gradlew -p android-driver bundleRelease --no-daemon`

Re-verify the signature before uploading:
`"C:\Program Files\Android\Android Studio1\jbr\bin\jarsigner" -verify -certs android-driver/app/build/outputs/bundle/release/app-release.aab`  → must print **"jar verified"** and the `CN=Fee Free Ordering Systems` cert (never `CN=Android Debug`).
