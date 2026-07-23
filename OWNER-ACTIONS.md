# OWNER ACTIONS — Luigi's tracked to-do list

**How this file works (Claude maintains it):**
- Every time Claude needs something from you, it gets logged here with exact steps — chat messages can scroll away, this file can't.
- When you finish a step, tell Claude ("done #A2") and it gets moved to the DONE LOG with the date and how it was verified.
- ☐ = to do · 🔷 = do it WITH Claude in a live session · ⏳ = waiting on someone else · 🤔 = your decision needed

**Last updated:** 2026-07-19 by Claude (**iOS ring round 3 shipped** from Fabrizio's 2026-07-18 video — the "two orders at once" double-ring, the "music card with a play button", and the ring-gap cadence all fixed web/server-side (adversarially reviewed, 21-agent workflow; 823 tests); his re-test asks posted on the report (IN_TESTING). The wake-handoff piece still rides the NEXT TestFlight build (006c669d, already committed). Earlier same day: Erik's $10 make-good SENT + verified (T-J closed). Remaining opens: awaiting Apple ×1 + Google ×2 review emails, B5 Kitchen 16 KB real fix.)
**Previous update:** 2026-07-17 by Claude (🎉 driver iOS SUBMITTED to App Review 1:22 AM — Waiting for Review; prod test deliveries cleaned; v1.1 Phase 2 deployed. Earlier: Android submission prep — BOTH signed RELEASE .aab files built + cryptographically proven release-signed [Kitchen vc21/v3.0 + Driver vc1/v1.0, same upload key]; Play org conversion confirmed = 20-tester gate GONE; wrote Play listing copy for both apps; generated 4 Play screenshots from the local demo; rewrote IOS_APP_STORE_SUBMISSION.md for the org + added the driver app. Apple org still Pending — decisions logged in A17.)

---

## ⭐ TOMORROW — the short list (do these WITH Claude / report results)

**Together (5–15 min each):**
- **T-J. ✅ DONE 2026-07-19 — Erik's $10 make-good SENT + verified end-to-end.** Luigi clicked Give (notify ✓) at 06:03Z → email sent; Claude then re-ran the live checkout preview with Erik's REAL email: **exactly −$10.00 applied automatically** (and FIRSTBUY correctly absent — he's returning). Promo dies after his one use (usageLimit 1 + once-per-lifetime); trash icon on his customer page revokes it anytime. Watch: when Erik orders, the order total will show the $10 off. Original plan kept below for the record.
  Original: **Erik's $10 make-good staged + PROVEN; only YOUR 2 clicks remain (that's what sends the email).** Your GO from 2026-07-19. Claude created the promo on prod ("**Sorry we missed your discount — $10 on us**": hidden, $10 off cart, once-per-lifetime, everyone, dies after 1 use) and PROVED it live: a test email attached to it got **-$10.00** at checkout on your real store; an unattached email got nothing; the test attach was then deleted — the deal is currently attached to NOBODY and invisible to the public. The email text (apology + 3 easy steps + "create an account, earn 5% Luigi Bucks") is baked into the promo description. Your clicks:
  1. **Admin → Customers → open Erik Wiebe** (the $12.79 pickup from 2026-07-17).
  2. **"Give a VIP special"** card → pick **"Sorry we missed your discount — $10 on us"** → keep **"notify"** checked → **Give**. Expect the toast "**emailed 1**" — that's his email going out (subject "Your VIP member deal at Luigi's Lasagna & Pizzeria — $10.00 off", branded, Order-now button to your site).
  Afterwards tell Claude "sent" and he'll re-verify the discount live against Erik's real email. Trash icon on Erik's page removes the deal any time. ⚠️ Unchanged flag: $10 vs. his $12.79 first order ≈ nearly-free meal — your stated intent; a minimum order is the knob if you'd rather not. Also FYI: your store's VIP label said "Bruce Trail Staff" — Erik's email would have opened with that, so Claude reset it to the default "VIP member" (your one customer group carries no promos, so nothing else changes; say the word to restore it).
