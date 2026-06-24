# 🚀 Launch — what's actually left (compiled 2026-06-24)

## TL;DR
The **code is in excellent shape.** A read-only survey (4 agents) + a fresh i18n audit confirm:
i18n parity is perfect (38 locales, 4,813 keys, 0 gaps); the marketing site (homepage, /features,
signup, screenshots) is built; the **iOS Swift printer bridge (~900 lines) and the signed Android
release AAB are done**; no TODO/FIXME left in the code. **What's left before launch is overwhelmingly
YOUR actions** (app-store submissions, Stripe live, env vars, a handful of UATs) plus **optional
features** I can build on your go. The single **time-sensitive** item is the **Android 14-day
closed-testing gate — start it today.**

> Note: the in-app task tracker was stale — several "pending" items (homepage i18n, /features rebuild,
> screenshots, signup entry points, iOS printing, signed AAB) are in fact already shipped.

---

## ① CRITICAL PATH — the minimum to go live (mostly your actions)

### 🔴 START TODAY — it has a hard 14-day clock: Android → Play Store closed testing
The signed AAB exists (`android/app/build/outputs/bundle/release/app-release.aab`, v2.9, ~20 MB).
Google requires **≥20 testers for ≥14 days** in closed testing before granting production access — no
bypass. Every day delayed pushes the launch date out.
- [YOU] Play Console → Testing → Closed testing → create a track ("alpha").
- [YOU] Add ≥20 tester emails (friends, family, reseller partners — anyone).
- [YOU] Upload the AAB + share the opt-in link.
- [ME] Draft the store listing copy + generate phone/tablet screenshots from the demo restaurant.
- After 14 days → Play prompts "Apply for production access" → fill the identity form → submit → ~2–3 day review.

### 🔴 Config sweep — CRITICAL, ~30 min, do before taking real money
- [YOU] **ENCRYPTION_KEY** in Vercel prod (32-byte hex). Without it, saved Stripe keys can't decrypt → card payments silently fail.
- [YOU] **CRON_SECRET** set (guards the cron endpoints: auto-reject, digests, settlement, alert-calls).
- [YOU] **Resend domain** verified (so prod emails actually send).
- [YOU] **Rotate** the `admin@feefreeordering.com` password (was visible in chat) + the **Neon DB password**.

### 🔴 Stripe LIVE — CRITICAL, ~30 min, do at T-minus-1h
Code is ready (key-only model: each restaurant pastes their own Stripe keys).
- [YOU] Flip the dashboard test→live, recreate Products + Prices in Live, paste the live price IDs into the add-ons, re-register the webhook URL, run one $1 test order + refund.

### 🔴 Add-on prices — CRITICAL, ~10 min
- [YOU] /superadmin/add-ons → set each price (Online Payments, Hosted Website, Multi-Location, Reservations, Marketplace, Driver Pool) → **Sync to Stripe**. Until non-zero, the Subscribe buttons show "Coming soon".

### 🟠 iOS → App Store — parallel; not blocking the Android launch
The Swift printer bridge is BUILT; Codemagic is configured.
- [YOU, one-time] Add the App Store Connect API key ("ff-asc-key") in Codemagic → Integrations.
- [YOU] Trigger the "ios-kitchen" Codemagic build → it auto-uploads to TestFlight.
- [YOU] Install on an iPad, connect the Star printer on WiFi, test discovery + a test print (the bridge needs ONE real-hardware confirmation).
- [ME] Draft the App Store listing copy.
- [YOU] Screenshots + submit → Apple review (strict on web-wrappers; the native printing + demo login is the justification).

### 🟠 One real restaurant fully set up + the reviewer demo
- [YOU] Fully configure one restaurant (hours, menu, payments, delivery zones) — for the first real order + the store reviewers' demo (demo@feefreeordering.com exists; put its password in the Play/Apple "App access" field).

---

## ② UAT — verify the DONE code on prod (your checklist; all code shipped)
Each of these is built + deployed; they just need one real run-through on prod:
- [ ] **Kitchen printer** — real online order → the printer in your kitchen physically prints (never yet run against a real prod order).
- [ ] **Stripe payment** — $1 live order → accept → refund (after Stripe live).
- [ ] **Autopilot** — enable cart-abandon + re-engage on a test restaurant → trigger → emails fire (check Resend), no re-fire loop, opted-out gets nothing.
- [ ] **Catering** — 24h-notice item: <24h blocked, ≥24h allowed; kitchen alert + receipt + email.
- [ ] **Closed-restaurant** — scheduled order while closed → accepted, kitchen alert deferred to opening.
- [ ] **Reports funnel** — incognito order → Funnel/Visits/Heatmap populate.
- [ ] **Menu PDF import** — 2–3 more menus (different cuisines) → extraction quality.
- [ ] **Customer accounts** — signup → personal coupon → applies logged-in, silently not logged-out.
- [ ] **Custom domain** — a real restaurant connects a real domain → DNS verifies → branded login.
- [ ] **Reseller flow** — apply → approve → add restaurants → commission rollup → payout (Sam's account is set up for this).
- [ ] **Multi-location** — parent → child → menu inheritance → revert-to-brand. ⚠️ Known HIGH bug: the location switcher child→parent navigation — fix before charging $49.99/mo.

---

## ③ OPTIONAL features — NOT launch blockers (I build on your "go")
The platform launches fine without these. Ranked by leverage:
1. **Setup Wizard + completion tracking** (~600 lines) — RECOMMENDED. Every new restaurant hits this; it guides setup→publish + gates publishing on completeness. Highest leverage for the signup→activate funnel.
2. **ShipDay Driver Pool** (~1000 lines) — biggest practical unlock (most restaurants have no drivers). Schema/UI partly scaffolded.
3. **Multi-location add-on gating + the switcher bug** — needed before charging for Multi-Location.
4. **Publishing embed widget** (~800 lines) — paste-on-your-site ordering (GloriaFood parity). Depends on #1.
5. **Hosted website generator** (~700 lines) — auto marketing page per restaurant.
6. **Marketplace M2.5 billing reconciliation** (~400 lines) — only matters once you have a paying marketplace customer.
7. **Merge 3 open PRs** — M2 savings tracker, superadmin redirect bugfix, roadmap doc.
8. **Browser background ring (B1)** (~2–3 days, web push) — you deferred it; the native app already covers the kitchen.
9. **Kitchen device tracking gate** (~100 lines) — final publish check (part of #1).
10. **Marketplace SEO `<head>` i18n** (small) — the one remaining English-only metadata, deferred.

---

## ④ Done autonomously this pass
- ✅ i18n parity audited — 38 locales, 4,813 keys, 0 missing/extra/placeholder/rich-tag (clean).
- ✅ Fixed a stale reseller-pricing comment ($29 → $19.99 Branded).
- ✅ This survey + plan (most "remaining" tasks were already shipped; the tracker was stale).

---

## The realistic timeline
- **The long pole is the Android 14-day closed test.** Start it today and the earliest production
  date is ~2 weeks out.
- **In parallel** (a day or two of your time): config sweep + Stripe live + add-on prices + one
  restaurant fully set up + the UAT checklist.
- **iOS** can trail Android by a few days (just needs the Codemagic build + one hardware print test
  + Apple review).
- **Optional features** are your call — none of them block a soft launch.
