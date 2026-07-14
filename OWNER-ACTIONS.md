# OWNER ACTIONS — Luigi's tracked to-do list

**How this file works (Claude maintains it):**
- Every time Claude needs something from you, it gets logged here with exact steps — chat messages can scroll away, this file can't.
- When you finish a step, tell Claude ("done #A2") and it gets moved to the DONE LOG with the date and how it was verified.
- ☐ = to do · 🔷 = do it WITH Claude in a live session · ⏳ = waiting on someone else · 🤔 = your decision needed

**Last updated:** 2026-07-14 by Claude (A15 added — native Fee Free Delivery driver apps are built: Android APK ready to sideload now, iOS ready for a Codemagic → TestFlight build).

---

## A. DO NOW — this week, in priority order

### A17. 🔷 Enrol the Apple Developer ORG account for Fee Free Ordering Inc. (D-U-N-S landed 2026-07-14)
Your D-U-N-S number for **Fee Free Ordering Inc.** is in hand — this was the blocker for the company Apple account. Now:
1. Go to **developer.apple.com/enroll** → choose **Company/Organization** → enter the D-U-N-S + legal entity details (use a *company* Apple Account/email if you have one, not a personal one). Pay the $99/yr. Apple verifies the org — usually **1–5 business days** (they may phone to confirm).
2. **Keep testing on the current team meanwhile** — nothing is blocked. The Kitchen app stays on TestFlight; create the **driver** app under the current team per A15 (Option A: ship now, transfer later).
3. **Once the org membership is active:** transfer BOTH apps (`com.feefreeordering.kitchen` + `com.feefreeordering.driver`) to the org (bundle ids survive; TestFlight builds/testers do NOT — you re-invite testers), then repoint Codemagic's `ff-asc-key` + the `IOS_SIGNING_KEY_PEM` signing key to the new team. Tell Claude when the org is live and it'll walk you through the transfer + Codemagic repoint.
4. **Bonus:** a Google **Play** org account under Fee Free Ordering Inc. is exempt from the 20-tester production gate your personal account hit — worth doing the same company route there (see A on the Android side).