- **T-A. ✅ DONE 2026-07-16 — driver rating DEPLOYED.** Schema pushed to BOTH branches, `rating-wip` merged (commit 25554fdd), preflight green (816 tests), and VERIFIED live on prod: the public tracking API now returns `driverRating`. Drivers see their ★ % in the app; dispatch + superadmin show it; customers see it on the tracking card. (Note: preflight's exit code was masked by a pipe on the first run and hid a stale-Prisma-client failure — caught by the read-bottom-up rule; the tooling gap is noted below as T-H.)
- **T-B2. ✅ DONE 2026-07-17, 1:22 AM — Fee Free Delivery iOS SUBMITTED to App Review 🎉** (Build 6, status **Waiting for Review**, submission ID `da64928d-7c7f-44a9-a6f2-60b24412a25c`, up to ~48h). Final blockers cleared live with Claude: App Privacy published (5 data types: Name/Email/Phone/Precise Location linked + Crash Data not-linked; all App Functionality, no tracking), price tier **Free**, iPad 13" screenshots (2048×2732 ×2). NOTE: checkpoint 3 (locked-phone pin) was started but not finished (#525532 reached picked_up) — Luigi chose to submit anyway; a fresh test job can be seeded on request. When Apple's email arrives (approved OR rejected), paste it to Claude. ⚠️ Still: never touch the OLD team's Kitchen app (Fabrizio live on it).
- **T-I. ✅ v1.1 BUILD COMPLETE 2026-07-18 — all phases 0–8 shipped.** Phases 0+1 (unified login) LIVE 2026-07-16. Phase 2 (`cd68a19b`) keyset schema BOTH branches. Phase 3 driver shell device-gated + deployed. Phase 4 History, Phase 5 Earnings, sounds, Phases 6–7 restaurant Deliveries tab + detail (`d80c9a9f`, `c06d8e75`). **Phase 8 (`c73ead43`): restaurant Drivers tab + tap-to-call (your "phone visible" call) + Rate-this-driver on finished deliveries — a rating visibly moves the driver's ★ % (verified 100→76 in E2E, 13/13 checks).** What to try in the app: sign in at `/driver` with your admin login → new **Drivers** tab → tap a driver → call button + their deliveries for you; open any completed delivery → rate them at the bottom.
- **T-H. ✅ DONE (verified 2026-07-17)** — preflight already runs `prisma generate` FIRST (the reorder landed with an earlier phase); rule stands: run preflight DIRECTLY, never through a pipe/tee (pipes mask the exit code), read bottom-up.
- **T-B. iOS TestFlight under the org** → when Apple's verification email arrives (A17), we set up the org's App Store Connect key + Codemagic + build "Fee Free Delivery (iOS)".

**You test on real devices (tell Claude what breaks):**
- **T-C. Tablet apps** — both are installed. Sign into the **Fee Free Delivery** app with your driver login (`support@feefreeordering.com`) → Allow location **"Always"** → take a short test delivery (accept → picked up → delivered, watch background GPS). Open the **Kitchen** app too.
- **T-D. This session's live changes** — (1) checkout now shows **"X km from store"** next to the zone on your store; (2) **desktop checkout** bottom no longer flush against the edge (Fabrizio's fix); (3) driver "**Can't complete**" now asks to confirm, re-offers the order to the pool, and the customer sees "**Finding you a driver**" (not a stuck driver name).

**Unblock Fabrizio's open reports (Claude needs from you):**
- **T-E. iOS report (`cmrkvs5r`)** — on the iPhone Kitchen app, open the **3-dot menu** and read out the **"web `<build>`"** value (tells us if his app has the current code). His ring fixes need a fresh iOS build (T-B).
- **T-F. Invoices report (`cmr1ty0lc`)** — confirm the exact symptom, or confirm it's the known "non-VIES restaurants can't buy paid plans yet" (blocked on the EU OSS registration, not code).

