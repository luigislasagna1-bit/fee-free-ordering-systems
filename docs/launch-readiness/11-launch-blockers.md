# Launch-Readiness Audit — 11: Launch Blockers

**Date:** 2026-07-10. **Status:** platform is LIVE (single owner-operated restaurant, Canada). This register governs **continuing** live operation and, critically, **the conditions for onboarding additional / third-party restaurants**.

Severities: **Critical** = can lose money or data or breach a boundary; **High** = must fix before broadening beyond the single-owner pilot. This file lists Critical + High only. Full per-domain findings (Medium/Low/Informational) live in `03`–`08`.

**Reading the "exposure" column:** several findings are *latent* — real defects with no impact under the current configuration (one owner-run store, auto-accept off, no external restaurants) that become live hazards the moment a setting changes or a second restaurant is onboarded. Latent ≠ safe to ignore; it means "no fire drill tonight, but fix before the trigger condition occurs."

---

## CRITICAL

### C-1 · Auto-accepted card orders are never captured (LR-PAY-01)
- **Component / paths:** `src/lib/stripe/verify-order-payment.ts:90-99` (requires_capture branch); `src/app/api/orders/[id]/route.ts:234-282` (capture only on pending→accepted PATCH); the C3 capture-on-authorize fix lives only in `src/lib/stripe/events/payment-intent.ts` (platform webhook, never fires for key-only restaurant charges).
- **Defect:** with `Restaurant.autoAcceptOrders = true`, an order is created already `status='accepted'`, so the capture step (which runs on the pending→accepted transition) never fires. `verifyAndReleaseOrderPayment` releases the order to the kitchen at `paymentStatus='authorized'` but never captures; once `authorized`, later status-poll calls short-circuit (lines 56-62) and never capture either. The manual-capture hold expires (~7 days) and the restaurant is never paid for food it made and delivered.
- **Exposure:** **LATENT — zero current live exposure** (verified prod audit 2026-07-10: only 1 restaurant has auto-accept on and it takes no online card; Luigi's Lasagna has auto-accept off; all 550 paid card orders captured correctly). Triggers the moment ANY restaurant enables auto-accept + online card.
- **Impact:** restaurant delivers food, collects nothing. Silent — no error surfaces.
- **Fix:** mirror the PayPal path — in `verifyAndReleaseOrderPayment` select `Order.status`; in the `requires_capture` branch, if `status==='accepted'` call `capturePayment` (guarded by `isStripeAlreadyCaptured`) and set `paymentStatus='paid'` before `fireOrderNotifications`. ~1 hour, add tests, review, no impact on the current happy path.
- **Owner action:** approve as remediation stage (tracker item B3).

### C-2 · No automated database backup / no tested restore (LR-DB / LR-OPS)
- **Component:** operational — Neon Postgres is the sole source of truth for customer wallets, coupon/promo caps, orders, payments, subscriptions.
- **Defect:** no `pg_dump` job, no scheduled backup to off-Neon storage, no documented/tested restore. Neon point-in-time-recovery retention is tier-dependent and unverified on the production plan. Schema is managed by `prisma db push` (no versioned migrations, no down-migrations), so a bad push has no clean revert.
- **Exposure:** **live now.** A dropped table, a bad `db push`, a Neon incident, or ransomware has no proven recovery path.
- **Impact:** total or partial data loss with no restore = business-ending for a payments platform.
- **Fix:** (1) confirm + document Neon PROD PITR retention on the current plan; (2) perform ONE real restore drill to a scratch branch and document it; (3) add a scheduled daily `pg_dump` to off-Neon storage with a backup-failure alert. Owner + engineering.
- **Owner action:** partly owner (Neon plan/PITR confirmation, tracker), partly engineering.

---

## HIGH

### H-1 · Disputes / chargebacks are invisible to the system (LR-PAY-02)
`charge.dispute.created` is handled only by the platform webhook (never fires for key-only restaurant charges); the per-restaurant webhook registers only `charge.refunded` (`src/lib/restaurant-stripe-webhook.ts:23`). A disputed order stays `paid` forever — reports overstate revenue, Reward Dollars earned on it are never clawed back, and a non-technical owner who ignores Stripe's email auto-loses the dispute. **Fix:** add `charge.dispute.created`/`closed` to `WEBHOOK_EVENTS` + handle in the per-restaurant route (stamp a dispute flag, alert the owner). Bundle with C-1. *(Professional review: Stripe dispute-handling guidance.)*

### H-2 · Order-create saga is not atomic (LR-DB)
`reserveCredit` decrements the Reward Dollars balance BEFORE `order.create`; the matching spend ledger row is written AFTER by `recordSpendForOrder`. No transaction spans the two. A crash between them leaves the wallet debited with no ledger row (a compensating `refundRewardClaim` exists on the create-failure path, but a crash after create / before ledger write is a gap). **Fix:** wrap reserve + create + spend-ledger in one interactive `$transaction`, or write the spend row inside the same implicit transaction as the order create.

### H-3 · Intra-tenant RBAC helper largely unused (LR-SEC-02)
A correct central RBAC module (`src/lib/access.ts`, `requireRestaurantAccess`) exists but is called by only ~7 of 291 routes. `kitchen_staff` accounts (which restaurants will hand to hourly staff on a tablet) can call money-affecting config routes — prices, service fees, reward rules, promotions, customer notes — because those routes authorize on the *presence* of a `restaurantId` only, with no role tier check. **Fix:** add `requireRestaurantAccess(user, restaurantId, MANAGER)` to config/money write routes; keep order-flow routes at staff tier. Reuses the tested helper, no schema change. *(Blocks handing staff accounts to non-owners — relevant as soon as a real restaurant with employees onboards.)*

### H-4 · Impersonation is not audit-logged (LR-SEC-01)
Superadmin and reseller "view as restaurant" writes no durable record of who impersonated whom, when, or what they did. The banner is UX-only. The highest-privilege capability on a live-payments platform has no forensic trail. **Fix:** append-only audit row (actor, target, mode, start/stop, ip, timestamp) in each impersonate route; optionally log high-value writes performed while impersonating. *(Professional review: relevant to a future breach/dispute investigation.)*

### H-5 · Dependency security advisories (LR-SEC-03, LR-SEC-04)
`next@16.2.4` carries multiple HIGH advisories directly relevant to this app's surface (App-Router middleware/proxy bypass, redirect cache-poisoning, CSP-nonce XSS) — fix is the in-range patch `16.2.10`. Transitive `undici <=6.26.0` + `fast-uri <=3.1.1` HIGH advisories fix in place via non-forcing `npm audit fix`. **NOT applied** — owner rule forbids automatic dependency changes; presented for approval. **Fix:** bump Next to 16.2.10, run `npm audit fix` (non-forcing), run preflight, confirm. Low regression risk, but proxy + route handlers are build-critical so verify carefully.

### H-6 · No CI / release gate / supply-chain scanning (LR-OPS, LR-TEST)
No `.github/workflows`. The 591 tests + typecheck run only when a developer manually runs `npm run preflight` before pushing; Vercel builds do NOT run the test suite. No dependency or secret scanning. Push to `main` deploys straight to production on developer discipline alone. **Fix:** GitHub Actions running preflight + `npm audit` + secret scan on every push/PR, blocking deploy on failure.

### H-7 · No monitoring / alerting (LR-OPS)
Sentry captures thrown errors only — but money/webhook/cron paths use `catch { console.error; return 500 }`, so swallowed failures never reach Sentry. No uptime monitor, no DB/cron-health check, no webhook-failure alert, no payment-mismatch alert, no backup-failure alert, no cert/domain-expiry alert. A silently failing cron (auto-accept, auto-reject, settlement, dunning) or a stuck payment would go unnoticed. **Fix:** external uptime + synthetic-order probe with SMS alert; cron dead-man's-switch heartbeat; wire `reportError()` into every money/webhook/cron catch block.

### H-8 · No incident-response / DR governance (LR-OPS)
No incident procedure, no breach procedure, no status page, no defined RTO/RPO, only a one-line rollback note. **Fix:** adopt `08-incident-response-and-runbooks.md` as the operational runbook set; define RTO/RPO; stand up a status page; document that rollback is code-only (not DB schema).

### H-9 · Data-retention promises unimplemented (LR-PRIV) — LAWYER REVIEW
The Privacy Policy + account-deletion page promise 90-day anonymization of closed accounts and 7-year-then-anonymize for orders, but NO cron or code implements any anonymization or purge. `CartSession`, `WebsiteVisit`, `Prospect` grow forever with PII. Published policy and actual behavior diverge. **Fix:** either build the anonymization/purge crons or revise the policy to match reality — a lawyer decides which. *(Professional review: privacy pro + lawyer.)*

### H-10 · No self-service data-subject rights (LR-PRIV) — PRIVACY-PRO REVIEW
No self-service access, export, or deletion. Deletion is a manual email request; there is a `deleteRestaurantCompletely()` but no per-customer delete/export tool. **Fix:** privacy-pro review of the DSAR workflow; consider a per-customer delete/export helper mirroring `delete-restaurant.ts`.

### H-11 · Marketing consent / CASL question (LR-PRIV) — LAWYER REVIEW
Cart-abandonment recovery emails send to any abandoned-cart email; only KNOWN customers who explicitly opted out are suppressed. A brand-new guest who merely typed an email at checkout (no consent) still receives a marketing nudge. Unsubscribe link is present (mitigating). **Fix:** lawyer review of the CASL implied-consent basis; gate on affirmative consent if advised.

### H-12 · No authorization / tenant-isolation test coverage (LR-TEST)
Zero tests assert per-route auth (401 unauth, 403/404 cross-tenant) or restaurant-scoped ownership on writes. The isolation is currently *correct by manual audit* but nothing prevents a future regression. **Fix:** a parameterized route-authorization harness asserting unauth→401 and cross-tenant-id→403/404 for every mutating route.

### H-13 · No webhook idempotency / payment-scenario tests (LR-TEST)
The webhook dedup logic and the 14 payment edge scenarios (double-click, refresh mid-pay, amount tamper, coupon/reward race, refund retry, payment-succeeds-order-fails, out-of-order webhook, etc.) are implemented but untested. **Fix:** idempotency suite over `dispatchStripeEvent` on the in-memory prisma mock + route-level tests for each payment scenario.

---

## Summary

| Severity | Count | Nature |
|---|---|---|
| Critical | 2 | 1 latent (auto-accept capture), 1 live (no tested backup) |
| High | 13 | Payments-visibility, atomicity, RBAC, deps, and the whole operational-maturity layer (CI, monitoring, IR, retention, tests) |

**Nothing here indicts the current single-store live happy path** — payment correctness, tenant isolation, and card-data handling are sound. The blockers are about (a) two specific money-correctness defects that trigger on config change, (b) the absence of the operational safety net (backups, monitoring, incident response) that a live payments platform must have, and (c) the readiness gate for onboarding *other people's* restaurants. See `00-executive-summary.md` for the verdict and staged plan.
