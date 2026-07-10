# Launch-Readiness Audit — 08: Incident Response & Operational Runbooks

**Date:** 2026-07-10. Companion to `01-system-inventory.md`, `02-architecture-and-data-flow.md`, `03-payment-and-stripe-connect-audit.md`, `04-security-audit.md`, and `07-test-gap-analysis.md`.

**Audit context.** The platform went **live on 2026-07-10**; this deliverable governs continuing live operation. It is a **read-only** operational-readiness audit — what observability, alerting, and disaster-recovery capability *exists* versus what is *missing* — followed by fourteen ready-to-follow incident runbooks. The runbooks are written to be executed by a **non-technical owner (Luigi) or a future engineer**; every step is labelled by who does it. Evidence was gathered by reading source, config, and the existing `docs/launch-readiness/*` set. No files were modified. Monitoring/alerting findings are rendered in §5 as `LR-OPS-01…08`, ordered by severity; the runbooks follow in §6.

> **Standing rules that override every runbook below.** **NEVER change `ENCRYPTION_KEY`** — it makes all encrypted per-restaurant Stripe/ShipDay keys undecryptable, permanently. Keep the previous good Vercel deployment pinned at all times. A **code rollback does NOT roll back the database** — schema changes must stay additive (expand/contract) to remain promote-back-safe. All customer-facing comms honor `marketingConsent` and use `formatCurrency(amount, restaurant.currency)`. **Log identifiers only** (orderId / restaurantId / event id) — never PII, card data, tokens, or `passwordHash`. Nothing in this document contains a secret value.

---

## 1. Executive posture

**Lead result — error *capture* is solid; error *alerting, uptime, and recovery* are largely absent.** Sentry is wired end-to-end and PII-safe (`sendDefaultPii:false`, error-only replay with all text/inputs masked, an identifiers-only `reportError()` helper), webhooks are idempotent via dedicated `StripeWebhookEvent` / `PaypalWebhookEvent` ledgers, brute-force login protection is Upstash-backed, per-restaurant credentials are AES-256-GCM encrypted at rest, and 17 Vercel crons run the background workload behind `CRON_SECRET`. That is a genuinely strong *foundation*.

**Principal gap — nobody is watching, and there is no verified way back.** For a live-money platform the operational holes are material and concentrated:

- **No verified backup / DR.** No `pg_dump` script, no scheduled backup, no tested restore. Neon PITR tier is **unverified** (still unchecked in `GO-LIVE-TODAY.md` and `LAUNCH-READINESS.md`). This is the single largest recovery gap — a bad `db push`, a destructive query, or a Neon incident could permanently lose order/payment/wallet data with no known recovery window.
- **No proactive alerting.** No uptime check, no synthetic-order probe, no dead-man's-switch on the 17 crons (a silently-failing `auto-reject` or `order-alert-calls` cron is invisible), no webhook-failure alert, no payment-mismatch alert, no suspicious-login/privilege-change alert, no backup-failure alert, no cert/domain-expiry watcher.
- **Alerting blind spot inside the code.** Money and hot paths use `catch { console.error; return 500 }` (162 files use `console.*`); a swallowed 500 never reaches Sentry's `onRequestError` — the exact gap `report-error.ts` was written to close, yet `reportError` is referenced in only ~6 files.
- **No governance.** No CI (so no dependency or secret scanning, no enforced preflight gate — push to `main` promotes straight to prod), no incident/breach procedure, no status page, and no defined RTO/RPO. Emergency rollback was one line in `LAUNCH-READINESS.md`.

**What this document delivers.** §5 grades the gaps as `LR-OPS-01…08`. §6 supplies the **fourteen incident runbooks** — Stripe outage, Vercel outage, Neon outage, webhook backlog, duplicate order, duplicate payment, paid-order-missing-from-kitchen, restaurant-loses-internet, compromised account, compromised API key, suspected data breach, incorrect refund, payout failure, and emergency rollback — each as clean numbered steps with a trigger, an owner, and a verification check. §7 records the RTO/RPO targets and status-page decision to be filled in.

**Overall verdict: LAUNCH-ACCEPTABLE with an urgent DR + alerting program.** No incident is in progress. The exposure is that a *first* incident would today be met with no alert, no rehearsed restore, and (until now) no written procedure. The P0 items — verify Neon PITR + take a manual backup, add an uptime + synthetic-order alert to Luigi, and add a cron dead-man's-switch — should land immediately; the runbooks below are usable as-is in the meantime.

---

## 2. What exists (verified in code)