**Decision (no clicking — just tell Claude):**
- **T-G. What Claude builds next** in the delivery backlog: **#5** driver order-history + shift-earnings dashboard, **#6** dispatch-view enrichment (history, driver info, settings), and the rating **feedback buttons** (customer/restaurant/you rate a driver). Pick an order or say "your call."

*(Everything below is the standing backlog; the items above are the fresh ones from tonight.)*

---

## A. DO NOW — this week, in priority order

### A22. ✅ DONE 2026-07-23 (Luigi said "a22 go") — earn-rate snapshot LIVE, E2E-proven
Schema pushed to BOTH Neon branches FIRST (both reported "in sync"), then merge deployed (7c71efdd, preflight 859 tests). **E2E ALL PASS on dev with a REAL UI-placed order** (ORD-572695597, VIP customer @10% group, base 5%): stamp=10 written at placement → projection 0.20 → **rate edited to 20% mid-flight → projection UNCHANGED** (pre-fix it would have flipped) → completion grant paid exactly the promised 0.20 → fixture cleaned up. The receipt's "you'll earn X" and the wallet grant can no longer disagree. Repro scripts: _verify-earn-override-e2e.ts (setup/cleanup) + _verify-earn-snapshot-e2e.ts (assert).

### A20. ✅ DONE 2026-07-19 — First Buy PROVEN end-to-end on a real charged order 🎉
**You flipped the toggle 2026-07-18** (toggle-truth sync confirmed: promo active, email drip resumed), Claude preview-proved it 2026-07-19 (fresh identity → 10% via the live `apply-promos` API), and then **you placed the real test order `ORD-067045266`** (Dipping Sauce $1.49, fresh `+firstbuy` identity): the charged row shows `promoDiscount=$0.15`, FIRSTBUY in `appliedPromos`, card authorized for the discounted $1.51, PromotionUsage row written, `usedCount` 0→1. The campaign's promise now reaches the payment. (Order left pending — accept or cancel it in the kitchen as you like; the proof stands either way.)
**Decision made 2026-07-19:** no comp. Instead: a **$10 one-time credit locked to his email**, auto-applied on his next order — done through the existing "Give a VIP special" flow (no new code). Exact steps = **T-J** above. (His literal "add 10 Luigi Bucks" idea won't work: reward dollars can only be SPENT by a signed-in account — your own 2026-06-27 anti-drain rule — and he's a guest.)

### A21. ✅ DONE 2026-07-19 — delivery indexes pushed to BOTH databases (run live with Luigi)
`push-schema-to-both.ts` ran with you present; both branches reported "in sync". Verified read-only on prod: `DeliveryAssignment_restaurantId_status_settlementId_idx` + `DeliveryAssignment_restaurantId_status_deliveredAt_idx` both exist. Additive-only, no data touched.

