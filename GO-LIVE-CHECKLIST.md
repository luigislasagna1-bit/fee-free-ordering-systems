# 🚀 Go-Live Checklist — the short list

_Last updated 2026-06-04. This is the **minimal set of things left before launch**.
For the exhaustive 17-domain regression sweep, see `LAUNCH-VERIFICATION-CHECKLIST.md`._

The product is **feature- and i18n-complete**: 38 languages, all currencies,
timezone-correct, marketing-consent compliant, every customer + admin surface
localized. What remains below is **configuration + live testing only** — none
of it is code work, and the items marked 🔴 genuinely require you (Luigi).

---

## 🔴 BLOCKER 1 — Stripe LIVE (KEY-ONLY model — changed 2026-06-04)
The single hard gate for taking real money.

> **IMPORTANT — the payment model changed on 2026-06-04.** Stripe **Connect was
> replaced** with a **key-only** model (GloriaFood/CloudWaitress-style). There is
> **no platform Connect onboarding and no platform webhook** for customer
> payments anymore. Each restaurant connects with **their own** Stripe API keys
> and money lands **directly** in their own Stripe account — the platform never
> touches it and charges no commission. Payment state is verified server-side
> with the restaurant's key (no webhook dependency).

**Per restaurant — to take live card payments:**
1. The restaurant subscribes to the **Online Payments** add-on (grants the
   `card_payments` entitlement).
2. In **Settings → Payments → Stripe**, set **Mode = Live** and paste their own
   **live** keys (`pk_live_…` + `sk_live_…`), then **Save** and **Test connection**.
3. Turn **card payments ON** (the toggle that appears once keys are saved).
4. **Live $1 test (do this once per restaurant before relying on it):**
   - Place a real order, pay **$1** with a real card → order shows **authorized**
     and appears in the kitchen.
   - **Accept** in the kitchen → capture runs on the restaurant's key → order
     flips to **paid**; the $1 is in the restaurant's own Stripe balance.
   - **Refund** the $1 from the kitchen order screen → reverses cleanly.
   - **Reject** a different test order pre-accept → the authorization is voided
     (no charge). Idempotency keys are handled in code.

**Platform-level (only for charging restaurants for subscriptions/add-ons):**
- The platform's **own** live Stripe keys still go in `/superadmin/settings/stripe`
  (this powers SubscriptionInvoice / add-on billing — separate from customer
  payments).

**⚠️ `ENCRYPTION_KEY` MUST be set in production** (32-byte hex). Restaurant secret
keys are stored AES-256-GCM-encrypted with it; if it's missing or differs between
deploys, decryption fails and card payments silently won't work.

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
- [ ] **`ENCRYPTION_KEY`** set in Vercel (32-byte hex) — **required** for Stripe key-only + PayPal (encrypts stored secrets). Without it, card payments fail.
- [ ] **`CRON_SECRET`** set — guards the cron endpoints (auto-reject, auto-complete, **order-alert-calls**, digests, etc.).
- [ ] `ANTHROPIC_API_KEY` set in Vercel — only if you want superadmin AI report triage.
- [ ] Resend domain verified (so marketing/transactional mail isn't spam-foldered).
- [ ] At least one real restaurant fully set up (hours, menu, payments, delivery zones).
- [ ] Region backfill verified clean on prod (0 restaurants needed changes, 2026-06-03).

### Optional add-on features (each is a safe no-op until configured)
- [ ] **Auto phone-call alert** (nearly-missed orders): set `FFOS_TWILIO_ACCOUNT_SID`,
      `FFOS_TWILIO_AUTH_TOKEN`, `FFOS_TWILIO_FROM_NUMBER` in Vercel (same creds as SMS),
      give the restaurant a phone number, and toggle it on in Orders → Kitchen settings.
- [ ] **Address autocomplete + delivery map pin**: set the restaurant's
      `mapProvider = "google"` + a Google Maps API key in Admin → Map settings.
      (Leaflet restaurants keep plain address fields + server geocoding.)

## ✅ Already shipped & verified (no action needed)
- 38-language i18n across **every** user-facing surface (incl. SEO metadata).
- Per-restaurant currency, timezone-correct receipts/promos/digests/reservations.
- Marketing consent: bidirectional opt-out, sticky, excluded from all marketing sends, red OPT-OUT admin badge.
- Reseller report center (+ back button), region cascade, marketplace.
- **2026-06-04 feature batch** (all deployed, IN_PROGRESS for owner testing):
  Stripe key-only payments, partial/full **refunds** from the kitchen,
  menu-item **day/time availability** (+ server guard), **duplicate category**,
  GloriaFood-style **List** ordering layout, **Book-a-Table** dedicated screen,
  restaurant **fiscal/billing details** on invoices, **4-minute** kitchen
  countdown + full alert audio, and the kitchen now surfaces **future pending
  reservations** for manual acceptance.

---

## 📋 Lower-priority regression checks (if time allows)
Pull from `LAUNCH-VERIFICATION-CHECKLIST.md`: Pizza Builder, Kitchen Display,
Reservations, Hours (midnight wrap), Promos (13 types × 8 restrictions),
Printing (auto-print on auto-accept), Multi-location/reseller, Payments
(3DS / PayPal / coupon race).

> Report back **PASS** per item, or screenshot + the page/tab on any **FAIL**.