**Error tracking — Sentry, wired end-to-end and PII-safe:**
- `src/instrumentation.ts` (`register` + `onRequestError = captureRequestError`), `sentry.server.config.ts`, `sentry.edge.config.ts`, `src/instrumentation-client.ts`, `src/app/global-error.tsx` (client boundary forwards to Sentry).
- PII posture is good: `sendDefaultPii:false` on server + edge; client replay masks all text/inputs and blocks media; replay is error-only (session sample 0). `tracesSampleRate 0.1`; errors 100%.
- `src/lib/report-error.ts` provides a never-throws `reportError(e, ctx)` helper with an explicit contract: pass **IDENTIFIERS ONLY** (orderId / restaurantId / event id), never raw body/email/address.
- DSN via `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`; environment tagged from `VERCEL_ENV`; sourcemap upload documented. Gated to `NODE_ENV=production` unless `SENTRY_FORCE_ENABLE=1`.

**Correlation / idempotency (good where present):**
- Webhooks are idempotent via dedicated ledgers: `StripeWebhookEvent` + `PaypalWebhookEvent` (`eventId` unique, `processedAt`). The Stripe dispatcher logs every event and routes by type (`src/app/api/webhooks/stripe/route.ts`).
- Orders carry `Order.idempotencyKey`; `verify-order-payment.ts` does a hard ownership check (`intent.metadata.orderId === order.id`) before releasing.

**Rate-limit / auth guards:** `src/lib/login-protection.ts` (brute-force lockout) backed by Upstash Redis (`UPSTASH_REDIS_REST_URL` / `TOKEN`) — required in prod; per-instance/useless without it.

**Secrets at rest:** `encrypt()` / `decrypt()` (AES-256-GCM, `ENCRYPTION_KEY`) for per-restaurant Stripe/ShipDay keys.

**Scheduled work:** 17 Vercel cron jobs (`vercel.json`) incl. `auto-reject-stale-orders`, `auto-complete-orders`, `order-alert-calls`, `ios-ring-pending`, `dunning`, `reports-snapshot`. Crons authenticate via Bearer `CRON_SECRET`.

**Existing docs:** `docs/launch-readiness/01..04`, `LAUNCH-READINESS.md`, `GO-LIVE-TODAY.md`, `STABILIZATION-PLAN.md` already flag most DR gaps (Neon PITR unverified, no CI, no backup script, one-line rollback).

---

## 3. What is missing

- **NO CI whatsoever.** `.github/workflows` is absent. No dependency scanning (Dependabot / `npm audit` gate), no secret scanning (gitleaks / trufflehog), no automated test/preflight gate. Preflight is convention-only (`AGENTS.md`) — nothing enforces it before push; push to `main` → Vercel promotes to prod directly.
- **NO automated backups.** No `pg_dump` script, no scheduled backup job, no restore-test doc. Neon PITR tier is **UNVERIFIED** (`GO-LIVE-TODAY.md:14` and `LAUNCH-READINESS.md:20` both unchecked). The single largest recovery gap on a live money system.
- **NO uptime / DB / queue / cron-health monitoring.** No external uptime check, no synthetic-order probe, no dead-man's-switch on the 17 crons (a silently-failing `auto-reject` or `order-alert-calls` is invisible).
- **NO webhook-failure alerting beyond Sentry-on-throw.** Money/hot paths use `catch { console.error; return 500 }` (162 files use `console.*`). A swallowed 500 never reaches Sentry's `onRequestError` — exactly the gap `report-error.ts` was written to close, but `reportError` is referenced in only ~6 files.
- **NO structured logging / no log correlation.** Plain `console.*` strings, no request/trace id propagated into logs, no PII/secret redaction layer around console (Sentry is scrubbed; Vercel runtime logs are not, and retention is short).
- **NO payment-mismatch detection.** `verify-order-payment.ts` validates intent **ownership** but never compares `intent.amount` to `order.total` — an underpaid/tampered intent would release to the kitchen; no reconciliation cron, no alert.
- **NO suspicious-login / privilege-change / admin-role-change alerting.** `login-protection` rate-limits but emits no alert on lockout or on a user's role/owner change.
- **NO backup-failure, cert-expiry, or domain-expiry alerts** (custom tenant domains via Vercel; platform + reseller domains).
- **NO status page, NO defined RTO/RPO, NO incident-response or data-breach procedure, NO step-by-step rollback runbook** (rollback was one line in `LAUNCH-READINESS.md:96`).

---

## 4. Monitoring & alerting gap matrix

