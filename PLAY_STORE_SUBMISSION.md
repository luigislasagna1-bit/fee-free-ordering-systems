# Play Store submission — Fee Free Order App (Kitchen Order App)

Package: `com.feefreeordering.kitchen` · **versionCode 21 / versionName 3.0**
Signed AAB: `android/app/build/outputs/bundle/release/app-release.aab` (26.4 MB)
Release signature — VERIFIED 2026-07-16 (`jarsigner -verify` → "jar verified"):
- Signer: `CN=Fee Free Ordering Systems, O=Fee Free Ordering Systems, L=Milton, ST=Ontario, C=CA`
- Cert SHA-256: `20:96:12:86:BB:2F:C9:B0:40:54:8B:10:67:BE:FD:02:B5:86:03:C8:D2:AC:84:11:5E:16:08:51:D6:E5:B0:AF`
- This is the upload key at `android/app/feefree-release.jks` (NOT a debug cert). Google Play App Signing re-signs with its own key on upload — this is the upload cert Play pins to the app.

Developer account: **Fee Free Ordering Inc. (Organization)** · D-U-N-S `243370724` · account ID `7291944516964290458` · owner luigislasagna1@gmail.com (Sameem Nabil).

> ✅ **Org account = NO closed-testing gate.** The account was converted to an
> Organization on 2026-07-15, which is **exempt** from the 20-tester / 14-day
> closed-testing requirement that the old Personal account hit. This app can go
> **straight to a Production release** — no closed test required.
>
> ⚠️ **versionCode must be higher than anything already uploaded.** If Play rejects
> the upload with "Version code 21 has already been used", bump `versionCode` in
> `android/app/build.gradle` (→ 22) and rebuild. The prior closed-testing uploads
> used lower codes, so 21 should be clear — but this is the one thing to watch.

---

## Store listing copy

**App name:** Fee Free Order App

**Short description** (≤80 chars):
> Get & manage your restaurant's online orders and table bookings in real time.

**Full description** (≤4000 chars):
> Fee Free Order App is the order-taking companion for restaurants on Fee Free
> Ordering. Install it on the phone or tablet at your counter and never miss an
> online order again.
>
> • Instant new-order alerts — a loud ring the moment an order or table
>   reservation comes in, even with the screen off or the app in the background.
> • Accept, prepare, and complete orders from one clean screen, with a live
>   countdown to each order's promised time.
> • Table reservations and "order ahead" bookings, right alongside your orders.
> • Direct thermal receipt printing to Star receipt printers over your local
>   Wi-Fi — no extra hardware or cloud account needed.
> • End-of-day reports so you can close out the day at a glance.
> • Works in 38 languages and follows the language you set for your restaurant.
>
> Fee Free Ordering lets restaurants take online orders from their own website
> and ordering page without paying 30% commissions to third-party apps. This app
> is the kitchen-side companion — you'll need a Fee Free Ordering account
> (sign up free at feefreeordering.com) to use it.

**Category:** Business (alt: Food & Drink)
**Tags:** restaurant, orders, point of sale, food, kitchen
**Contact email:** support@feefreeordering.com
**Website:** https://www.feefreeordering.com
**Privacy policy:** https://www.feefreeordering.com/privacy

---

## Graphics
- **App icon** 512×512 — ✅ DONE → `store-assets/app-icon-512.png` (bell + two-tone
  "FF", navy/green). The installed app launcher icon was updated to match (adaptive
  background = green `@color/ic_launcher_background`, foreground + legacy PNGs
  regenerated in `android/app/src/main/res/mipmap-*/`). Regenerate via
  `node scripts/gen-final-assets.js`. AAB rebuilt + re-signed afterward.
- **Feature graphic** 1024×500 — ✅ DONE → `store-assets/feature-1024x500.png`.
- **Phone screenshots** ≥2 (min 320px) — STILL NEEDED. Capture the kitchen app on
  the tablet: (1) orders list with a live order, (2) an order detail / accept
  screen, (3) the reservations view, (4) settings. Drop them in `store-assets/`.
- (Tablet screenshots recommended since it's used on tablets.)

---

## Data safety form (answers)
- **Does the app collect/share data?** Yes (collects, does not sell/share with third parties for ads).
- **Data collected:** Name, email, phone (the restaurant's own account login + the order/customer info it displays). App activity (orders handled). Device IDs (for push notifications).
- **Purpose:** App functionality (order management, notifications), account management.
- **Encrypted in transit?** Yes (HTTPS).
- **Can users request deletion?** Yes — via support@feefreeordering.com (privacy policy, 90-day purge).

## Content rating
- Questionnaire → "Business / Productivity"; no violence/sexual/gambling content → **Everyone**.

---

## Demo account (App access) — for reviewers
A complete, live demo restaurant exists on **production** so reviewers can sign in
and test the kitchen app end-to-end. Created via
`npx tsx scripts/run-on-prod.ts scripts/create-demo-restaurant.ts '<password>'`
(idempotent; password passed as an arg so it's never committed — it lives only in
the Play Console "App access" field).

- **Login email:** `demo@feefreeordering.com`  ·  password: *(in Play Console App access field)*
- **Kitchen login:** https://feefreeordering.com/kitchen/login
- **Ordering page (to generate a test order):** https://feefreeordering.com/order/fee-free-demo-restaurant
- Restaurant is published, open 24/7, pickup on, cash payment, 3 categories / 7 items.

In Play Console → **App content → App access**, choose **"All or some functionality
is restricted"** and add these credentials + the reviewer instructions (open app →
Kitchen login → sign in → Orders dashboard; place a Cash/Pickup test order from the
ordering page to watch it ring in).

---

## Submission steps (org account → straight to Production)
1. **Play Console → Create app** — name "Fee Free Order App", language English, type App, Free.
2. **Set up the app** — fill the dashboard tasks: privacy policy URL, app access (provide the demo login so reviewers can sign in), data safety (above), content rating, target audience, store listing (copy above + graphics).
3. **Production → Create new release.**
4. **Upload the AAB** (`android/app/build/outputs/bundle/release/app-release.aab`). Play verifies the signature; on the first upload it enrolls this cert in Play App Signing.
5. **Add release notes → Review release → Start rollout to Production.** First review is typically a few hours to ~2 days.

*(A closed/internal test track is optional now — handy for a last on-device sanity check before the public rollout — but no longer required for production.)*

Rebuild command (bump `versionCode` in `android/app/build.gradle` before each new upload):
`JAVA_HOME="C:\Program Files\Android\Android Studio1\jbr"  gradlew -p android bundleRelease --no-daemon`

Then re-verify the signature before uploading:
`"C:\Program Files\Android\Android Studio1\jbr\bin\jarsigner" -verify -certs android/app/build/outputs/bundle/release/app-release.aab`  → must print **"jar verified"** and the `CN=Fee Free Ordering Systems` cert above (never `CN=Android Debug`).
