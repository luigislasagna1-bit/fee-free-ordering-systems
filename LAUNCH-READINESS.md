# Fee Free Ordering — Launch Readiness Plan

**Purpose:** the single source of truth for everything left before going LIVE with real customers and money. Produced 2026‑07‑02 from a 7‑lens pre‑launch audit (security, payments, privacy, DB reliability, emails, marketing/native/reseller, go‑live ops). Read this first, then `AGENTS.md`, `ROADMAP.md`, `TODO.md`, and the memory index (`MEMORY.md`).

> **How to use:** the **10 Blockers** are the gate to launch. Run two tracks in parallel — an **Owner/Ops track** (accounts, keys, DNS, devices — see *Owner Actions*) and a **Code track** (Claude ships the fixes). Never touch a money hot path blind: every payment/promo change lands behind an end‑to‑end order test asserting **previewed total == charged total to the cent**; every user‑facing string ships in **all 38 locales in the same change**; run `npm run preflight` (read bottom‑up) + the all‑38 i18n parity audit before every push; push schema to **both** Neon branches.

---

## Executive summary

Architecturally sound and close to launch. The money‑critical cores are genuinely well‑built: key‑only customer payments with idempotency keys, an atomic append‑only Reward Dollars ledger, race‑safe promo caps, a hardened PayPal webhook, encrypted‑at‑rest credentials, consistent session/ownership scoping, **335 green tests**, and **38‑locale parity at 0 mismatches**. The gap to "live with real money" is **not the happy path** — it's (1) go‑live config that hasn't been flipped, and (2) a cluster of edge‑case money leaks, legal/privacy misstatements, and missing hardening that are individually small but collectively launch‑blocking.

**Top risks:** platform still on the owner's personal/sandbox Stripe account (no restaurant can be billed as "Fee Free Ordering Inc."); email can't reach real recipients (Resend sandbox From); Privacy Policy denies running GA/Pixel while the app ships them, with no consent gate and a broken unsubscribe; cart **preview can diverge from charge** for member‑only/franchise promos (customer charged more than shown); reward store‑credit is **lost on captured‑order cancel/auto‑reject refunds**; **no login rate‑limiting** and the limiter is per‑instance/useless at scale; and prod env vars + Neon PITR backups are unconfirmed. Fix the blockers, run the go‑live runbook end‑to‑end (incl. a real $1 live order + physical print/ring UAT), and this is launchable.

---

## 🔴 BLOCKERS — must fix before real customers/money

