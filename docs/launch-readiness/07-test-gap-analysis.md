# Launch-Readiness Audit — 07: Test-Gap Analysis

**Date:** 2026-07-10. Companion to `01-system-inventory.md`, `02-architecture-and-data-flow.md`, `03-payment-and-stripe-connect-audit.md`, and `04-security-audit.md`.

**Audit context.** The platform went **live on 2026-07-10**; this deliverable governs continuing live operation, not a pre-launch gate. It answers one question: *if a future change silently breaks a money-critical or tenant-isolation guarantee, would anything catch it before customers do?* Findings were produced by a **read-only** test-coverage auditor who inventoried the automated test suite, mapped it against the twelve test types a live-money multi-tenant platform needs, and checked the fourteen required payment scenarios against actual tests. No code was modified. Raw findings are rendered in §6 as `LR-TEST-01…07`, ordered by severity.

> **Standing owner rule honored throughout.** Per Luigi's directive, no source, config, or test file was changed by this audit. Every remediation below is a recommendation. Nothing in this document contains a secret value.

---

## 1. Executive posture

**Lead result — the unit layer is genuinely strong, but it is the *only* layer.** The suite is **591 test cases across 51 project test files** under `src/`, run by Vitest (`vitest run`, also embedded in `npm run preflight`). Coverage of pure business logic is real and deep: the promotions engine (~15 files — eligibility, unit-ownership, stacking, tie-break, GloriaFood parity), the rewards/wallet ledger (including a refund-flow test that drives the ledger lifecycle over an in-memory Prisma mock), payment math (`stripe-minor-units` zero-decimal conversion, `capture-idempotency` error classification, `payment-methods` accepted-method gating), service fees, platform tax, commission, pizza pricing, and the full hours/scheduling stack. If a refactor breaks how a promotion stacks or how minor units convert, a test will very likely fail. **That protection is worth keeping and building on.**

**Principal gap — 100% of the suite is co-located pure-function unit tests, and nothing enforces them.** There is **no integration, API, authorization, tenant-isolation, DB-constraint, webhook, E2E, load, failure-injection, or backup-restore layer** — and **no CI**. `.github/workflows` is absent, there are no git hooks, and the Vercel build runs `prisma generate && next build`, which does **not** run Vitest. A push to `main` deploys straight to production **whether or not the 591 tests were ever run and whether or not they passed**. The green suite is enforced purely by a developer remembering to run `npm run preflight` before pushing. This inverts the usual safety model: the platform's most sensitive code (payment reconciliation, webhook idempotency, cross-tenant write scoping) is the code with **zero** automated coverage, and even the coverage that exists is not a release gate.

**Where the risk concentrates.** Four High-severity gaps stand out because each guards a guarantee the codebase has *already broken once* or that moves real money:

1. **No CI / release gate (LR-TEST-01).** The single highest-leverage gap. Until every push runs the suite and blocks on failure, every other test written below is only as protective as a developer's memory.
2. **No authorization / tenant-isolation tests (LR-TEST-02).** Of 291 route handlers, 204 call `getSessionUser` but only ~15 grep as `restaurantId`-scoped. The C1/C2 modifier-IDOR criticals in the project's own history are a *dropped `restaurantId` from a where-clause* — exactly the regression a route-authorization harness would catch, and exactly the class with zero coverage today.
3. **No webhook-idempotency tests (LR-TEST-03).** The Stripe/PayPal dedup/replay/out-of-order logic (claim-first INSERT mutex, status-gated reprocess) is subtle, correctness-critical, and completely unverified. Providers retry for days; a wrong status gate means double-capture or a silently-unpaid order.
4. **No payment-scenario tests (LR-TEST-04).** All fourteen required money scenarios — amount tamper, double-submit, refund retry, payment-succeeds-order-fails — are implemented with idempotency keys and reconciliation guards but have **zero** automated proof. A refactor could remove the amount-reconciliation check and all 591 tests would stay green.

**Overall verdict: LAUNCH-ACCEPTABLE with an urgent, sequenced test-hardening program.** No test *failure* was found — the existing tests pass and are well-written. The risk is entirely one of **coverage and enforcement**: the layers that would catch the platform's most expensive failure modes do not exist, and the layer that does exist cannot block a bad deploy. LR-TEST-01 (CI) is the prerequisite that makes everything else protective and should land first.

