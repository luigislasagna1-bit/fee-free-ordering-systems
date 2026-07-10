# Launch-Readiness Audit — 06: Database & Reliability

**Date:** 2026-07-10. Companion to `01-system-inventory.md`, `02-architecture-and-data-flow.md`, `03-payment-and-stripe-connect-audit.md`, `04-security-audit.md`, and `05-privacy-and-legal-review-package.md`.

**Audit context.** The platform went **live on 2026-07-10**; this deliverable governs continuing live operation, not a pre-launch gate. It was produced by a single **read-only** database + reliability pass over `C:\FeeFreeOrderingSystems`. Evidence base: `prisma/schema.prisma` (3,924 lines), the order-create route (`src/app/api/orders/route.ts`, 2,812 lines), the money ledgers (`src/lib/reward-ledger.ts`, `src/lib/promo-usage.ts`, `src/lib/coupon-ledger.ts`), the Stripe/PayPal webhook idempotency layer (`src/lib/stripe/events.ts`, `src/lib/stripe/events/payment-intent.ts`), the schema-push tooling (`scripts/push-schema-to-both.ts`, `prisma/migrations/`), the customer order-page loader (`src/app/order/[slug]/page.tsx`), and the cron `findMany` paths (`src/app/api/cron/*`). No code was modified.

---

## 1. Executive posture

**The money layer is unusually well-hardened for a first product; the operational layer is the weakest link.** The order/payment core deliberately trades DB-enforced integrity and true multi-statement transactions for a **best-effort compensating saga**, but it does so with real discipline: atomic conditional counters, claim-first webhook mutexes, and append-only ledgers keyed by idempotency constraints. What is *not* hardened is everything below the application — **there is no automated backup, no tested restore, and Neon Point-in-Time Recovery is unverified** for a database that is the sole source of truth for customer money.

**Principal gaps, in priority order:**

1. **No proven restore path (LR-DB-01, Critical).** For a system holding reward wallets, coupon/promo caps, and order + payment + commission ledgers, the absence of a tested restore means a bad `db push --accept-data-loss`, a branch reset, or a Neon incident could be **unrecoverable**. This is an operational Critical that no amount of application code can mitigate.
2. **The order-create saga is not one transaction (LR-DB-02, High).** `reserveCredit` decrements the reward wallet **before** `order.create`, and the matching spend ledger row is written **after**. A lambda teardown in that window silently debits a customer's balance with no ledger row to reverse it.
3. **Unversioned, irreversible migrations (LR-DB-03, Medium).** `prisma db push` with `--accept-data-loss` against production branches, no migration history, and a stale `provider = "sqlite"` lock file.
4. **Unbounded reads and an uncached hot path (Medium/Low).** Several cron `findMany` calls lack `take` caps, and the customer order page issues ~15 sequential uncached round-trips per render.

**Overall verdict: LAUNCH-ACCEPTABLE on the application layer, with a Critical operational gap (LR-DB-01) to close immediately.** The money paths are safe against the realistic concurrency scenarios; the durability of the whole system, however, rests on an unverified backup posture.

---

## 2. Constraints — uniqueness, FK coverage, onDelete

**STRONG coverage on the money-critical rows:**

| Constraint | Location | Purpose |
|---|---|---|
| `Order.@@unique([restaurantId, orderNumber])` | schema `:1444` | The new hardening; the route regenerates + retries on P2002 (`route.ts:2555-2571`). Both Neon branches audited duplicate-free before it was added (comment 2026-07-10). |
| `Order.idempotencyKey @unique` | schema `:1226` | Dedupes double-clicked / retried checkout POSTs; the loser returns the winner's order (`route.ts:2609-2626`). |
| `StripeWebhookEvent.stripeEventId @unique` | schema `:703-714` | Webhook dedup backbone. |
| `PaypalWebhookEvent.paypalEventId @unique` | schema `:719-732` | Webhook dedup backbone. |
| `RewardLedger.@@unique([accountId, orderId, reason])` | schema `:2247` | Caps ≤1 spend and ≤1 earn per order per account. |
| `PromotionUsage.@@unique([promotionId, orderId])` | schema `:1958` | One promo use per order. |
| `RewardAccount.@@unique([restaurantId, customerId])` | schema `:2226` | One wallet per customer per restaurant. |
| `Coupon.@@unique([restaurantId, code])`; `SubscriptionInvoice.stripeInvoiceId`; `MarketplaceSettlement.@@unique([restaurantId, monthStart])` | schema | All present. |