1. **Set prod env vars** (`ENCRYPTION_KEY`, `CRON_SECRET`, `RESEND_API_KEY`, Sentry DSNs, `BLOB_READ_WRITE_TOKEN`, `NEXTAUTH_SECRET`, Twilio/Anthropic). `ENCRYPTION_KEY` must be the *exact* value that encrypted existing secrets or every stored Stripe/Resend key fails to decrypt and **card payments silently fail**. All 16 crons **fail‑CLOSED** on unset `CRON_SECRET` (auto‑reject/auto‑complete/dunning/digests/settle all silently stop). *Do:* set them in Vercel prod, curl one cron with the Bearer to confirm 200, trigger one Sentry test error, and add every missing var to `.env.example`. — `.env.example`, `src/app/api/cron/*`, `vercel.json`, `sentry.server.config.ts`
2. **Confirm Neon PROD PITR/backups + stop blind `db push`.** Real‑money system with no verified backups and drift‑based schema (single stale migration, no rollback). *Do:* verify 7–30 day PITR on a paid tier + document restore; manual `pg_dump` before first go‑live and before every schema push; for pending schema changes generate/review the SQL (`migrate diff --script`), confirm **no full‑table rewrite/lock on `Order`/`MenuItem`**, apply to BOTH branches via `push-schema-to-both`. — `prisma/`, `scripts/push-schema-to-both.ts`
3. **Create the Fee Free Ordering Inc. LIVE Stripe account + flip platform to Live.** Platform (subscriptions/add‑ons/settlement/white‑label) is still the owner's personal/sandbox account → Checkout + descriptor read "Luigis Lasagna & Pizzeria". *(Customer ORDER money is key‑only and unaffected.)* *Do:* create the Live account (Canada, no VAT); Superadmin→Stripe set Mode=Live + `pk_live_/sk_live_/whsec_`, Test, Enable; recreate Products/Prices in Live + paste live price IDs into `/superadmin/add-ons` + Sync; register the webhook with the full event set; run a $1 live sub + refund. — `src/lib/stripe.ts`, `src/app/api/superadmin/settings/stripe/route.ts`, `src/app/api/webhooks/stripe/route.ts`
4. **Provision Resend prod sending.** Default From is `onboarding@resend.dev`; the sandbox only delivers to the account owner — **every real transactional email bounces**. *Do:* verify `feefreeordering.com` (SPF+DKIM+DMARC), create a live `re_` key, save it in Superadmin→Email, set From to `support@feefreeordering.com`, send a test to a NON‑Resend inbox. — `src/lib/email.ts:62`, `src/app/superadmin/settings/email/EmailSettingsClient.tsx`
5. **Privacy Policy §7 falsely denies GA/Pixel while the app ships them + no consent gate.** `privacy/page.tsx` says "We do not run Google Analytics, Facebook Pixel…" but `order/[slug]/page.tsx` renders `<TrackingScripts>` (gtag + fbq) whenever a restaurant sets IDs, firing **before consent**. *Do:* rewrite §7 to disclose restaurant‑enabled GA4/Meta Pixel; ship a consent banner on `/order/[slug]` that defers fbq/gtag until opt‑in (at least region‑gated for EU); if the gate can't ship, disable Pixel/GA for EU‑region restaurants at launch. — `src/app/privacy/page.tsx:118-125`, `src/app/order/[slug]/page.tsx:465`, `src/components/order/TrackingScripts.tsx`
6. **One‑click email unsubscribe is non‑functional** (RFC 8058 header → no‑op URL; nothing flips `marketingConsent`/`Prospect.unsubscribedAt`). CAN‑SPAM/CASL violation + Gmail/Yahoo bulk‑sender rule that tanks the shared domain's deliverability. *Do:* build `POST /api/public/unsubscribe` (signed token → set consent false / `unsubscribedAt`), handle the one‑click POST + a human GET page, point the header + footer at it. Don't enable Kickstarter cold outreach until this works. — `src/lib/email.ts:169-174`, `src/lib/kickstarter.ts`, *(missing)* `src/app/api/public/unsubscribe/route.ts`
7. **Cart PREVIEW ≠ CHARGE for member‑only + franchise promos** (customer charged MORE than shown — chargeback/trust magnet). Preview and charge feed the shared engine different inputs (member signal: session vs `CustomerAccount`; franchise: preview omits parent `scope:"brand"` promos). *Do:* extract ONE shared `getActivePromotionsForOrder(restaurant,{channel,includeBrandScope,take:500})` used by both routes + one canonical member definition (pass `idCustomerId` into apply‑promos lifetime/member checks); guard with end‑to‑end tests asserting previewed==charged to the cent for a member‑only cart + a child‑of‑brand cart. — `src/app/api/public/apply-promos/route.ts`, `src/app/api/orders/route.ts:1176-1190,1447-1459`, `src/lib/coupon-ledger.ts` *(already traced in `TODO.md`)*
8. **Reward store‑credit permanently lost on captured‑order cancel/auto‑reject refund.** `refundForOrder()` (returns spent + claws back earned, idempotent — `reward-ledger.ts:211`) exists but has **ZERO callers** anywhere in the codebase (verified: `orders/[id]/route.ts` imports only `redeemForOrder`/`releaseForOrder`/`awardForOrder`; `auto-reject-orders.ts` imports only `releaseForOrder`). Every refund/cancel path calls `releaseForOrder()`, which is a **no‑op once the spend has been `redeemed`** at order completion — so a customer who paid partly in Pizza Bucks and is then refunded loses that credit entirely. Also `refundedAmount` is stamped at full total while Stripe only refunds `total − creditApplied`. *Do:* call `refundForOrder(orderId)` on both captured‑refund paths (manual refund + auto‑reject paid branch), set `refundedAmount = round2(total − creditApplied)`, add `creditApplied` to those selects; verify a complete→cancel→refund restores the wallet exactly once (idempotent under double‑fire). — `src/app/api/orders/[id]/route.ts`, `src/lib/auto-reject-orders.ts`, `src/lib/reward-ledger.ts:211`
9. **No login rate‑limiting + the limiter is per‑instance (useless at scale).** All four login paths do unlimited `bcrypt.compare` (credential stuffing against the people who control money); the in‑memory `Map` limiter doesn't share across Vercel isolates so every rate limit degrades to near‑unlimited. *Do:* stand up a shared store (Upstash Redis / Vercel KV) as the limiter backing (keep the Map as a same‑isolate fast‑path), add IP+email login limiting (~10 fails/5min) + DB‑backed lockout (`User.failedLoginCount` + `lockedUntil`). — `src/lib/rate-limit.ts`, `src/lib/auth.ts`, `src/lib/auth-kitchen.ts`, `src/app/api/customer/login/route.ts`, `src/app/api/restaurants/[slug]/account/login/route.ts`
10. **Live on‑device + live‑money UAT never run.** Kitchen ring/print is hardware‑verified at `kitchen-verified-v2.8` but never against a REAL prod order; the $1 live capture/refund/void loop needs live keys. *Do (owner, after live keys):* real prod order → physical thermal print + screen‑off ring on the tablet → pay $1 live → accept (capture) → refund → reject a second (void); run the `alertAt` scheduled‑ring‑timing check + the save‑a‑card 3DS flow on a real card; confirm the reward wallet restores exactly once. Record PASS/FAIL. — `TESTING-PLAN-2026-07-02.md`

