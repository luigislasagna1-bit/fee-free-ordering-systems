# Design — "Gift Wallet Pass": spending a gifted balance with no account

**Status:** designed, NOT yet built. Produced 2026-07-31 by a 13-agent design panel
(3 independent designs → attacker / guest / maintainer judging → synthesis).

## ⚠️ Luigi's overrides to this spec (2026-07-31, after reading it)

The spec below asks for a **maximum gift amount** as its one owner decision. Luigi
answered, then reversed it. The binding rules are:

1. **NO dollar cap** on gifts that can be spent without an account. The spec's
   `GIFT_PASS_MAX_CENTS` ceiling and the "large gifts fall back to the signup
   email" split are **cut** — every gift gets the pass.
2. **One unredeemed gift per guest instead.** If a recipient already has an
   uncollected gift at this restaurant, a second one is refused. This is the
   agreed control in place of the amount cap. ✅ **BUILT** — `already_pending`
   409 in `POST /api/admin/reward-gifts`, with the admin UI naming the
   outstanding amount and offering resend-or-cancel.
3. **Resend must exist**, so a recipient who lost or never understood the email
   can be re-notified. ✅ **BUILT** — `POST /api/admin/reward-gifts/[id]/resend`,
   ✉ button on every non-revoked gift row, 60s per-gift throttle, and the email
   it sends follows the gift's CURRENT state (a pending gift claimed in the
   meantime must not be told to "create an account" again).

**Consequence to be honest about:** the amount cap was the control bounding what a
single leaked link could cost. Without it, a forwarded or mis-addressed gift email
can be spent in full by whoever holds it, whatever the amount. The remaining
controls are unchanged and still real: one gift only, one restaurant only, no gift
cards, no refundable deposits, no driver tips, earns nothing, 90-day expiry, and
instant revoke from the admin. The one-unredeemed-gift rule bounds how many can be
outstanding per person — not how large any one of them is.

## What is already built from this design's neighbourhood

These landed 2026-07-31 and the spec's diffs must be read against them, not
against what the panel saw:

- `promoCtx.sessionWalletSpendable` / `walletMismatchEmail` no longer exist. A
  signed-in customer now OWNS their orders, and the wallet spend site asserts
  `customer?.id === promoCtx.sessionCustomerId` (an exact id comparison). Any
  diff in this spec that touches the spend condition must preserve that.
- `refundForOrder` now writes to the account named on each row it undoes.
- The marketplace signup route claims pending gifts.
- Both gift emails now teach in three numbered steps.

## Chosen approach

scoped-capability ("Gift Wallet Pass"), rebuilt on deferred-binding's guest-twin wallet holder and hardened with minimal-account's credential hygiene.

## Why

**Why scoped-capability is the base.** It is the only one of the three that actually delivers what Luigi asked (spend with no account, no password, no signup form) while never minting `ff_rest_account`. Its central architectural decision survives verification and is the single most important line in this whole exercise: `sessionCustomerId` is NOT just a wallet key — I confirmed at `src/lib/promo-order-context.ts` that it also drives `isMember` (line ~245), `resolveGrantById`/`?grant=` (line ~262) and the member-only VIP add-back. Both other designs widen or reuse that field, which would silently hand every gift recipient the entire VIP promo and personal-grant surface. Introducing a separate `walletCustomerId` is the correct seam and everything else grafts onto it.

**What I grafted from deferred-binding (and it is the biggest single improvement).** Ground truth #2 as stated is wrong, and the codebase proves it. `RewardAccount.customerId` FKs a **Customer row**, not an account. `isAccountCustomer()` (src/lib/reward-gifts.ts:24-30) requires `signedUpAt || passwordHash || customerAccountId`; `earnSignupDateFor()` (reward-ledger.ts:324-346) fails CLOSED without `signedUpAt`; and `/api/orders` already find-or-creates exactly such a guest-grade row for every guest checkout (route.ts:~1786). So the wallet holder is a **guest twin**: the recipient can SPEND but can never LOG IN and never EARNS, so future order economics are untouched. And the signup route hydrates that same row **in place** (signup/route.ts:141-166), so if they ever do sign up the leftover balance is simply already there — no merge, no migration. This dissolves minimal-account's entire premise that a claim must create an account-grade row, and with it minimal-account's fatal Tier-B flaw (asking an unauthenticated link-bearer to set a password on a real customer's row with order history — verified to be the *modal* case at reward-gifts/route.ts:102, not an edge case).

I also grafted deferred-binding's **printed, human-typable code**. It is the highest-leverage UX decision available: every host-resolution, cookie-scope, fragment-mangling and forwarded-link failure degrades to "type these 16 characters" instead of a dead end. So the credential is ONE 80-bit Crockford-base32 code with two presentations (link fragment + printed text), not two credentials of unequal strength.

**What I grafted from minimal-account.** Its credential hygiene, kept whole: CSPRNG entropy, SHA-256 at rest so a DB dump yields nothing spendable, unique-index lookup (no timing oracle), restaurantId binding, atomic guarded writes, explicit revocation, and — critically — the outright refusal to build on `src/lib/order-status-token.ts`. I re-read that file: it is a deterministic HMAC over `` `${purpose}:${subjectId}` `` with no nonce, no expiry, no single-use, and its secret falls back to `NEXTAUTH_SECRET` (line 32). Building money on it would mean a credential that never dies and whose rotation logs out every user. I also grafted its `next.config.ts` finding — verified at line 60: `/((?!embed|order).*)` genuinely exempts every `/order` path from `X-Frame-Options`/`frame-ancestors`, so anything placed under `/order` is frameable today. And I grafted its resend rule (recovery keyed on grant state, sent only to the stored address).

