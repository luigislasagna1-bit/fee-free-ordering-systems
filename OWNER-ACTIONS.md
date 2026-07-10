# OWNER ACTIONS — Luigi's tracked to-do list

**How this file works (Claude maintains it):**
- Every time Claude needs something from you, it gets logged here with exact steps — chat messages can scroll away, this file can't.
- When you finish a step, tell Claude ("done #A2") and it gets moved to the DONE LOG with the date and how it was verified.
- ☐ = to do · 🔷 = do it WITH Claude in a live session · ⏳ = waiting on someone else · 🤔 = your decision needed

**Last updated:** 2026-07-10 (early morning) by Claude.

---

## A. DO NOW — this week, in priority order

### A1. ☐ Re-subscribe "Online Payments" with your real card — DEADLINE THURSDAY JULY 17
**Why:** your free partner period ends July 17. When it does, card checkout on luigispizzapastawings.com STOPS until this is done. Doing it early also gives us the first live test of restaurants paying the platform.
1. Go to `feefreeordering.com/admin` and log in.
2. Left sidebar → **Billing** → open the **Add-ons** page.
3. Find **Online Payments ($39.99/mo)** → click **Subscribe**.
4. Pay with your real business card in the Stripe checkout that opens.
5. Tell Claude "done A1" → Claude verifies the subscription + invoice landed on the platform Stripe account.

### A2. ☐ One click to activate refund-sync: "Test connection"
**Why:** this registers the new webhook on your Stripe account so refunds made in the Stripe dashboard update orders + Luigi Bucks automatically.
1. `feefreeordering.com/admin` → **Payments** → **Payment providers**.
2. In the Stripe card, click **Test connection**. Expect the green success message.
3. Tell Claude "done A2" → Claude verifies the webhook registered in the database.

### A3. ☐ Back up the Android signing key — CRITICAL, 10 minutes
**Why:** `feefree-release.jks` exists as ONE copy on this PC. If the disk dies, the Android app can NEVER be updated again — not by anyone, ever. This is the highest-consequence item on this list.
1. On this PC, search for the file `feefree-release.jks` (File Explorer → search in `C:\FeeFreeOrderingSystems`, likely under the `android` folder).
2. Copy it to your Google Drive (drag into drive.google.com).
3. Copy it to a USB stick you keep somewhere safe.
4. Put the keystore PASSWORD in your password manager (or written note stored separately from the USB).
5. Verify: re-download the file from Google Drive once and confirm it opens/downloads (don't skip this).
6. Tell Claude "done A3".

### A4. ☐ Turn on Apple membership auto-renew — expires ~August 3
**Why:** if the Luigi's Lasagna Apple Developer membership lapses mid-launch, the iOS app can't be submitted and TestFlight stops.
1. Go to `developer.apple.com/account` and sign in.
2. Open **Membership details**.
3. Enable **Automatic renewal** (or click Renew now, $99 USD/yr).
4. While you're there: note the **D-U-N-S Number** shown — paste it to Claude (useful reference).
5. Tell Claude "done A4".

### A5. ☐ ShipDay webhook token (two halves — do both)
**Why:** the delivery-status webhook now rejects unauthenticated callers (security hardening). Until this token is set in BOTH places, ShipDay driver status updates are paused (orders still complete automatically — nothing is lost, just live driver status).
**Half 1 — Vercel:**
1. Go to `vercel.com` → your project → **Settings** → **Environment Variables**.
2. Click **Add New**: Name = `SHIPDAY_WEBHOOK_TOKEN`. Value = a long random password (30+ characters — generate one in your password manager, and SAVE it there).
3. Environment: tick **Production** → Save.
4. Go to **Deployments** → latest deployment → "..." menu → **Redeploy** (env changes need a redeploy).
**Half 2 — ShipDay:**
5. In the ShipDay dashboard → look for **Integrations / Webhook settings**.
6. The webhook URL should be `https://feefreeordering.com/api/webhooks/shipday?token=PASTE-THE-SAME-VALUE-HERE`.
7. Tell Claude "done A5" → Claude verifies the webhook accepts ShipDay again.
*(If you're not actively using ShipDay drivers right now, this can slide a few days — but do it before the next driver dispatch.)*

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

### B3b. ✅ STAGE 2 BUILT (2026-07-10) — on branch `fix/stage2-backups-disputes`, awaiting deploy
- **C-2 backups** ✅ real verified prod backup made + backup/verify/restore tools + automated daily encrypted off-site cron (ea09541e, 483656e8)
- **H-1 disputes** ✅ OrderDispute table + webhook dispute events + owner-alert email + tests (443a0a01). Table pushed to DEV only.
Preflight green (603 tests). **⚠️ DEPLOY SEQUENCING for Stage 2 (must be in this order — H-1 adds a new table):**
1. Claude pushes the `OrderDispute` table to the **PROD** database (safe/additive; a fresh backup exists) — **needs your OK: say "push the stage 2 schema"**.
2. Claude merges the branch to main (deploys). Say **"deploy stage 2"** (implies step 1).
3. Confirm the backup cron's env vars exist in Vercel prod: `CRON_SECRET`, `ENCRYPTION_KEY`, `BLOB_READ_WRITE_TOKEN` (all believed set — Claude verifies post-deploy).
4. On Admin → Payments, click **Test connection** so your dispute webhook registers (same click as A2).

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

---

*Claude also keeps a full audit under `docs/launch-readiness/` — findings there reference these action items where an owner step closes a finding.*