### A16. ☐ TEST this session's shipped work (2026-07-14) — NOT DONE YET (Luigi will do when ready)
Everything below is built + pushed + preflight-green, but NOT yet verified by you on real devices / real data:
1. **Uber Eats import** — Admin → Menu → Import → paste your Koozina Uber link → confirm categories/items/modifiers/photos land. (Best from your own IP; a datacenter IP can get Uber's bot-challenge on the modifier fetch.)
2. **Driver app on your phone** — sideload `C:\Users\luigi\Downloads\FeeFreeDelivery-driver-debug.apk` (Android), and/or do A15 (iOS → TestFlight). Take it on a short drive to confirm background GPS.
3. **Fee Free Delivery end-to-end** (see A13) — create a driver, enable it on a store, run a test delivery accept→picked up→delivered.
4. **A14** (marketplace retirement on prod) + **A15** (driver app store steps) are the related owner steps.
Tell Claude the results of each and it'll fix anything that surfaces.

### A14. 🔷 Run the marketplace retirement migration on PROD (marketplace is now free)
**Why:** the marketplace is now free + included for every restaurant (customer site shows only restaurants within 15 km, with Pickup/Delivery badges; no per-order or monthly fee). The per-order fee is already $0 in code, but any restaurant still on the OLD paid marketplace add-on ($199.99/mo or PAYG) is still attached to a Stripe subscription until this runs. The migration cancels those subs, **keeps their Driver Pool** (grants a free standalone Driver Pool so ShipDay/FeeFree dispatch never drops), and retires the add-on from sale so nobody signs up for a now-free thing. It is **dry-run by default** (shows the plan, changes nothing) — I already verified it on the dev branch.
1. First see the plan (safe, read-only): `npx tsx scripts/run-on-prod.ts scripts/retire-marketplace-addon.ts` — it lists which subscriptions would be cancelled + who keeps Driver Pool.
2. Review the list. When you're happy, apply it: `npx tsx scripts/run-on-prod.ts scripts/retire-marketplace-addon.ts --apply` (this cancels the live Stripe subscriptions and retires the add-on).
3. Tell Claude "done A14" → Claude confirms 0 active marketplace subs on prod and Driver Pool intact for each affected restaurant.
*(NOTE: the customer marketplace is already live + free. The ADMIN/pricing pages that described it as a paid add-on were ALSO fixed 2026-07-14 — the marketplace admin page now shows "Included — free". Done.)*

### A15. 🔷 Install the Fee Free Delivery DRIVER app on your phone (native builds are ready)
**Why:** you asked for native Android + iOS apps of the `/driver` app so you can take it on real deliveries — including BACKGROUND GPS (location keeps streaming with the phone locked / in your pocket), which a browser/PWA can't do. Both are built as WebView shells of `feefreeordering.com/driver`, bundle id `com.feefreeordering.driver`, name "Fee Free Delivery". Android is ready to sideload right now; iOS needs a few Apple steps (no Mac required — Codemagic builds it in the cloud like the Kitchen app).

**Android (fastest — do this to test today):**
1. The debug APK is on this PC at `C:\Users\luigi\Downloads\FeeFreeDelivery-driver-debug.apk`. Copy it to an Android phone (email it to yourself, Google Drive, or USB).
2. On the phone, tap the APK. Android will ask to allow "install unknown apps" for whatever app you opened it from → allow → Install.
3. Open "Fee Free Delivery", sign in with a driver login, and it'll ask for location permission — choose **Allow all the time** so background tracking works.

**iOS / TestFlight (needs your Apple account — reuses the SAME setup as the Kitchen app):**
1. In the **Apple Developer portal** → Certificates, IDs & Profiles → **Identifiers** → register a new App ID with bundle id **`com.feefreeordering.driver`** (team `NT5ZY28ATK`, "Luigi's Lasagna & Pizzeria Inc.").
2. In **App Store Connect** → Apps → **+ New App** → pick that bundle id, name "Fee Free Delivery", primary language English. (No screenshots/metadata needed just for TestFlight.)
3. In **Codemagic**, open this repo → run the new **"Fee Free Delivery (iOS)"** workflow (`ios-driver`). It builds on the cloud Mac, signs with your existing `ff-asc-key` + stored cert, and uploads to TestFlight automatically. Use **"Start new build"**, not "Rebuild".
4. When it finishes (~15 min), the build appears in App Store Connect → TestFlight. Add yourself as an internal tester, accept the invite in the **TestFlight** app on your iPhone, install, and choose **Allow location "Always"** on first run.

Tell Claude how the on-device test goes (does it load, sign in, stream GPS on a real short drive) and I'll fix anything that comes up. NOTE: the app icon is currently the default Capacitor icon — cosmetic, easy to swap later; not worth blocking testing on.

### A13. 🔷 Turn on FeeFreeDelivery for a store (the Phase 1 MVP just shipped)
**Why:** the whole in-house delivery product is live in software — the enable path, the `/driver` PWA (live GPS), weekly $7.99 billing, customer live-tracking, and admin/superadmin management. Before a real delivery can flow, three things need YOU (all ops/legal — insurance, payroll, unit-economics — remain your separate call).
1. **Create a driver** — go to `feefreeordering.com/superadmin` → **Delivery Drivers** → **New driver** (name, email, an 8+ char temporary password, optional home store + hourly rate). The driver is now **auto-emailed their login** (app link + email + temp password) on save, and texted too if you gave a phone. They sign in at `feefreeordering.com/driver` (installable to the home screen). *(For the SMS to send you must set `FFOS_TWILIO_ACCOUNT_SID`, `FFOS_TWILIO_AUTH_TOKEN`, `FFOS_TWILIO_FROM_NUMBER` in Vercel — email works already via Resend. Until then the temp password you set is still shown to you to relay by hand.)*
2. **Enable it on the store** — `feefreeordering.com/admin` → **Driver Pool** → pick **Fee Free Delivery** as the delivery method → toggle **Enable**. Requires the **Driver Pool** add-on + an online payment method (drivers never collect at the door, so delivery must be prepaid). "Auto-send on accept" is on by default; turn it off to hold orders for a manual "Send to driver". *(Fee Free Delivery only appears for stores within 100 km of the Toronto/Milton area — others see only "your own drivers" and ShipDay.)*
3. **Card on file for billing** — the weekly settlement (every Monday 00:10 UTC) invoices the distance-tiered fee ($7.99 ≤3.5 km / $8.99 3.5–7 km / $9.99 7–10 km) per delivered order to the store's card on file. Make sure the store has completed billing setup, or the settlement will show "no card on file" and skip.
*(The **same `/driver` app** is now dual-role: drivers get the job queue; restaurant owners open the same link and sign in with their existing dashboard login to assign & track deliveries. Verified end-to-end on the demo: accept→picked up→delivered flips the order to completed, freezes the fee, streams live GPS, shows the customer a live map. Test scripts: `_create-demo-driver`, `_enable-feefree-demo`, `_seed-feefree-test`.)*

### A1. ✅ DONE 2026-07-11 (Luigi clicked Subscribe; Claude's prod verification pending — say "verify A1 on prod") — Re-subscribe "Online Payments" with your real card — was due THURSDAY JULY 17
**Why:** your free partner period ends July 17. When it does, card checkout on luigispizzapastawings.com STOPS until this is done.
**⚠️ 2026-07-11 update:** you tried this and the page showed "Renews automatically" with NO Subscribe button — that was a bug (the free-period card looked subscribed and the system even refused an early subscribe). Claude built the fix: the card now says **"Free until July 17, 2026"** with a **"Subscribe to keep it"** button, and subscribing early does NOT double-charge — your card is saved now and the first charge lands only when the free period ends. **✅ DEPLOYED 2026-07-11 (056747a1, adversarially reviewed, site verified healthy) — ready for your click:**
1. Go to `feefreeordering.com/admin` → **Billing** → **Add-ons**.
2. On the **Online Payments ($39.99/mo)** card, click **"Subscribe to keep it"**.
3. Complete the Stripe checkout with your real business card ($0.00 due today — billing starts July 17).
4. Tell Claude "done A1" → Claude verifies the subscription is attached on the platform Stripe account.
*(Note: this covers ONLY Online Payments. Your other complimentary add-ons each show the same button now — subscribe to each one you want to keep past its free date.)*

### A2. ✅ DONE 2026-07-11 (screenshot: "Connection successful — your Stripe keys work", Live mode; DB webhook-row verification pending — covered by "verify A1 and A2 on prod") — One click to activate refund-sync: "Test connection"
**Why:** this registers the new webhook on your Stripe account so refunds made in the Stripe dashboard update orders + Luigi Bucks automatically.
1. `feefreeordering.com/admin` → **Payments** → **Payment providers**.
2. In the Stripe card, click **Test connection**. Expect the green success message.
3. Tell Claude "done A2" → Claude verifies the webhook registered in the database.

### A4. ✅ DONE 2026-07-11 (Luigi renewed the membership) — Turn on Apple membership auto-renew — was expiring ~August 3
**Why:** if the Luigi's Lasagna Apple Developer membership lapses mid-launch, the iOS app can't be submitted and TestFlight stops.
1. Go to `developer.apple.com/account` and sign in.
2. Open **Membership details**.
3. Enable **Automatic renewal** (or click Renew now, $99 USD/yr).
4. While you're there: note the **D-U-N-S Number** shown — paste it to Claude (useful reference).
5. Tell Claude "done A4".

### A5. ✅ DONE 2026-07-12 — ShipDay webhook configured + verified (wizard flow)
**Why:** the delivery-status webhook rejects unauthenticated callers (security hardening). ~~Vercel env var + manual URL~~ **Replaced:** every restaurant now gets its own personal webhook link, shown right on the Driver Pool page — no Vercel steps, no password manager.
**After the ShipDay wizard deploys (Claude will tell you when):**
1. `feefreeordering.com/admin` → **Driver Pool** → the **"Live driver status (webhook)"** card.
2. Click **Copy link**, then in your ShipDay dashboard open **Integrations → Webhook** and paste it as the endpoint URL.
3. The card flips to **"Webhook verified"** on the first update ShipDay sends.
4. Tell Claude "done A5".
*(This doubles as the live test of the new wizard with your ShipDay account — Claude will walk you through placing one test delivery.)*

### A6. ☐ Change the superadmin password (it appeared in a chat screenshot)
1. Log out of `feefreeordering.com/admin`.
2. On the login page click **Forgot password** → enter `admin@feefreeordering.com`.
3. Open the reset email → set a NEW password (from your password manager, never reused).
4. Tell Claude "done A6".

### A7. 🔷 Rotate the database password — do WITH Claude live
**Why:** the Neon database password was visible in an old debugging screenshot. Rotating it is important but touchy — done wrong, the live site loses its database. Claude will drive; you'll click.
1. Just tell Claude "let's do A7" in a session when the restaurant is CLOSED.
2. (For reference, the flow will be: Neon console → reset role password → update Vercel `DATABASE_URL` → redeploy → verify site loads.)

### A8. ☐ Create the free Upstash account (rate-limit protection)
**Why:** login/order rate limits currently reset whenever the server restarts. A free Redis database makes them stick.
1. Go to `console.upstash.com` → sign up (free).
2. **Create Database** → name `feefree-prod` → region: pick a US-East option → Create.
3. On the database page, find **REST API** section: copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
4. Vercel → Settings → Environment Variables → add BOTH (Production) → Redeploy (same as A5 step 4).
5. Tell Claude "done A8".

### A9. ☐ Verify the Gift Cards "no discounts" flag (you said you'd check)
1. `feefreeordering.com/admin` → **Menu** → open the **Gift Cards** category settings.
2. Confirm the "exclude from discounts / promotions" option is ON.
3. Tell Claude "A9 yes it's on" or "A9 it was off, I turned it on".

### A11. 🔷 Confirm Neon backup retention — 5 min (part of Stage 2, mostly DONE)
**Status:** Claude already made + VERIFIED a real backup of all prod data tonight (58,282 rows, all money-tables complete), built repeatable backup/verify/restore tools, and built an automated daily encrypted off-site backup (deploys with Stage 2). Remaining from you:
1. Log in to **console.neon.tech** → your project → **Settings / Branches** → find the **point-in-time-recovery / history retention** setting. Tell Claude the number of days shown (free tier ≈ 1 day; paid ≈ 7–30). If it's 1 day, consider the paid tier — it's your instant "undo" for a bad change.
2. (Optional, with Claude) a full restore drill into a scratch Neon branch — say "let's do the restore drill" and Claude walks you through creating a throwaway branch to restore into.

### A10. ☐ Delete the two "Test July" restaurants
1. `feefreeordering.com/superadmin` → **Restaurants**.
2. Find the two named like "Test July" → use the **Delete** button on each (leave *Kaori* and *Japanese Restaurant | TEST* alone).
3. Tell Claude "done A10".

### A12. ☐ Order-placed email — 1-minute check (your report from 2026-07-11)
**Why:** you reported the restaurant didn't get an immediate email when a customer placed an order. Claude verified the CODE is correct — the staff "Order placed" email fires the moment the order lands (before you accept it), separately from the customer's confirmation. So the likely cause is the recipient setup on your restaurant.
1. `feefreeordering.com/admin` → **Notifications**.
2. Check your email address is listed as a recipient, the row is ACTIVE, and the **"Order placed"** toggle is ON. Add/fix it if not.
3. If it already looks right, tell Claude **"A12 looks right — run the prod check"** — that authorizes a read-only look at the recipient rows + exact send timestamps for the recent orders to find what really happened.

### A13. 🔷 iOS APP — the plan is set (Luigi 2026-07-13: "ship now, transfer later"). Full details: `IOS_APP_STORE_SUBMISSION.md`.
**Context:** the app WORKS on TestFlight (build 24 — ring on locked phone device-verified). It's a WebView of /kitchen, so all web fixes are already in it. No iOS code is broken. Two tracks:

**A13a. ☐ TestFlight for Fabrizio's new restaurant — do THIS to get them running in days (NO App Store needed).**
1. App Store Connect → your app → **TestFlight** → confirm build 24 is "Ready to Test".
2. **External testing → enable the public link** (one-time ~24h Beta App Review) — OR add the restaurant's Apple ID as a tester by email.
3. Send the restaurant: install **TestFlight** → open the link → install **Fee Free Order App** → Kitchen login with THEIR credentials. Done. (Any restaurant uses the same app.)

**A13b. ✅ DONE 2026-07-13 — the "100% working" device test PASSED.** Verified on Luigi's iPad: rings + notifies with phone LOCKED + app backgrounded ✓; PRINTS correctly on the Star printer ✓; ghost ring FIXED (was stale WebView-cached code; a clean reinstall + the auto-accept hardening commit 767ae631 cleared it) ✓. The app is 100% working. (Auto-accept is OFF on Luigi's store by choice for the first 1–2 months — orders arrive PENDING and ring the full alarm until accepted.)