---

## 🟠 HIGH — before broad launch

- **Gift cards not excluded from promo/coupon discounts + payable with reward credit** (free store‑credit minting). Add a `promoExcluded`/`discountExcluded` bool to `MenuItem`+`MenuCategory` (BOTH branches); exclude flagged lines from the discountable base (order‑level %/amount + BOGO/combo) and from the reward‑redeemable total, in BOTH preview + charge; test `minimumOrder`/%‑off/fixed‑cart/free‑item all ignore gift‑card lines. **If any active promo overlaps a gift‑card SKU at go‑live, this is a BLOCKER.**
- **No HTTP security headers** (CSP, X‑Frame‑Options, HSTS, nosniff, Referrer‑Policy, Permissions‑Policy). `next.config.ts` has no `headers()`. Add them (X‑Frame‑Options: DENY, exempt `/embed`; HSTS; nosniff; Referrer‑Policy; Permissions‑Policy) + a CSP report‑only first (pages inject inline script/style → needs nonces/hashes), then enforce. — `next.config.ts`, `src/proxy.ts`
- **Stored XSS: restaurant fields → JSON‑LD `<script>` without escaping `</script>`.** `JSON.stringify` doesn't escape `< > &`; a name of `</script><script>…` executes on the public marketing page + custom domain. Escape `< → <`, `> → >`, `& → &` (+ U+2028/2029) on every `dangerouslySetInnerHTML` JSON‑LD emit. — `src/app/site/[slug]/page.tsx:307,398`, `src/app/[slug]/page.tsx:92-93`, `online-ordering-for/[slug]`, `vs/[slug]`, `site/[slug]/[seoSlug]`
- **ShipDay webhook fails OPEN when `SHIPDAY_WEBHOOK_TOKEN` unset + trusts body to flip order status.** Make the token mandatory in prod (401 if unset); only transition when `shipdayOrderId` matches; constrain allowed transitions (never arbitrary→completed). — `src/app/api/webhooks/shipday/route.ts:40-114`
- **Marketing‑consent checkbox is pre‑ticked (opt‑out)** — invalid under CASL/GDPR. Default UNCHECKED (cleanest: everywhere; at minimum CA+EU). Keep the `marketingConsentAt` timestamp + source as proof. — `OrderingPageClient.tsx:1311`, `orders/route.ts:1640`
- **Cold‑outreach Kickstarter emails have no consent basis + broken opt‑out.** Don't launch cold outreach until the unsubscribe endpoint (Blocker #6) works; add an owner consent attestation for uploaded lists. — `src/lib/kickstarter.ts`
- **Customer order‑confirmation EMAIL omits payment method, store‑credit used, collected, reward earned** (tip currently buried too). Thread `paymentMethod`+`creditApplied`+`rewardEarned` into the `orderConfirmed` payload in `fireOrderNotifications`; render the rows via `buildMoneyBreakdown()`/`money.*`. — `EmailParts.tsx:343-400`, `OrderConfirmation.tsx`, `order-notifications.ts:160-187`
- **Email + SMS labels hardcoded English** (violates the 38‑locale rule). `OrderTotals`/`OrderItemsTable` hardcode Subtotal/Delivery/Tip/Total/FREE/Qty/Note; `buildCustomerSms` builds English literals. Add `money.*`/`receipt.*`/`sms.*` keys ×38, thread the dict + resolved locale, run parity. — `EmailParts.tsx`, `notifications.ts`
- **"24/7 Canadian support — 1‑888‑618‑8765" advertised everywhere but the Twilio line is unconfirmed.** Provision/verify the number + Voice webhook (`/api/twilio/support-call`), set `SUPPORT_FORWARD_TO_NUMBER`/`SUPPORT_LINE_NUMBER`, place a real test call to Luigi's cell — or soften the copy until live.
- **No caching on the hottest read (customer order page = ~10 sequential uncached Neon round‑trips/request).** Add a 30–120s TTL cache (`unstable_cache` by slug, bust on admin write) for restaurant‑by‑slug, the menu tree, and `getEntitlements`; batch independent reads into `Promise.all`. — `src/app/order/[slug]/page.tsx`, `src/lib/entitlements.ts`
- **Android signed AAB (vc21/v3.0) not built + 14‑day Play closed‑testing clock; keystore backup irreversible‑if‑lost.** Rebuild + upload, enroll ≥20 testers, **start the clock now**; back up `feefree-release.jks` + passwords to two off‑machine locations.
- **iOS StarXpand print bridge + ring‑when‑locked need one real‑hardware TestFlight confirmation** before App Store submit. Confirm Codemagic `ff-asc-key` + `ios_signing`, build, install on iPad, verify Star discovery + physical print + screen‑locked ring, then submit.
- **Go‑live data/security hygiene:** rotate `admin@feefreeordering.com` password + Neon DB password (exposed in chat); confirm both Neon branches aligned; owner deletes the two "Test July" restaurants (keep Kaori/Japanese TEST); post‑test purge test orders/reservations/Stripe test cards; confirm `Restaurant.country` is 2‑letter ISO on live stores.