**Gaps / deliberate trade-offs:**

- **LOOSE references (no FK) on money-tracking side-tables, by design** (documented scaling choice to keep the hot `Order` table free of back-relations): `PromotionUsage.orderId` (`:1951`), `CustomerCoupon.appliedOrderId` (`:2011`), `RewardLedger.orderId` (`:2241`). Referential integrity for these is **app-enforced only** — the DB will not stop or clean up orphans if an `Order` is ever hard-deleted. *(→ LR-DB-09; latent invariant: never hard-delete `Order` rows.)*
- **`RewardLedger.@@unique([accountId, orderId, reason])` uses a NULLABLE `orderId`.** In Postgres, NULLs are distinct in a unique index, so rows with `orderId = NULL` (admin manual grant/adjust) are **NOT deduped** by the constraint. The customer signup/earn/spend paths sidestep this by passing a synthetic non-null `orderId` (e.g. `signup:${customerId}` in `reward-earn.ts:42`), so the **live money paths are safe**; only admin-initiated null-orderId grants are unguarded. *(→ LR-DB-08.)*
- **`Order → Restaurant`** has no explicit `onDelete` (`:1430`); as a required relation it defaults to **Restrict**, so a restaurant with orders cannot be deleted (safe). Optional relations (customer / coupon / deliveryZone) default to **SetNull** — acceptable.

---

## 3. Atomicity — what is vs is not transactional

**The order-create flow is a COMPENSATING SAGA, NOT a single transaction.** There is no `$transaction` spanning the money mutations. Sequence (`route.ts`):

1. Coupon `usedCount` atomic bump (`:2302-2319`, raw conditional UPDATE)
2. Promo `usedCount` atomic claims (`:2334-2387`)
3. Reward reserve = atomic balance decrement (`:2417-2431` → `reward-ledger.ts` `reserveCredit`)
4. `order.create` **with nested items + modifiers** (`:2449-2554`) — **this single call is an implicit Prisma transaction**, so an order never lands with partial items.
5. **AFTER** create: `writePromotionUsageRows` (awaited, `:2639`), `recordSpendForOrder` (awaited, `:2660`), reservation link, counters.

**Compensation on create-failure (`:2572-2628`):** coupon/promo counters decremented and reward re-credited — but every rollback is **fire-and-forget** (`.catch` only logs; the coupon/promo rollbacks are not even awaited). The code itself documents the residual crash-window: *"a rare failure here leaves a counter over by 1 with no row."* *(→ LR-DB-02, LR-DB-06.)*

**TRULY atomic (good):**

- Reward grant / release / refund each wrap balance-update + ledger-write in `prisma.$transaction` (`reward-ledger.ts:71-86, 189-199, 226-262`).
- Promo release wraps `DELETE … RETURNING` + counter give-back in one `$transaction` (`promo-usage.ts:61-72`).
- The reward balance decrement uses a single atomic `UPDATE … WHERE balance >= applied` (`reward-ledger.ts:119-125`), so it can never over-draw.

**NON-atomic best-effort (by design):** the cross-entity order saga above; the coupon `usedCount` has **no per-order ledger** (unlike `PromotionUsage`), so its reconciliation relies solely on the create-failure rollback. *(→ LR-DB-05.)*

---

## 4. Race conditions

**Well-defended on the hot paths:**

- **Concurrent order on the last coupon slot:** atomic `UPDATE Coupon SET usedCount=usedCount+1 WHERE maxUses IS NULL OR usedCount < maxUses` (`route.ts:2303`) — the race-loser gets 0 rows → 409. Same column-vs-column guard for capped promos (`:2346-2352`).
- **Reward double-spend across two simultaneous orders draining one wallet:** `WHERE balance >= applied` (`reward-ledger.ts:124`) — the loser gets 0 rows, returns insufficient, order proceeds at credit 0. **No negative balance is possible.**
- **Duplicate submission:** `idempotencyKey` unique + `orderNumber` unique both act as DB-level mutexes.
- **Stripe webhook create-vs-create race:** the INSERT of `StripeWebhookEvent` is itself the mutex; P2002 re-reads and only dedups a truly-finished (`processed`/`ignored`) row (`events.ts:46-60`).
- **Kitchen 4s poll:** reads plus an atomic exactly-once print claim `updateMany where kitchenPrintedAt:null` (schema comment `:1348-1354`) — no double-print across web + native + multi-device.

