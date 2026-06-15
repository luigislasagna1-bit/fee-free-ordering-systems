# Apple App Store — Submission Pack (Fee Free Order App, iOS)

**App:** Fee Free Order App (the kitchen order terminal, iPhone + iPad)
**Bundle ID:** `com.feefreeordering.kitchen`
**Status:** Swift code written (printer engine ported from Android). Needs: one Xcode session (cloud Mac) to add Star's SDK + first build → TestFlight → printer test → App Store review.

> 🟡 **FINALIZE WITH CLAUDE** = needs a quick decision/asset before submitting — these cause rejections, don't guess.

---

## STEP 1 — Apple Developer account ✅ (you have it)
Just confirm it's active: sign in at **https://developer.apple.com/account** → membership should say "Active" (Apple Developer Program, $99/yr). If it asks you to renew or accept new agreements, do that — a lapsed agreement blocks submission.

---

## STEP 2 — Create the app in App Store Connect (no Mac needed — do this anytime)
1. Go to **https://appstoreconnect.apple.com** → **My Apps** → **＋** → **New App**.
2. Platform: **iOS**
3. Name: **Fee Free Order App**
4. Primary language: **English (U.S.)**
5. Bundle ID: select **com.feefreeordering.kitchen** (if it's not in the list, create it first at developer.apple.com → Certificates, IDs & Profiles → Identifiers → ＋ → App ID → `com.feefreeordering.kitchen`).
6. SKU: `feefree-order-app` (any unique string, internal only)
7. User Access: Full Access → Create.

---

## STEP 3 — The cloud-Mac session (the one paid step — ~1–2 hrs, fully guided)
Everything above is free. This is the only part that needs a Mac. **Tell me when you're ready and I'll walk you through it live, screenshot by screenshot.** Outline so you know what's coming:

**3a. Rent the Mac**
- **MacinCloud** (macincloud.com) → **Managed Server** plan (~$30/mo, Xcode pre-installed) → note the server address + login they email you.
- On your PC, install **Microsoft Remote Desktop** (free, Microsoft Store) → add the MacinCloud server → connect. You'll see a Mac desktop.

**3b. Get the code onto the Mac** (Terminal app on the Mac)
- `node -v` — if "command not found", install Node LTS from nodejs.org.
- Make a GitHub access token first: github.com → Settings → Developer settings → Personal access tokens → **Tokens (classic)** → Generate → tick **repo** → copy it.
- `git clone https://github.com/luigislasagna1-bit/fee-free-ordering-systems.git` → username = your GitHub name, password = **paste the token**.
- `cd fee-free-ordering-systems` → `npm install` → `npx cap sync ios`

**3c. Open + wire up Xcode**
- `open ios/App/App.xcworkspace` — ⚠️ the **.xcworkspace**, not .xcodeproj.
- **Add Star's SDK:** File ▸ Add Package Dependencies → paste `https://github.com/star-micronics/StarXpand-SDK-iOS` → Add → tick the **App** target → Add Package.
- **Signing:** click the blue **App** project → **App** target → **Signing & Capabilities** → ✅ Automatically manage signing → Team → Add Account → sign in with your Apple Developer ID → pick your team.

**3d. Build → fix → archive**
- Destination dropdown (top) → **Any iOS Device (arm64)**.
- Product ▸ **Build** (⌘B). My Swift port is faithful but expect a few red errors on Star symbol names — **screenshot them to me and I'll give exact one-line fixes.** Repeat until green.
- Product ▸ **Archive** → Organizer opens → **Distribute App** → **App Store Connect** → **Upload** → through the defaults → Upload.

**3e. TestFlight**
- ~10 min later the build shows in App Store Connect ▸ **TestFlight**. Install the **TestFlight** app on your iPhone 15, accept the build, open it, and **we test-print on your real Star printer.** I refine the Swift until receipts come out clean.

> After it compiles clean once (3d), the committed project change means **Codemagic** (`codemagic.yaml`) can do every future build automatically — so you can cancel the Mac rental.

---

## STEP 4 — Store listing (copy/paste)

**Name (≤30):** `Fee Free Order App`
**Subtitle (≤30):** `Kitchen orders & receipts`
**Keywords (≤100):** `restaurant,kitchen,POS,orders,receipt,printer,thermal,star,delivery,takeout,pickup,KDS`
**Promotional text (≤170):** `Receive, manage, and print your restaurant's online orders straight to your kitchen — commission-free, on the tablet you already own.`

**Description:** (same as the Play listing)
```
Fee Free Order App is the kitchen companion for restaurants using Fee Free Ordering Systems — the commission-free online ordering platform built for independent restaurants.

Turn any iPad or iPhone into a professional kitchen order terminal:

• Receive new orders the moment customers place them, with a clear sound and on-screen alert.
• See every detail at a glance — items, options, customer notes, pickup or delivery, and the time each order is due.
• Accept, prepare, and complete orders with a tap.
• Print receipts directly to your Star WiFi thermal printer — no PC, no cables, no extra hardware.
• Handle pickup, delivery, dine-in, reservations, and scheduled pre-orders all in one place.

Why restaurants choose Fee Free Ordering Systems:
• 0% commission — keep 100% of every order.
• Your own branded online ordering page, menu, and checkout.
• Built-in delivery, pickup, dine-in, reservations, and pre-orders.

This app is for restaurants with a Fee Free Ordering Systems account. Sign up at https://feefreeordering.com and log in with your kitchen credentials.

Questions? support@feefreeordering.com
```
**Support URL:** https://feefreeordering.com · **Privacy Policy URL:** https://feefreeordering.com/privacy
**Category:** Primary **Business**, Secondary **Food & Drink**

---

## STEP 5 — App Privacy (Apple's "nutrition label") 🟡 FINALIZE WITH CLAUDE
In App Store Connect ▸ App Privacy. Draft (mirrors the Play Data Safety):
- **Data used to track you:** **None.**
- **Data linked to you:**
  - **Contact Info → Email address** — purpose **App Functionality** (staff login). Not used for tracking.
- **Data not linked to you:** none required (no analytics SDK in the native shell).
- Order content (customer name/address) is the restaurant's business data viewed through the app, governed by our privacy policy — not collected from the app's user. (We confirm Apple's preferred classification together.)

---

## STEP 6 — App Review information 🟡 FINALIZE WITH CLAUDE (top rejection causes)
- **Sign-in required:** YES → provide a **demo restaurant login** (email + password) in the "App Review Information" box. Set aside one stable demo restaurant with a couple of sample orders.
- **Notes for the reviewer** (draft):
  > This app is the kitchen order terminal for restaurants using our online-ordering platform. It requires a restaurant login (provided above). Its core native function — not available in a browser — is direct WiFi printing of order receipts to Star thermal printers via the StarXpand SDK, which is why the app requests Local Network access. After signing in with the demo credentials you'll see the live order screen.
- This pre-empts **Guideline 4.2** (minimum functionality — answered by the native printing) and **5.1.1** (login access).
- **Local Network permission:** already declared in `Info.plist` with a reviewer-friendly reason. Expect the "Allow Local Network" prompt on first print — that's intended.

---

## STEP 7 — Account deletion ✅ (same as Play)
Privacy policy documents deletion by emailing support@feefreeordering.com (90-day purge). Sufficient since the app is login-only (accounts are created on the website). Optional fast-follow: wire the in-app "Delete Account" button (translations already exist in 38 languages).

---

## STEP 8 — Screenshots 🟡 FINALIZE WITH CLAUDE
Required sizes:
- **iPhone 6.7"** (1290 × 2796) — required
- **iPad 13"** (2048 × 2732) — required (app supports iPad)

Easiest: once the TestFlight build is on your iPhone + iPad, screenshot 3–4 screens (order list, an open order, the print/settings view). Send them and I'll size/clean them for both form factors.

---

## Quick reference
- Star SDK (SPM): `https://github.com/star-micronics/StarXpand-SDK-iOS` → module `StarIO10`, iOS 13+
- iOS printer code: `ios/App/App/StarXpandBridge.swift` + `DirectPrinterPlugin.swift` (ports of the Android GOLDEN pipeline)
- Automated builds: `codemagic.yaml` (after the first manual Xcode build)
- Bundle ID: `com.feefreeordering.kitchen` (shared with Android — intentional)
- Every new submission: bump the build number in Xcode (or `CURRENT_PROJECT_VERSION`) or App Store Connect rejects the upload.