---

## 🟡 MEDIUM / LOW (fast‑follow)

- Cron Bearer compare not constant‑time → `crypto.timingSafeEqual`.
- Stripe webhook dedup is check‑then‑create (not atomic) → mirror PayPal claim‑first (create row before handling, P2002→200). `src/lib/stripe/events.ts`
- `charge.refunded` handler leaves `paymentStatus='paid'` + doesn't release the reward wallet on a dashboard refund → set status/refundedAmount + `refundForOrder` on full refund. `src/lib/stripe/events/charge.ts`
- Order number has NO unique constraint (same‑ms collision) → `@@unique([restaurantId, orderNumber])` + retry, or a daily sequence. `src/lib/utils.ts:113`, `schema.prisma:1289`
- `auto-complete-orders` cron cross‑tenant scans all restaurants with no date floor/take → add bound + paginate. Same for digest crons.
- Missing indexes on `Order.shipdayOrderId` + `Order.paypalCaptureId` (webhook full‑table scans).
- `apply-promos` + order‑page menu `findMany` have no `take` cap → add `take:500` + `isActive:true` slug lookup.
- kitchen/orders poll does an `updateMany` write every ~4s/device, not wrapped in `withDbRetry` → gate to ~1/min per restaurant + cache.
- Public geocode proxy has no rate limit → could get shared Nominatim banned; add IP limit + global token bucket <1 req/s.
- Impersonation cookies set without `secure:true` in prod → mirror `USE_SECURE_PREFIX`. Add an audit log + Privacy §4 disclosure for reseller PII access.
- No self‑service data export/deletion (manual email only) + no Art. 28 DPA/processor terms for EU restaurants → add a DPA section to Terms pre‑launch; self‑service as fast‑follow.
- No Resend bounce/complaint webhook / suppression list → build `/api/webhooks/resend`, persist bounces/complaints, skip suppressed. Needed before scaling the shared domain.
- PasswordReset + VerifyEmail email BODIES + EmailFooter hardcoded English → thread `t()` + keys ×38.
- Reseller white‑label emails ship from the platform domain (no DKIM for reseller custom domains) — document for launch; per‑reseller domain verification post‑launch.
- `track/visit` + `track/event` trust `body.restaurantId` unvalidated → validate against an active Restaurant + move limiter to shared store.
- Reseller SVG logo upload allows script‑bearing SVGs → drop SVG or sanitize server‑side.
- Multi‑Location add‑on: `LocationSwitcher` can't go child→parent + the $49.99/mo add‑on isn't behavior‑gated → mark "coming soon" for launch or fix reverse‑nav + gate child creation.
- **Money‑normalization remaining** (this session shipped kitchen/confirmation/admin/reports‑accounting + status‑aware labels): the EMAIL rows (see High), the "Store credit redeemed"/"Collected" line on the **EOD slip** (golden‑print‑test) + reports dashboard/sales‑summary, a kitchen **tile** "PB"/net badge, the **ShipDay COD `totalOrderCost` + kitchen push body** → `total − creditApplied` (driver over‑collection), the reports polish (missing discount line, Promotions report group by `appliedPromos` not `couponId`, `/admin` dashboard `reportOrderWhere`, Brand tz UTC bug, customer‑detail `totalSpent`), and the ReservationModal deposit hint via `formatCurrency`.
- **Invoice issuer:** build the platform‑issuer entity field usage on subscription + marketplace‑settlement invoices (Superadmin→Company = "Fee Free Ordering Inc.", Canada, no VAT); confirm a direct‑store invoice shows it with no reseller footer.
- EOD/EOM digest hardcodes `noMissedOrders:true`/`noCanceledOrders:true` → compute real counts. `email.ts:1293`
- Reservation "missed" auto‑decline reuses the "Declined" subject → add `reservationConfirmed.subjectMissed` ×38.
- `ZERO_DECIMAL` currency set duplicated across payment‑intent + refund (100x‑refund trap if they drift) → extract one shared `toMinorUnits()` + subset‑assertion test.
- `OrderConfirmation` concatenates 3 translated fragments + force‑lowercases a label → move to one ICU‑templated key per variant.
- Dead code: `buildStatementDescriptorSuffix` (no callers), `EMAIL_ENABLED` (unused), stale superadmin "application fee" copy contradicting the zero‑commission model.
- Customer emails logged cleartext on not‑found/send‑fail paths → redact/hash in a batched logging pass.