**Residual / known races (all low-probability, mostly self-healing):**

- A webhook retry arriving while the first attempt is **still running** (row status `received`) runs handlers concurrently — the code states this honestly and leans on per-handler idempotency (`events.ts:38-41`).
- The monthly order-cap counter increment is explicitly racy (`route.ts:2705-2708`) — worst case +1 over cap, acceptable.
- The saga crash-window (§3 / LR-DB-02) is a **durability gap, not a concurrency race**.

---

## 5. Migration safety

**The project uses `prisma db push` (schema-diff, no versioned migration history).** Risks, stated plainly:

- **NO down-migrations and NO ordered migration log:** `prisma/migrations/` holds a single `20260502013358_init` plus a `migration_lock.toml` that still declares `provider = "sqlite"` while the live datasource is `postgresql` (`schema.prisma:6-8`). That lock file is a **stale artifact** and would mislead anyone who later tries `prisma migrate`.
- **Dual-branch drift risk** is mitigated by `scripts/push-schema-to-both.ts`, which rewrites `.env.local` to target each `DATABASE_URL` in turn and runs `prisma db push`. It relies on textual parsing of commented / active `DATABASE_URL` lines and restores the file in a `finally` block — **but if the process is killed mid-run, `.env.local` is left toggled**, and there is **no post-push schema-equality assertion**, so a partial run can silently leave one branch behind.
- **The script forwards arbitrary flags, including `--accept-data-loss`** (documented for "restructuring a unique index"). `db push --accept-data-loss` on a hot table (`Order`/`MenuItem`, potentially millions of rows) can **drop/rewrite columns with no staged migration and no rollback path**. The new `@@unique([restaurantId, orderNumber])` is exactly this class of change.
- **No shadow database / CI check** that the schema a commit expects equals what is deployed. Preflight runs `prisma generate` + build, **not a DB diff**.

**Net:** additive changes are safe; any destructive or unique-index restructure is a **manual, unversioned, irreversible operation performed directly against production branches**. *(→ LR-DB-03.)*

---

## 6. Indexes / performance

**Hot-path indexing is thoughtful.** `Order` carries composite indexes for the kitchen poll (`[restaurantId, status, notifiedAt]`, `schema.prisma:1462`), reports (`[restaurantId, status, createdAt]`, `[restaurantId, channel, createdAt]`), and webhook reconciliation (`[shipdayOrderId]`, `[paypalCaptureId]`, `:1448-1449`). `Coupon` has `[customerId, isActive]`; `Restaurant` indexes `graceEndsAt` for the dunning sweep.

**Concerns:**

- **Customer order-page render is a chain of SEQUENTIAL, UNCACHED Neon round-trips per request** (~15 total): `restaurant.findUnique` (`page.tsx:88`) → `resolveInheritedHours` (`:117`) → `resolveInheritedZones` (`:118`) → `promotion.findMany` (`:163`) → `rewardEarnRule.findMany` (`:265`) → `menuCategory.findMany` with nested item/modifier includes (`:287`) → `order.count` (`:429`) → `sandboxRestaurant.findUnique` (`:452`). **No `unstable_cache` / React `cache` / `revalidate` anywhere** (grep found none). Every anonymous customer hitting `/order/[slug]` pays the full serial latency; the restaurant-by-slug, entitlement, and menu reads are the exact lookups AGENTS.md flags as cacheable seams — the seam is currently **unimplemented**. *(→ LR-DB-07.)*
- **Unbounded `findMany` in cron / background paths (no `take`):** `prospect.findMany` (`cron/kickstarter-invites/route.ts:106`), `prospectImport.findMany` (`:91`), `kickstarterState.findMany` (`:55`), and `order.findMany` over **all** pending + notified orders platform-wide every minute (`cron/ios-ring-pending/route.ts:99`). Others DO cap (`vip-schedules` `take:500`, `cleanup-sandboxes` `take:200`). The prospect-list load is the most likely to balloon in memory as import lists grow. *(→ LR-DB-04.)*
- **Money columns are `Float` throughout** with `round2` / `Math.round(x*100)/100` discipline; correct today, but floats accumulate rounding error at volume — **integer-cents is the scale-safe choice** worth planning. *(→ LR-DB-10.)*

---

## 7. Timezone & currency

