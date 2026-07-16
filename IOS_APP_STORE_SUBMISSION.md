# iOS App Store submission — Fee Free Ordering Inc.

Covers **both** iOS apps:
- **Fee Free Order App** (Kitchen) — bundle `com.feefreeordering.kitchen`
- **Fee Free Delivery** (Driver) — bundle `com.feefreeordering.driver`

**Target seller / legal entity: Fee Free Ordering Inc. (Apple Developer ORGANIZATION account).**
- Enrollment ID `LXARH3QT89` · D-U-N-S `243370724` · account holder Sameem Nabil.
- **STATUS 2026-07-16: the org account is still "(Pending)" at Apple.** Apple says processing can take up to ~48h (sometimes a verification call). **Nothing on Apple's side is clickable until it activates — do NOT re-purchase, it's already paid.** Everything below is the plan for the moment it goes active.
- Old team (where the Kitchen app lives today): **Luigi's Lasagna & Pizzeria Inc.**, Team `NT5ZY28ATK`. Luigi wants nothing public under that name — hence the move to the org.

---

## 🔑 DECISIONS THAT ARE BLOCKED ON APPLE ACTIVATING (raise these, don't act blind)

### D1. The Kitchen bundle id is stuck on the OLD team — pick a path
`com.feefreeordering.kitchen` is registered under the OLD team `NT5ZY28ATK`, and its build 24 is on that team's TestFlight. **A bundle id lives under exactly one team.** Apple's "Transfer App" moves an app between teams **only if it has at least one version released on the public App Store** — a **TestFlight-only app generally cannot be transferred.** So "submit now under Luigi's Lasagna, transfer to the org later" (the old Option A) is **not reliable** for Kitchen. Two real options:
- **D1-a (clean, recommended): re-register Kitchen under the org.** Once the org is active: in the OLD team remove the `com.feefreeordering.kitchen` App ID / App Store Connect record, then register the same bundle id fresh under the org and create a new ASC app record. Cost: build 24's TestFlight testers/build history don't carry over — you re-upload one build via Codemagic and re-invite testers. The seller name is Fee Free Ordering Inc. from day one. *(A bundle id can only be re-registered under a different team once it's fully removed from the first — if Apple still shows it "in use", that's the step that's pending.)*
- **D1-b: submit Kitchen from the OLD team now.** Fastest to the public store, but the App Store **Seller shows "Luigi's Lasagna & Pizzeria Inc."** — the exact thing Luigi said he doesn't want — and you'd still face the transfer limitation later. Not recommended unless speed beats the seller-name concern.

**Driver app has NO iOS App ID yet → no such problem.** Register `com.feefreeordering.driver` **directly under the org** from the start (D2 below). No transfer, ever.

### D2. Codemagic signing points at the OLD team — repoint after the org has an API key
Both iOS workflows sign with the old team's credentials:
- **`ff-asc-key`** (the App Store Connect API key integration) → issued under `NT5ZY28ATK`.
- **`IOS_SIGNING_KEY_PEM`** (env group `ios_signing`, the reused distribution private key) → an `NT5ZY28ATK` distribution cert.

When the org is active: create a NEW **App Store Connect API key under the org** (Users and Access → Integrations → App Store Connect API → generate, App Manager role), add it to Codemagic as a new integration, and **repoint BOTH `ios-kitchen` and `ios-driver` workflows to it.** The stored `IOS_SIGNING_KEY_PEM` cert must be re-minted under the org too (the first org build can mint one; see the cert-reuse note in the iOS memory). Until then, an org-targeted build will fail signing.

### D3. Kitchen's iOS ring bugs are UNRESOLVED — shipping it to the PUBLIC store untested is risky
Fabrizio's reported iOS ring issues are still open. His app's build stamp (web `de2bbc0`) proved his install is already on **current** code — so the earlier "his app is a stale build" theory was **wrong**, and the ring behavior needs a real root-cause, not a rebuild. Recommendation: **do not push the Kitchen app to the public App Store until the ring bug is understood** (TestFlight is fine for continued testing). The **Driver app has no such blocker** — it's new and its core flow (queue + GPS) is verified — so if you want an iOS app in the store first, Driver is the safer candidate. Final call is yours; this is the honest risk statement.

---

## Per-app checklist

Do the same five things for each app (App Store Connect → the app):
**1** App Information · **2** Version metadata · **3** App Privacy · **4** Screenshots · **5** App Review notes. The demo accounts (§6) must exist on PROD first.

---

# APP A — Fee Free Order App (Kitchen) · `com.feefreeordering.kitchen`

## A1. App information
- **Name** (≤30): `Fee Free Order App`
- **Subtitle** (≤30): `Never miss an online order`
- **Primary category:** Business · **Secondary:** Food & Drink
- **Content rights:** No third-party content · **Age rating:** 4+

## A2. Version metadata (1.0 → Prepare for Submission)
- **Promotional text** (≤170):
  > Real-time order alerts that ring even when the iPad is locked, plus direct thermal receipt printing. The kitchen companion for Fee Free Ordering restaurants.
- **Description** (≤4000):
  > Fee Free Order App is the order-taking companion for restaurants on Fee Free Ordering. Install it on the iPhone or iPad at your counter and never miss an online order again.
  >
  > • Instant new-order alerts — a loud ring the moment an order or table reservation arrives, even with the screen locked or the app in the background.
  > • Accept, prepare, and complete orders from one clean screen, with a live countdown to each order's promised time.
  > • Table reservations and "order ahead" bookings, right alongside your orders.
  > • Direct thermal receipt printing to Star receipt printers over your local Wi-Fi — no extra hardware or cloud account needed.
  > • End-of-day reports so you can close out the day at a glance.
  > • Works in 38 languages and follows the language you set for your restaurant.
  >
  > Fee Free Ordering lets restaurants take online orders from their own website and ordering page without paying 30% commissions to third-party apps. This app is the kitchen-side companion — you'll need a Fee Free Ordering account (sign up free at feefreeordering.com) to use it.
- **Keywords** (≤100): `restaurant,orders,kitchen,receipt printer,POS,food,online ordering,takeout,delivery,star printer`
- **Support URL / Marketing URL:** `https://www.feefreeordering.com`
- **Copyright:** `2026 Fee Free Ordering Inc.`

## A3. App Privacy (collect: Yes · tracking: No · advertising: No)
| Data type | Collected | Linked | Tracking | Purpose |
|---|---|---|---|---|
| Name | Yes | Yes | No | App Functionality |
| Email address | Yes | Yes | No | App Functionality, Account |
| Phone number | Yes | Yes | No | App Functionality |
| Customer/order content (User Content) | Yes | Yes | No | App Functionality |
| Device ID (push token) | Yes | Yes | No | App Functionality (notifications) |
- Not used for tracking. Not shared for ads. Encrypted in transit (HTTPS). Deletion → support@feefreeordering.com.
- **Privacy Policy URL:** `https://www.feefreeordering.com/privacy`

## A4. Screenshots (both device sizes required)
- **iPhone 6.7"** 1290 × 2796 · **iPad 12.9"** 2048 × 2732.
- Show: orders list with a live order + countdown, an order detail/accept screen, reservations view, printer/settings screen. (Claude generates these from the seeded demo.)

## A5. App Review notes (prevents a 4.2 web-wrapper rejection — paste verbatim)
- **Demo account:** `demo@feefreeordering.com` / *(password in the App Review field — see §6)*
  > This app is the staff-side companion for restaurants using the Fee Free Ordering platform; it is not a consumer app. To test:
  > 1. Open the app → tap "Kitchen login" → sign in with the demo account above.
  > 2. You'll see the live Orders dashboard.
  > 3. To generate a test order, open https://feefreeordering.com/order/fee-free-demo-restaurant in any browser, add an item, choose Pickup + Cash, and place the order. It rings and appears in the app in real time.
  >
  > Native capabilities that require this to be an app (not a website):
  > • Time-sensitive push notifications that ring the device even when locked or in Focus — so staff never miss an order.
  > • Direct thermal receipt printing to Star Micronics printers over the local network (StarXpand SDK).
  > These are core to the workflow and cannot be done in a mobile browser.

---

# APP B — Fee Free Delivery (Driver) · `com.feefreeordering.driver`

> ⚠️ **Background location app.** iOS reviewers scrutinize `NSLocationAlwaysAndWhenInUseUsageDescription` + `UIBackgroundModes: location`. The reviewer notes (B5) must explain the delivery-tracking purpose, or expect a rejection asking why the app needs Always location. The Info.plist strings are already descriptive; keep the App Privacy location answers (B3) honest.

## B1. App information
- **Name** (≤30): `Fee Free Delivery`
- **Subtitle** (≤30): `Deliveries, live on the map`
- **Primary category:** Business · **Secondary:** Navigation
- **Content rights:** No third-party content · **Age rating:** 4+

## B2. Version metadata (1.0 → Prepare for Submission)
- **Promotional text** (≤170):
  > Accept delivery jobs, navigate to the restaurant and customer, and share your live location the whole way — even with the phone locked. Driver + dispatch in one app.
- **Description** (≤4000):
  > Fee Free Delivery is the driver and dispatch app for restaurants that deliver with the Fee Free Ordering platform. Sign in as a driver to work the job queue, or as a restaurant owner to assign and track your deliveries — one app, both roles.
  >
  > FOR DRIVERS
  > • See available delivery jobs near you and accept the ones you want.
  > • One-tap navigation to the restaurant, then to the customer, with the address, order details, and a direct call button on every stop.
  > • Move each job through the real workflow — accepted, picked up, delivered — with a tap.
  > • Your live location is shared with the customer and restaurant only while you're on an active delivery, and it keeps updating even when your phone is locked or in your pocket, so the customer's tracking map stays accurate the whole way. Location sharing stops the moment the delivery is complete.
  >
  > FOR RESTAURANTS
  > • Open the same app, sign in with your existing Fee Free Ordering dashboard login, and get the dispatch view: assign orders to a driver, watch deliveries in progress on a live map, and see what you owe for the week at a glance.
  >
  > Fee Free Ordering lets restaurants take online orders and run their own in-house delivery without paying 30% commissions to third-party apps. You'll need a Fee Free Ordering driver account (your restaurant sets you up) or a restaurant account to sign in. Learn more at feefreeordering.com.
- **Keywords** (≤100): `delivery,driver,gps,tracking,restaurant,dispatch,courier,navigation,food delivery,logistics`
- **Support URL / Marketing URL:** `https://www.feefreeordering.com`
- **Copyright:** `2026 Fee Free Ordering Inc.`

## B3. App Privacy (collect: Yes · tracking: No · advertising: No)
| Data type | Collected | Linked | Tracking | Purpose |
|---|---|---|---|---|
| **Precise Location** | **Yes** | Yes | No | App Functionality (live delivery tracking; **collected in background**) |
| Name | Yes | Yes | No | App Functionality |
| Email address | Yes | Yes | No | App Functionality, Account |
| Phone number | Yes | Yes | No | App Functionality |
| App activity (deliveries handled) | Yes | Yes | No | App Functionality |
- Location is shared with the customer + restaurant of the active delivery only, for app functionality — **not** for tracking across apps, **not** for advertising.
- Encrypted in transit (HTTPS). Deletion → support@feefreeordering.com.
- **Privacy Policy URL:** `https://www.feefreeordering.com/privacy`

## B4. Screenshots (iPhone 6.7" required; iPad optional — it's a phone-first app)
- Show: the driver job queue, an accepted job with navigate/call buttons, an in-progress delivery, and the restaurant dispatch map. (Claude generates these from the seeded demo.)

## B5. App Review notes (paste verbatim — CRITICAL for the Always-location review)
- **Demo driver account:** *(create on PROD — see §6; put email/password in the App Review field)*
  > This is the delivery-side companion for restaurants on the Fee Free Ordering platform; it has two roles in one app. To test the DRIVER role:
  > 1. Open the app → sign in with the demo driver credentials above → you'll see the delivery job queue.
  > 2. When a driver goes on shift the app requests location "Always". This is core to the app: while a delivery is active, the driver's live location is streamed to the customer's order-tracking page and to the restaurant's dispatch map, and it must continue when the phone is locked/in a pocket during the drive. Location is used for nothing else and stops when the delivery is delivered.
  > 3. To see a job flow, a restaurant using Fee Free Ordering assigns a delivery to the driver; the driver accepts → picked up → delivered.
  >
  > RESTAURANT role: tap "Restaurant owner?" on the login screen and sign in with a restaurant dashboard login (demo: demo@feefreeordering.com) to get the dispatch/assign/track view.
  >
  > Why background location is required: without it, a customer watching "where's my driver" would see the pin freeze every time the driver's phone locks — the live-tracking feature is the app's primary function.

---

## 6. Demo accounts (must exist on PROD before submitting)
- **Kitchen** — the demo restaurant (idempotent; password passed as an arg so it never lands in git — it lives only in the ASC App Review field):
  ```
  npx tsx scripts/run-on-prod.ts scripts/create-demo-restaurant.ts '<password>'
  ```
  - Kitchen login: https://feefreeordering.com/kitchen/login
  - Test-order page: https://feefreeordering.com/order/fee-free-demo-restaurant
- **Driver** — a demo DRIVER must exist on prod so reviewers reach the queue. Create it at
  `feefreeordering.com/superadmin → Delivery Drivers → New driver` (email + 8+ char password),
  or adapt `scripts/_create-demo-driver.ts` for a prod run. Put the credentials in the Driver
  app's ASC App Review field. The restaurant/dispatch role reuses `demo@feefreeordering.com`.

## 7. Submission steps (per app, once the org is active + signing repointed)
1. App Store Connect (org account) → the app → the **1.0** version.
2. Fill §1–§3 + upload §4 screenshots + §5 reviewer notes.
3. **Build** section → **＋ → select the latest Codemagic build** (Kitchen: build 24+ if kept on old team per D1-b, or a fresh org build per D1-a; Driver: the first `ios-driver` org build). Export-compliance is pre-answered via `ITSAppUsesNonExemptEncryption=NO` in Info.plist.
4. **Add for Review → Submit.** First review is typically 24–48h.
5. If Kitchen is rejected under 4.2 (web-wrapper), point to the native push + printing in §A5. If Driver is questioned on Always-location, point to §B5.

## 8. Codemagic build (both apps build on the cloud Mac — no local Mac needed)
- **Kitchen:** `ios-kitchen` workflow → TestFlight.
- **Driver:** `ios-driver` workflow (`XCODE_PROJECT ios-driver/App/App.xcodeproj`, bundle `com.feefreeordering.driver`, syncs via `node scripts/cap-driver.mjs sync ios`, background-geolocation plugin bundled). Register the App ID + create the ASC app record **under the org** first (D1/D2), then use **"Start new build"** (not "Rebuild").
- Both reuse the `ff-asc-key` + `IOS_SIGNING_KEY_PEM` setup — which must be **repointed to the org** per D2 before an org build will sign.

---

## TestFlight — get a restaurant running NOW (no App Store needed)
While the org activates, the Kitchen app stays testable on the OLD team's TestFlight (build 24, "Ready to Test"):
1. App Store Connect (old team) → the app → **TestFlight**.
2. Add the restaurant's Apple ID as a tester by email, OR enable the external public link (one-time ~24h Beta App Review).
3. Send them: install **TestFlight** → open the invite → install **Fee Free Order App** → Kitchen login with THEIR credentials. (The app is generic — any restaurant logs in with its own kitchen login.)
