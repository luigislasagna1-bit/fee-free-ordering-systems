# Tonight's Session — Test + Finish (2026-07-14)

Everything from the last few days, organized. **Nothing here is assumed done.** Tell Claude the result of each (or "done X") and it gets checked off + moved to OWNER-ACTIONS DONE LOG. Full detail for any item lives in `OWNER-ACTIONS.md`.

Legend: ☐ = to do · 🔷 = do it live with Claude · 🧪 = test/verify · 🤔 = your decision

---

## 1. 🧪 TEST what shipped this week (built + pushed + preflight-green, NOT yet verified by you)

| # | Feature | How to test (5 min each) |
|---|---|---|
| T1 | **Uber Eats menu import** | Admin → Menu → **"Import from GloriaFood"** button → paste your Koozina Uber link → Preview → Import into a fresh menu. Confirm categories/items/prices/photos. *(Modifiers may say "Uber blocking, retry" from a datacenter — retry once.)* |
| T2 | **Login fixes** | Confirm you can log into `/admin`, `/kitchen`, and the delivery app (Restaurant-owner button on `/driver`). A throttled login now says "Too many attempts — wait a few minutes" (not "invalid password"). |
| T3 | **Fee Free Delivery — manual dispatch** | Admin → Driver Pool → Fee Free Delivery → turn **Auto-send OFF**. Place a **paid** test delivery → Accept → it HOLDS → Admin → Delivery → **Send to driver**. |
| T4 | **Driver app (Android)** | Sideload `C:\Users\luigi\Downloads\FeeFreeDelivery-driver-debug.apk` → sign in as a driver → **Allow location "all the time"** → take a short drive, confirm background GPS + accept→picked up→delivered. |
| T5 | **Unclaimed-order alert** | After T3, leave the order unaccepted 3 min → Sameem should get an SMS *(only once A18 env is set — see below)*. |
| T6 | **Marketplace = free** | Admin → Marketplace shows "Included — free" (no price/lock). Public `feefreefood` shows only restaurants within 15 km. |
| T7 | **iOS Kitchen ring (Fabrizio's report)** | On iPhone/iPad: open Kitchen → check the **3-dot menu shows `web <build>`** (proves fresh code). Re-test: login-ring, screen-off ring, backgrounded ring, overlap. *(Report the `web` build value per device.)* |

---

## 2. 🔷 NEEDS YOU — accounts & config (unblocks the above)

| # | Action | Why |
|---|---|---|
| A17 | **Enrol Apple ORG account** (developer.apple.com/enroll, Company, use the D-U-N-S) | Puts everything under Fee Free Ordering Inc. Start now — Apple takes 1–5 days. Testing continues on the current team meanwhile. |
| A15 | **iOS driver app → TestFlight** | Register App ID `com.feefreeordering.driver` → App Store Connect new app → run Codemagic **"Fee Free Delivery (iOS)"** → accept TestFlight invite. |
| A13 | **Create a driver + enable Fee Free** | Superadmin → Delivery Drivers → New driver; then Admin → Driver Pool → enable Fee Free. Needed for T3–T5. |
| A18 | **Set alert phone env** | Vercel: `FEEFREE_DISPATCH_ALERT_PHONE=+16476690808` + `FFOS_TWILIO_*` keys → turns on the T5 unclaimed-order SMS + driver-invite SMS. |
| A8 | **Create free Upstash** | Makes login rate-limits (T2) persist across restarts. `console.upstash.com` → 2 env vars in Vercel. |
| A14 | **Marketplace retirement on prod** | `npx tsx scripts/run-on-prod.ts scripts/retire-marketplace-addon.ts` (dry run first, then `--apply`). Cancels any old paid marketplace subs. |
| A6 | **Change superadmin password** | It appeared in a screenshot. Forgot-password on `admin@feefreeordering.com`. |
| A7 | **Rotate DB password** 🔷 | Do live with Claude when the store is closed (touchy). |
| — | **Google Play ORG account** | Same D-U-N-S → Play org → removes the 20-tester production gate. |

---

## 3. 🧪 QUICK CHECKS (1–2 min each)

- **A9** — Menu → Gift Cards category → confirm "exclude from discounts" is ON.
- **A10** — Superadmin → Restaurants → delete the two "Test July" restaurants (leave Kaori + the Japanese TEST one).
- **A12** — Admin → Notifications → confirm your email is a recipient, row ACTIVE, "Order placed" ON (you reported missing order emails).
- **A11** — Neon console → note the point-in-time-recovery retention (days).
- **A1 / A2** — say "verify A1 and A2 on prod" so Claude confirms the Online-Payments subscription + Stripe webhooks registered in the DB.

---

## 4. 🤔 DECISIONS (just tell Claude the answer)

- **B1** — clean the 3 test reward wallets (Sameem $13.46, guest $5.80, yours $8.21)? "B1 yes".
- **B2** — Multi-Location add-on: (a) mark "Coming soon" or (b) Claude fixes the gaps?
- **B3** — deploy the parked money-correctness Stage 1 branch, or leave it?
- **Escalating call** — want a phone CALL (not just SMS) if an order is still unclaimed after ~5 min?

---

## 5. 🔨 ON CLAUDE — I'll build these next (no action from you)

- **Directed dispatch** (#33/#34) — driver online/offline toggle + auto-pick-best-driver with accept/decline/re-offer. Ranking engine already built; needs schema + a driver-app rebuild.
- **iOS ring fixes** (#29–31) — overlap + wake-gap + background-no-ring. Waiting on your T7 device results (need to know which survive fresh code) before touching the verified ring.
- **Import button rename** ("Import from GloriaFood" → "Import your menu").
- **App icons** for the driver app (currently default).

---

*Work through §1 (test) + §2 (setup) tonight — those unblock the most. Report results and Claude fixes anything that surfaces + advances §5.*