**What I rejected from every design, on verified grounds.**
1. **All three specify the spend-site diff wrong.** They quote `if (... && promoCtx.sessionCustomerId)`. The real conditions at `apply-promos/route.ts:275` and `orders/route.ts:2439` carry a third conjunct, `promoCtx.sessionWalletSpendable`, added on 2026-07-31 to stop a signed-in customer typing a stranger's address from spending their own wallet on someone else's order. Applying any of the three diffs verbatim deletes that fix. My spec preserves it explicitly.
2. **Preview/charge divergence.** All three put the gift email-match guard only in `/api/orders`, leaving `apply-promos` to show "$25 applied" and the charge route to silently take $25 more. The existing comment at apply-promos:271-275 exists precisely to prevent that. I moved the guard **into `buildPromoOrderContext`**, the one place both routes read, so they structurally cannot disagree.
3. **The tip is a cash-out path.** `serverTotal` includes `serverTip` (orders/route.ts:~1768) and the redeemable base subtracts only redeem-excluded lines and deposits. Tips are frozen into `DriverPayout.tipsCents` (src/lib/driver-payout.ts:81,125) and paid to drivers as real cash. A bearer credential funding a tip converts gift credit into a cash outflow. For pass-funded orders only, the tip is subtracted from the redeemable base.
4. **Token in a query string is not private in this repo.** I confirmed `src/instrumentation-client.ts` boots Sentry in prod with `tracesSampleRate: 0.1` and `replaysOnErrorSampleRate: 1.0` and **no `beforeSend`/`beforeBreadcrumb` URL scrubbing** (`maskAllText` masks DOM text, not URLs). Query strings also land in Vercel access logs. So: the code rides in the **fragment** and is presented by **POST body**, and URL scrubbing is added to all three Sentry configs as a required build step.
5. **Deferred-binding's fatal flaw is real and I fixed it at the root.** Its stranded-balance mitigation ("identical `orderBy` in all three places") cannot work: signup's lookup at signup/route.ts:141 has no `orderBy` at all, and among duplicate GUEST rows every candidate has `passwordHash: null`, so that tiebreaker is degenerate. My fix is one shared, fully deterministic ordering constant used at all four sites.
6. **Dropped as scope creep:** scoped-capability's revoke-clawback branch (a second feature riding in on a money change), and deferred-binding's public resend that revokes live codes (an unauthenticated griefing vector that can kill a real recipient's code mid-checkout).

## Specification

## GIFT WALLET PASS — complete specification

### 0. One-sentence model
The emailed gift carries a **Gift Wallet Pass**: a DB-backed, revocable, expiring bearer credential whose entire authority is *"spend wallet W at restaurant R toward the order being placed right now."* It is never a session. The wallet lives on a **guest-grade Customer row** that cannot log in and cannot earn. The gift itself still never expires.

---

### 1. THE CREDENTIAL

**Form.** One secret. `crypto.randomBytes(10)` → **80 bits** → 16 chars of Crockford Base32 (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`, no I/L/O/U). Displayed grouped: `4K7P-9RT2-M8XW-QN5D`.

**Normalization before hashing:** uppercase → strip anything outside the alphabet → map `I→1 L→1 O→0 U→V` → require length exactly 16.

**Two presentations, one secret:**
- Clickable link: `https://<host>/order/<slug>/gift/<grantId>#g=4K7P9RT2M8XWQN5D` — **fragment**, never sent to the server, never in Vercel access logs, never in a Referer.
- Printed in the email as text, typable on the landing page. This is the recovery path for every host/cookie/forwarding failure.

**No signing key.** Verification is `findUnique({ where: { codeHash: sha256(normalized) } })` — an indexed lookup, not a comparison. There is no signature-compare timing surface, no key to rotate, and **zero coupling to `NEXTAUTH_SECRET` or `ORDER_STATUS_SIGNING_KEY`** (ground truth #4 sidestepped entirely). Plaintext is stored nowhere, logged nowhere, and never returned in any admin API response.

**Deliberately NOT `src/lib/order-status-token.ts`.** Verified: deterministic HMAC over `` `${purpose}:${subjectId}` ``, no nonce, no expiry, no single-use, secret falls back to `NEXTAUTH_SECRET` at line 32.

**Not single-use, by design.** A single-use link is broken by mail scanners, by re-reading the email, and by a $50 gift spent over three orders. Instead:
- **Pass** expires 90 days after issue. The **gift** never expires (Luigi's 2026-07-28 rule holds — `PendingRewardGrant.status` stays `pending` until the recipient actually clicks).
- **Browser session** is single-active: each exchange rotates `sessionHash`, killing the previous device. 60-minute **sliding** window (renewed on each successful read), 12-hour absolute cap.
- `exchangeCount` hard-capped at 25, `failedAttempts` hard-capped at 25 — DB-enforced, does **not** fail open.
- The spend itself is single-use per order via `RewardLedger @@unique([accountId, orderId, reason])` and `reserveCredit`'s `UPDATE … WHERE balance >= applied` (reward-ledger.ts:119-126, verified atomic).

**Cookie.** `ff_gift_pass` — `httpOnly`, `sameSite: "lax"`, `secure` in prod, `path: "/"`, `maxAge: 3600`, **no `domain` attribute** (host-only, deliberate: a gift cookie must never follow a chain's hosts). Distinct name and distinct table from `ff_rest_account` so no existing reader can be fooled.

**What it authorizes — exhaustively:** (a) read the spendable balance + redeem caps for one wallet at one restaurant; (b) `reserveCredit` against that wallet toward one order placed with that same email. **Nothing else.** It is never returned by `getCurrentRestaurantCustomer()`, never sets `ff_rest_account`, never sets `isMember`, is never accepted by `resolveGrantById`/`?grant=`, cannot read order history / saved addresses / profile, cannot reset a password, cannot earn, cannot cross to a sibling chain restaurant (strict `restaurantId` equality, **no `chainCustomerId` walk** — a deliberate divergence from `getCurrentRestaurantCustomer`), cannot buy `rewardRedeemExcluded` items, cannot fund a refundable deposit, and **cannot fund a tip**.

---

### 2. THE WALLET HOLDER — guest twin, not an account

At first exchange we resolve-or-create a Customer row with `signedUpAt: null, passwordHash: null, customerAccountId: null, marketingConsent: false, marketingConsentAt: null`.

Verified consequences: `isAccountCustomer()` → false; `earnSignupDateFor()` → null → `orderEligibleToEarn()` → **false** (fails closed), so a gift-funded order earns nothing; `isMember` is session/CustomerAccount-based, never wallet-based, so no member-only VIP promos leak; and the signup route hydrates **this same row in place**, so a later real signup inherits the remaining balance with zero migration code.

If the resolved row IS an account (`isAccountCustomer` true), the exchange **refuses** with `account_exists` and tells them to sign in — their gift is already credited by the existing instant path or by the signup hook. A leaked link must never drain a password-protected wallet.

**Deterministic row selection (fixes the stranding bug all three designs carry).** New `src/lib/customer-row.ts`:
```ts
export const CUSTOMER_ROW_ORDER = [
  { passwordHash: { sort: "desc", nulls: "last" } },
  { createdAt: "asc" },
  { id: "asc" },
] as const;
```
Applied at **all four** sites so they can never pick different rows for one email:
- `src/app/api/orders/route.ts:~1791` (today: passwordHash only)
- `src/app/api/restaurants/[slug]/account/signup/route.ts:~141` (today: **no orderBy at all**)
- `src/app/api/admin/reward-gifts/route.ts:~95`
- the new exchange path

Where-clause semantics are left untouched (no regression risk); only ordering is added. The exchange uses the **exact lowercase** email match signup uses, and separately does a case-insensitive lookup purely to detect an existing account and refuse.

---

### 3. ENDPOINTS

**`GET /order/[slug]/gift/[grantId]`** — server component, `dynamic = "force-dynamic"`.
Renders **nothing sensitive**: no amount, no sender name, no note, no email. Just the restaurant's branding and a "Enter your gift code" form (prefilled by the client from `#g=`). This closes the unauthenticated-PII-disclosure hole (grant ids are cuids, not secrets). Headers: `Cache-Control: no-store, no-cache, must-revalidate`, `Pragma: no-cache`, `Expires: 0`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`. **Mutates nothing** — mail-scanner-safe, matching the guest-cancel precedent.

**`POST /api/public/gift-pass/verify`** — body `{ slug, code }`. Read-only preview. Rate-limited. Returns `{ ok, amountLabel, restaurantName, giftFromName, note }` on success so the page can say "You've been sent $25 by Luigi's Lasagna" *after* the secret is proven. Uniform `{ ok:false, code:"invalid" }` for not-found/expired/revoked so it is not an oracle. **No writes, no cookie.**

**`POST /api/public/gift-pass/exchange`** — body `{ slug, code }`. The ONLY place `ff_gift_pass` is minted.
Order of operations:
1. `rateLimitShared("giftpass:ip:" + sha256(getClientIp(req)), 10, 60_000)` → 429; then `rateLimitShared("giftpass:grant:" + passId, 20, 3_600_000)`.
2. Resolve restaurant by slug; refuse if `!isActive` or `!rewardsEnabled`.
3. `findUnique({ where: { codeHash } })`; assert `restaurantId` equality, `revokedAt == null`, `expiresAt > now`, `exchangeCount < 25`, `failedAttempts < 25`. On miss, increment nothing (no row) and return the uniform refusal.
4. Load the grant; assert `status === "pending"` (a revoked or already-claimed grant refuses).
5. Resolve-or-create the guest twin (§2). Refuse `account_exists` if it is an account.
6. `claimPendingGiftsFor({ restaurantId, customerId, email, grantIds: [grantId] })` — **scoped to this pass's grant only**, so one leaked link can never sweep every outstanding gift to that address.
7. Mint browser secret; `update` the pass row with `sessionHash`, `sessionExpiresAt = now+60m`, `sessionAbsoluteExpiresAt = now+12h` (set once), `customerId`, `exchangeCount: { increment: 1 }`, `lastExchangeAt`, `lastIpHash`.
8. `cookies().set(...)` **on the host the request arrived on** — this is why the cookie is minted at click-time, and it is what makes ground truth #7 a non-issue on the happy path.
9. Respond `{ ok: true, balance, redirectTo: "/order/" + slug }`.

**`redirectTo` is a relative path, and it is `/order/<slug>` on BOTH host shapes** — never the origin root. Verified at `src/proxy.ts:~441`: on a branded host with the hosted-site add-on, `/` rewrites to `/site/<slug>` (the **marketing** page), which is the exact trap that stranded Luigi's first test recipient (memorialized in the comment at reward-gifts/route.ts:87-89). `/order/<slug>` passes through the proxy unchanged on branded hosts and is the real path on the platform host.

**`GET /api/public/gift-pass/me`** — reads the cookie, returns `{ ok, amountLabel, balance, restaurantName }` for the storefront banner, or a typed `reason` (`expired | superseded | account_exists | none`) so the UI can say *why* rather than silently showing nothing. Renews the sliding window. `Cache-Control: no-store`.

**`POST /api/public/gift-pass/resend`** — body `{ slug, grantId }`. Sends **only to the address stored on the grant**, never a request-supplied one. Gated on `grant.status === "pending"` **alone**, deliberately independent of code/pass state — so expiry, a crash mid-exchange, a wrong device, or a consumed session are all self-recoverable in one tap. **Never revokes a live code** (that would let a stranger kill a real recipient's code mid-checkout): if the current code is live it re-sends the same one; only if expired/revoked does it mint a replacement. `rateLimitShared` per-IP 10/h and per-grant 3/h, plus a DB-enforced lifetime `resendCount <= 20`. Always returns the same generic body regardless of outcome.

**`POST /api/admin/reward-gifts/[id]/resend`** — session-scoped, `where: { id, restaurantId: session.restaurantId }`. Mints a fresh code (killing the old), re-sends the invite. Luigi's manual lever.

---

### 4. THE SPEND SITES — the money path

**`src/lib/promo-order-context.ts`.** Add to the type and the return object:
```ts
giftPassCustomerId: string | null;
walletCustomerId:  string | null;
walletSource: "session" | "gift_pass" | null;
```
Resolution (**this exact shape — do not simplify**):
```ts
// UNCHANGED, load-bearing: sessionWalletSpendable is the 2026-07-31 fix that
// stops a signed-in customer typing a stranger's address from funding that
// stranger's order out of their own wallet. It must survive this change.
const sessionSpender = sessionCustomerId && sessionWalletSpendable ? sessionCustomerId : null;

// Only consult the pass when there is no session at all.
let giftPassCustomerId: string | null = null;
if (!sessionCustomerId) {
  try {
    giftPassCustomerId = await resolveGiftPassSpender({
      expectedRestaurantId: restaurant.id,
      typedEmail,               // ← email match lives HERE, in the shared context
    });
  } catch (e) { console.error("[promo-order-context giftPass]", e); giftPassCustomerId = null; }
}

const walletCustomerId = sessionSpender ?? giftPassCustomerId;
const walletSource = sessionSpender ? "session" : giftPassCustomerId ? "gift_pass" : null;
```
`resolveGiftPassSpender` returns null unless the typed email is present and equals (lowercased) the pass's stored email. **Putting the guard here is what makes preview and charge structurally incapable of disagreeing** — the existing comment block at apply-promos:271-275 states that requirement; all three source designs violated it.

**CRITICAL — do NOT fold the pass into `sessionCustomerId`.** Verified: that field gates `isMember` (~line 245), `resolveGrantById`/`?grant=` (~line 262), and the member-only VIP add-back. Leave the `bodyGrantId && promoCtx.sessionCustomerId` block at `orders/route.ts:~2728` untouched.

**`src/app/api/public/apply-promos/route.ts:275`.**
```diff
-if (r.rewardsEnabled && promoCtx.sessionCustomerId && promoCtx.sessionWalletSpendable) {
+if (r.rewardsEnabled && promoCtx.walletCustomerId) {
```
and `getBalance({ ..., customerId: promoCtx.walletCustomerId })`. `walletCustomerId` already encodes `sessionWalletSpendable`, so the 2026-07-31 fix is preserved verbatim for the session path. Add to the `reward` object:
- `rewardSource: promoCtx.walletSource` — so the cart can label whose money is being applied (also closes open task #9 for this surface).
- `redeemTipExcluded: promoCtx.walletSource === "gift_pass"` — the client subtracts the tip from the redeemable base when true, so the offered max matches the charge-side clamp.

Update the existing comment block: the 2026-07-31 revert note **stays** (a typed address is still never a wallet key); the pass is a *proven bearer credential*, which is exactly the "signed claim link" that comment anticipated.

**`src/app/api/orders/route.ts:~2439`.**
```diff
-if (promoCtx.sessionCustomerId && promoCtx.sessionWalletSpendable) {
+if (promoCtx.walletCustomerId) {
```
`customerId: promoCtx.walletCustomerId`, `creditSpenderId = promoCtx.walletCustomerId`.

Immediately before `reserveReward`, add the gift-pass-only guards (**fail closed — proceed at credit 0, never fail the order**, preserving the existing "the claim NEVER fails the order" contract):
```ts
let passTipExcluded = 0;
if (promoCtx.walletSource === "gift_pass") {
  // (a) Identity coherence. (restaurantId, email) is NOT unique on Customer and
  //     duplicate rows exist in the wild. Without this the wallet decrement and
  //     order.customerId could land on two different rows.
  if (!customer || customer.id !== promoCtx.walletCustomerId) throw new SkipCredit();
  // (b) Tip is a CASH outflow: serverTip rides in serverTotal and is frozen into
  //     DriverPayout.tipsCents and paid to the driver 100% as cash. A bearer
  //     credential must buy food, not fund a cash payout.
  passTipExcluded = serverTip;
}
```
and subtract it in the existing clamp:
```ts
orderTotal: Math.max(0, round2(serverTotal - redeemExcludedLinesTotal - depositLinesTotal - passTipExcluded)),
```
Every other clamp (`minRedeemBalance`, `maxRedeemPercent`, the $0.50 `minCharge` floor, the atomic `WHERE balance >= applied`), the atomic spend-ledger write inside order-create, `Order.creditApplied`, `fullyCovered`, `releaseForOrder`/`refundForOrder` — all unchanged.

---

### 5. IDEMPOTENCY (every leg)
- **Exchange / claim:** `claimPendingGiftsFor`'s guarded `updateMany({ where: { id, status: "pending" } })` flip plus the synthetic `gift:<grantId>` ledger key (reward-gifts.ts:55-72). Double-click, retry, or two devices → credited exactly once. Verified, unchanged.
- **Pass mint:** `upsert` on `grantId @unique` — re-driving the admin create is safe.
- **Spend:** `reserveCredit`'s `UPDATE … WHERE balance >= applied` (loser gets 0 rows), `RewardLedger @@unique([accountId, orderId, reason])`, and the order route's `idempotencyKey` short-circuit at ~line 241 which returns the existing order without re-entering the reward block.
- **Order-create failure:** existing `refundClaim` re-credits; nothing pass-specific needed because the pass is not consumed by a spend.
- **Release/refund:** unchanged — credit returns to the same wallet, and the pass (if still live) can spend it again.

---

### 6. SCHEMA (`prisma/schema.prisma`)
Sparse side table. **Nothing added to `Order`, `Customer`, or `MenuItem`** (AGENTS.md hot-table rule).
```prisma
model GiftWalletPass {
  id                       String    @id @default(cuid())
  restaurantId             String
  grantId                  String    @unique   // one pass per gift; mint idempotency
  customerId               String?             // guest twin; NULL until first exchange
  codeHash                 String    @unique   // sha256(normalized 16-char code)
  codeHint                 String              // last 4 chars, admin support only
  sessionHash              String?   @unique   // sha256(ff_gift_pass value)
  sessionExpiresAt         DateTime?           // sliding, 60 min
  sessionAbsoluteExpiresAt DateTime?           // hard 12 h cap
  expiresAt                DateTime            // 90 days
  revokedAt                DateTime?
  revokedReason            String?
  exchangeCount            Int       @default(0)
  failedAttempts           Int       @default(0)
  resendCount              Int       @default(0)
  lastResendAt             DateTime?
  lastExchangeAt           DateTime?
  lastIpHash               String?             // sha256(ip + daily salt); no raw IPs
  createdAt                DateTime  @default(now())
  updatedAt                DateTime  @updatedAt

  restaurant Restaurant @relation(fields: [restaurantId], references: [id], onDelete: Cascade)
  customer   Customer?  @relation(fields: [customerId], references: [id], onDelete: Cascade)

  @@index([restaurantId, customerId])
  @@index([expiresAt])
}
```
Back-relations `giftWalletPasses GiftWalletPass[]` on `Restaurant` and `Customer`. Push with `npx tsx scripts/push-schema-to-both.ts` (BOTH Neon branches), then `prisma generate` **before** tsc.

---

### 7. EMAIL CHANGES
`src/emails/templates/RewardGiftInvite.tsx` — add optional props `spendUrl`, `code` (formatted `XXXX-XXXX-XXXX-XXXX`), `codeExpiryLabel`. When present:
- **Primary CTA:** "Spend your {amount} now — no account needed" → `spendUrl` (fragment-carried code).
- **The code printed in large monospace** below it, with "Or type this code at checkout: 4K7P-9RT2-M8XW-QN5D".
- Copy: this link is just for you, please don't forward it; your {rewardLabel} never expire, only this code does ({date}); if it lapses, ask for a new one.
- **Secondary link:** "Or create a free account to keep it forever" → the existing `signupUrl` (which correctly points at `/account/signup`, not the origin root).
- Plain-text alternative body (mandatory per the 2026-07-29 email policy).

`src/lib/email.ts` (`sendRewardGiftInviteEmail`, ~1155) — thread `spendUrl`, `code`, `codeExpiryLabel`; expiry formatted in the restaurant's timezone + `hoursFormat`. Locale stays `restaurant.defaultLanguage` (no recipient locale exists yet). This is a 1:1 owner-initiated transactional notice, so **`marketingConsent` is correctly not consulted** — unchanged from today.

---

### 8. TRANSPORT / HEADER HYGIENE
- `next.config.ts` `headers()` — add **before** the existing rules:
  `{ source: "/order/:slug/gift/:path*", headers: [ X-Frame-Options: DENY, Content-Security-Policy: "frame-ancestors 'none'", Referrer-Policy: "no-referrer", X-Robots-Tag: "noindex, nofollow", Cache-Control: "no-store" ] }`.
  **Required**: verified at line 60 that `/((?!embed|order).*)` exempts every `/order` path from frame protection so the embed widget stays frameable — without this rule the claim page is clickjackable.
- **Sentry URL scrubbing (required, not optional).** Add `beforeSend`, `beforeSendTransaction` and `beforeBreadcrumb` to `src/instrumentation-client.ts`, `sentry.server.config.ts` and `sentry.edge.config.ts` that strip any `#g=…` fragment and rewrite any path matching `/gift/` to `/gift/[redacted]`. Verified today: `tracesSampleRate: 0.1`, `replaysOnErrorSampleRate: 1.0`, and **no URL redaction whatsoever** — `maskAllText` masks DOM text, not URLs. Without this, live codes are shipped to sentry.io.
- The client calls `history.replaceState(null, "", location.pathname + location.search)` on mount to strip `#g=` from the URL bar and history; the code is held in component state only — never `localStorage`/`sessionStorage`.

---

### 9. UI SURFACES
- `src/app/order/[slug]/gift/[grantId]/page.tsx` — inert server component (§3).
- `src/app/order/[slug]/gift/[grantId]/GiftClaimClient.tsx` — reads `#g=`, strips it, POSTs to `/verify` then `/exchange` behind one explicit button; typed error → translated message; on success `window.location.assign(redirectTo)`.
- `OrderingPageClient.tsx` — fetch `/api/public/gift-pass/me` once on mount (skipped entirely when signed in). Persistent banner, styled with `theme.primaryColor` inline (never hardcoded orange): *"You're spending {restaurant}'s {amount} gift — balance {balance}."* Visually distinct from the signed-in header so nobody thinks they are logged in.
- `CheckoutModal.tsx` — prefill and **require** the checkout email from the pass; render `rewardSource` on the credit row ("Luigi's Lasagna gift"); apply `redeemTipExcluded` to the slider max; **auto-apply the full available credit by default** (`creditToApply` currently defaults to 0 at OrderingPageClient.tsx:~1352 — a guest told "spend your $25 now" must not be able to check out at full price by failing to find a slider); handle `gift_pass_expired` / `gift_pass_superseded` / `gift_pass_account_exists` with a clear recovery message plus a "send me a new code" button, never a silently vanishing wallet.
- `src/app/admin/rewards/GiftRewardDollars.tsx` — per-row code hint (`••••QN5D`), code status, expiry, and **Resend** / **Revoke** buttons (Revoke pending-only, with confirm). Every new control carries a `HelpTip` per the standing rule. Whole surface gated on `rewardsEnabled`.
- `src/app/api/admin/reward-gifts/[id]/revoke/route.ts` — behavior for existing callers **unchanged** (pending-only guarded flip). On a successful flip, also `revokeGiftWalletPassForGrant(id, "gift_revoked")` so an already-emailed code dies instantly. **No clawback branch** — deliberately out of scope.

---

### 10. i18n KEYS (all 38 locales, same change)
New namespace `giftPass`:
`landingTitle`, `landingSubtitle`, `codeLabel`, `codePlaceholder`, `codeHelp`, `verifyButton`, `giftFrom`, `giftAmount`, `giftNote`, `claimButton`, `claiming`, `successBanner`, `bannerSpending`, `bannerBalance`, `checkoutCreditLabel`, `checkoutEmailLocked`, `checkoutEmailLockedHelp`, `resendButton`, `resendSent`, `signUpInstead`, `helpTipWhatIsThis`, and one message per typed code: `errInvalid`, `errExpired`, `errRevoked`, `errAccountExists`, `errRewardsOff`, `errSuperseded`, `errTooManyAttempts`, `errRateLimited`, `errEmailMismatch`, `errGeneric`.

New/changed `email.rewardGiftInvite.*`:
`spendCtaPrimary`, `orTypeThisCode`, `codeExpiryLine`, `neverExpiresLine`, `doNotForwardLine`, `createAccountSecondary`, `plainTextBody`.

New `admin.rewardGifts.*`:
`codeHint`, `codeStatus`, `codeExpires`, `resendCode`, `resendConfirm`, `resendSent`, `revokeGift`, `revokeConfirm`, `helpTipRevoke`, `helpTipResend`.

Then `npx tsx scripts/i18n-parity-all.ts` must report **0 missing / 0 extra / 0 placeholder-arg / 0 rich-tag mismatch across all 38** before deploy.

---

### 11. TESTS (`src/lib/gift-wallet-pass.test.ts`, new)
Must assert: code is exactly 16 chars from the Crockford alphabet (a shortening regression silently collapses the entire security model — comment says so at the assertion); a pass for restaurant A returns null for restaurant B (no chain hop); a pass whose Customer became an account self-retires; revoked/expired/attempt-capped passes return null; two exchanges invalidate the first cookie; double exchange credits the wallet exactly once; the pass is rejected by `getCurrentRestaurantCustomer`; **a pass holder gets `isMember === false` and zero member-only promos out of `buildPromoOrderContext`**; a guest twin with a positive balance and no `signedUpAt` is **not** earn-eligible; `walletCustomerId` is null when a signed-in customer types a divergent email (the `sessionWalletSpendable` regression guard); tip is excluded from the redeemable base for `walletSource === "gift_pass"` but not for `"session"`; `claimPendingGiftsFor` with `grantIds` claims only that grant.

Extend `src/lib/reward-refund-flow.test.ts` for release-after-pass-spend.

---

### 12. VERIFICATION BEFORE PUSH
`npm run preflight`, read **bottom-up** (schema + route handlers + next.config are all build-critical). Then a real end-to-end run against the seeded demo store per the verify-before-declaring-fixed rule: gift → click the real link → claim → confirm the banner → confirm the slider auto-applies → place a card order → confirm `creditApplied` reduces the charge and the order earns $0. Explicitly re-test the **untouched** paths sharing this code: normal signup-with-pending-gift, reset-password guest activation, the instant already-has-account gift, and a **signed-in** customer spending their own balance with a matching and with a divergent typed email.

## Build steps

### 1. Deterministic customer-row selection (do this FIRST — it is the fix that stops gift money stranding on an orphan row)

Files: `src/lib/customer-row.ts`, `src/app/api/orders/route.ts`, `src/app/api/restaurants/[slug]/account/signup/route.ts`, `src/app/api/admin/reward-gifts/route.ts`

Create src/lib/customer-row.ts exporting CUSTOMER_ROW_ORDER = [{ passwordHash: { sort: 'desc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }]. Apply it at orders/route.ts:~1791 (today passwordHash only), signup/route.ts:~141 (today NO orderBy at all — this is the actual bug), and reward-gifts/route.ts:~95. Do NOT touch any where clause. Behaviour is byte-identical when one row exists; deterministic when duplicates exist. Add a test asserting all three resolve the same row given two guest twins.

### 2. Schema: GiftWalletPass side table

Files: `prisma/schema.prisma`

Add the GiftWalletPass model exactly as in the spec (grantId @unique, codeHash @unique, sessionHash @unique, two composite indexes) plus back-relations on Restaurant and Customer. Nothing added to Order/Customer/MenuItem. Run `npx tsx scripts/push-schema-to-both.ts` so dev AND prod Neon branches move together, then `npx prisma generate` BEFORE any tsc run.

### 3. The credential primitive

Files: `src/lib/gift-wallet-pass.ts`, `src/lib/gift-wallet-pass.test.ts`

Exports: generateCode() (randomBytes(10) -> 16-char Crockford base32), normalizeCode(), hashCode() (sha256 hex, NO server secret, no import of order-status-token), mintPassForGrant({restaurantId, grantId}) (upsert on grantId -> {passId, code}), verifyCode({slug/restaurantId, code}) (read-only, typed refusal union), exchangePass({restaurantId, code, ip}) (all of §3 step 3-8 inside one prisma.$transaction), resolveGiftPassSpender({expectedRestaurantId, typedEmail}) (cookie read, checks 1-8, strict restaurantId equality with NO chainCustomerId walk, sliding-window renewal, self-retire on account_exists), revokeGiftWalletPassForGrant(grantId, reason), GIFT_PASS_COOKIE_NAME, giftPassCookieOptions(). Every read path try/caught returning null (fail closed). Never logs a code. Module doc states the invariant: this authorizes wallet spend and nothing else; a third call site requires an explicit decision, not a copy-paste. Write the tests from §11 alongside.

### 4. Scope claimPendingGiftsFor to one grant

Files: `src/lib/reward-gifts.ts`

Add optional `grantIds?: string[]` to claimPendingGiftsFor's opts, ANDed into the findMany where. Absent = today's behaviour exactly (signup / reset-password / instant paths unchanged). The exchange passes [grantId] so one leaked code can never sweep every outstanding gift for that address into one wallet. Keep the existing take:50 bound, the guarded pending->claimed flip, the gift:<id> ledger key, and the revert-on-credit-failure logic — all load-bearing and correct.

### 5. Public endpoints

Files: `src/app/api/public/gift-pass/verify/route.ts`, `src/app/api/public/gift-pass/exchange/route.ts`, `src/app/api/public/gift-pass/me/route.ts`, `src/app/api/public/gift-pass/resend/route.ts`

Build the four routes per §3. Code arrives in the POST BODY only — never a query param. exchange is the only place ff_gift_pass is set, always on the request's own host, and always responds redirectTo: '/order/<slug>' (relative) — never the origin root (proxy.ts:~441 rewrites '/' to /site/<slug> for hosted-site tenants). resend gates on grant.status === 'pending' ALONE, never revokes a live code, sends only to the stored address, and returns a uniform generic body. All four wire rateLimitShared + getClientIp; verify/exchange return a uniform 'invalid' for not-found/expired/revoked so they are not status oracles.

### 6. Money path — shared context (the one change that must be reviewed line by line)

Files: `src/lib/promo-order-context.ts`

Add giftPassCustomerId, walletCustomerId, walletSource per §4. sessionSpender = sessionCustomerId && sessionWalletSpendable ? sessionCustomerId : null — the 2026-07-31 fix MUST survive; do not collapse it. Consult the pass ONLY when sessionCustomerId is null. The gift email-match guard lives HERE (inside resolveGiftPassSpender via typedEmail) so preview and charge cannot diverge. Do NOT fold the pass into sessionCustomerId — it also gates isMember (~245), resolveGrantById/?grant= (~262) and the member-only VIP add-back. The lookup is gated on cookie presence AND on sessionCustomerId being null, so ~99.9% of hot-path requests skip it entirely.

### 7. Money path — the two spend sites

Files: `src/app/api/public/apply-promos/route.ts`, `src/app/api/orders/route.ts`

apply-promos:275 -> `if (r.rewardsEnabled && promoCtx.walletCustomerId)`, getBalance on walletCustomerId, add rewardSource and redeemTipExcluded to the reward object, update the comment block (keep the 2026-07-31 revert note). orders/route.ts:2439 -> `if (promoCtx.walletCustomerId)`, customerId/creditSpenderId = walletCustomerId, plus the two gift-pass-only fail-closed guards from §4: identity coherence (customer.id === walletCustomerId) and passTipExcluded = serverTip subtracted from the reserveReward orderTotal. Leave the bodyGrantId && sessionCustomerId block at ~2728 completely untouched.

### 8. Admin create + revoke + resend

Files: `src/app/api/admin/reward-gifts/route.ts`, `src/app/api/admin/reward-gifts/[id]/revoke/route.ts`, `src/app/api/admin/reward-gifts/[id]/resend/route.ts`

In the PENDING branch only (~line 144): after pendingRewardGrant.create, mintPassForGrant() and build spendUrl = restaurantOrderUrl(r, '/gift/' + gift.id) + '#g=' + code; pass spendUrl/code/codeExpiryLabel to sendRewardGiftInviteEmail. Keep status 'pending' (claim stays lazy — that is what preserves the revoke path and stops a CRM row existing for a link nobody clicked). If minting throws, log and still send the signup-only email (degraded, never broken). The instant/account branch is untouched. Revoke keeps its pending-only guarded flip verbatim and additionally calls revokeGiftWalletPassForGrant — NO clawback branch. New admin resend route is session-scoped with where:{id, restaurantId}.

### 9. Email template + sender

Files: `src/emails/templates/RewardGiftInvite.tsx`, `src/lib/email.ts`

Per §7: primary spend CTA, the code printed in large monospace, expiry line, never-expires line, do-not-forward line, signup demoted to a secondary link, and a plain-text alternative body (2026-07-29 policy). sendRewardGiftInviteEmail (~1155) gains spendUrl/code/codeExpiryLabel; format the expiry in the restaurant's timezone + hoursFormat.

### 10. Transport hygiene — headers and Sentry redaction

Files: `next.config.ts`, `src/instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`

next.config.ts headers(): add the /order/:slug/gift/:path* rule (X-Frame-Options DENY, frame-ancestors 'none', Referrer-Policy no-referrer, noindex, no-store) — required because line 60's /((?!embed|order).*) exempts every /order path from frame protection. Then add beforeSend + beforeSendTransaction + beforeBreadcrumb to ALL THREE Sentry configs stripping any #g= fragment and rewriting /gift/ paths to /gift/[redacted]. Verified today: tracesSampleRate 0.1, replaysOnErrorSampleRate 1.0, zero URL redaction. This step is not optional.

### 11. Customer-facing UI

Files: `src/app/order/[slug]/gift/[grantId]/page.tsx`, `src/app/order/[slug]/gift/[grantId]/GiftClaimClient.tsx`, `src/app/order/[slug]/OrderingPageClient.tsx`, `src/app/order/[slug]/CheckoutModal.tsx`

Landing page renders NOTHING sensitive without a verified code (no amount, no sender, no note). Client reads #g=, history.replaceState's it away on mount, holds it in state only. Storefront banner from /gift-pass/me, theme.primaryColor inline. CheckoutModal: prefill + require the pass email, label the credit row with rewardSource, apply redeemTipExcluded to the slider max, AUTO-APPLY the full available credit by default (creditToApply defaults to 0 at OrderingPageClient.tsx:~1352 — leaving it would let a guest check out at full price), and give every typed error code a real recovery message plus a resend button.

### 12. Admin UI

Files: `src/app/admin/rewards/GiftRewardDollars.tsx`

Code hint (••••QN5D), code status, expiry column, Resend and Revoke buttons (Revoke pending-only, with confirm). HelpTip on every new control per the standing rule. Whole surface gated on rewardsEnabled per the feature-gated-visibility rule.

### 13. i18n x38 + parity audit

Files: `src/messages/en.json`, `src/messages/bg.json`, `src/messages/de.json`, `src/messages/el.json`, `src/messages/es.json`, `src/messages/fr.json`, `src/messages/it.json`, `src/messages/ja.json`, `src/messages/ko.json`, `src/messages/lt.json`, `src/messages/lv.json`, `src/messages/nl.json`, `src/messages/ru.json`, `src/messages/sr.json`, `src/messages/sv.json`, `src/messages/th.json`, `src/messages/uk.json`, `src/messages/vi.json`, `src/messages/zh.json`, `src/messages/*.json (all 38 per src/lib/locales.ts)`

Add every key from §10 to en.json and translate into all 37 non-English locales IN THIS SAME CHANGE, preserving {placeholders}, ICU plurals and rich tags. Then run `npx tsx scripts/i18n-parity-all.ts` (NOT i18n-audit.ts, which only checks 4) and require 0 missing / 0 extra / 0 placeholder-arg / 0 rich-tag mismatch across all 38.

### 14. Owner actions + preflight + end-to-end verification

Files: `OWNER-ACTIONS.md`, `TODO.md`

Log the owner action: set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL/TOKEN) in Vercel prod — without them rateLimitShared degrades to per-isolate Maps (rate-limit.ts:78-86) and fails open on store errors. Also add a line to the domain-switch runbook: a customDomain cutover breaks already-sent gift links; resend from admin after any cutover. Then `npm run preflight` read BOTTOM-UP, then the full end-to-end run from §12 including the four untouched regression paths.

## Residual risk

**1. The bearer problem is real and is NOT eliminated — only capped.** Whoever holds the email can spend the gift. This is inherent to "no account", not a flaw in the implementation. Mitigations: unguessable 80-bit code, 90-day expiry, instant revoke, one-restaurant scope, no tips/deposits/gift-cards, no earn, and an order confirmation to the gift address so the real recipient gets an immediate signal. NOT mitigated: authentication. If Luigi ever wants this closed, the only real answer is requiring signup — i.e. today's behaviour.

**2. Typo'd addresses are a genuine regression versus today.** Right now a stranger who receives a mis-sent gift must sign up to get it. After this, they click once. The revoke button and the amount cap are the only controls; once redeemed, it is gone.

**3. Log/telemetry exposure is reduced, not zero.** Fragment + POST-body transport keeps the code out of Vercel access logs and Referer headers, and the new Sentry `beforeSend`/`beforeBreadcrumb` scrubbing keeps it out of sentry.io. But the code is also printed as plain text in the email body, so anything that indexes or scans email bodies (corporate archiving, mail-client sync, a screenshot in a group chat) still sees it. That is the deliberate cost of the typable-code UX, and I think it is worth it — but it is a cost.

**4. Duplicate Customer rows are made deterministic, not impossible.** Step 1 makes all four lookup sites agree, which removes the stranding path all three source designs carried. But `(restaurantId, email)` is still not unique on `Customer`, so a duplicate created *between* exchange and signup could still split. The real fix is a partial unique index on `(restaurantId, lower(email))` with a dedupe backfill — a separate, larger migration that should not ride in on this change. Flag it; the charge-time identity-coherence guard fails closed in the meantime (credit refused rather than split across two rows).

**5. The rate limiter fails open and is currently unconfigured.** `rateLimitShared` degrades to a per-isolate Map with no Upstash/KV and fails open on store errors (verified, rate-limit.ts:78-86, 111). It is defence-in-depth for resource abuse and mail-bombing, **not** the security boundary — 80 bits of CSPRNG entropy is. Nobody should treat it as a boundary until the env vars are set, and the `exchangeCount`/`failedAttempts`/`resendCount` DB caps (which do not fail open) are what actually bound a targeted attacker.

**6. Someone shortens the code.** A future "customers complain about typing" change to 6 digits collapses the entire security model instantly, because entropy is the only real defence. The test asserting exact length and alphabet carries a comment naming this failure mode. It is a social risk, not a technical one, and it will not be caught by review unless someone reads that test.

**7. The gift pass gets reused as a general primitive.** Its narrow scope is enforced by there being exactly two call sites (`apply-promos`, `orders`). A third one silently widens it and the next engineer has no way to know. Mitigated by the module doc, by `resolveGiftPassSpender` returning only a bare `customerId` (never a Customer object, so it is awkward to use as identity), by a test asserting `getCurrentRestaurantCustomer` rejects it, and by an AGENTS.md line — but this is convention, not enforcement.

**8. Host and domain churn.** The cookie is host-only and minted at click-time, so the happy path is correct by construction. But a `customDomain` cutover between send and click hard-breaks every outstanding link. Recovery is "resend from admin", and the printed code makes it a soft failure rather than a dead end — but it needs the runbook line, and Luigi will not think of it himself.

**9. Unbounded, un-aged liability.** Codes expire; the money never does (Luigi's explicit rule). Nothing in this feature — or anywhere in the app today — shows total outstanding gift liability. It only grows, and in some jurisdictions unredeemed store credit carries escheatment obligations. Recommend a follow-up: an "Outstanding Reward Dollars" figure on the reports page, split earned vs gifted. Flag it now, not after it is large.

**10. Blast radius.** ~20 surfaces, six of them money-path or hot-path (`promo-order-context`, `apply-promos`, `orders/route.ts` ×2, `reward-gifts` create/revoke, `signup`), a schema push to both Neon branches, one build-critical `next.config.ts` edit, three Sentry configs, and 38 locale files. This is a multi-day change with a preflight-and-adversarial-review tail, not a quick win. The `signup/route.ts` ordering change in step 1 is the one edit that touches a path this feature does not otherwise use — it is a pure tiebreak addition, but it deserves its own line in the regression test pass.
