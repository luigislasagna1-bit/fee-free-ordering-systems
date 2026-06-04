# 🚀 Go-Live Checklist — the short list

_Last updated 2026-06-04. This is the **minimal set of things left before launch**.
For the exhaustive 17-domain regression sweep, see `LAUNCH-VERIFICATION-CHECKLIST.md`._

The product is **feature- and i18n-complete**: 38 languages, all currencies,
timezone-correct, marketing-consent compliant, every customer + admin surface
localized. What remains below is **configuration + live testing only** — none
of it is code work, and the items marked 🔴 genuinely require you (Luigi).

---

## 🔴 BLOCKER 1 — Stripe TEST → LIVE
The single hard gate. Cannot take real money without it.

1. In Stripe Dashboard, switch to **live mode**, copy the **live** publishable +
   secret keys (and the **live** webhook signing secret).
2. Put them in production env (`/superadmin/settings/stripe` and/or Vercel env).
3. **Test:** place a real order, pay **$1** with a real card.
   - ✅ Money lands in the live Stripe account.
   - ✅ Stripe Connect routes the payout to the correct restaurant.
   - ✅ Refund the $1 — it reverses cleanly.
4. Re-confirm the webhook fires in live mode (order flips to paid; no duplicate
   charge on Stripe retries — idempotency is already handled in code).

## 🔴 BLOCKER 2 — Autopilot end-to-end
`/admin/marketing/autopilot`

- Enable **cart-abandonment** + **re-engagement**.
- Trigger each (abandon a cart ~1–2h; or use a customer past 60% of their avg
  interval).
- ✅ Emails fire (check the Resend dashboard).
- ✅ They do **not** re-fire in a loop (AutopilotSend de-dup).
- ✅ An **opted-out** customer receives **nothing** (consent filter — shipped
  2026-06-03). A brand-new guest who abandoned a cart still gets the nudge.

## 🔴 BLOCKER 3 — Catering flow
Restaurant with `cateringNoticeHours: 24` + an item flagged `isCatering`.

- Add the catering item → checkout.
- ✅ Scheduling **within 24h is blocked**; 24h+ is allowed (server-enforced).
- ✅ Kitchen sees the order, receipt prints, customer email arrives.

## 🔴 BLOCKER 4 — Closed-restaurant deferred kitchen alert
Restaurant currently outside open hours.

- Customer places a **scheduled** order for tomorrow during the closed window.
- ✅ Order is accepted.
- ✅ The kitchen alert is **deferred until the restaurant opens** (no 3 AM ping).

---

## ⚙️ Pre-launch config sweep (quick)
- [ ] `ANTHROPIC_API_KEY` set in Vercel — only if you want superadmin AI report triage.
- [ ] Region backfill already verified clean on prod (0 restaurants needed changes, 2026-06-03).
- [ ] Resend domain verified (so marketing/transactional mail isn't spam-foldered).
- [ ] At least one real restaurant fully set up (hours, menu, payments, delivery zones).

## ✅ Already shipped & verified (no action needed)
- 38-language i18n across **every** user-facing surface (incl. SEO metadata).
- Per-restaurant currency, timezone-correct receipts/promos/digests/reservations.
- Marketing consent: bidirectional opt-out, sticky, excluded from all marketing sends, red OPT-OUT admin badge.
- Reseller report center (+ back button), region cascade, marketplace.

---

## 📋 Lower-priority regression checks (if time allows)
Pull from `LAUNCH-VERIFICATION-CHECKLIST.md`: Pizza Builder, Kitchen Display,
Reservations, Hours (midnight wrap), Promos (13 types × 8 restrictions),
Printing (auto-print on auto-accept), Multi-location/reseller, Payments
(3DS / PayPal / coupon race).

> Report back **PASS** per item, or screenshot + the page/tab on any **FAIL**.
