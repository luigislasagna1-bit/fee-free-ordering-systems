# Testing plan — 2026-07-02 session

Everything below was shipped to prod this session and is auto-deploying. Ordered
**money / legal / regression first**. Legend for **where**:
`YOU-prod` = do it on the live site · `CLAUDE-local` = assistant can drive on a
local dev store · `DEVICE` = physical kitchen tablet/phone · `STRIPE-live` = real card.

## ✅ Already de-risked (no action)
- **Invoice can't 500 from the new columns** — the schema reached BOTH Neon branches and the seed upsert succeeded on prod, so `companyLegalName` etc. exist live (the #1 crash risk is closed).
- i18n parity **38/38** on every new key; `tsc` clean on every change; `composeStreetLine` unit-tested 10/10.

---

## 🔴 Round 1 — Invoice (LIVE fiscal document) · YOU-prod · ~5 min
1. **Non-reseller invoice (the common case).** As an admin of a directly-signed-up store, open a paid invoice from `/admin/billing` → Download/Print. **Pass:** loads (no error), issuer = **Fee Free Ordering Inc.**, support email shown, **no** reseller logo, **no** "Your local partner" line; bill-to + totals unchanged.
2. **Reseller invoice — the issuer FLIP.** Open an invoice for a restaurant signed up by an approved reseller that has a logo/imprint + company name (+ VAT). **Pass:** reseller **logo leads the header**, named issuer below = **Fee Free Ordering Inc.**, footer reads **"Your local partner: {reseller} · VAT {vat}"**.
3. **Superadmin company settings.** `/superadmin/settings/company` → confirm **Fee Free Ordering Inc.** is populated; optionally add the legal address (no tax number — Canada). Save → re-open an invoice to confirm it reflects the change.

## 🔴 Round 2 — Coupon + special-hours MONEY · CLAUDE-local (or YOU-prod)
4. **Preview total == charged total.** Place test orders where (a) a coupon applies during a special-hours window, (b) a bigger auto-deal beats the coupon, (c) a below-minimum cart. **Pass:** amount charged == cart total to the cent in all three.
5. **Empty-cart coupon regression.** With code `SAVE10` (10% off, min $20): empty cart accepts with no min-order error; under $20 = no discount; at/over $20 = discount applied + charged; invalid/expired/usage-exhausted still reject. **Pass:** only the min-order-on-empty branch is loosened; all other rejections still fire.
6. **Guest assigned-code.** Assign a personal code to `ownerA@example.com`. As a logged-out guest: wrong email → refused message; matching email → discount applies **and persists on the placed order**; the received order (kitchen + admin detail) shows the code. **Pass:** all three.

## 🟠 Round 3 — Save-a-card · STRIPE-live · YOU-prod
7. **First save.** `/admin/billing` → "Payment method" → **Save a payment method** → complete 3-D Secure on a real card → returns to Billing with a success note + the card shown (brand ••••last4 + expiry). Works with **no** paid service active.
8. **Change card.** Click **Change card** → save a different card → the shown card updates. (Confirm any active marketplace/PAYG auto-charge still works.)

## 🟠 Round 4 — Hours / address / reservation / geocode
9. **Special OPEN hours (YOU-prod).** Set delivery special hours 10:00–20:00 for today. Customer → Delivery → checkout offers slots from **10:00** + the "🕒 Delivery opens TODAY at 10:00 (special hours)" message.
10. **Normal-day regression (YOU-prod).** On a day with NO special rule, confirm checkout hours behave exactly as before.
11. **Address order (YOU-prod).** Italian store: pick an address → shows **"Via … 13"** (number after). North-American store → **"13 Main St"** (number first).
12. **Reservation screen (DEVICE).** Open a reservation in the Kitchen Order App → date reads in the kitchen's language ("sabato 27 giugno 2026"), phone dials on tap, email shows/opens mail.
13. **Auto-geocode (YOU-prod).** `/admin/profile` → type/edit the address → the pin drops automatically (no button). Reload an existing store → its saved pin does **not** move.
14. **⚠️ alertAt ring timing (DEVICE).** Place a scheduled order during a special-hours window and confirm the kitchen ring fires at the right time (flag if it rings off the general next-open instead).

---

## 👀 Top regressions to watch (call out immediately if seen)
- Non-reseller invoice must render identically to before (platform issuer, no footer).
- Cart preview total must equal the charged amount everywhere.
- Normal (non-special) days must behave byte-for-byte as before.
- Kitchen ring / print / poll (hardware-verified v2.8) must be unaffected.
- Existing map pins must not move on `/admin/profile` load.
- North-American / UK delivery addresses must still read number-first.

## ✅ Owner-only actions
- Send the "please verify" **emails to Fabrizio** from the Reseller Reports UI (comments + in-app notifications are already posted).
- **Delete the two "Test July" restaurants** (Super Admin → red Delete).
- **Message affected resellers** that invoices now name Fee Free Ordering Inc. as issuer (their restaurants received the old style before) — intended, more correct.
- **Accountant sign-off**: showing Fee Free with no tax number + (later) any EU reverse-charge wording.
- Spot-check `Restaurant.country` is a **2-letter ISO code** on a few live (esp. EU) stores.
- Clean up any test restaurants / orders / reservations / Stripe test cards afterward.