**Timezone (consistent and correct):** `Restaurant.timezone` (default `America/New_York`) is the single anchor; hours are stored canonically as 24h `HH:MM` regardless of display (`schema.prisma:24-30`) and `Restaurant.hoursFormat` controls only rendering. Scheduled-order parsing is done in the restaurant's local tz and the **same `Date` object is reused** for the kitchen `estimatedReady`, so the two can't drift (`route.ts:2510-2514`). `scheduledSlotMinutes` **freezes** the promised window server-side at placement, so later settings changes can't rewrite it (`schema.prisma:1338-1345`). Reward earn rules convert picked dates to tz day-bounds at the admin API, so rule evaluation stays tz-free (`schema.prisma:2256-2259`). The standing MEMORY rule "hours match restaurant format" is honored in the loader.

**Currency (centralized and correct):** `formatCurrency(amount, currency)` uses `Intl.NumberFormat` with a per-currency default locale (`utils.ts:18-38`, USD/CAD/EUR/GBP/AUD…) and falls back to `en-US`/USD on an unknown code rather than throwing (`:24-27`). `Restaurant.currency` (ISO-4217 lowercase) drives the Stripe PaymentIntent currency, the PayPal order currency, and all display. **Minor:** the fallback silently mis-renders an unrecognized code as USD — acceptable since the pricing engine validates codes on save, but a bad code would be **invisible rather than loud**.

---

## 8. Backup / PITR / restore

**This is the highest residual operational risk and is NOT addressable from the codebase.** Restating the known posture: there is **NO automated application-level backup, NO tested restore runbook, and Neon Point-in-Time Recovery is tier-dependent and — per project notes — UNVERIFIED.**

For a system that is the source of truth for customer money (reward wallets, coupon/promo caps, order + payment state, subscription/commission ledgers), the absence of a proven restore path means a bad `db push --accept-data-loss`, an accidental branch reset, or a Neon incident could be **unrecoverable**. The append-only ledgers (`RewardLedger`, `PromotionUsage`, `CustomerCoupon`, `SubscriptionInvoice`) make the data **reconstructable in principle** — but **only if the rows themselves survive**, and they share the same database with no independent export.

**Recommended before scaling customer money:** (a) confirm the Neon PITR retention window on the current plan and **document the exact restore procedure**; (b) run **one real restore drill** to a scratch branch; (c) add a **scheduled logical export (`pg_dump`)** of at least the money tables to object storage. *(→ LR-DB-01.)*

---

## 9. Findings