| Capability | State | Evidence |
|---|---|---|
| Error tracking (Sentry) | **EXISTS** | `instrumentation*.ts`, `sentry.*.config.ts`, `global-error.tsx` |
| PII scrubbing in Sentry | **EXISTS** | `sendDefaultPii:false`; replay mask/block |
| `reportError` helper | **EXISTS but under-wired** | `report-error.ts`; only ~6 referencing files |
| Structured logging | **MISSING** | 162 files use `console.*`; no logger lib |
| Log PII/secret redaction | **MISSING (Sentry only)** | `console.*` unguarded in runtime logs |
| Payment/order correlation ids | **PARTIAL** | `Order.idempotencyKey`; Stripe/PayPal `WebhookEvent` ledgers |
| Webhook idempotency | **EXISTS** | `StripeWebhookEvent` / `PaypalWebhookEvent` `processedAt` |
| Uptime monitoring | **MISSING** | no external monitor, no probe |
| DB monitoring | **MISSING** | Neon dashboards only, no alerts wired |
| Cron/queue health (dead-man) | **MISSING** | 17 crons, no failure alert |
| Webhook-failure alert | **MISSING** | swallowed 500s never hit Sentry |
| Payment-mismatch alert | **MISSING** | `verify-order-payment.ts` has no amount check |
| Suspicious-login / priv-change alert | **MISSING** | `login-protection.ts` has no alert emit |
| Backup-failure alert | **MISSING** | no backup job to alert on |
| Cert/domain-expiry alert | **MISSING** | Vercel-managed; no expiry watcher |
| Dependency scanning in CI | **MISSING** | no `.github/workflows` |
| Secret scanning in CI | **MISSING** | no `.github/workflows` |
| Incident/breach procedure | **MISSING** | none in repo (this doc closes it) |
| Status page | **MISSING** | none |
| RTO/RPO defined | **MISSING** | not stated anywhere (see §7) |
| Emergency rollback runbook | **MISSING → now provided** | was `LAUNCH-READINESS.md:96` (1 line); see Runbook 14 |
| Automated DB backup / PITR verified | **MISSING/UNVERIFIED** | `GO-LIVE-TODAY.md:14` unchecked |

---

## 5. Findings

**8 findings** — **1 Critical, 3 High, 3 Medium, 1 Low.** Ordered by severity; IDs `LR-OPS-01…08`. The fourteen requested runbooks are the remediation deliverable for LR-OPS-04 and are embedded in §6.

---

### LR-OPS-01 — No verified database backup or restore path (DR)
- **Severity:** Critical
- **Component:** Backups / disaster recovery
- **Affected paths:** `GO-LIVE-TODAY.md:14`; `LAUNCH-READINESS.md:20`; `docs/launch-readiness/01-system-inventory.md:294-311`; `scripts/`
- **Description:** No automated database backup exists — no `pg_dump` script, no scheduled backup job, no restore-test documentation. Neon PITR tier is unverified. Schema is managed by `prisma db push` (no versioned migrations, no down-migrations).
- **Failure scenario:** A bad `db push`, an accidental destructive query, or a Neon incident corrupts/loses `Order`/`Payment` rows. There is no verified restore path and no known RPO.
- **Impact:** Potential **permanent loss** of order/payment/customer/wallet data on a live money system; unbounded, unverified recovery window.
- **Recommended remediation:** Confirm Neon PROD PITR (7–30 day) on a paid tier and document a tested restore. Add a scheduled `pg_dump` (daily) to off-Neon storage with a backup-failure alert. Take a manual `pg_dump` before every schema push and before go-live. (Ties to `07`/LR-TEST-07 — rehearse the restore once.)
- **Professional review required:** Yes — confirm the Neon plan's PITR granularity and retention, and decide the off-Neon backup destination, before relying on either.

### LR-OPS-02 — No CI: no dependency, secret, or preflight gate before prod
- **Severity:** High
- **Component:** CI / supply chain
- **Affected paths:** `.github/` (absent); `package.json` (`preflight` script); `vercel.json`
- **Description:** No CI pipeline exists (`.github/workflows` absent). No dependency scanning, no secret scanning, no enforced test/preflight gate. Push to `main` deploys straight to production; preflight is convention-only.
- **Failure scenario:** A dependency with a known CVE, a committed secret, or a build-breaking/regressing change is pushed to `main` and auto-promoted to prod without any gate.
- **Impact:** Vulnerable dependencies and leaked secrets ship undetected; a skipped preflight can break the live admin/ordering surface (has happened before per `AGENTS.md`).
- **Recommended remediation:** Add `.github/workflows` running `tsc` + `vitest` + `next build` (preflight), `npm audit --production` (fail on high), and gitleaks/trufflehog secret scan on PRs targeting `main`. Enable Dependabot. Optionally require the check before Vercel promotes. (Shared item with `07`/LR-TEST-01.)
- **Professional review required:** No — mechanical; align the dependency-upgrade policy with the standing no-auto-upgrade rule (`04`/LR-SEC-03).

