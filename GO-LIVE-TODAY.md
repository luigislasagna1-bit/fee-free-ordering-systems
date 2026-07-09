# 🚀 GO LIVE — Live Payments Checklist (do TODAY, launch tomorrow)

**Goal:** Luigi's Lasagna taking **real customer card payments**. Distilled from `LAUNCH-READINESS.md`.

**The one thing to understand:** the payment *code* is done and verified (key-only customer payments, authorize-then-capture, idempotent, preview==charge, reward-refunds — 335+ tests green). **Going live is CONFIG + one $1 test, not more coding.** Customer money goes 100% to the restaurant's own Stripe; the *platform* Stripe account (billing restaurants on subscriptions) is a SEPARATE thing and does **NOT** block taking customer orders.

---

## 🔴 MUST DO TODAY — owner actions (the actual gate)

- [ ] **1. `ENCRYPTION_KEY` in Vercel prod = the EXACT value that encrypted your stored keys.** ⚠️ **The single most dangerous setting.** If it's wrong or changed, every stored Stripe/Resend key fails to decrypt and **card payments silently fail with no error.** Never change it once set. → Vercel → Project → Settings → Environment Variables.
- [ ] **2. Your restaurant's own Stripe → LIVE keys.** In the Luigi's Lasagna admin payment settings, enter the **live** publishable + secret keys (`pk_live_…` / `sk_live_…`) and register its webhook. This is the actual "turn on live payments" switch for customer orders.
- [ ] **3. `CRON_SECRET` set in Vercel prod.** Without it, all 16 crons fail-CLOSED — **auto-accept, auto-reject, settlement, digests all silently stop.** Set it, then `curl` one cron with the Bearer to confirm a 200.
- [ ] **4. `pg_dump` backup of prod Neon** before flipping anything (and confirm Neon PITR is on a paid tier).
- [ ] **5. Live $1 UAT (go/no-go):** place a REAL order with a REAL card on the live store → the kitchen tablet **rings + prints** → **accept (capture $1)** → **refund it** → reject a second (void). Confirm the reward wallet restores exactly once. **Record PASS/FAIL.**

## 🟠 STRONGLY RECOMMENDED (so launch isn't embarrassing)

- [ ] **6. Resend live sending:** verify `feefreeordering.com` (SPF+DKIM+DMARC), create a live `re_…` key, save it in Superadmin → Email, set From = `support@feefreeordering.com`, send a test to a **non-Resend** inbox — or customers get **no confirmation email**.
- [ ] **7. Rotate** the `admin@feefreeordering.com` password + Neon DB password (both were exposed in chat earlier).
- [ ] **8. Set the remaining prod env vars** (`NEXTAUTH_SECRET`, `BLOB_READ_WRITE_TOKEN`, Sentry DSNs, Twilio, Anthropic, `UPSTASH_REDIS_REST_URL/TOKEN`).

## ✅ Already done in code (nothing to do — verified)
Customer payments (key-only, idempotent, capture/refund), preview==charge for member/franchise promos, reward store-credit refund on cancel, gift-card promo exclusion, login rate-limiting + DB lockout, promo engine + stacking, security headers, XSS hardening.

---

## 🗺️ AFTER payments work — near-term roadmap (not launch-day blockers)

1. **Platform Stripe LIVE account** (Fee Free Ordering Inc.) — needed to *bill restaurants* for subscriptions/add-ons, not for taking customer orders. Do before onboarding paying restaurants.
2. **Native apps:** signed Android AAB → Play closed testing (14-day clock — start ASAP); iOS TestFlight print + screen-locked-ring confirmation → App Store submit.
3. **Support line:** provision/verify 1-888-618-8765 → Voice webhook → real test call, or soften the "24/7" copy.
4. **Confirmation-email money rows** (payment method / store credit / reward earned) + email/SMS label i18n; EOD "store credit redeemed"/"collected" lines; ShipDay COD total = `total − creditApplied`.
5. **Open reseller reports:** Meal-Bundle-Promo (stacking) + category features — both awaiting Fabrizio's re-test; **Invoices** report still IN_PROGRESS.
6. **Fast-follow hardening** (see `LAUNCH-READINESS.md` Medium/Low): order-number unique constraint, cron bounds/pagination, missing webhook indexes, `take` caps, Resend bounce webhook + suppression list, self-service data export/DPA.

**Full detail:** `LAUNCH-READINESS.md` (10 blockers · runbook · owner actions).