---

## 2. Existing test inventory

**Runner.** Vitest — `vitest.config.ts` (`include: src/**/*.test.ts`, `environment: node`). Command `npm test` = `vitest run`; also invoked inside `npm run preflight` (tsc → prisma generate → vitest → `next build`).

**Totals.** **51 project test files** under `src/`, **591 `it`/`test` cases**. (An earlier count of "53 files" included non-`src`/historical files; the live figure is 51.) **100% are co-located pure-function unit tests.** There is no integration, API, or end-to-end layer.

**By domain:**

| Domain | Coverage |
|---|---|
| **Promo engine** (largest cluster, ~15 files) | `promo-engine`, `promo-types`, `promo-fields`, `promo-validation`, `promo-window`, `promo-exclusion`, `promo-once-per-order`, `promo-buy-n-get-free`, `promo-bogo-extra-charges`, `promo-gloriafood-parity`, `promo-order-context`, `combo`, `money-breakdown` — strong unit coverage of eligibility, unit-ownership, stacking, tie-break. |
| **Rewards / wallet** | `reward-math`, `reward-rules`, `reward-earn-gate`, `reward-refund-flow` (drives the ledger lifecycle over an in-memory Prisma mock — the **one** place webhook-shaped DB logic is exercised), `vip-membership`, `vip-schedules`. |
| **Payments / money** | `stripe-minor-units` (zero-decimal currency conversion), `capture-idempotency` (11 tests — classifies capture errors as money-moved vs real failure), `payment-methods` (16 tests — accepted-method gating), `service-fees`, `platform-tax`, `commission`, `money-breakdown`, `pizza-topping-pricing`, `pizza-pricing`. |
| **Hours / scheduling** | `service-hours`, `service-labels`, `restaurant-hours`, `schedule-slots`, `holidays`, `holiday-rules`, split/`reservation-validation`. |
| **Misc lib** | `utils`, `phone`, `password`, `encrypt`, `locales`, `format-time`, `fiscal-countries`, `dunning`, `receipt-schema`, `setup-checklist`, `restaurant-url`, `menu-dedupe`, `menu-fulfilment`, `menu-visibility`, `menu-import/gloriafood`, `safe-json-ld`, `login-protection`, `unsubscribe`, `vies`. |

**Mocking posture.** 8 files use `vi.mock('@/lib/db')` with bespoke in-memory Prisma fakes. There is **no** shared test DB, **no** factory/fixtures library, **no** supertest/Next route harness, **no** Stripe mock/sandbox harness, and **no** Playwright/Cypress E2E.

---

## 3. Coverage matrix (test type vs state)

Legend: **PRESENT** / **PARTIAL** / **ABSENT**. "Priority to add" reflects blast radius on a live-money multi-tenant platform.

| Test type | State | Priority to add | Notes |
|---|---|---|---|
| Unit (pure functions) | **PRESENT (strong)** | — (maintain) | 591 cases; promo / reward / pricing / hours well covered. |
| Integration (multi-module w/ DB mock) | **PARTIAL** | Medium | Only the reward ledger + ~8 files, via hand-rolled in-memory Prisma. |
| API / route-handler | **ABSENT** | **High** | 0 of 291 `route.ts` have a test. |
| Authorization (per-route session + tenant scope) | **ABSENT** | **High** | 0 tests assert 401/403 or ownership; 204 routes call `getSessionUser`, only ~15 grep as `restaurantId`-scoped — the scope guard is unverified. |
| Tenant-isolation (cross-restaurant IDOR) | **ABSENT** | **High** | 0 tests; history has 3 IDOR criticals (C1/C2 modifier PATCH/POST, per `STABILIZATION-PLAN`). |
| DB / constraint (unique, FK, cascade) | **ABSENT** | Medium | `idempotencyKey`/`orderNumber` unique + P2002 dedup paths never asserted against a real schema. |
| Migration / schema-drift | **ABSENT** | Medium | Two Neon branches kept in sync by a script, never test-verified. |
| Stripe sandbox (live API shape) | **ABSENT** | Medium | `createDirectPaymentIntent` / `refundDirectPayment` / capture never hit test-mode Stripe. |
| Webhook (dedup / replay / out-of-order) | **ABSENT** | **High** | `dispatchStripeEvent` claim-first idempotency + PayPal/ShipDay dedup untested. |
| E2E ordering (browser) | **ABSENT** | Medium | No Playwright; hot path (order → pay → kitchen) unguarded. |
| Load / concurrency | **ABSENT** | Medium | 10k-user target has no perf/soak test. |
| Failure-injection (Stripe/Resend/DB down) | **ABSENT** | Medium | Fire-and-forget + fail-closed branches untested. |
| Backup / restore (DR) | **ABSENT** | Low (but critical elsewhere) | No documented or tested restore drill. Tracked operationally in `08-incident-response-and-runbooks.md`. |