### LR-OPS-03 — No uptime, cron-health, or webhook-failure alerting
- **Severity:** High
- **Component:** Monitoring / alerting
- **Affected paths:** `vercel.json` (17 crons); `src/app/api/cron/*`; `src/app/api/webhooks/*`
- **Description:** No uptime, DB, cron/queue-health, or webhook-failure monitoring. Sentry only captures thrown errors; money/webhook/cron paths `catch { console.error; return 500 }`, so swallowed failures never reach Sentry (the exact gap `report-error.ts` documents), and `reportError` is wired in only ~6 files.
- **Failure scenario:** The `order-alert-calls` or `auto-reject` cron silently fails, or a restaurant's Stripe webhook 500s on every retry for days — nobody is alerted because the error is swallowed before `onRequestError`.
- **Impact:** Silent outages of order alerting, auto-reject, and webhook processing; missed orders and stuck payments with no operator visibility.
- **Recommended remediation:** Add an external uptime monitor + synthetic-order probe with phone/SMS alert to Luigi. Add a cron dead-man's-switch (heartbeat ping). Wire `reportError()` into every catch in webhook/cron/order/payment paths so swallowed 500s become Sentry alerts.
- **Professional review required:** No — but choose the alert channel (SMS/phone) so it reaches a non-technical owner reliably.

### LR-OPS-04 — No incident-response, breach, or step-by-step rollback procedure
- **Severity:** High
- **Component:** Incident response / DR governance
- **Affected paths:** repo-wide (none found before this doc); `LAUNCH-READINESS.md:96`
- **Description:** No incident-response procedure, no data-breach procedure, no status page, no defined RTO/RPO, and only a one-line emergency-rollback note (no step-by-step runbook). Code rollback does not roll back the database, and that interaction was undocumented.
- **Failure scenario:** During a live outage or suspected breach the operator has no predefined steps, notification duty, or rollback procedure; a promote-back over a newer additive-plus-destructive schema risks further data issues.
- **Impact:** Slow, error-prone response; potential regulatory exposure (PII/PCI) with no breach playbook; risky ad-hoc rollbacks.
- **Recommended remediation:** Adopt the runbooks in §6; define RTO/RPO in the §7 appendix; stand up a hosted status page; document that rollback is code-only and schema changes must stay additive to remain promote-back-safe. **This finding is closed in substance by §6 — assign the OWNER and ENGINEER roles to real people/phone numbers.**
- **Professional review required:** Yes — a lawyer/privacy pro should confirm the breach-notification steps (Runbook 11) against applicable law (see `06`, data-privacy audit).

### LR-OPS-05 — No payment-amount reconciliation or mismatch alert
- **Severity:** Medium
- **Component:** Payments / reconciliation
- **Affected paths:** `src/lib/stripe/verify-order-payment.ts:82-108`
- **Description:** On payment release the code verifies intent ownership (`metadata.orderId`) but never compares `intent.amount` against `order.total`. There is no reconciliation cron and no payment-mismatch alert.
- **Failure scenario:** A tampered or mis-priced `PaymentIntent` authorizes for less than `order.total`; verify releases it to the kitchen as `authorized` and no alert fires.
- **Impact:** Under-collection / revenue leakage released to fulfillment undetected; no daily Stripe-vs-DB reconciliation to catch drift.
- **Recommended remediation:** Add an amount check (`intent.amount === expected minor units`) in `verify-order-payment` before release; `reportError` on mismatch. Add a nightly reconciliation cron comparing Stripe charges to Order totals and alerting on deltas. (Complements `07`/LR-TEST-04, which adds the test for this guard.)
- **Professional review required:** No — but coordinate with the payment-scenario test work so the guard is added and tested together.

### LR-OPS-06 — No structured logging or log-redaction layer
- **Severity:** Medium
- **Component:** Structured logging / log redaction
- **Affected paths:** `src` (162 files using `console.*`); `src/lib/report-error.ts`
- **Description:** No structured logger and no request/trace correlation id in logs; logging is plain `console.*` strings. Sentry is PII-scrubbed, but Vercel runtime logs are not passed through any redaction allowlist and retention is short.
- **Failure scenario:** A developer logs a request-context object containing a customer email/address/phone, or a token, in a `console.error` during debugging; it lands unredacted in Vercel logs.
- **Impact:** PII/secret leakage into runtime logs; hard cross-service correlation during incidents; short retention loses the forensic trail.
- **Recommended remediation:** Introduce a thin logger with an identifier-only redaction allowlist and a per-request correlation id; forward correlation ids into Sentry `extra`. Codify the `report-error.ts` "identifiers only" rule for all logging.
- **Professional review required:** No.