**A13c. ☐ Submit to the App Store (Option A — under "Luigi's Lasagna & Pizzeria Inc." now, transfer to Fee Free Ordering Inc. later).**
Everything is pre-written in `IOS_APP_STORE_SUBMISSION.md` (listing copy, privacy answers, reviewer notes tuned to avoid a rejection, submit steps). Owner steps: (1) run the demo-restaurant script with a password → put it in the App Review field; (2) paste the copy into App Store Connect; (3) attach build 24; (4) Submit. Say **"make the App Store screenshots"** and Claude generates the required iPhone + iPad images from the demo restaurant.

---

## B. YOUR DECISIONS — tell Claude the answer, no clicking needed

### B1. 🤔 Test reward wallets cleanup
Sameem's account holds $13.46 from before the fix; a typo-email guest wallet holds $5.80; your own test account holds $8.21. All test accounts. Say **"B1 yes, clean them"** and Claude zeroes them (or deduct them yourself in Admin → Customers).

### B2. 🤔 Multi-Location add-on ($49.99/mo)
It's purchasable today but has a navigation gap (child→parent switching) and weak gating. Options: **(a)** mark it "Coming soon" until fixed (safe), or **(b)** Claude fixes the gaps first. Say "B2 a" or "B2 b".

### B3. ✅ APPROVED + BUILT (2026-07-10) — awaiting your deploy decision
**Stage 1 built on branch `fix/stage1-money-correctness` (NOT deployed — your call to merge):**
- **C-1 auto-accept capture** ✅ fixed + 7 tests (commit f6879f7b)
- **H-2 order-create atomicity** ✅ fixed + 3 tests + hot-path refinement (733002c1, 9980d358)
- **H-1 disputes** ⏸️ HELD — needs a new DB table (a prod schema change); bundled into Stage 2 with the backup drill per your audit rules.
Adversarially reviewed (both fixes correct; one perf note fixed). Preflight green (600 tests).
**→ Two things I need from you:** (1) **"deploy stage 1"** to push+merge (triggers Vercel deploy) or leave it parked; (2) **"let's do stage 2"** to start the backup drill + H-1 disputes together.