**Continuous integration: ABSENT.** No `.github/workflows`, no husky/git hooks, no Vercel test step. The 591 green tests are enforced **only** by developer discipline running `npm run preflight` before push. Any push that skips preflight ships untested — and Vercel still deploys, because **build ≠ test**.

---

## 4. Payment-scenario coverage checklist

The fourteen scenarios a live-money platform must guarantee, the guard that exists in code, and whether a test proves it. **Every guard is real, commented code — and every test is ABSENT.**

| # | Scenario | Guard in code | Test? |
|---|---|---|---|
| 1 | Double-click Pay | `idempotencyKey` `pi_create_${orderId}` (payment-intent route) | **ABSENT** |
| 2 | Refresh during payment | order `paymentStatus !== 'pending'` rejects (payment-intent L102) | **ABSENT** |
| 3 | Network timeout / retry | `createDirectPaymentIntent` idempotency | **ABSENT** |
| 4 | Repeated (duplicate) webhook | `dispatchStripeEvent` claim-first INSERT mutex + status gate (`events.ts`) | **ABSENT** |
| 5 | Out-of-order webhook | `events.ts`: `received`/`failed` reprocess vs `processed`/`ignored` dedup | **ABSENT** |
| 6 | Expired / invalid session on refund | `getSessionUser` `preferKitchen` + role check (refund route L31-57) | **ABSENT** |
| 7 | Failed 3DS | client-confirm path; server has no assertion | **ABSENT** |
| 8 | Insufficient funds (charge/refund decline) | refund route catch → `refundStatus 'failed'` | **ABSENT** |
| 9 | Menu price changed mid-checkout | payment-intent amount reconciliation vs `order.total` (L92-110) | **ABSENT** |
| 10 | Coupon/reward-limit race | orders route credit claim + `refundRewardClaim` on P2002 loser (L2431/2601) | **ABSENT** |
| 11 | Refund retry (double-click refund) | cumulative-total `idempotencyKey` `refund_${id}_${cents}` | **ABSENT** |
| 12 | Refund-after-payout | not handled (relies on Stripe balance decline) | **ABSENT** |
| 13 | Dispute-after-payout | `charge.dispute` events → `handleChargeEvent` | **ABSENT** |
| 14 | Payment succeeds but order write fails | orders route P2002 fallback re-reads existing order (L2606-2619) | **ABSENT** |

*(Also tracked: amount tampering — a $50 order authorizing $0.50 — is the reconciliation guard that is the documented P0 fix; likewise untested.)*

**Bottom line:** every money-critical guard above is real code with an explanatory comment but **zero automated proof it works or stays working**. A refactor could silently remove the amount-reconciliation check and 591 tests would stay green.

---

## 5. The no-CI impact (why this is the top item)

Today the safety model is: *"the 591 tests are green because a human ran them."* That fails in three compounding ways on a live platform:

- **A skipped `preflight` ships untested code.** Nothing blocks a push that never ran the suite. Vercel promotes to production on the build succeeding, and the build never runs Vitest.
- **A *failing* test does not block a deploy either.** Even a developer who runs the tests can push over a red result; there is no gate.
- **The gap widens as the suite grows.** Every test written per §6 below is only protective once CI enforces it. Without CI, adding tests raises confidence but not the actual floor — the floor stays at "whatever the last person remembered to run."

This is why **LR-TEST-01 is the prerequisite for the entire remediation program.** The recommendation is a GitHub Actions workflow (or a Vercel `ignoreCommand`) that runs `npm run preflight` on every push/PR and blocks merge/deploy on failure, plus a husky `pre-push` hook as a local backstop.

---

## 6. Prioritized "tests to write first"

