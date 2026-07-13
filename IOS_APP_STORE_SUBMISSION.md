# iOS App Store submission — Fee Free Order App (Kitchen Order App)

Bundle ID: `com.feefreeordering.kitchen` · Team `NT5ZY28ATK`
Seller (Option A, chosen 2026-07-13): **Luigi's Lasagna & Pizzeria Inc.** — submit now, **transfer to Fee Free Ordering Inc. later** (an App Store transfer keeps the app, its reviews, and its ranking; TestFlight testers/builds do not transfer).
Build to attach: the latest **TestFlight build (1.0 (24) or newer)** — already uploaded via Codemagic.

> **You do NOT need the App Store for Fabrizio's / Milton's restaurants to start.**
> They can run the app THIS WEEK via **TestFlight** (see "TestFlight — get a restaurant running now" at the bottom). The App Store is only for the public listing.

---

## 1. App information (App Store Connect → your app → App Information)

- **Name** (≤30 chars): `Fee Free Order App`
- **Subtitle** (≤30 chars): `Never miss an online order`
- **Primary category:** Business  ·  **Secondary:** Food & Drink
- **Content rights:** does not use third-party content → No
- **Age rating:** answer all "None/No" → **4+**

## 2. Version metadata (the version → "1.0 Prepare for Submission")

- **Promotional text** (≤170 chars, editable anytime without review):
  > Real-time order alerts that ring even when the iPad is locked, plus direct thermal receipt printing. The kitchen companion for Fee Free Ordering restaurants.

- **Description** (≤4000 chars):
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

- **Keywords** (≤100 chars, comma-separated, no spaces after commas):
  > restaurant,orders,kitchen,receipt printer,POS,food,online ordering,takeout,delivery,star printer

- **Support URL:** `https://www.feefreeordering.com`
- **Marketing URL:** `https://www.feefreeordering.com`
- **Copyright:** `2026 Fee Free Ordering`
- **Version:** `1.0`

## 3. App Privacy (App Store Connect → App Privacy) — Apple's data questionnaire

Answer **Yes, we collect data**, NOT used for tracking, NOT linked for advertising:
| Data type | Collected | Linked to identity | Used for tracking | Purpose |
|---|---|---|---|---|
| Name | Yes | Yes | No | App Functionality |
| Email address | Yes | Yes | No | App Functionality, Account |
| Phone number | Yes | Yes | No | App Functionality |
| Customer/order content (User Content) | Yes | Yes | No | App Functionality |
| Device ID (push token) | Yes | Yes | No | App Functionality (notifications) |

- Data is **not** used to track users across apps/sites. Not shared with third parties for ads.
- Encrypted in transit (HTTPS). Deletion on request → support@feefreeordering.com.
- **Privacy Policy URL:** `https://www.feefreeordering.com/privacy`

## 4. Screenshots (required to submit)

Apple requires at least one set. This app runs on iPhone AND iPad, so provide **both**:
- **iPhone 6.7"** — 1290 × 2796 px (or 1284 × 2778)
- **iPad 12.9"** — 2048 × 2732 px

Capture the demo kitchen (login below) showing: (1) orders list with a live order + countdown, (2) an order detail / accept screen, (3) reservations view, (4) settings/printer screen.
> Claude can generate these from the seeded demo restaurant on request ("make the App Store screenshots").

## 5. App Review Information (reviewer notes — CRITICAL, prevents a 4.2 rejection)

- **Sign-in required:** Yes → provide the demo login below.
- **Demo account:** `demo@feefreeordering.com` / *(the password you set — see §6)*
- **Notes to reviewer** (paste verbatim):
  > This app is the staff-side companion for restaurants using the Fee Free Ordering platform; it is not a consumer app. To test:
  > 1. Open the app → tap "Kitchen login" → sign in with the demo account above.
  > 2. You'll see the live Orders dashboard.
  > 3. To generate a test order, open https://feefreeordering.com/order/fee-free-demo-restaurant in any browser, add an item, choose Pickup + Cash, and place the order. It will ring and appear in the app in real time.
  >
  > Native capabilities that require this to be an app (not a website):
  > • Critical/time-sensitive push notifications that ring the device even when locked or in Sleep/Focus — so staff never miss an order.
  > • Direct thermal receipt printing to Star Micronics printers over the local network (StarXpand SDK).
  > These are core to the workflow and cannot be done in a mobile browser.

## 6. Demo restaurant (must exist on PROD before submitting)

Idempotent; password passed as an arg so it never lands in git — it lives only in the App Store Connect "App Review Information" field:
```
npx tsx scripts/run-on-prod.ts scripts/create-demo-restaurant.ts '<password>'
```
- Kitchen login: https://feefreeordering.com/kitchen/login
- Test-order page: https://feefreeordering.com/order/fee-free-demo-restaurant
- Published, open 24/7, pickup on, cash payment.

## 7. Submission steps

1. App Store Connect → your app → the **1.0** version.
2. Fill §1–§3 + upload §4 screenshots + §5 review notes.
3. **Build** section → **＋ → select the latest TestFlight build (24+)**. (Export-compliance is pre-answered via `ITSAppUsesNonExemptEncryption=NO` in Info.plist.)
4. **Add for Review → Submit**. First review is typically 24–48h.
5. If rejected under 4.2 (web-wrapper), reply pointing to the native push + printing in §5 — usually clears it.

## 8. After it's live — transfer to Fee Free Ordering Inc.

Once the Fee Free Ordering Inc. org is enrolled (D-U-N-S pending): App Store Connect → App → **Transfer App** to the new org. The listing, reviews, and ranking move with it; you re-point Codemagic signing to the new team and (per [[project-ios-push-ring]]) **re-do the APNs key** for the new team.

---

## TestFlight — get a restaurant running NOW (no App Store needed)

For Fabrizio's new restaurant (Apple device) in a few days:
1. App Store Connect → your app → **TestFlight**.
2. Confirm build **24** shows "Ready to Test".
3. Fastest: **External testing → your public link** (enable it; a one-time ~24h Beta App Review, then anyone with the link installs). OR add the restaurant's Apple ID as an internal/external tester by email.
4. Send the restaurant: install **TestFlight** from the App Store → open your invite link → install **Fee Free Order App** → Kitchen login with THEIR restaurant's credentials.
   (The app is generic — any restaurant logs in with their own kitchen login; nothing per-restaurant to build.)
