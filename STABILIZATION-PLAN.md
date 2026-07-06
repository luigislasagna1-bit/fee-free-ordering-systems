# FeeFreeOrdering — Production Stabilization Plan

**Produced 2026‑07‑06** from an 11‑domain code audit covering the 15 core flows (signup/login, menu, ordering, checkout, Stripe payments, order storage, KDS, printing, emails/SMS, promos, admin settings, reseller/admin access, error handling, security, monitoring). Builds on `LAUNCH-READINESS.md` (most of its 10 blockers are already CODE‑SHIPPED) — this plan is the **production-stability** layer: everything that must be true for real restaurants to take real payments reliably.

**Scope:** stability, security, payments, order accuracy, printing. **No new features.**

## Totals
**53 findings — 3 Critical · 10 High · 22 Medium · 18 Low.** The 3 Criticals were re‑verified by re‑reading the actual code (not taken on the auditors' word).

## ✅ Fix log (2026‑07‑06)
Shipped this session, in tier order:
- **C3** capture‑on‑authorize for auto‑accepted card/PayPal (`215ce14a`) — ⚠️ live $1 test pending.
- **C1 + C2** modifier PATCH/POST ownership checks + **H1** kitchen login (emailLower) + **H5** reservation stale‑transition guard (`8b69d204`).
- **H9** money‑path Sentry alerting (`reportError`) + **H10** seven crons fail‑closed (`requireCronAuth`) (`1abf3bb0`).
- **H3** out‑of‑zone delivery rejected server‑side (this commit).

**Remaining:** H2 (order‑page caching), H4 (stuck‑card recovery), H6 (native‑print outage window), H7 (phone‑only SMS), H8 (silent email‑transport failure) + the Medium/Low tiers.

## How to read this
Tiers = when it must be fixed:
- 🔴 **Critical** — before **any** real restaurant touches it.
- 🟠 **High** — before **paid** clients / general availability.
- 🟡 **Medium** — during / right after beta.
- 🟢 **Low** — future hardening.

Each Critical/High has: **What · Why · Real‑ops impact · Impact areas · Safest fix · How to test · Regression risk.** Medium/Low are condensed (full per‑issue detail is archived in the audit run `waq9z8lu6`).

---

## ✅ GO / NO‑GO GATE

**Do NOT let a real restaurant take real payments until ALL of these are true:**

- [ ] **C1 + C2** — modifier‑group PATCH/POST ownership checks shipped (cross‑tenant price tampering closed).
- [ ] **C3** — auto‑accepted card/PayPal orders are actually **captured** (money collected), OR auto‑accept is disabled for online‑payment orders as an interim.
- [ ] **H4 + H6** — every authorized card order reliably reaches the kitchen and is either captured or voided (no dangling holds, no lost tickets).
- [ ] **H1** — kitchen login works with mixed‑case email (staff can actually sign into the tablet).
- [ ] Owner/config (from LAUNCH‑READINESS): **live Stripe account** (Fee Free Ordering / Luigi's Lasagna Inc.), **Resend prod sending** verified, **`CRON_SECRET` + `ENCRYPTION_KEY` + Upstash** set in prod, **live $1 order + physical print/ring UAT** passed.

**Before paid clients:** all 🟠 High cleared + Sentry alerting live (H9) + out‑of‑zone server guard (H3).

---

## 🔴 CRITICAL — before any real restaurant

### C1 — IDOR: modifier‑group **PATCH** has no ownership check (cross‑tenant price tampering)
- **Impact:** security · payments · order‑accuracy · privacy — **VERIFIED**
- **What:** `PATCH /api/menu/modifiers/[id]` (`route.ts:48`) does `modifierGroup.update({ where:{ id } })` — and the option sync + library propagation below — with **no restaurant scoping**. Only guard is "is an authenticated admin". Any restaurant admin can rewrite **another restaurant's** modifier group (name, required, min/max, and option `priceAdjustment`) by supplying its id.
- **Why:** The `DELETE` handler in the *same file* (`:117‑124`) and `GET` (`:14‑20`) both check ownership — PATCH was simply never given the guard.
- **Real‑ops:** Customer charges come from the stored `priceAdjustment` (`orders/route.ts`), so an edited price becomes a real over/undercharge on the **victim's** Stripe account. Not reachable through the normal UI (client only PATCHes its own ids), so it needs a crafted request + a leaked cross‑tenant id — but ids leak via shared brand menus, screenshots, support tickets; id non‑enumerability is not access control.
- **Safest fix:** Copy the DELETE handler's ownership check to the **top** of PATCH (and the option sync): fetch the group, authorize if `restaurantId === caller` OR its `menuItemId`/`categoryId` belongs to the caller, else `404`. Additive early‑return — cannot break the legitimate same‑restaurant path (must accept item‑scoped groups where `restaurantId` is null).
- **How to test:** As admin A, PATCH restaurant B's group id → must `404` and B unchanged; A can still edit its own groups; library option propagation still runs for A's own library groups.
- **Regression risk:** Near‑zero (early 404 for non‑owned ids). Must use the OR logic (item‑scoped groups have `restaurantId:null`) — a naive `where:{id,restaurantId}` would break pizza/item groups.

### C2 — IDOR: modifier‑group **POST** trusts body `menuItemId`/`variantId`/`categoryId`
- **Impact:** security · payments · order‑accuracy — **VERIFIED**
- **What:** `POST /api/menu/modifiers` (`route.ts:38‑56`) creates a group using `menuItemId`/`variantId`/`categoryId` straight from the body with no ownership check; when `menuItemId` is set, `restaurantId` is deliberately `null`, so the group is scoped entirely to the **victim's** item. Attacker‑chosen option prices are then created on it.
- **Why:** Handler comments "item‑scoped vs library" but never validates the target is owned. `variantId`/`categoryId` are honored though the UI never sends them, widening the surface.
- **Real‑ops:** Attach a `required:true` group with a high‑priced option to restaurant B's item/category → every B customer is forced to pick it and overcharged on B's Stripe. Same crafted‑request + leaked‑id reachability as C1.
- **Safest fix:** When `menuItemId`/`variantId`/`categoryId` is supplied, re‑fetch and require ownership (`menuItem.findFirst({where:{id,restaurantId}})`, etc.) before create; 404 if not owned. Pure library group (none supplied) keeps `restaurantId:restaurantId`. Also validate option `priceAdjustment` is a finite number ≥ 0. Additive.
- **How to test:** As A, POST with B's `menuItemId` → `404`, nothing created; A can still create a library group + an item‑scoped group on its own item; pizza‑builder attach still works.
- **Regression risk:** Low‑medium. Don't break the `/modifiers/attach` pizza path (already ownership‑checked) or normal item‑scoped create (findFirst on your own item returns the row).

### C3 — Auto‑accepted **card/PayPal** orders are never **captured** — food is cooked, money never collected
- **✅ FIXED 2026‑07‑06** (capture‑on‑authorize, no interim toggle — Luigi's call). Stripe webhook (`amount_capturable_updated`) + PayPal authorize endpoint now capture immediately when `status==="accepted"`; shared idempotency predicates (`capture-idempotency.ts`, 11 unit tests) guard replays; a capture failure leaves the order `authorized` for retry without blocking the kitchen. **Live $1 Stripe/PayPal test still required once live keys are in** (unit + build verified only).
- **Impact:** payments · data‑loss · order‑accuracy — **VERIFIED**
- **What:** Under authorize‑then‑capture (manual capture), funds move only when the kitchen clicks Accept → PATCH `orders/[id]` calls `capturePayment`/`capturePaypalAuthorization` (the **only** callers, grep‑confirmed). But with `autoAcceptOrders=true` (or reservation auto‑confirm), the order is created with `status="accepted"` at create time (`orders/route.ts:1830`, no reference to `paymentMethod`), so the PATCH accept path — and thus capture — **never runs**. The webhook (`payment-intent.ts`) sets `paymentStatus="authorized"` and releases to the kitchen (`fireOrderNotifications`) but does not capture. Auto‑complete cron flips to `completed` + redeems rewards but doesn't capture either. The order sits `authorized` forever; the Stripe hold auto‑expires (~7 days) unpaid.
- **Why:** Capture was wired exclusively to the manual kitchen‑accept transition; the auto‑accept path short‑circuits status without performing/scheduling capture. `autoAcceptOrders` has no guard against combining with online payment.
- **Real‑ops:** A common config — GloriaFood‑style shops turn on auto‑accept. Any such restaurant that also takes card/PayPal loses **100% of the money on every online order**, silently, until they reconcile Stripe payouts vs orders.
- **Safest fix:** Capture at **authorize time** for already‑accepted orders: in `handlePaymentIntentEvent` (on `amount_capturable_updated`) and the PayPal authorize endpoint, if `order.status==="accepted"` and transitioning to authorized, call `capturePayment`/`capturePaypalAuthorization` (reuse the existing `isAlreadyCaptured` catch for idempotency vs webhook replays), then set `paymentStatus="paid"`. Belt‑and‑suspenders: a reconcile cron that captures `status in (accepted,preparing,ready,completed) AND paymentMethod in (card,paypal) AND paymentStatus="authorized" AND acceptedAt older than N min`, before the ~7‑day expiry. **Interim mitigation (ship first, 1 line):** force auto‑accept OFF for card/paypal orders (create them `pending` so the kitchen Accept captures) until capture‑on‑authorize ships.
- **How to test:** Test restaurant `autoAcceptOrders=true` + live keys → place a card order → after `amount_capturable_updated`, Stripe PI is `succeeded` (captured), `Order.paymentStatus="paid"`; repeat PayPal; run through auto‑complete → no double‑capture. Regression: with auto‑accept **off**, capture still happens only on kitchen Accept.
- **Regression risk:** Changes *when* money moves for auto‑accept shops (immediately vs on‑accept) — correct for auto‑accept. Capture must be idempotent (reuse `isAlreadyCaptured`); gate strictly on `status==="accepted"` so non‑auto orders still capture on Accept.

---

## 🟠 HIGH — before paid clients

### H1 — Kitchen login is **case‑sensitive** on email — staff locked out of the tablet
- **Impact:** availability · printing. **What/Why:** `auth-kitchen.ts:71` looks up `where:{ email: credentials.email }` with the RAW value; every other path lowercases, so `User.email` is always lowercase. A tablet keyboard auto‑capitalizes the first letter → `Luigi@…` → `null` → "invalid credentials" though the password is right (also burns the per‑IP kitchen limiter). **Fix:** use the already‑computed `emailLower` (mirror `auth.ts:154`). **Test:** mixed‑case kitchen login now succeeds; wrong password still 401s; admin login unchanged. **Regression:** near‑zero.

### H2 — Order page hot path does ~15 **sequential uncached** Neon round‑trips per request
- **Impact:** availability · order‑accuracy (scale). **What/Why:** `order/[slug]/page.tsx` awaits ~13‑15 serial Neon queries (restaurant, hours, zones, promos, resolve/dead‑promo, reward rules, menu tree, maps key, shipday, customer, order count); only one `Promise.all`; nothing cached. Latency = SUM of round‑trips; ~15× Neon load at 1k concurrent. **Fix:** `unstable_cache` (30‑120s TTL, busted on admin write) for restaurant‑by‑slug + menu tree + entitlements; batch independent awaits into `Promise.all`. Pure latency work, semantics unchanged. **Test:** timing logs before/after; 2nd load hits cache; admin edit reflects within TTL; load‑test p95. **Regression:** stale menu/price if TTL too long or bust missing — short TTL + explicit `revalidateTag` on menu/settings/promo writes.

### H3 — Out‑of‑zone delivery orders are **not rejected server‑side** (client‑only gate)
- **Impact:** order‑accuracy · payments · availability. **What/Why:** `acceptOutsideZoneOrders=false` is enforced only in the browser (`OrderingPageClient` placeOrder); `POST /api/orders` never reads it — it sets `outsideDeliveryZone=true` and charges anyway (base fee if geocode null). **Fix:** in the orders route after zone resolution, if `delivery && zones>0 && !acceptOutsideZoneOrders && outsideDeliveryZone` → `400 delivery_out_of_area`. Reject only on a POSITIVE out‑of‑zone (treat geocode‑null as accept‑at‑base) so a Nominatim outage doesn't block all delivery. **Test:** tampered/stale client order to a far address → 400; flip flag → accepted at outer‑zone fee; in‑zone still works. **Regression:** don't treat geocode‑null as out‑of‑area; pickup/dine‑in unaffected.

### H4 — Key‑only card order can **authorize but never reach the kitchen**; abandoned‑sweep cancels **without voiding** the hold
- **Impact:** availability · order‑accuracy · payments. **What/Why:** for key‑only Stripe, the only release point is a single confirmation‑page server render (`confirmation/page.tsx:37 → verifyAndReleaseOrderPayment`). If the post‑payment redirect never loads (tab closed, network drop, 3DS in a backgrounded PWA), the card is **authorized** but the order stays `pending`/no kitchen fire; the status poll GET doesn't re‑verify; no cron reconciles; 30 min later the abandoned‑sweep cancels it **without** `voidPayment`, leaving a hold on the customer's card ~7 days. **Fix:** (1) call `verifyAndReleaseOrderPayment` inside public `GET /api/orders/[id]` when `card && paymentStatus in (pending,requires_action,processing)` — the status poll self‑heals (already idempotent, early‑returns for settled). (2) In the abandoned‑sweep, before cancelling a card order with a `paymentIntentId`, verify/release or `voidPayment` so no hold dangles. **Test:** kill the tab after Stripe redirect → order pending → open status page → poll flips to authorized + kitchen fires; force abandoned+authorized → Stripe shows canceled (voided), not an open hold. **Regression:** bound the verify to pending‑ish states (settled orders cost nothing); void‑before‑cancel is best‑effort (guard so an expired‑void still lets cancel proceed).

### H5 — Reservation status route has **no stale‑transition guard** — slept tablet auto‑declines confirmed bookings
- **Impact:** order‑accuracy · availability · data‑loss. **What/Why:** the reservation half of the task #37 stale‑device race. `PATCH /api/admin/reservations/[id]` writes `status` unconditionally; the order route got the `rejected`‑only‑from‑`pending` 409 guard but reservations did not. A woken tablet re‑runs its 1‑s auto‑decline against a stale snapshot and PATCHes `rejected` on an already‑`confirmed` booking → server overwrites + emails the guest "missed". **Fix:** mirror the order guard: same‑status no‑op; `rejected` from non‑`pending` → 409; optionally `updateMany({where:{id,status:'pending'}})` claim for `autoMissed`. Manual staff cancel of a confirmed booking must still work — gate only the `autoMissed`/rejected‑from‑non‑pending case. **Test:** accept a reservation, fire a stale auto‑decline → 409, stays confirmed, no email; genuinely‑pending still auto‑declines. **Regression:** low — don't gate the whole update on pending (would block confirmed→cancelled/seated).

### H6 — Native background‑print **silently drops** the ticket after a >15‑min printer outage while the app is closed
- **Impact:** printing · order‑accuracy · availability. **What/Why:** when the app is closed, only `KitchenKeepAliveService` prints, discovering jobs from the alarm‑state `print` array bounded to `PRINT_LOOKBACK_MS = 15 min` (`alarm-state/route.ts:35`). A printer offline >15 min (asleep, paper out, LAN blip) drops the order off the list forever; the 6‑h web catch‑up can't help (app closed). Ticket lost, no paper trace, order still `accepted` in DB. **Fix:** decouple the background‑print retry ceiling from the fresh‑deploy guard — bound by `acceptedAt`/deploy epoch and keep accepted+unprinted orders in the `print` list for ~6 h (match web catch‑up), OR raise `PRINT_LOOKBACK_MS` to ~60 min, plus an in‑app "N tickets failed to print" banner. **Test:** device build, app closed, printer OFF, wait >15 min, power on → ticket must print (after fix); fresh deploy must NOT reprint history. **Regression:** widening the window risks reprinting deploy‑era tickets — gate on a deploy epoch / `acceptedAt` recency + keep the atomic `kitchenPrintedAt` claim.

### H7 — **Phone‑only** customers get NO confirmation — SMS is unreachable behind the email early‑return
- **Impact:** order‑accuracy · availability. **What/Why:** `notifyCustomer()` returns early on `!customerEmail` (`notifications.ts:519`), before the switch that calls `fireSms()`. But email is optional and phone is mandatory, so a name+phone customer gets neither email nor SMS — even for a restaurant paying for the `customer_sms` add‑on. **Fix:** don't hard‑return on missing email; guard the *email* send on `customerEmail` while `fireSms()` still runs when `customerPhone` + entitlement present; report `sent=false` only when neither fired. **Test:** order with phone + no email on an SMS‑entitled restaurant → SMS on placement + accept/ready/reject; email‑only and both still work; add a unit test. **Regression:** low if email stays guarded; keep one `fireSms()` per case (no double‑send).

### H8 — Unconfigured/undecryptable email transport **silently "succeeds"** — every email vanishes with no signal
- **Impact:** availability · order‑accuracy. **What/Why:** `email.ts:164‑167` returns `{success:true}` + a `console.log` when the Resend client is null (wrong/rotated `ENCRYPTION_KEY` → decrypt fails → `apiKey` null, AND `RESEND_API_KEY` unset). No Sentry, no prod/dev distinction — so a misconfig silently drops **every** customer receipt, staff email, password reset, reservation email in prod, with no dashboard signal. **Fix:** when client is null AND prod, `Sentry.captureException` + `console.error` once per transport‑load and return `{success:false}`; keep the quiet placeholder only in dev; also Sentry‑capture the decrypt failure. **Test:** staging with no key → Sentry error fires + error‑level log; valid key → normal send; unit‑test the success flag flip. **Regression:** low, observability + a prod‑only return‑code flip (guard strictly on prod).

### H9 — Caught server errors on **money paths never reach Sentry** — no proactive alerting
- **Impact:** availability · payments · data‑loss. **What/Why:** Sentry only sees errors that are THROWN OUT of a handler (`onRequestError`) or explicitly `captureException`'d — but ZERO route handlers call `captureException`, and nearly every route (incl. orders POST, Stripe/PayPal webhooks) does `catch → console.error → return 500`, which bypasses `onRequestError`. So a persistent webhook bug 500s every Stripe retry for ~3 days with no alert; an order‑create 500 loses the sale silently. **Fix:** a tiny `reportError(e, ctx)` → `Sentry.captureException` dropped into the top‑level catch of orders POST, Stripe/PayPal webhooks, cron sweeps (IDs only in `ctx`, never PII). Purely additive — one line per catch, never alters the response. Then a Sentry alert rule on those routes. **Test:** force an order‑create/webhook failure with the DSN set → event appears with order context; customer still gets the same 500. **Regression:** minimal; pass only `orderId`/`restaurantId`/`event.id` (Sentry `sendDefaultPii:false`).

### H10 — Seven digest/utility crons **fail‑OPEN** (run for anonymous callers) when `CRON_SECRET` is unset
- **Impact:** security · availability · privacy. **What/Why:** `dunning`, `daily-digest`, `monthly-digest`, `eod-digest-closing`, `commissions`, `cleanup-sandboxes`, `import-menu-images` use `if (cronSecret) { check }` — a **missing** secret skips the check entirely and runs for any caller. (The dual‑auth crons correctly fail‑closed to a superadmin session; LAUNCH‑READINESS's "all crons fail‑closed" is true only for those.) If `CRON_SECRET` is ever unset/typo'd in prod, anyone can trigger owner dunning emails/SMS, digests, commission promotion, sandbox cleanup. **Fix:** convert the seven to fail‑closed (401 when `CRON_SECRET` unset in prod, or fall back to superadmin session like the dual‑auth crons); keep a `NODE_ENV!=='production'` dev escape hatch. **Test:** unset `CRON_SECRET` → each path 401s (currently 200+executes); set it → correct Bearer 200, wrong 401. **Regression:** none if prod sets the secret (Vercel crons send the Bearer).

---

## 🟡 MEDIUM — during / right after beta

- **M1 — Admin write routes gate on `restaurantId` presence, not role** (kitchen_staff could write reward‑rules/fees/customer‑notes). *security/privacy.* Add an `isRestaurantAdmin`/`accessRoleAtLeast('manager')` gate; low blast radius today (no self‑serve kitchen_staff provisioning). `reward-rules/[id]`, `service-fees/[id]`, `customers/[id]`.
- **M2 — Impersonation + `active_location` cookies set without `secure` in prod.** *security.* Derive `secure` from `USE_SECURE_PREFIX`/prod like `auth.ts`. (LAUNCH‑READINESS Med — still open.)
- **M3 — Editing item variants delete+recreates ALL variant rows every PATCH** → orphans variant‑scoped modifier groups + can FK‑fail the save. *data‑loss/accuracy.* Diff variants (update in place) instead of nuke‑and‑recreate. `menu/items/[id]`.
- **M4 — Server doesn't enforce modifier `required`/`minSelect`/`maxSelect`** — only that each option id is valid. *accuracy.* Validate group selection counts in the orders route.
- **M5 — Restored stale cart shows old prices; on a cash order the customer sees the higher server total only AFTER placing.** *accuracy/payments.* Re‑price the cart on load / show a "prices updated" diff.
- **M6 — Delivery fee & min‑order preview ≠ charge** (cart uses Nominatim geocode; charge uses the Google map pin). *accuracy/payments.* Use one geocode source for both, or re‑resolve the fee server‑side from the same coords the charge uses.
- **M7 — Server geocode failure silently charges base delivery fee + bypasses the zone minimum‑order.** *payments/accuracy.* On geocode‑null for a zoned restaurant, fail the fee resolution loudly (or hold) rather than default to base.
- **M8 — Stripe webhook idempotency is check‑then‑create, not atomic claim‑first** — concurrent redelivery can run a handler twice. *payments/data‑loss.* Mirror PayPal: create the event row first (unique id), P2002→200. (LAUNCH‑READINESS Med.)
- **M9 — `charge.refunded` webhook leaves `paymentStatus='paid'` + doesn't restore the reward wallet on a Stripe‑dashboard refund.** *payments/data‑loss.* Set status/refundedAmount + call `refundForOrder` on full refund. (LAUNCH‑READINESS Med; see also M16.)
- **M10 — `generateOrderNumber()` has no uniqueness guarantee + no DB unique constraint** — same‑ms collision → two live orders share a human number. *accuracy.* `@@unique([restaurantId, orderNumber])` + retry, or a daily sequence. (both Neon branches.)
- **M11 — Kitchen orders poll (4s/device) not wrapped in `withDbRetry`** — a transient Neon drop 500s the poll and can stall the ring/feed a cycle. *availability/accuracy.* Wrap the poll read in `withDbRetry`.
- **M12 — No printer configured = auto‑print is a silent no‑op** — staff get no "tickets aren't printing" warning. *printing/availability.* Surface a persistent "printer not set up / not reachable" banner in the KDS.
- **M13 — Digest emails advertise a one‑click unsubscribe that does nothing** (RFC 8058 header → login‑gated admin page). *availability/privacy.* Point the digest header/footer at the signed `/api/public/unsubscribe` (already built for marketing).
- **M14 — No Resend bounce/complaint webhook / suppression list** — bad addresses keep getting retried on the shared domain (hurts deliverability). *availability/privacy.* Build `/api/webhooks/resend`, persist bounces/complaints, skip suppressed.
- **M15 — All transactional emails are HTML‑only (no `text/plain` part)** — spam‑filter + accessibility hit. *availability.* Add a plain‑text alternative in the renderer.
- **M16 — Dashboard/webhook Stripe refund doesn't restore reward wallet / claw back earned credit.** *payments/data‑loss.* (Overlaps M9 — same `charge.refunded` fix should cover both spend‑restore and earn‑clawback.)
- **M17 — Reward credit is EARNED (minted) on an order fully refunded before it completed.** *payments/data‑loss.* Don't award (or claw back) earned reward when the order is refunded pre‑completion.
- **M18 — Server DSN read from `SENTRY_DSN` while client reads `NEXT_PUBLIC_SENTRY_DSN`** — an env‑sweep footgun that can silence ALL server capture. *availability.* Align the env var names / document both. (Compounds H9.)
- **M19 — Cron Bearer + ShipDay token compares are non‑constant‑time.** *security.* Use `crypto.timingSafeEqual`. (LAUNCH‑READINESS Med.)
- **M20 — No health‑check / synthetic uptime endpoint** for DB + critical deps. *availability.* Add `/api/health` (DB ping) + wire an uptime monitor.
- **M21 — `withDbRetry` protects only the kitchen polls, not the customer order page or checkout** — one transient Neon drop 500s a real customer. *availability/accuracy.* Extend `withDbRetry` to the order‑page load + orders POST core reads.
- **M22 — ShipDay webhook still fails OPEN (accepts any caller) when `SHIPDAY_WEBHOOK_TOKEN` unset.** *security/accuracy.* Require the token in prod (401 if unset); only transition on matching `shipdayOrderId`. (LAUNCH‑READINESS High — still open.)

---

## 🟢 LOW — future hardening

- **L1** — register/forgot/reset password use only the per‑isolate rate limiter (near‑unlimited across Vercel isolates). *availability.* Move to the shared Upstash limiter.
- **L2** — item/variant/modifier prices accept `NaN`/negative (`parseFloat` no validation). *accuracy/payments.* Clamp/validate ≥ 0 finite on write.
- **L3** — category duplicate recreates variant‑scoped modifier groups but never remaps `pizzaConfig` group ids (duplicated pizzas point at the source's groups). *accuracy.*
- **L4** — order‑page `menuCategory` tree query has no `take` cap / bounded include. *availability.*
- **L5** — payment‑intent failure after order creation can create duplicate pending card orders on retry (idempotency key reset too early). *data‑loss/payments.*
- **L6** — `apply-promos` preview looks up the restaurant by slug without `isActive:true`.
- **L7** — marketing‑consent checkbox pre‑ticked in the checkout modal. *privacy.* **DECIDED: LEAVE (Luigi 2026‑07‑06)** — deliberate opt‑out choice; flip only if a CASL/GDPR complaint lands.
- **L8** — `ZERO_DECIMAL` currency set duplicated across payment‑intent creation + refund (a future edit to one is a 100× under/over‑refund trap). *payments.* Extract one shared `toMinorUnits()`.
- **L9** — `MAX_AMOUNT` order cap is a flat 10,000 major units, not currency‑aware (rejects legit JPY etc. orders). *availability/payments.*
- **L10** — auto‑complete cron scans all simple‑mode restaurants with an unbounded `findMany` (no `take`/date floor). *availability/data‑loss.*
- **L11** — ring‑cadence urgency uses a stale 10‑min auto‑reject constant while orders auto‑reject at 4 min (alarm never escalates before the kill). *cosmetic.*
- **L12** — EOD slip "Printed at" timestamp uses restaurant locale → non‑ASCII that only renders on the bitmap path, not raw TCP. *printing.*
- **L13** — receipt logo fetched over the network on every print‑job in the kitchen hot path. *printing/availability.* Cache it.
- **L14** — Reward Dollars EARNED omitted from the confirmation email (status page only). *cosmetic.*
- **L15** — `buildCustomerSms` hardcoded English for all customer texts. *i18n.* (Noted in TODO; thread locale + `sms.*` keys ×38.)
- **L16** — `rewardMaxRedeemPercent = 0` is interpreted as "no cap" (100%), the opposite of an owner setting 0%. *config correctness.*
- **L17** — legacy `Coupon` discount path bypasses the gift‑card (`promoExcluded`) exclusion — dead in normal flow, latent mint if a Coupon row is reactivated. *payments/security.*
- **L18** — reward spend can be stranded if `recordSpendForOrder` fails after the balance was decremented (narrow crash window). *data‑loss/payments.*

---

## Recommended first stabilization PR (the "before any real restaurant" batch)
1. **C1 + C2** — modifier IDOR ownership checks (small, additive, high‑certainty). Mirror the DELETE handler.
2. **C3 interim** — force auto‑accept OFF for card/paypal at create (1 line), so no order is auto‑accepted‑uncaptured; then the real capture‑on‑authorize + reconcile cron.
3. **H1** — kitchen login `emailLower` (1 line, unblocks the tablet).
4. **H4** — status‑poll re‑verify + void‑before‑cancel (closes lost/stuck card orders).
5. **H5** — reservation stale‑transition 409 guard (mirror the order route).
6. **H9** — `reportError` → Sentry on the money paths (so we SEE failures during beta).
7. **H10** — fail‑closed the seven crons.

Each ships behind the standard gate: `npx vitest run` + `npm run preflight` (read bottom‑up) + i18n parity, and — for the payment items (C3, H4) — a **live $1 Stripe test** once live keys exist. Nothing here adds a feature.

## What the audit confirmed is already SOLID
Idempotency‑keyed order creation (duplicate‑submit), atomic append‑only reward ledger, race‑safe promo caps, hardened PayPal webhook, encrypted‑at‑rest credentials, consistent cross‑tenant `restaurantId` scoping on the read paths + DELETE handlers, the money‑path pizza engine + promo delete‑guards + stored‑XSS + security headers fixed earlier this session, and the accepted‑order stale‑device guard for orders (the reservation half is H5).

## Testing approach (how we prove each fix)
- **Unit/vitest** for pure logic (pricing, reward math, guard predicates).
- **Local end‑to‑end** on the seeded `demo-pizza-palace` for order/checkout/menu flows (dev DB, `preview_start`).
- **Live $1 Stripe test** for every capture/refund/void change once live keys are in (C3, H4, M8/M9).
- **Device build** for printing/ring changes (H6) — physical Star printer + screen‑locked ring.
- Each fix lists its own **How to test** + **Regression risk** above.