**P0 — write first (money + tenant safety, highest blast radius):**

1. **CI pipeline** — GitHub Actions (or Vercel `ignoreCommand`) running `npm run preflight` on every push/PR; add a husky `pre-push` as a local backstop. Single highest-leverage item; everything below is worth more once it can't regress silently.
2. **Webhook idempotency suite** (`dispatchStripeEvent`) — duplicate delivery → `skipped_duplicate`; retry while status `received`/`failed` → reprocess; `processed`/`ignored` → dedup forever; handler throw → row `failed` + 500 (so Stripe retries). Extend the in-memory Prisma pattern already used by `reward-refund-flow.test.ts`. Mirror for PayPal + ShipDay.
3. **Payment-intent reconciliation suite** — amount mismatch (tamper) → 400; wrong restaurant (cross-tenant order id) → 404; non-card / non-pending order → 400; `feature_locked` without `card_payments` → 402; credit-applied chargeable math.
4. **Refund idempotency + bounds suite** — cumulative `idempotencyKey` stability on double-click; `exceeds_balance`; partial → full transitions; full refund fires reward make-whole **exactly once** (partly covered by `reward-refund-flow` — extend to the route).
5. **Authorization harness** — a parameterized test that, for every `/api` route, asserts unauthenticated → 401 and cross-tenant id → 403/404. Seed it with the modifier PATCH/POST IDOR regression (C1/C2) as the first cases.

**P1 — next:**

6. **Orders-route placement** — `idempotencyKey` P2002 dedup returns the same order (no double charge / double credit spend); credit claim released when the losing racer aborts.
7. **Capture path** — payment-intent handler marks order paid exactly once; capture-error classification wired end-to-end (unit exists; add the handler integration).
8. **DB-constraint tests against an ephemeral Postgres** (unique `idempotencyKey`/`orderNumber`, FK cascade on order items) — catches drift the two-Neon-branch script can't.
9. **Failure-injection** — Stripe/Resend throw → customer route still 200 fast (fire-and-forget); refund still recorded; reward make-whole retried.

**P2 — after the above:**

10. **Stripe test-mode contract tests** (real sandbox) for create/capture/refund to catch API-shape drift.
11. **E2E (Playwright) happy path** — order → card pay → webhook → kitchen tile → refund.
12. **Load / soak** on the two hot paths (customer order render, kitchen 4s poll) against the 10k target.
13. **Migration test** (apply migrations to empty DB, assert schema) + a documented, rehearsed backup-restore drill.

---

## 7. Findings

**7 findings** — **4 High, 2 Medium, 1 Low.** No test *failure* was found; every finding is a coverage/enforcement gap. Ordered by severity; IDs `LR-TEST-01…07`.

---

### LR-TEST-01 — No CI / release gate: the 591 tests never run at deploy time
- **Severity:** High
- **Component:** Continuous integration / release gate
- **Affected paths:** `C:/FeeFreeOrderingSystems` (no `.github/workflows`, no `.husky`; `vercel.json` has crons only); `package.json` (`preflight` script)
- **Description:** There is no CI. The 591 unit tests run only when a developer manually invokes `npm run preflight` (or `npm test`) before pushing. Vercel builds with `prisma generate && next build`, which does **not** run Vitest, so a deploy succeeds even when tests fail or were never run. Green tests are enforced purely by discipline.
- **Failure scenario:** A change to the amount-reconciliation guard in `payment-intent/route.ts` is pushed without running preflight. No route test exists to catch it anyway — but even a broken unit test would not block the deploy; Vercel ships it.
- **Impact:** Any regression a test would catch can still reach production. As the suite grows the gap widens; the safety net is invisible at deploy time.
- **Recommended remediation:** Add a GitHub Actions workflow (or Vercel `ignoreCommand`) that runs `npm run preflight` on every push/PR and blocks merge/deploy on failure. Add a husky `pre-push` hook as a local backstop. This is the prerequisite that makes every other test below actually protective.
- **Professional review required:** No — mechanical CI setup; verify it runs the exact preflight sequence and fails the deploy on a red result.