---

## 🚀 GO‑LIVE RUNBOOK (ordered)

0. **Pre‑flight (owner machine):** `npm run preflight` (read bottom‑up), vitest green + tsc clean; back up `feefree-release.jks` + passwords off‑machine; manual `pg_dump` of prod Neon.
1. **Env sweep (Vercel prod):** `ENCRYPTION_KEY` (exact prior value — never change), `CRON_SECRET`, `RESEND_API_KEY`, `NEXT_PUBLIC_SENTRY_DSN`+`SENTRY_DSN`, `BLOB_READ_WRITE_TOKEN`, `NEXTAUTH_SECRET`, `SUPPORT_*`, `ANTHROPIC`, `FFOS_TWILIO_*`. Add every missing one to `.env.example`.
2. **DB:** confirm Neon PITR (7–30 days, paid); verify both branches schema‑aligned (`push-schema-to-both`); confirm no pending DDL rewrites `Order`/`MenuItem`.
3. **Security:** rotate `admin@feefreeordering.com` + Neon DB passwords; confirm `SHIPDAY_WEBHOOK_TOKEN` set + fails‑closed; crons fail‑closed with `CRON_SECRET`.
4. **Resend:** verify `feefreeordering.com` (SPF+DKIM+DMARC), save live key in Superadmin→Email, From = `support@feefreeordering.com`, test to a NON‑Resend inbox.
5. **Platform Stripe:** create the Fee Free Ordering Inc. LIVE account; Superadmin→Stripe Mode=Live + `pk_live_/sk_live_/whsec_`, Test, Enable.
6. **Stripe products:** recreate Products/Prices in Live; paste live price IDs into `/superadmin/add-ons`; Sync; register `https://feefreeordering.com/api/webhooks/stripe` (customer.subscription.*, invoice.*, checkout.session.completed, setup_intent.succeeded, account.*, charge.refunded, charge.dispute.created); confirm `getWebhookSecrets()` returns live.
7. **Issuer:** confirm Superadmin→Company issuer = Fee Free Ordering Inc.; verify a direct‑store invoice (no reseller footer).
8. **Per‑restaurant:** verify each live restaurant's OWN Stripe keys are LIVE (customer orders use these, not the platform account); `Restaurant.country` = 2‑letter ISO.
9. **Support line:** provision/verify 1‑888‑618‑8765 → Voice webhook → real test call to Luigi's cell (or soften the "24/7" copy).
10. **Native:** rebuild signed Android AAB (vc21/v3.0) → Play closed testing → ≥20 testers, start the 14‑day clock; Codemagic `ios-kitchen` → iPad print + screen‑locked ring → submit App Store listing.
11. **Live UAT** (fully‑configured restaurant): real order → physical print + screen‑off ring → $1 live capture → refund → reject a second (void); `alertAt` ring timing + save‑a‑card 3DS on a real card; wallet restored exactly once. Record PASS/FAIL.
12. **Monitoring:** trigger one Sentry test error; curl one cron with the Bearer (200); set alerts on payment + order‑route errors.
13. **Owner data hygiene:** send "please verify" emails for IN_TESTING reseller reports; delete the two "Test July" restaurants; purge test orders/reservations/Stripe test cards.
14. **Rollback plan:** keep the previous Vercel deploy pinned for instant promote‑back; keep sandbox Stripe keys to revert Mode=Test; **never change `ENCRYPTION_KEY`**.