### LR-OPS-07 — No suspicious-login or privilege-change alerting
- **Severity:** Medium
- **Component:** Auth / security alerting
- **Affected paths:** `src/lib/login-protection.ts`; `src/lib/session.ts`; `src/lib/auth.ts`
- **Description:** Login brute-force protection exists (Upstash-backed) but emits no alert on repeated lockouts, and there is no alert on privilege/role/owner changes or new-admin creation.
- **Failure scenario:** An attacker triggers repeated lockouts against an owner account, or a compromised session elevates a user's role — no signal reaches the operator.
- **Impact:** Account-takeover and privilege-escalation attempts go unnoticed until damage is visible.
- **Recommended remediation:** Emit `reportError`/alert on N lockouts within a window and on any role/owner/restaurant-scope change; surface a superadmin security-events feed. (Pairs with `04`/LR-SEC-01 impersonation-audit work.)
- **Professional review required:** No.

### LR-OPS-08 — Sentry can silently no-op if `SENTRY_DSN` is unset in prod
- **Severity:** Low
- **Component:** Error-tracking config
- **Affected paths:** `sentry.server.config.ts:14-31`; `.env.example` (`SENTRY_DSN`)
- **Description:** Sentry is enabled only when `NODE_ENV=production` and DSN is set; if `SENTRY_DSN` is unset in prod the SDK silently no-ops. There is no post-deploy smoke test confirming Sentry actually receives events.
- **Failure scenario:** A prod deploy ships with an empty `SENTRY_DSN` (or a mis-scoped auth token breaks sourcemaps); errors are captured nowhere and nobody notices.
- **Impact:** Blind error-tracking in production despite the SDK being "installed".
- **Recommended remediation:** Add a post-deploy synthetic-error check (or verify the first release event) and assert `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` are present in the prod env as part of the go-live checklist.
- **Professional review required:** No.

---

## 6. Incident runbooks

**Roles.** **OWNER** = Luigi (owner-operator; decisions + customer comms). **ENGINEER** = on-call senior dev. Where one person holds both roles, do the OWNER steps first. Every runbook honors the standing rules in the banner at the top of this document — above all: **NEVER change `ENCRYPTION_KEY`**, and **a code rollback does not roll back the database**.

---

### Runbook 1 — Stripe outage / degraded
- **Trigger:** Card authorizations start failing; Sentry shows a spike in webhook/verify errors; `status.stripe.com` reports an incident.
- **Who:** ENGINEER leads; OWNER handles payment-mode switch + customer comms.
- **Steps:**
  1. ENGINEER: confirm at `status.stripe.com` and check Sentry for spikes in webhook/verify errors.
  2. ENGINEER: if the Stripe API is down, card orders will fail to authorize. Do **NOT** retry-loop charges. Confirm there are no double-charges by checking the `StripeWebhookEvent` ledger.
  3. OWNER: temporarily switch affected restaurants to accept **cash / card-on-delivery** (admin → payments) so ordering continues.
  4. ENGINEER: verify webhooks are queued, not lost — Stripe retries for up to 3 days and our handler is idempotent (`StripeWebhookEvent`). No manual replay needed unless events expired.
  5. RECOVERY: when Stripe restores, watch `verify-order-payment` releases and run payment reconciliation (see Runbook 13) to catch any pending/authorized stuck orders.
- **Verification:** `status.stripe.com` green; new card orders authorize; no duplicate rows in `StripeWebhookEvent`; no orders stuck in `authorized`/`pending` after the reconciliation pass. OWNER switches payment methods back once stable.

---

### Runbook 2 — Hosting / Vercel outage
- **Trigger:** The site is unreachable or erroring platform-wide; `vercel-status.com` reports an incident.
- **Who:** ENGINEER diagnoses; OWNER posts customer-facing status and reassures kitchens.
- **Steps:**
  1. ENGINEER: confirm at `vercel-status.com`; check that the latest deploy is **not** the cause — if the outage started right after a push, go to Runbook 14 first.
  2. If it is a platform-wide Vercel outage, there is nothing to deploy around it. OWNER posts to the status page / social that ordering is temporarily down.
  3. ENGINEER: kitchens keep any already-received orders on their tablets (kitchen tabs are persistent ledgers) — reassure staff **not to clear them**.
  4. Crons will not fire during the outage. After recovery, manually verify `auto-reject-stale-orders` and `order-alert-calls` caught up; no order is auto-rejected on a stale clock (the anchor is `alertAt`/`notifiedAt`, not `scheduledFor`).
  5. RECOVERY: confirm a healthy production deployment is serving.