### LR-TEST-02 — No authorization / tenant-isolation tests on 291 route handlers
- **Severity:** High
- **Component:** Authorization & tenant-isolation testing
- **Affected paths:** `src/app/api/**/route.ts` (291 handlers; 204 call `getSessionUser`, only ~15 grep as `restaurantId`-scoped)
- **Description:** Zero tests assert per-route authorization (401 for no session, 403/404 for cross-tenant access) or restaurant-scoped ownership on writes. The `CLAUDE.md` security rule ("restaurant-scoped writes must check the user owns the restaurant") and the project's own history of 3 IDOR criticals (`STABILIZATION-PLAN` C1/C2 modifier PATCH/POST) are guarded only by manual code review.
- **Failure scenario:** A refactor drops `restaurantId` from a menu/modifier/order `updateMany` where-clause (exactly the C1/C2 bug). Restaurant A can then mutate Restaurant B's data. No test fails.
- **Impact:** Cross-tenant data tampering / IDOR on a multi-tenant money platform — the highest-severity class of bug this codebase has already shipped once.
- **Recommended remediation:** Build a route-authorization harness: parameterized tests asserting unauthenticated → 401 and cross-tenant resource id → 403/404 for every mutating route. Seed it with the modifier PATCH/POST IDOR as regression cases.
- **Professional review required:** Partial — decide the canonical fixture set (two seeded restaurants + roles) once; the per-route assertions are then mechanical.

### LR-TEST-03 — No webhook-idempotency tests (Stripe / PayPal / ShipDay)
- **Severity:** High
- **Component:** Webhook idempotency & ordering
- **Affected paths:** `src/lib/stripe/events.ts` (`dispatchStripeEvent`); `src/app/api/webhooks/{stripe,paypal,shipday}/route.ts`
- **Description:** The webhook dedup/replay/out-of-order logic is subtle (claim-first INSERT as mutex, P2002 re-read, status-gated reprocess of `received`/`failed` vs permanent dedup of `processed`/`ignored`) and completely untested. Stripe retries up to ~3 days and PayPal up to 25 times; correctness here prevents double-capture and double-refund.
- **Failure scenario:** A duplicate `payment_intent.succeeded` arrives while the first is still `received`; both run handlers concurrently. Or a handler bug flips the status gate so genuine retries get swallowed and an order never marks paid. Neither path has a test.
- **Impact:** Double-processed payments/refunds, or silently dropped events (unpaid orders shown paid, or paid orders never captured).
- **Recommended remediation:** Add an idempotency suite driving `dispatchStripeEvent` over the existing in-memory Prisma mock (see `reward-refund-flow.test.ts`): duplicate → `skipped_duplicate`, in-flight → reprocess, finalized → dedup, handler-throw → `failed` + rethrow. Mirror for PayPal and ShipDay.
- **Professional review required:** No — extends an established in-memory-mock pattern already in the suite.

### LR-TEST-04 — No payment-scenario tests: all 14 money guards unverified
- **Severity:** High
- **Component:** Payment-scenario coverage (checkout money path)
- **Affected paths:** `src/app/api/public/payment-intent/route.ts`; `src/app/api/orders/[id]/refund/route.ts`; `src/app/api/orders/route.ts`
- **Description:** The 14 required payment scenarios (double-click Pay, refresh mid-payment, amount tamper, coupon/reward race, refund retry, payment-succeeds-order-fails, etc.) are all implemented with idempotency keys and reconciliation guards but have zero tests. The reconciliation guard (client amount vs server `order.total`, the documented P0 fix) and the cumulative-total refund idempotency key are exactly the kind of logic a refactor can silently break.
- **Failure scenario:** Menu price changes mid-checkout and the reconciliation epsilon is loosened in a refactor; a $50 order authorizes $0.50. Or the refund `idempotencyKey` stops including the cumulative total and a double-click issues two refunds.
- **Impact:** Under-charging, double-charging, double-refunding — direct financial loss with no automated detection.
- **Recommended remediation:** Add route-level tests (in-memory Prisma + Stripe mock) for each scenario in §4, prioritizing amount reconciliation, double-submit idempotency, and refund cumulative-key stability.
- **Professional review required:** No — but pair with LR-TEST-03's mock harness so both money paths share fixtures.

