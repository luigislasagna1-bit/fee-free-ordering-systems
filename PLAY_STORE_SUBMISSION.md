# Play Store submission — Fee Free Order App (Kitchen Order App)

Package: `com.feefreeordering.kitchen` · versionCode 8 / versionName 1.7
Signed AAB: `android/app/build/outputs/bundle/release/app-release.aab` (release-signed by "CN=Fee Free Ordering Systems")
Developer account: FeeFreeOrderingSystems (Personal) · ID 7291944516964290458

> ⚠️ **Personal account → closed-testing requirement.** Because the developer
> account is *Personal* (created recently), Google requires a **closed test with
> ≥20 testers for ≥14 days** before production access is granted. So the path is
> **closed testing first**, then production after the 14-day window.

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

## Submission steps (closed testing → production)
1. **Play Console → Create app** — name "Fee Free Order App", language English, type App, Free.
2. **Set up the app** — fill the dashboard tasks: privacy policy URL, app access (provide a demo login so reviewers can sign in — a test restaurant account), data safety (above), content rating, target audience, store listing (copy above + graphics).
3. **Testing → Closed testing → create a track** (e.g. "alpha"). Create a tester email list of ~20 people; share the opt-in link.
4. **Upload the AAB** to that closed track (`app-release.aab`). Roll it out.
5. **Wait 14 days** with ≥20 testers actually opted-in.
6. **Apply for production access** (Play prompts once eligible) → fill the form.
7. **Production → create release → upload the AAB → submit for review.**

Rebuild command (bump `versionCode` in `android/app/build.gradle` before each new upload):
`JAVA_HOME="C:\Program Files\Android\Android Studio1\jbr"  gradlew -p android bundleRelease --no-daemon`