---

## 👤 OWNER‑ONLY ACTIONS (Luigi)

- Create the **Fee Free Ordering Inc. LIVE Stripe account** (Canada, no VAT) + paste keys in Superadmin→Stripe; recreate/Sync Products; register the live webhook.
- Verify **`feefreeordering.com` in Resend** (SPF/DKIM/DMARC), create the live key, save it, confirm delivery to a non‑Resend inbox.
- Set all **prod env vars** in Vercel (`ENCRYPTION_KEY` exact value, `CRON_SECRET`, Resend, Sentry, Blob, Twilio, Anthropic).
- Confirm **Neon prod PITR** + take the manual `pg_dump` before go‑live.
- **Rotate** the `admin@feefreeordering.com` password + Neon DB password (both were exposed in chat).
- Provision/verify **1‑888‑618‑8765** + wire its Voice webhook + place a real test call — or soften the "24/7 support" copy.
- Rebuild + upload the **signed Android AAB**, enroll ≥20 Play testers, start the 14‑day clock; back up the keystore + passwords to two secure off‑machine locations.
- Confirm Codemagic **`ff-asc-key` + `ios_signing`**, run the iOS build, do the on‑device iPad print + screen‑locked ring check.
- Run the **live on‑device + $1 live‑money UAT** (order → print → ring → capture → refund → void) on real hardware.
- **Send the "please verify" emails** for the IN_TESTING reseller reports from the Reseller Reports UI + **delete the two "Test July" restaurants**.
- Run the **reseller UAT** end‑to‑end on prod with a **non‑owned** reseller account (not "Sam's" — that's your own and de‑brands on purpose): apply→approve→ref‑attributed signup→commission→payout request→mark‑paid→email.

---

## ✅ ALREADY SOLID (do not re‑audit)

- **Customer order payments** key‑only (100% to each restaurant's Stripe), authorize‑then‑capture, all Stripe calls require idempotency keys (`pi_create_<orderId>`, `refund_<id>_<cents>`) — double‑clicks can't double‑charge; the personal‑descriptor issue does NOT touch customer orders. `public/payment-intent` reconciles the client amount vs the server‑priced order.
- **Reward Dollars ledger** atomic + append‑only + concurrency‑safe (`UPDATE…WHERE balance>=applied`, `@@unique(accountId,orderId,reason)`, `$transaction`, clamps ≥0, never throws on the hot path; release‑on‑reject/auto‑reject/abandoned wired). **Promo usage cap** race‑safe (atomic claim + idempotent give‑back).
- **PayPal webhook** is gold‑standard (claim‑first idempotency + re‑fetch live status). **Stripe webhook** enforces signature. 3DS/SCA handled without premature kitchen release; abandoned‑payment sweeper reclaims slots; dunning has grace + nudges; marketplace PAYG settlement idempotent with CRA province tax.
- **Session/ownership** solid (single `getSessionUser()` with the admin‑vs‑kitchen tie‑break fix; `where:{id,restaurantId}` writes; `restaurantId` always server‑derived; superadmin role‑gated; impersonation re‑validates; cross‑reseller PII isolation).
- **Secrets** encrypted at rest (AES‑256‑GCM); no raw SQL (all parameterized Prisma); nothing logs passwords/keys/cards; bcrypt + anti‑enumeration + burned reset tokens; Sentry PII‑off. `src/proxy.ts` applies the mandatory no‑store redirect headers + same‑slug rewrite guard.
- **DB:** `Order` well‑indexed for its hot patterns; alarm‑state ring poll exemplary (take‑bounded, `withDbRetry`, `after()` defer); Neon HTTP adapter avoids pool exhaustion; order‑create uses compensating rollbacks.
- **i18n** fully clean (all 38 locales, 5231 keys, 0 mismatches); `formatCurrency` everywhere; type‑exhaustive notification dispatcher.
- **Health:** 335 vitest tests green, tsc clean. Marketing site (+ real screenshots), robots/sitemap, JSON‑LD SSG pages built. Superadmin Company (issuer) + Stripe Live UI + reseller payout infra complete. Legal pages (Privacy/Terms/Refund/Account‑Deletion) exist + wired. Native config sound. Both money divergences already traced in `TODO.md`.

---

## Reference — this session's outstanding items (see `TODO.md` for full detail)

- **Reseller reports:** 13/14 IN_TESTING (awaiting Fabrizio's confirm + owner sending verify emails); **time‑slot ranges (cmqqxerxs)** still to BUILD; kitchen‑tile "choose which fields show" feature; coupon per‑service/combinable toggles.
- **Money normalization:** foundation + kitchen/confirmation/admin/reports‑accounting + status‑aware labels shipped this session; emails/EOD/tile‑badge/ShipDay+push/reports‑polish remain (see Medium/Low).
- **First 5 code items for the new session (in order):** (1) Blocker #7 preview==charge, (2) Blocker #8 reward refund paths, (3) High gift‑card exclusion, (4) Blocker #9 rate‑limit store + login limiting, (5) Blockers #5/#6 privacy §7 + consent gate + unsubscribe endpoint.