### LR-TEST-05 — No DB-constraint, migration, or schema-drift tests
- **Severity:** Medium
- **Component:** DB constraint, migration & schema-drift testing
- **Affected paths:** `prisma/` schema + migrations; `scripts/push-schema-to-both.ts`
- **Description:** P2002 dedup paths (`Order.idempotencyKey`, `orderNumber`) and FK/cascade behavior are relied on for correctness but never asserted against a real schema — all 8 DB-touching tests use hand-rolled in-memory fakes that cannot reproduce a real unique-constraint race. Schema is pushed to two Neon branches by a script with no test that the branches match or that migrations apply cleanly.
- **Failure scenario:** A migration adds a column to one branch only, or a unique index is dropped; the in-memory mocks still pass and the drift surfaces in production as a duplicate order or a runtime P20xx.
- **Impact:** Silent schema drift between dev/prod, and idempotency guarantees that pass in mocks but fail on the real DB.
- **Recommended remediation:** Add constraint tests against an ephemeral Postgres (Testcontainers or a CI Postgres service) for the unique/idempotency/FK paths, plus a migration-apply smoke test on an empty DB.
- **Professional review required:** No — standard ephemeral-Postgres CI service.

### LR-TEST-06 — No E2E, load, or failure-injection coverage on the hot paths
- **Severity:** Medium
- **Component:** E2E, load & failure-injection testing
- **Affected paths:** hot paths — customer `/order` render; kitchen 4s poll; checkout → webhook → kitchen
- **Description:** No browser E2E covers the order → pay → kitchen happy path; no load/soak test exists despite the explicit 100 → 1,000 → 10,000 concurrent-user target; no failure-injection verifies that customer routes stay fast/200 when Stripe or Resend is down (the fire-and-forget branches). These are asserted only by comments in code.
- **Failure scenario:** A Resend outage makes a fire-and-forget email block the request path after a refactor removes the `after()` wrapper; checkout latency spikes at load with no test to catch it.
- **Impact:** Regressions in the highest-traffic paths and in degraded-dependency behavior ship undetected until real users hit them at scale.
- **Recommended remediation:** Add a Playwright happy-path E2E, a failure-injection suite (mock Stripe/Resend throwing → route still 200 fast), and a basic load/soak run against the order render + kitchen poll before scaling past current volume.
- **Professional review required:** Partial — the load target and pass thresholds should be agreed with the owner against the growth plan.

### LR-TEST-07 — No backup/restore (disaster-recovery) drill
- **Severity:** Low
- **Component:** Disaster recovery (backup/restore) testing
- **Affected paths:** Neon DB (dev + prod branches)
- **Description:** There is no documented or rehearsed backup-restore drill and no test/runbook verifying that a restore produces a working schema + data set. For a live-money platform this is the last line of defense.
- **Failure scenario:** Accidental data loss or a bad migration on prod; the team discovers during the incident that restore steps are unverified.
- **Impact:** Extended downtime / potential permanent data loss during a real incident.
- **Recommended remediation:** Document and rehearse a Neon point-in-time restore; add a periodic restore-verification step (restore to a scratch branch, run a smoke query + migration check). Operational ownership of this item lives in `08-incident-response-and-runbooks.md` (LR-OPS-01, Runbook 3).
- **Professional review required:** No — but coordinate with the Neon PITR verification tracked in the ops audit so the drill is run once, not twice.

---

## 8. Remediation priority (continuing-operation)

| Priority | Findings | Rationale |
|---|---|---|
| **P0 — land first (unblocks everything)** | LR-TEST-01 | CI is the prerequisite; until pushes run and gate on the suite, every test below is only as protective as a developer's memory. |
| **P1 — money + tenant safety** | LR-TEST-03, LR-TEST-04, LR-TEST-02 | Webhook idempotency, the 14 payment scenarios, and the route-authorization/IDOR harness — the guards with the highest blast radius and a prior production incident (C1/C2). Reuse the existing in-memory-mock pattern. |
| **P2 — real-DB & degraded-mode confidence** | LR-TEST-05, LR-TEST-06 | Ephemeral-Postgres constraint/migration tests and E2E + failure-injection + load on the hot paths ahead of the scale target. |
| **P3 — disaster recovery** | LR-TEST-07 | Rehearsed restore drill; coordinate with `08`/LR-OPS-01 so the Neon PITR verification is done once. |

*Every remediation above is subject to the `AGENTS.md` standing rules — no regressions (trace hot paths, run `npm run preflight`), i18n parity for any new user-facing string, and schema changes pushed to both Neon branches.*