### A19b. 🎉 KITCHEN APP **LIVE ON GOOGLE PLAY** (confirmed by Luigi's screenshot, 2026-07-22)
`https://play.google.com/store/apps/details?id=com.feefreeordering.kitchen` — public, installable ("Install on more devices" showing, 1+ downloads). Luigi's calls (2026-07-22):
1. **UK reseller link** — ☐ PARKED (Luigi picked "skip for now"; say "draft the reseller note" or send it yourself anytime).
2. **Marketing + reseller Play-link sweep** — ✅ DONE 2026-07-22 (superseded by the app-distribution project Luigi commissioned + approved same day: `app-links.ts` single switch, badges live on home//features/footer/reseller, admin install hub + QR, welcome-email step, kitchen-login hint, setup-wizard step. Future store approvals = flip one URL in src/lib/app-links.ts).
3. **Driver app** ("Fee Free Delivery", com.feefreeordering.driver) — ⏳ still in Play review as of Kitchen going live ("only Kitchen so far"). Paste the email when it arrives (approved OR rejected → same-day fix).
4. **iOS driver app** — 🎉 **APPROVED on the App Store** (Luigi confirmed 2026-07-23) — first PUBLIC iOS app, under the org (seller = Fee Free Ordering Inc., never touched the old team). ☐ LUIGI: paste the App Store listing URL (App Store Connect → App Information → View on App Store) → Claude flips `APP_LINKS.driver.ios` in src/lib/app-links.ts and every surface (iOS badge on driver contexts + driver-invite email) activates. Driver-PLAY still in review (inverted from Kitchen: Play ✅/Apple ⏳ vs Play ⏳/Apple ✅).
5. **B5** (16 KB page-size fix, Star SDK bump + print re-test) still stands for a FUTURE Kitchen update — not urgent now that vc21 is live.

### A19. ✅ DONE 2026-07-16 — BOTH Android apps SUBMITTED to Play Production 🎉
**Kitchen "Fee Free Order App"** (vc21/v3.0) submitted ~02:15, status **In review**. **Driver "Fee Free Delivery"** (vc1/v1.0, new brand icon) submitted ~11:33 after the background-location + foreground-service declarations with the demo video (unlisted YouTube). 16 KB error on Kitchen bypassed via "Proceed anyway" (real fix = **B5**). When the review emails arrive, tell Claude the outcome → if approved, the public links go out (reseller + marketing): Kitchen `https://play.google.com/store/apps/details?id=com.feefreeordering.kitchen`, Driver `...?id=com.feefreeordering.driver`. If rejected, paste the email → same-day fix.
**Follow-ups parked here:** (1) UK reseller — send the Play link when Kitchen goes live (or add his Gmail to the closed-testing track today); (2) driver-app demo video is on YouTube unlisted — leave it up, Google re-checks it on every update.
<details><summary>original A19 upload steps (done)</summary>
**Ready now:** two signed RELEASE `.aab` files are built and PROVEN release-signed (jarsigner "jar verified", signer `CN=Fee Free Ordering Systems`, SHA-256 `20:96:12:86:…B0:AF` — NOT a debug cert). Both use the same upload key (`android/app/feefree-release.jks`).
- **Kitchen** "Fee Free Order App" — `android/app/build/outputs/bundle/release/app-release.aab` (`com.feefreeordering.kitchen`, versionCode 21 / v3.0). Playbook: `PLAY_STORE_SUBMISSION.md`.
- **Driver** "Fee Free Delivery" — `android-driver/app/build/outputs/bundle/release/app-release.aab` (`com.feefreeordering.driver`, versionCode 1 / v1.0). Playbook: `PLAY_STORE_SUBMISSION_DRIVER.md`.
1. `play.google.com/console` → **Create app** for each (names above) → fill listing (copy in the playbooks) + data safety + content rating + app access (demo login).
2. **Production → Create release → upload the .aab → Review → Start rollout.** (Org account: no closed test required.)
3. **⚠️ Driver app only:** it requests **background location** → Play **requires** a "Location permissions declaration" + a short **demo video** of the background use, or it's rejected. Steps + the exact wording are at the top of `PLAY_STORE_SUBMISSION_DRIVER.md`.
4. Play screenshots are generated (4, in `store-assets/play-screenshots/`) — upload the kitchen ones to the Kitchen listing, the driver ones to the Driver listing.
5. **Reviewers need logins on PROD:** Kitchen = `demo@feefreeordering.com` (set its prod password via `scripts/run-on-prod.ts scripts/_set-demo-password.ts '<pw>'`). Driver = create a demo driver at `/superadmin → Delivery Drivers`. Put both in Play's App-access field.
6. If Play says "version code N already used", tell Claude → bump versionCode + rebuild (seconds).
*(NOTE: the driver app launcher icon is still the default Capacitor icon — cosmetic; swap before/after, not a blocker.)*
</details>

### A18. 🔷 Set the Fee Free Delivery "unclaimed order" alert phone (Sameem)
A new safety net texts the Fee Free platform owner when a delivery order sits in the pool with NO driver accepting for 3 minutes (so it never gets silently dropped). To turn it on, set in Vercel env:
- `FEEFREE_DISPATCH_ALERT_PHONE` = `+16476690808` (Sameem Nabil)
- (SMS goes through the existing Twilio setup — needs `FFOS_TWILIO_ACCOUNT_SID` / `FFOS_TWILIO_AUTH_TOKEN` / `FFOS_TWILIO_FROM_NUMBER` set too, same as the driver-invite SMS.)
Until the phone is set, the cron still runs but just logs "no alert phone configured" (no text sent) — nothing breaks. The alert links to `/superadmin/drivers` to assign it manually.

### A17. ⏳ Apple Developer ORG account for Fee Free Ordering Inc. — SUBMITTED, still "(Pending)" as of 2026-07-16
**Status:** enrollment SUBMITTED, Apple says processing can take up to ~48h (sometimes a verification call). **Enrollment ID `LXARH3QT89`** · Legal entity **Fee Free Ordering Inc.** · **D-U-N-S `243370724`** · account holder **Sameem Nabil**. **Nothing on Apple is clickable until it activates — do NOT re-purchase, it's already paid.** Test delivering on the **Android** driver APK meanwhile so nothing is blocked.

**🔑 IN PROGRESS 2026-07-23 — D1-a → PLAN B (fresh iOS bundle id under the org).** Apple refused to free the old `com.feefreeordering.kitchen` App ID ("in use by the App Store" — build-24 history lock, may take 30-90d or never), so Luigi picked Plan B: new iOS-only id. **Org team = `N537SW2VG2` (Fee Free Ordering Inc.).** Android keeps `com.feefreeordering.kitchen` (unchanged). Live checklist:
1. ✅ DONE — old-team app record removed (Jul 23).
2. ✅ DONE — iOS App ID `com.feefreeordering.kitchenapp` registered under the org with Push Notifications (name "Fee Free Order App").
3. ⏳ NOW — App Store Connect (org) → New App record on that bundle id.
4. ☐ Claude edits (paired with the build): codemagic.yaml `ios-kitchen` BUNDLE_ID + ios/App/App.xcodeproj PRODUCT_BUNDLE_IDENTIFIER → `.kitchenapp` (NOT capacitor.config.ts — Android must stay `.kitchen`); repoint `ios-kitchen` to the ORG ASC API key (same creds the driver workflow used).
5. ☐ Codemagic build → org TestFlight → verify the ring incl. wake-handoff 006c669d (first native build with it = also clears D3). Capture iOS kitchen screenshots here.
6. ☐ Submit for App Store review (Claude preps metadata from IOS_APP_STORE_SUBMISSION.md + store-assets).
7. When approved → tell Claude → flip `APP_LINKS.kitchen.ios` = iOS badges live everywhere.

**🔑 THREE DECISIONS (original, for the record — full detail in `IOS_APP_STORE_SUBMISSION.md` §D1–D3):**
- **D1 — Kitchen bundle id is stuck on the OLD team.** `com.feefreeordering.kitchen` lives under the old team (`NT5ZY28ATK`) and is TestFlight-only. Apple's "Transfer App" needs a *publicly released* app, so **a TestFlight-only app generally can't be transferred** — the old "submit now, transfer later" plan is NOT reliable for Kitchen. Pick: **(D1-a, recommended)** remove it from the old team + re-register the same bundle id fresh under the org (lose build-24 TestFlight history, re-upload one build); or **(D1-b)** submit from the old team now (Seller shows "Luigi's Lasagna & Pizzeria Inc." — the name you didn't want public). **Driver app has no iOS App ID yet → register `com.feefreeordering.driver` CLEAN under the org, no transfer ever.**
- **D2 — Codemagic signing points at the old team.** `ff-asc-key` + `IOS_SIGNING_KEY_PEM` are old-team creds. Once the org is live: create a new App Store Connect API key under the org, add it to Codemagic, and repoint BOTH `ios-kitchen` + `ios-driver` workflows. Until then an org-targeted iOS build fails signing.
- **D3 — Kitchen iOS ring bugs are UNRESOLVED.** Fabrizio's build stamp (web `de2bbc0`) proved his app is already on CURRENT code, so the earlier "stale build" theory was WRONG — the ring needs a real root-cause, not a rebuild. **Recommendation: do NOT push Kitchen to the PUBLIC App Store until the ring bug is understood** (TestFlight is fine). The Driver app has no such blocker → it's the safer first public iOS app if you want one.
<details><summary>original enrol steps (done)</summary>
Your D-U-N-S number for **Fee Free Ordering Inc.** is in hand — this was the blocker for the company Apple account. Now:
1. Go to **developer.apple.com/enroll** → choose **Company/Organization** → enter the D-U-N-S + legal entity details (use a *company* Apple Account/email if you have one, not a personal one). Pay the $99/yr. Apple verifies the org — usually **1–5 business days** (they may phone to confirm).
2. **Keep testing on the current team meanwhile** — nothing is blocked. The Kitchen app stays on TestFlight; create the **driver** app under the current team per A15 (Option A: ship now, transfer later).
3. **Once the org membership is active:** transfer BOTH apps (`com.feefreeordering.kitchen` + `com.feefreeordering.driver`) to the org (bundle ids survive; TestFlight builds/testers do NOT — you re-invite testers), then repoint Codemagic's `ff-asc-key` + the `IOS_SIGNING_KEY_PEM` signing key to the new team. Tell Claude when the org is live and it'll walk you through the transfer + Codemagic repoint.
4. **Bonus:** a Google **Play** org account under Fee Free Ordering Inc. is exempt from the 20-tester production gate your personal account hit — worth doing the same company route there (see A on the Android side).
</details>

### A16. ☐ TEST this session's shipped work (2026-07-14) — NOT DONE YET (Luigi will do when ready)
Everything below is built + pushed + preflight-green, but NOT yet verified by you on real devices / real data:
1. **Uber Eats import** — Admin → Menu → Import → paste your Koozina Uber link → confirm categories/items/modifiers/photos land. (Best from your own IP; a datacenter IP can get Uber's bot-challenge on the modifier fetch.)
2. **Driver app on your phone** — sideload `C:\Users\luigi\Downloads\FeeFreeDelivery-driver-debug.apk` (Android), and/or do A15 (iOS → TestFlight). Take it on a short drive to confirm background GPS.
3. **Fee Free Delivery end-to-end** (see A13) — create a driver, enable it on a store, run a test delivery accept→picked up→delivered.
4. **A14** (marketplace retirement on prod) + **A15** (driver app store steps) are the related owner steps.
Tell Claude the results of each and it'll fix anything that surfaces.

### A14. ✅ DONE / no-op — marketplace retirement migration (dry-run confirmed 0 subs on PROD, 2026-07-20)
**RESULT (Claude ran the read-only dry-run against prod, 2026-07-20):** `Marketplace add-on subscriptions to cancel: 0` — there are NO restaurants on a legacy paid marketplace subscription on prod, and the marketplace AddOn is already `isActive:false` (retired from sale). So there is **nothing to cancel and nothing to migrate** — the end state A14 aimed for (0 active marketplace subs, add-on retired) is already true. `--apply` would be a no-op; **you do NOT need to run it.** A14's completion check ("0 active marketplace subs on prod, Driver Pool intact") is satisfied trivially (0 subs → no Driver Pool inclusion to preserve). If you want to double-check yourself: `npx tsx scripts/run-on-prod.ts scripts/retire-marketplace-addon.ts` (read-only). *(Note: running the retire script via run-on-prod alone leaves the LOCAL encryption key active, so a hypothetical `--apply` couldn't decrypt prod Stripe keys to actually cancel subs — moot here since there are 0 subs, but worth knowing if any ever appear.)*

<details><summary>Original A14 instructions (kept for reference — no longer needed)</summary>

**Why:** the marketplace is now free + included for every restaurant (customer site shows only restaurants within 15 km, with Pickup/Delivery badges; no per-order or monthly fee). The per-order fee is already $0 in code, but any restaurant still on the OLD paid marketplace add-on ($199.99/mo or PAYG) is still attached to a Stripe subscription until this runs. The migration cancels those subs, **keeps their Driver Pool** (grants a free standalone Driver Pool so ShipDay/FeeFree dispatch never drops), and retires the add-on from sale so nobody signs up for a now-free thing. It is **dry-run by default** (shows the plan, changes nothing) — I already verified it on the dev branch.
1. First see the plan (safe, read-only): `npx tsx scripts/run-on-prod.ts scripts/retire-marketplace-addon.ts` — it lists which subscriptions would be cancelled + who keeps Driver Pool.
2. Review the list. When you're happy, apply it: `npx tsx scripts/run-on-prod.ts scripts/retire-marketplace-addon.ts --apply` (this cancels the live Stripe subscriptions and retires the add-on).
3. Tell Claude "done A14" → Claude confirms 0 active marketplace subs on prod and Driver Pool intact for each affected restaurant.
*(NOTE: the customer marketplace is already live + free. The FULL admin/pricing/marketing/terms/refund copy sweep + PAYG-route retirement shipped 2026-07-20 (commit bb527957) — no surface still frames the marketplace as paid, and the obsolete pay-as-you-go opt-in pages/routes are retired. **The webhook that would have hidden legacy subscribers on cancel was also fixed**, so the migration was safe — though the dry-run above shows there was nothing to migrate anyway.)*

</details>

### A15. 🔷 Install the Fee Free Delivery DRIVER app on your phone (native builds are ready)
**✅ 2026-07-15 — Claude verified the iOS driver project is fully build-ready** (Xcode project, bundle id `com.feefreeordering.driver`, descriptive location-permission strings, `UIBackgroundModes: location` + background-geolocation plugin for locked-phone GPS, `ITSAppUsesNonExemptEncryption:false`, and the Codemagic `ios-driver` workflow reuses your working `ff-asc-key` + cert and auto-submits to TestFlight). No code changes needed — the steps below are all on your Apple account. **To actually DELIVER with it you sign in as a DRIVER (driver queue) — that needs a driver account (A13); signing in with your restaurant-owner login gives the DISPATCH view, not the delivery queue.**
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

### A6. ✅ DONE 2026-07-17 — Superadmin password rotated
Luigi confirmed via chat. New password set via Forgot Password flow on `admin@feefreeordering.com`.

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

### B5. 🤔 Kitchen app "16 KB page size" fix — approve the Star SDK bump + minimum-Android raise
**Why:** Play flagged the Kitchen .aab ("does not support 16 KB memory page sizes"); you submitted with "Proceed anyway" (2026-07-16), which works for now but Google will eventually enforce it. Root cause is PROVEN: two native libraries inside the Star printer SDK `stario10 1.9.0`. The fix is verified available: upgrade to `stario10 1.12.1` (Claude downloaded + binary-checked it — compliant), BUT it requires raising the app's minimum Android from 7.0 to **8.0** (drops only 9+-year-old devices) and, because the printer pipeline is hardware-verified GOLDEN, a **physical print re-test on your tablet + Star printer** before shipping. The Driver app is unaffected (already compliant).
Say **"B5 go"** → Claude does the bump + preflight + builds vc22, then we do a 10-min print test together before it goes to Play. No rush — only needed for a future update or if Google's review bounces vc21.

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

### C1. ✅ DONE 2026-07-15 — Google Play account converted to Organization (Fee Free Ordering Inc.)
D-U-N-S `243370724`, dev account ID `7291944516964290458`, owner luigislasagna1@gmail.com (Sameem Nabil). Organization + authorized representative both VERIFIED by Google. **The 20-tester / 14-day closed-testing production gate is GONE — Android can publish straight to Production.** → see A19 for the upload.

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
| 2026-07-17 | T-B2 — Fee Free Delivery iOS SUBMITTED to App Review (Build 6) | ASC: "1 Item Submitted", Waiting for Review, submission `da64928d-…412a25c`, 1:22 AM |
| 2026-07-17 | Task #11 — prod video/checkpoint test deliveries cleaned | script output: removed #872615 (delivered) + #525532 (picked_up), 2 orders + assignments + items, videoseed-tagged rows only |
| 2026-07-17 | DSA trader status completed for the org (ASC → Business → Compliance Requirements; trader=yes, Milton address confirmed) | Luigi confirmed in chat ~1:45 AM; Free Apps Agreement Active thru Jul 2027; bank/tax banners intentionally skipped (free app) |
| 2026-07-17 | Fabrizio round 3 SHIPPED (623a9c81): checkout footer parity (root cause = .safe-bottom zeroing padding), desktop scroll-lock (html-overflow), kitchen night-mode relaunch | Playwright-verified locally + ON HIS PROD STORE (gap 24px vs dish 21px, was 0; background pinned); screenshots in session scratchpad |
| 2026-07-17 | iOS ring web waves SHIPPED (fa1328ad): resume-suspect gate, tap-to-restore, Now Playing teardown, push-health panel + Test ring (3-dot menu), cron overlap bound | 5-symptom root cause investigation; 11 review findings fixed; parity 5683/0 ×38; preflight ×2 green; reaches installed apps via auto-refresh (NO TestFlight needed) |
| 2026-07-17 | All 6 Fabrizio reports updated: display+night-mode → IN_TESTING w/ re-test asks; iOS + Invoices stay IN_PROGRESS (per Luigi) | 4 replies posted via _reply-report.ts + threads dumped to confirm intact; reporter notified on each |
| 2026-07-17 | iOS ring ROUND 2 shipped (a09bab4b) from Fabrizio's video: Now Playing prime removed on shell, lockable 8s-countdown Test ring, ring-tap lands on list | His 306MB video analyzed frame-by-frame + audio timeline (ffmpeg); 3 investigators; 4 review findings fixed; parity+preflight 0; calibrated reply posted with per-item test steps — video confirmed login-ring/locked-ring/cron re-ring all working |
| 2026-07-17 | Native iOS wake fix PREPARED (006c669d): AppDelegate clears delivered ring notifications on activate — rides the NEXT Codemagic ios-kitchen build (not compiled locally) | Committed; device-gate verifies whether it cuts in-flight .caf |
| 2026-07-17 | v1.1 Phase 3 (7e405ad7) DEVICE-GATE PASSED with Luigi + count-fix (5a0d9860): Jobs/Profile shell, RoleSwitch, /api/driver/me | Gate: pings landed during locked minute + tab flips, completedAt==deliveredAt live; Profile now refetches per tab-activation (was stale until re-login) |
| 2026-07-17 | v1.1 Phase 4 (d990d8f0): driver History tab — day-grouped keyset list + detail overlay + On-time/Late badge | E2E 28/28 (pagination no-dup/no-gap, chips, null-city, currency); parity 5706 x38; preflight green |
| 2026-07-17 | Driver app SOUNDS (89984bfb): new-order chime until accepted + stage ticks + mute toggle | Pure WebAudio (no iOS media card); ZERO DriverQueue edits; E2E 9/9; both of Luigi's gate-day asks shipped same day |
| 2026-07-17 | v1.1 Phase 5 (cdb13eb2): Earnings tab — Today/This week/Last week, per-currency tip stacking, hardened bound-tz aggregate | E2E 35/35 (usd+eur tips proven separate, exact period counts, >35d invisible, range-clamp 400); parity 5718 x38; preflight green. Resumed from a Fable-5 usage-limit mid-run on Opus |
| 2026-07-20 | Fabrizio's ristorante-test made PERMANENTLY FREE (Luigi's call — thanks for his testing/feedback; his CLIENT accounts stay paid) | All 5 comped add-ons (hosted_website, online_payments, custom_domain, reservation_deposits, advanced_promos) + plan trial pushed from Aug 24 to 2126-01-01; no Stripe subs touched (none existed); dunning clear; prod re-verified read-only. Reversible: set real dates back anytime (scripts/_fabrizio-free-account.ts) |

---

*Claude also keeps a full audit under `docs/launch-readiness/` — findings there reference these action items where an owner step closes a finding.*