**10 findings** — **1 Critical, 1 High, 3 Medium, 3 Low, 2 Informational**. Ordered by severity; IDs `LR-DB-01…10`. The backup/DR gap is rendered **Critical** (elevated from the auditor's High): for a live, payments-adjacent product, an unrecoverable data loss is the single highest-impact failure mode, and it is unmitigated.

---

### LR-DB-01 — No automated backup and no tested restore path (Neon PITR unverified)
- **Severity:** Critical
- **Component:** Backups / restore
- **Affected paths:** `prisma/schema.prisma` (whole DB); operational (Neon)
- **Description:** No automated application backup, no tested restore, and Neon PITR is tier-dependent and unverified — for a database that is the sole source of truth for customer wallets, coupon/promo caps, orders, payments, and subscription / commission ledgers.
- **Failure / scenario:** An accidental `prisma db push --accept-data-loss`, a Neon branch reset, or a provider incident corrupts or drops money tables; there is no proven procedure to restore to a known-good point.
- **Impact:** Potentially **unrecoverable** loss of customer balances and financial records; regulatory / trust exposure for a payments-adjacent product. Unmitigated by any application code.
- **Evidence:** No backup/export job in `vercel.json` crons; ledgers share the one database with no independent export; PITR retention not documented anywhere in-repo.
- **Recommended remediation:** (a) Confirm and **document** Neon PITR retention on the current plan; (b) perform one real **restore drill** to a scratch branch; (c) add a scheduled `pg_dump` of at least the money tables (`Order`, `OrderItem`, `RewardLedger` / `RewardAccount`, `PromotionUsage`, `CustomerCoupon`, `SubscriptionInvoice`, `MarketplaceSettlement`, `CommissionTransaction`) to object storage.
- **Professional review required:** No — operational work; owner/ops to schedule the drill and export. Highest priority in this domain.

### LR-DB-02 — Order-create saga can debit a reward wallet with no spend ledger row
- **Severity:** High
- **Component:** Order-create saga durability
- **Affected paths:** `src/app/api/orders/route.ts:2389-2435, 2657-2662`; `src/lib/reward-ledger.ts:101-166`
- **Description:** Reward Dollars are decremented atomically (`reserveCredit`) **BEFORE** `order.create`, and the matching spend ledger row is written **AFTER** create by `recordSpendForOrder`. No transaction spans the two. If the serverless process dies (or Vercel tears down the lambda after the response) between a successful `order.create` and the awaited `recordSpendForOrder`, the customer's wallet balance is debited with **NO** spend ledger row tied to the order.
- **Failure / scenario:** Customer applies $8 store credit; `reserveCredit` decrements balance by $8; `order.create` succeeds; the lambda is killed before `recordSpendForOrder` persists. The $8 is gone from the balance but no `spend` row exists, so `releaseForOrder` / `refundForOrder` (which key off a spend row with status `applied`) can never return it. The credit is **silently lost** to the customer with no ledger trace.
- **Impact:** Silent customer money loss with no audit row; unreconcilable because the release/refund paths require the missing spend row. Low probability per order but scales linearly with order volume and is **invisible** (no alert).
- **Evidence:** Confirmed by code path; the route comments acknowledge the analogous "counter over by 1 with no row" window for promos.
- **Recommended remediation:** Either wrap `reserveCredit` + `order.create` + `recordSpendForOrder` in a single interactive `$transaction`, OR write the spend ledger row inside the SAME implicit transaction as `order.create` (nested create / claim row created with the order), OR add a reconciliation cron that detects `RewardAccount` debits lacking a spend row within N minutes and re-credits.
- **Professional review required:** No — code fix; framed High for money-loss impact despite low per-event probability.

### LR-DB-03 — Unversioned `db push` migrations with `--accept-data-loss` against production
- **Severity:** Medium
- **Component:** Migration model
- **Affected paths:** `prisma/migrations/migration_lock.toml:3`; `scripts/push-schema-to-both.ts:73-77`; `prisma/schema.prisma:6-8`
- **Description:** Schema is managed by `prisma db push` with no versioned migration history or down-migrations. `migration_lock.toml` declares `provider=sqlite` while the datasource is `postgresql`. The push-to-both script forwards `--accept-data-loss` and performs **no post-push equality assertion**; a mid-run kill leaves `.env.local` toggled and one branch un-pushed.
- **Failure / scenario:** A destructive / unique-index change is pushed to branch A, the script (or operator) is interrupted before branch B, and there is no diff check to catch the drift; a later `--accept-data-loss` push rewrites a hot-table column with no rollback path.
- **Impact:** Silent dev/prod schema drift; irreversible destructive changes against production with no migration audit trail.
- **Evidence:** Consistent with the AGENTS.md / MEMORY stated model; the `sqlite` lock line is a concrete latent hazard (`migration_lock.toml:3`).
- **Recommended remediation:** Adopt `prisma migrate` with a shadow DB (or at minimum add a post-push `prisma migrate diff` / schema-hash assertion per branch in preflight); fix or remove the `sqlite` `migration_lock`; forbid `--accept-data-loss` outside a reviewed, staged step.
- **Professional review required:** No — engineering process change.

### LR-DB-04 — Unbounded `findMany` in cron / background paths
- **Severity:** Medium
- **Component:** Cron memory bounds
- **Affected paths:** `src/app/api/cron/kickstarter-invites/route.ts:91,106`; `src/app/api/cron/ios-ring-pending/route.ts:99`
- **Description:** Several background `findMany` calls have no `take` cap: `prospect.findMany` and `prospectImport.findMany` (per-restaurant prospect lists can be large) and an every-minute `order.findMany` over **all** pending + notified orders platform-wide.
- **Failure / scenario:** A restaurant imports a large prospect list, or the platform accumulates many concurrent pending orders; the cron loads the full set into memory each run.
- **Impact:** Growing memory / latency and potential OOM in the cron lambda as data grows toward the 1k–10k user target.
- **Evidence:** `vip-schedules` uses `take:500` and `cleanup-sandboxes` uses `take:200`; these three paths do not.
- **Recommended remediation:** Add `take` caps + cursor pagination (mirror `vip-schedules take:500` / `cleanup-sandboxes take:200`) and scope `order.findMany` by a time floor with an index-covered LIMIT.
- **Professional review required:** No — mechanical hardening.

### LR-DB-05 — Classic coupon `usedCount` may not release on reject / cancel / refund
- **Severity:** Medium
- **Component:** Coupon usedCount reconciliation
- **Affected paths:** `src/app/api/orders/route.ts:2302-2319, 2577-2588`
- **Description:** Classic `Coupon.usedCount` is bumped atomically at placement and is given back **ONLY on `order.create` failure**. Unlike promos (`PromotionUsage` per-order ledger), there is no ledger tying a coupon use to an order, so a later reject / cancel / refund does not appear to release the coupon use.
- **Failure / scenario:** A customer places an order with a `maxUses`-limited coupon (`usedCount` bumped), the kitchen rejects it; the coupon use is not returned, permanently consuming one of a limited pool.
- **Impact:** Legitimate customers can be denied a still-valid limited coupon after rejected / cancelled orders; caps over-tighten over time.
- **Evidence:** Placement-time bump + create-only rollback confirmed in `route.ts`; the reject-path give-back was **NOT located** and should be verified before relying on this finding.
- **Recommended remediation:** Verify the reject/cancel/refund paths; if no give-back exists, add a per-order coupon-usage ledger (mirror `PromotionUsage`) so classic-coupon caps release on non-fulfillment exactly-once, or move coupon redemption to the fulfillment-based `CustomerCoupon` ledger uniformly.
- **Professional review required:** Yes — **PLAUSIBLE, needs verification** of the reject path before scheduling the fix.

### LR-DB-06 — Compensation rollbacks are fire-and-forget
- **Severity:** Low
- **Component:** Best-effort compensation
- **Affected paths:** `src/app/api/orders/route.ts:2577-2604`
- **Description:** On `order.create` failure the coupon/promo counter rollbacks are unawaited fire-and-forget and the reward re-credit is awaited but only `.catch`-logged. If a rollback itself fails, the counter / balance stays skewed with only a log line.
- **Failure / scenario:** `order.create` throws for a non-duplicate reason and the compensating UPDATE also fails (transient DB error); the coupon/promo counter is left over by 1.
- **Impact:** Slow cap drift requiring manual DB repair; the code accepts this trade-off explicitly.
- **Evidence:** Rollbacks at `route.ts:2577-2604` are not awaited; only `console.error` on failure.
- **Recommended remediation:** Prefer wrapping claim + create in one transaction (auto-rollback) so no compensation is needed; if kept, at least `await` the counter rollbacks and emit a **monitored alert** (not just `console.error`).
- **Professional review required:** No — subsumed by the LR-DB-02 transaction fix if adopted.

### LR-DB-07 — Customer order page issues ~15 sequential uncached DB round-trips
- **Severity:** Low
- **Component:** Order-page hot-path caching
- **Affected paths:** `src/app/order/[slug]/page.tsx:88,117,118,163,265,287,429,452`
- **Description:** The customer ordering page issues ~15 sequential, uncached database round-trips per render with no `unstable_cache` / React `cache` / `revalidate`. AGENTS.md explicitly flags restaurant-by-slug, entitlement, and menu reads as cacheable seams; the seam is unimplemented.
- **Failure / scenario:** At 1k+ concurrent customers, each page render serially awaits restaurant, inherited hours, inherited zones, promotions, earn rules, menu (nested includes), prior-order count, and sandbox lookups.
- **Impact:** Latency and DB connection pressure scale with traffic on the single most-hit customer route.
- **Evidence:** grep found no cache/revalidate wrapper on the loader; the eight enumerated reads are sequential `await`s.
- **Recommended remediation:** Introduce a short-TTL cache (`unstable_cache` / React `cache`) for the slug→restaurant, entitlements, and active-menu reads; parallelize the independent lookups with `Promise.all` where no data dependency exists.
- **Professional review required:** No — performance hardening on the hot path; verify no stale-menu regression after adding TTLs.

### LR-DB-08 — Reward ledger unique constraint does not dedupe null-orderId admin grants
- **Severity:** Low
- **Component:** Reward ledger unique constraint on nullable `orderId`
- **Affected paths:** `prisma/schema.prisma:2247`; `src/lib/reward-ledger.ts:50-93`
- **Description:** `@@unique([accountId, orderId, reason])` does not dedupe rows with `orderId = NULL` (Postgres treats NULLs as distinct), and `grant()` only performs its own idempotency pre-check when `opts.orderId` is set. Admin manual grant/adjust with a null `orderId` is therefore unguarded.
- **Failure / scenario:** An admin double-clicks "grant credit" (null `orderId`); two ledger rows and two balance increments are written.
- **Impact:** Duplicate **admin-initiated** credit. Customer order / signup / earn / spend paths pass synthetic non-null `orderId`s and are **NOT affected**.
- **Evidence:** `reward-ledger.ts:50-93` idempotency pre-check is gated on `opts.orderId` being present.
- **Recommended remediation:** Require a non-null synthetic `orderId` for every grant (e.g. `adjust:<uuid>` supplied by the caller), or add an application-level idempotency key to admin grant actions.
- **Professional review required:** No — bounded to the admin console.

### LR-DB-09 — Loose FKs on money side-tables rely on a "never hard-delete Order" invariant
- **Severity:** Informational
- **Component:** Loose FK on money side-tables
- **Affected paths:** `prisma/schema.prisma:1951, 2011, 2241`
- **Description:** `PromotionUsage.orderId`, `CustomerCoupon.appliedOrderId`, and `RewardLedger.orderId` are loose references with no FK (deliberate, to keep the hot `Order` table free of back-relations). Referential integrity and orphan cleanup are app-enforced only.
- **Failure / scenario:** If an `Order` were ever hard-deleted (currently orders are not hard-deleted), its ledger / usage rows would be orphaned with no DB cascade.
- **Impact:** None today; a latent integrity assumption that must be preserved (**never hard-delete `Order` rows**). Note the tension with any future retention/purge tooling (see privacy doc LR-PRIV-01/07).
- **Evidence:** No `@relation` FK on the three `orderId` fields.
- **Recommended remediation:** Document the "no hard-delete of `Order`" invariant near these models and in any future data-retention / purge tooling; consider a periodic orphan-audit query.
- **Professional review required:** No — documentation / invariant preservation.

### LR-DB-10 — Money is stored as `Float` rather than integer cents
- **Severity:** Informational
- **Component:** Float money representation
- **Affected paths:** `prisma/schema.prisma:1249-1257` (`Order` money columns); `src/lib/reward-math.ts` (`round2`)
- **Description:** All monetary values are `Float` with `round2` / `Math.round(x*100)/100` discipline rather than integer cents.
- **Failure / scenario:** High order volume with repeated proportional allocations (e.g. `earnBasisForOrder` proportional discount) accumulates floating-point rounding error.
- **Impact:** Currently controlled by consistent rounding; a scale/audit risk rather than a present defect.
- **Evidence:** `Order` money columns typed `Float`; rounding centralized in `reward-math.ts`.
- **Recommended remediation:** Plan a migration to integer-cents (or Prisma `Decimal`) for money columns before high volume; at minimum add invariant tests that reconstruct order totals from ledger sums.
- **Professional review required:** No — roadmap item; couple any migration with the LR-DB-03 migration-safety work.

---

## 10. Remediation priority (continuing-operation)

| Priority | Findings | Rationale |
|---|---|---|
| **P0 — do now (operational Critical)** | LR-DB-01 | No proven restore for the money source-of-truth; unmitigated by code. Document PITR, run one restore drill, add a `pg_dump` export. |
| **P1 — schedule promptly (money durability)** | LR-DB-02 | Silent, invisible customer-credit loss on lambda teardown; wrap the reserve/create/spend in one transaction or add a reconciliation cron. |
| **P2 — process + memory hardening** | LR-DB-03, LR-DB-04, LR-DB-05 | Migration safety (irreversible `--accept-data-loss` on prod), unbounded cron reads, and the coupon-release gap (verify first). |
| **P3 — hot-path + correctness cleanup** | LR-DB-06, LR-DB-07, LR-DB-08 | Awaited/monitored compensation, order-page caching, admin-grant idempotency. |
| **P4 — track / roadmap** | LR-DB-09, LR-DB-10 | Preserve the no-hard-delete invariant; plan integer-cents money migration. |

*Every remediation above is subject to the AGENTS.md standing rules — no regressions (trace hot paths, run `npm run preflight`), i18n parity for any new user-facing string, and schema changes pushed to **both** Neon branches via `scripts/push-schema-to-both.ts`. LR-DB-03 in particular means any schema change made to fix these findings must itself follow the safe-migration discipline it recommends.*