<details><summary>original B3 detail</summary>

### B3-orig. 🤔 APPROVE remediation Stage 1 — Money correctness (recommended)
**Three money-path fixes, bundled (engineering, ~½ day, no risk to current live operation):**
- **C-1 (Critical, latent):** auto-accept + card orders never captured — food delivered, money never collected. Zero exposure today (your store's auto-accept is OFF); triggers if anyone enables auto-accept + online card. Fix mirrors an existing PayPal fix.
- **H-1 (High):** chargebacks/disputes are invisible — if a customer disputes a card charge, Stripe pulls the money + ~$15 fee from your balance and the system still shows "paid" forever. Fix adds dispute events to the webhook shipped tonight.
- **H-2 (High):** a crash mid-order could debit Luigi Bucks without recording it — make the order-create + wallet steps one atomic transaction.
Say **"B3 fix it"** → becomes approved Stage 1 (branch, tests, review, no deploy of keys). NOT applied until you say so.
</details>

### B3b. ✅ STAGE 2 DEPLOYED (2026-07-10, commit 407d987c) — money-path hardening + backups + disputes LIVE
Stage 1 + Stage 2 both deployed to production. OrderDispute table pushed to prod first (safe order). Adversarially reviewed twice; all findings fixed. 607 tests green.
**What's now live:** auto-accept capture fix, order-atomicity, dashboard-refund sync, chargeback recording + owner-alert email, a real verified DB backup + automated nightly encrypted off-site backup, and the full backup/verify/restore toolkit.
**Still needs YOU (see the prioritized list at the top / A-items):** the Test-connection click (A2) to register the refund + dispute webhooks; confirm Neon backup retention (A11); the backup cron's env vars in Vercel.
<details><summary>original B3b build note</summary>

### B3b-orig. ✅ STAGE 2 BUILT (2026-07-10) — on branch `fix/stage2-backups-disputes`
- **C-2 backups** ✅ real verified prod backup made + backup/verify/restore tools + automated daily encrypted off-site cron (ea09541e, 483656e8)
- **H-1 disputes** ✅ OrderDispute table + webhook dispute events + owner-alert email + tests (443a0a01). Table pushed to DEV only.
Preflight green (603 tests). **⚠️ DEPLOY SEQUENCING for Stage 2 (must be in this order — H-1 adds a new table):**
1. Claude pushes the `OrderDispute` table to the **PROD** database (safe/additive; a fresh backup exists) — **needs your OK: say "push the stage 2 schema"**.
2. Claude merges the branch to main (deploys). Say **"deploy stage 2"** (implies step 1).
3. Confirm the backup cron's env vars exist in Vercel prod: `CRON_SECRET`, `ENCRYPTION_KEY`, `BLOB_READ_WRITE_TOKEN` (all believed set — Claude verifies post-deploy).
4. On Admin → Payments, click **Test connection** so your dispute webhook registers (same click as A2).
</details>

### B4. 🤔 APPROVE later remediation stages (review the audit first, no rush)
The full audit is in `docs/launch-readiness/` — read **00-executive-summary.md** first (the verdict + plan). Beyond Stage 1, the staged fixes are: **Stage 2** backups + restore drill (the other Critical — needs you to confirm the Neon plan), **Stage 3** access hardening (staff can currently edit prices — matters once real restaurants add employees), **Stage 4** dependency security patches (needs your OK per your no-auto-upgrade rule), **Stage 5** monitoring + incident response, **Stage 6** test coverage, **Stage 7** privacy (needs a lawyer FIRST). Tell Claude which stage to run next, one at a time. No stage touches live keys or the current happy path.

---

## C. WAITING — no action until something arrives

### C1. ⏳ D-U-N-S number for Fee Free Ordering Inc. (requested 2026-07-10, expect ~5–8 business days)
**When the email with the number arrives:**
1. Tell Claude the number arrived (never need to share it in chat if you prefer — just say it's in).
2. Then: `play.google.com/console` → **Developer account → About you → Change account type → Organization** → enter *Fee Free Ordering Inc.* + the D-U-N-S → submit (verification takes a few days).
3. After Google verifies: the 12-tester requirement disappears → Claude preps the signed Android build → you upload → production release.

### C2. ⏳ Fabrizio's re-tests (promo stacking + category features reports)
When he confirms, tell Claude → reports get marked FIXED + he gets replies.

### C3. ⏳ iOS TestFlight session (needs you + the iPad, ~15 min)
When you have the iPad handy, tell Claude "let's do C3": print a real test order on the Star printer + confirm the ring fires with the screen locked. That's the last gate before App Store submission.

---

## D. DONE LOG (append-only — proof we did it)

| Date | Item | Verified how |
|---|---|---|
| 2026-07-09 | Platform Stripe switched to LIVE (Fee Free Ordering Inc.) | DB audit: live pk, secrets saved, 18 add-ons re-synced |
| 2026-07-09 | New platform webhook registered (33 events) + secret saved | DB audit: saved 01:26Z |
| 2026-07-10 | Restaurant Stripe LIVE (Luigi's Lasagna) | DB audit: mode=live, test status ok 01:38Z |
| 2026-07-10 | 🎉 First real card charge — order #ORD-649136293, $2.29 | DB audit: paymentStatus=paid, live intent |
| 2026-07-10 | Accepted Methods set to online-card-only | Luigi confirmed INTENTIONAL |
| 2026-07-10 | $2.29 refund intentionally skipped | Luigi: "money comes back to me" |
| 2026-07-10 | One of two $5 sign-up incentives turned OFF | Luigi confirmed in chat |
| 2026-07-10 | D-U-N-S requested for Fee Free Ordering Inc. (developer queue) | Luigi confirmed registration done |
| 2026-07-10 | Free partner periods set (yours Jul 17, Fabrizio Aug 24, Milton Aug 2) | Conversion script ran; prod DB verified |
| 2026-07-10 | Money-path hardening shipped (commit 91d11c07) | 590 tests, adversarial review, pushed |
| 2026-07-10 | A3 — Android signing key backed up to multiple sources (Google Drive + USB) + passwords saved | Luigi confirmed in chat; original at android/app/feefree-release.jks intact |
| 2026-07-11 | A1 — Online Payments re-subscribed before the Jul 17 free-period end | Luigi confirmed in chat; DB verification pending ("verify A1 on prod") |
| 2026-07-11 | A2 — Stripe Test connection clicked (registers refund-sync + dispute webhooks) | Screenshot: green "Connection successful", Live mode, pk_live key |
| 2026-07-11 | A4 — Apple Developer membership renewal submitted (was expiring ~Aug 3) | Luigi confirmed in chat; Apple shows "being processed" — normal, confirm the new expiry date shows within a day |
| 2026-07-12 | A5 — ShipDay webhook link pasted in his dashboard + token verified | DB: webhookVerifiedAt 10:20Z; auto-dispatch verified live same day (order 50239818); status back-flow deploys tested, witnessed on next real delivery |

---

*Claude also keeps a full audit under `docs/launch-readiness/` — findings there reference these action items where an owner step closes a finding.*