- **Verification:** `vercel-status.com` green; the synthetic-order probe (or a manual $1 order) completes; the kitchen tablet reloads its persistent tab with no lost orders.

---

### Runbook 3 — Database / Neon outage (or corruption)
- **Trigger:** Reads/writes fail; Sentry shows DB connection errors; the Neon dashboard shows the branch or compute down — OR data corruption is suspected.
- **Who:** ENGINEER leads; OWNER handles customer messaging; escalate to Runbook 14 for the rollback decision.
- **Steps:**
  1. ENGINEER: confirm in the Neon dashboard (branch health, compute status). Check Sentry for connection errors.
  2. If the prod branch is down, the app cannot read/write orders. OWNER switches messaging to "temporarily unavailable".
  3. Do **NOT** run `prisma db push` or any migration during an incident.
  4. If this is **data corruption** (not just downtime): STOP writes, escalate to the Runbook 14 decision, and prepare a PITR restore — identify the last-good timestamp (before the bad event). Confirm the PITR tier/retention first (LR-OPS-01).
  5. RESTORE: create a Neon branch from PITR at the last-good time, validate row counts (`Order`, `Payment`, `Customer`, wallet), then cut over `DATABASE_URL`. Record the RPO (data-loss window) for the postmortem.
  6. After restore, reconcile Stripe charges vs restored `Order` rows (Runbook 13).
- **Verification:** App reads/writes succeed against the restored/recovered branch; row counts for `Order`/`Payment`/`Customer`/wallet are sane; Stripe-vs-DB reconciliation shows no orphaned charges; RPO recorded.

---

### Runbook 4 — Webhook backlog
- **Trigger:** `StripeWebhookEvent` / `PaypalWebhookEvent` rows accumulate with `processedAt = null` and a growing count; orders stuck unpaid.
- **Who:** ENGINEER.
- **Steps:**
  1. ENGINEER: check `StripeWebhookEvent` / `PaypalWebhookEvent` for rows with `processedAt = null` and a growing count.
  2. Check Sentry + Vercel logs for the failing handler; identify the failing `event.type`.
  3. Because handlers are idempotent, it is safe to let Stripe/PayPal retries drive reprocessing once the bug is fixed. Deploy the fix (Runbook 14 if it regresses).
  4. For events already past the provider retry window: replay from the Stripe/PayPal dashboard ("Resend event") or a controlled reprocess script that respects the `WebhookEvent` dedupe.
  5. Verify affected orders reached the correct `paymentStatus` and fired kitchen notifications.
- **Verification:** `processedAt = null` count returns to zero and stays flat; affected orders show the correct `paymentStatus`; kitchen received them; no duplicate processing in the ledger.

---

### Runbook 5 — Duplicate order
- **Trigger:** Two near-identical orders (same customer/cart within seconds) appear; kitchen flags a repeat.
- **Who:** ENGINEER investigates; OWNER/kitchen confirm which was actually made.
- **Steps:**
  1. ENGINEER: identify the duplicates (same customer/cart within seconds). Check `Order.idempotencyKey` — true duplicates share the same intent.
  2. OWNER/kitchen: confirm which order was actually made; cancel the extra in admin.
  3. If the duplicate was **card-authorized**, VOID the extra authorization (do not just cancel) so no hold dangles; if **captured**, issue a refund (Runbook 12).
  4. Note the root cause (double-submit, retry) for the eng backlog.
- **Verification:** One valid order remains; the extra is cancelled and its authorization voided (or refunded); no dangling Stripe hold on the customer; EOD totals reflect a single order.

---

### Runbook 6 — Duplicate payment (same order charged twice)
- **Trigger:** Two charges/intents map to the same `Order.id`; customer reports a double charge.
- **Who:** ENGINEER refunds; OWNER notifies the customer.
- **Steps:**
  1. ENGINEER: in Stripe, find both charges/intents; confirm both map to the same `Order.id` via `metadata`.
  2. Refund the duplicate charge in full via Stripe (idempotent). Do **NOT** delete the order.
  3. Reconcile: ensure `Order.paymentStatus` reflects a single valid payment; adjust reporting if EOD already counted both.
  4. OWNER: notify the customer with the refund confirmation.
  5. Root cause: check for a non-idempotent capture path; file an eng ticket.
- **Verification:** Exactly one charge remains net of the refund; `Order.paymentStatus` shows a single valid payment; EOD/reporting corrected; customer confirmed the refund.

---

