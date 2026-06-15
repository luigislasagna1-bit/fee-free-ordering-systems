# Google Play Store — Submission Pack

**App:** Fee Free Order App (the kitchen order terminal)
**Package:** `com.feefreeordering.kitchen`
**Build:** `android/app/build/outputs/bundle/release/app-release.aab` — signed, 12.9 MB, versionCode `1`, versionName `1.0`
**Status:** ✅ AAB built & signed. Waiting on: Play Console account → fill forms → upload.

> Items marked **🟡 FINALIZE WITH CLAUDE** need a quick decision or asset before we submit — don't guess on them, they're the ones that cause rejections.

---

## STEP 0 — Create the Play Console account ⏰ DO THIS FIRST (1–3 day wait)

Nothing below can happen until this clears, so start it today and it verifies in the background.

1. Go to **https://play.google.com/console** and sign in with a Google account.
   - **Recommendation:** use a business Google account (e.g. a `@feefreeordering.com` address) rather than your personal Gmail — this becomes your permanent developer identity.
2. Pay the **$25 one-time** registration fee (card).
3. Choose account type:
   - **Individual** — faster, verified with your personal government ID. Totally fine to launch with.
   - **Organization** — looks more official (shows your company name as developer), but needs a **D-U-N-S number** (free, ~1–2 days to obtain). 
   - 👉 Start as **Individual** if you want to move fastest; you can convert later.
4. Complete **identity verification** (upload a government ID). Google takes **1–3 days** (sometimes longer). This is the long pole — once it's green, we can publish same-day.

---

## STEP 1 — Create the app

Play Console → **Create app**:
- App name: **Fee Free Order App**
- Default language: **English (United States)**
- App or game: **App**
- Free or paid: **Free**
- Tick the Declarations (Developer Program Policies + US export laws).

---

## STEP 2 — Store listing (copy/paste)

**App name** (≤30 chars):
```
Fee Free Order App
```

**Short description** (≤80 chars):
```
Receive, manage & print your restaurant's orders. Commission-free ordering.
```

**Full description** (≤4000 chars):
```
Fee Free Order App is the kitchen companion for restaurants using Fee Free Ordering Systems — the commission-free online ordering platform built for independent restaurants.

Turn any Android tablet into a professional kitchen order terminal:

• Receive new orders the moment customers place them, with a clear sound and on-screen alert.
• See every detail at a glance — items, options, customer notes, pickup or delivery, and the time each order is due.
• Accept, prepare, and complete orders with a tap.
• Print receipts directly to your Star WiFi thermal printer — no PC, no cables, no extra hardware.
• Handle pickup, delivery, dine-in, reservations, and scheduled pre-orders all in one place.
• Runs on the tablet you already own.

Why restaurants choose Fee Free Ordering Systems:
• 0% commission — keep 100% of every order. No per-order fees eating your margin.
• Your own branded online ordering page, menu, and checkout.
• Built-in delivery, pickup, dine-in, reservations, and pre-orders.
• Fast, reliable, and made for the pace of a real kitchen.

This app is for restaurants with a Fee Free Ordering Systems account. To get started, sign up at https://feefreeordering.com and log in with your kitchen credentials.

Questions? We're here to help: support@feefreeordering.com
```

**Category:** Business (or Food & Drink — Business is the safer fit)
**Contact email:** support@feefreeordering.com
**Website:** https://feefreeordering.com

---

## STEP 3 — Graphics 🟡 FINALIZE WITH CLAUDE

| Asset | Spec | Status |
|---|---|---|
| App icon | 512×512 PNG | I'll export this from your launcher icon |
| Feature graphic | 1024×500 PNG/JPG | I can design a branded banner |
| Phone screenshots | 2–8, PNG/JPG | Capture from your tablet, or I produce them |
| Tablet screenshots (7" & 10") | recommended | Capture from your tablet |

Easiest screenshots: open the app on your tablet and screenshot 3–4 screens (order list, an open order, the print/settings view). Send them and I'll size/clean them up.

---

## STEP 4 — App content forms (these cause most rejections — get them right)

### Privacy policy
- URL: **https://feefreeordering.com/privacy** ✅ (already live)

### App access 🟡 FINALIZE WITH CLAUDE — **#1 rejection cause**
The reviewer opens the app and hits your kitchen **login screen**. If they can't get in, they reject. So:
- In **App access**, choose "All or some functionality is restricted" and provide a **working demo restaurant login** (email + password) plus step-by-step instructions to reach the order screen.
- 👉 Action: set aside one stable demo restaurant we won't delete, with a couple of sample orders. We'll write the reviewer steps together.

### Data safety 🟡 FINALIZE WITH CLAUDE — must be accurate
Draft answers (we confirm before submitting):
- Collects or shares user data? **Yes** (kitchen staff log in; the app sends login + order actions to our secure server).
- Encrypted in transit? **Yes** (HTTPS/TLS).
- Way to request data deletion? **Yes** → see Step 5.
- Data types collected:
  - **Email address** — for staff login / account management. Not shared. Required.
  - **App activity (in-app actions)** — for app functionality. Not shared.
- Data shared with third parties? **No.**
- Note: order content shown to staff (customer name/address/phone) is the restaurant's own business data, viewed through the app and governed by our privacy policy — we don't collect it from the device user. (We'll confirm Google's preferred classification together.)

### Content rating
- Run the questionnaire. It's a business/productivity tool — no violence, sex, gambling, etc. → expected rating **Everyone / PEGI 3**.

### Target audience & content
- Target age: **18+** (business tool for restaurant staff). **Not** directed at children → avoids the Families policy requirements.

### Ads
- Contains ads? **No.**

### Financial features
- No in-app payments. Customer payment happens on the website, **not** in this app → declare **no** financial features / no in-app purchases. (This also means no Google Play billing cut.)

### Why it's not "just a website" (in case review asks)
This is **not** a bare web wrapper: it adds native **direct WiFi thermal-printer** support (Star StarXpand SDK) and native order **notifications/alerts** — real device functionality beyond a browser. (Google is lenient here, but good to have the answer ready.)

---

## STEP 5 — Account deletion 🟡 FINALIZE WITH CLAUDE (required by Google & Apple)
Both stores require users be able to delete their account + data. Options:
- A "Delete my account" action in the admin site, **or**
- A documented request path (e.g. email support@feefreeordering.com) with a stated response time, linked from the privacy policy.
- 👉 We'll confirm which we have / need to add before submitting.

---

## STEP 6 — Upload & release
1. **Testing → Internal testing** first: create a release, upload `app-release.aab`, add your own email as a tester. Installs instantly via a Play link, **no review wait** — confirm it runs on your tablet.
2. Then **Production**: promote the release. Google review takes **a few hours to a few days** for a first submission.

**Remember for every future update:** bump `versionCode` (2, 3, 4…) in `android/app/build.gradle` before rebuilding, or Play rejects the upload.

---

## Quick reference — where things live
- Signing config: `android/app/build.gradle` (loads `android/keystore.properties`)
- Keystore + passwords: `android/app/feefree-release.jks` + `android/keystore.properties` — **gitignored, never committed. Back these up somewhere safe (password manager + a copy off your PC). If you lose them, you can never update this app under the same listing.**
- Rebuild the AAB: `gradlew bundleRelease` (with `JAVA_HOME` set to the Android Studio JBR)