### Runbook 7 — Paid order missing from kitchen display
- **Trigger:** A customer paid but the order never appeared on the kitchen tablet.
- **Who:** OWNER/kitchen check the tablet; ENGINEER checks the order state.
- **Steps:**
  1. OWNER/kitchen: confirm the tablet is online and on the correct restaurant; pull-to-refresh; check the kitchen tab (persistent).
  2. ENGINEER: look up the Order — is `paymentStatus` `authorized`/`paid`? If `pending`, the post-payment redirect may not have released it: open the customer status page (it self-heals via `verify-order-payment`) or hit the order-status poll.
  3. Confirm `fireOrderNotifications` ran (push + email). If not, re-trigger via the verify path.
  4. If the tablet push token is stale: **last-login owns the ring** — re-login the kitchen app.
  5. As a fallback, OWNER reads the order from admin and enters it into the kitchen manually so the food is made.
- **Verification:** The order is visible on the kitchen tablet (or was manually entered so it's being made); `paymentStatus` is correct; push/email notification confirmed fired.

---

### Runbook 8 — Restaurant loses internet
- **Trigger:** A restaurant reports its tablet is offline / can't load orders.
- **Who:** OWNER coaches the restaurant; ENGINEER only if prolonged.
- **Steps:**
  1. OWNER: coach the restaurant — orders are safe server-side; the tablet will re-sync when it is back online.
  2. The missed-order auto phone-call (Twilio) will still ring the restaurant's phone for new orders during the outage — staff can take orders verbally.
  3. When back online, the kitchen app reloads the persistent tab — no orders are auto-cleared.
  4. If prolonged: OWNER temporarily pauses online ordering for that restaurant (admin) to avoid orders nobody can see.
- **Verification:** On reconnect, the kitchen tab reloads with all orders intact; any phone-taken orders are entered; if paused, ordering is re-enabled once connectivity is stable.

---

### Runbook 9 — Compromised account (customer or admin)
- **Trigger:** Suspicious logins/actions on an account; owner or customer reports unauthorized access.
- **Who:** ENGINEER contains; OWNER notifies the affected party.
- **Steps:**
  1. ENGINEER: force-invalidate sessions for the account (rotate `NEXTAUTH` secret only as a last resort — it logs everyone out). Reset the account password.
  2. Review recent actions: orders, refunds, payout/settings changes, role changes. Revert unauthorized changes.
  3. If it is an ADMIN/owner account: check for added users, changed payout details, exported data.
  4. OWNER: notify the affected restaurant/customer.
  5. Enable/confirm login-protection lockout; consider an IP block via `proxy.ts`. If PII was accessed, go to Runbook 11.
- **Verification:** Attacker sessions are invalidated and password reset; no unauthorized users/payout changes remain; login-protection active; affected party notified; escalated to Runbook 11 if PII was touched.

---

### Runbook 10 — Compromised API key (Stripe / ShipDay / Resend / `CRON_SECRET`)
- **Trigger:** A provider key is suspected leaked (committed to git, exposed in logs, provider alert).
- **Who:** ENGINEER rotates; OWNER reviews provider charges.
- **Steps:**
  1. ENGINEER: immediately rotate the key in the provider dashboard.
  2. Update the value in Vercel env (and re-encrypt per-restaurant keys via `encrypt()` if a restaurant key leaked). **NEVER touch `ENCRYPTION_KEY`.**
  3. Redeploy so the new env takes effect.
  4. Review provider logs for unauthorized use during the exposure window; refund/void any fraudulent charges (Runbook 12).
  5. If the leaked key was in git history, purge and rotate; add gitleaks to CI (LR-OPS-02).
- **Verification:** Old key rejected by the provider; new key works end-to-end (a test call/order succeeds); no fraudulent activity remains unaddressed; `ENCRYPTION_KEY` untouched.

---

### Runbook 11 — Suspected data breach
- **Trigger:** Evidence or credible report that customer PII or credentials were accessed/exfiltrated.
- **Who:** OWNER + ENGINEER jointly declare an incident; OWNER owns regulatory/customer notification.
- **Steps:**
  1. OWNER + ENGINEER: declare an incident; start a timeline log (**identifiers only**).
  2. CONTAIN: rotate affected credentials (Runbook 10), invalidate sessions, block the vector (`proxy.ts` / provider).
  3. ASSESS scope: which tables/rows/PII (`Customer` email/phone/address; **NEVER card numbers** — Stripe holds those; we store no PAN). Confirm no `passwordHash`/keys were exfiltrated.
  4. PRESERVE evidence: snapshot logs, Sentry events, and a Neon PITR branch at the incident time.
  5. NOTIFY: OWNER handles regulatory/customer notification per applicable law (Canada PIPEDA / GDPR if EU customers) within required timelines. Do **not** delete evidence.
  6. REMEDIATE + postmortem; add detection for the gap.
- **Verification:** Vector contained and credentials rotated; scope documented; evidence preserved (logs + Sentry + PITR snapshot); notifications made within legal timelines; detection added. (Confirm notification steps with a privacy pro — see `06`.)

---

### Runbook 12 — Incorrect refund
- **Trigger:** A refund was issued for the wrong amount (too little or too much).
- **Who:** ENGINEER corrects the Stripe/DB state; OWNER handles customer comms + any re-payment.
- **Steps:**
  1. ENGINEER: pull the Order + Stripe charge; determine the correct amount.
  2. If **under-refunded**: issue the delta refund in Stripe (idempotent).
  3. If **over-refunded**: you cannot un-refund. If the customer owes, OWNER arranges re-payment (new charge / cash) — **never silently re-charge without consent**.
  4. Reconcile reward/store-credit: reward Dollars are lost on a captured-order cancel/refund per the known issue — verify the wallet ledger and manually re-credit if the refund was our error.
  5. OWNER: notify the customer with the corrected amounts.
- **Verification:** Net refund equals the correct amount; wallet/reward ledger reconciled and re-credited if appropriate; customer notified and (if applicable) consented to any re-payment.

---

### Runbook 13 — Payout failure (Stripe Connect to a restaurant)
- **Trigger:** A restaurant reports missing payouts; Stripe shows a failed/paused payout.
- **Who:** ENGINEER diagnoses in Stripe; OWNER coordinates with the restaurant.
- **Steps:**
  1. ENGINEER: check the Connect account in Stripe for `payouts_enabled`, `requirements.currently_due`, and the failure reason.
  2. If KYC/verification is incomplete: OWNER asks the restaurant to complete onboarding; payouts resume automatically.
  3. If a bank/account error: the restaurant updates its payout bank details in Stripe.
  4. Platform-fee / marketplace-settle: verify the marketplace-settle cron ran (monthly, `vercel.json`) and did not error in Sentry.
  5. Confirm no orders are stuck uncaptured (which would starve the payout) — run the reconciliation check.
- **Verification:** `payouts_enabled = true` with no outstanding `currently_due`; the next payout clears; the settle cron ran without Sentry errors; no uncaptured orders remain.

---

### Runbook 14 — Emergency rollback
- **Trigger:** A regression correlates with the latest deploy — Sentry error spike starting at the deploy time, or a broken customer/admin surface right after a push.
- **Who:** ENGINEER executes the rollback; OWNER handles any customer messaging during it.
- **Steps:**
  1. ENGINEER: confirm the regression correlates with the latest deploy (Sentry spike start vs deploy time).
  2. In Vercel, **PROMOTE the previous known-good deployment** (instant rollback) — do not wait for a rebuild. Keep the previous good deploy pinned at all times.
  3. **NEVER change `ENCRYPTION_KEY`** as part of a rollback (it would make all encrypted Stripe/ShipDay keys undecryptable).
  4. **DATABASE CAVEAT:** a code rollback does **NOT** roll back the DB. Promote-back is safe only if the schema change was **ADDITIVE**. If the bad deploy ran a destructive `db push`, a code rollback alone will not fix data — go to Runbook 3 (PITR).
  5. Verify redirects are not cache-poisoned (`proxy.ts` must send `no-store`/`no-cache` on auth-dependent redirects).
  6. Run the synthetic-order probe + a $1 live order to confirm ordering, payment, and kitchen fire all work post-rollback.
  7. POSTMORTEM: capture the root cause; the fix must pass `npm run preflight` before re-deploy.
- **Verification:** The previous good deployment is serving; the Sentry spike stops; a $1 live order completes end-to-end (order → payment → kitchen fire); no cache-poisoned redirects; `ENCRYPTION_KEY` untouched; if a destructive migration ran, DB handled via Runbook 3.

---

## 7. Appendix — targets to define

Fill these in and link this document from `LAUNCH-READINESS.md`. Assign the OWNER and ENGINEER roles above to real people and phone numbers.

- **RTO (time to restore service):** TBD — recommend **≤ 1h for the app** (Vercel promote-previous) and **≤ 4h for the database** (Neon PITR restore).
- **RPO (max acceptable data loss):** TBD — depends on Neon PITR granularity; target **≤ 5 min** once PITR is verified (LR-OPS-01).
- **Status page:** TBD — recommend a hosted external page **independent of Vercel/Neon** so it stays up during a platform outage (Runbooks 1–3 reference it).
- **Alert channel to the owner:** TBD — must be SMS/phone so it reaches a non-technical owner (LR-OPS-03).

*Every remediation above is subject to the `AGENTS.md` standing rules — no regressions (trace hot paths, run `npm run preflight`), i18n parity for any new user-facing string, and schema changes pushed to both Neon branches.*
