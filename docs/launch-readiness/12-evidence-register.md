# Launch-Readiness Audit — 12: Evidence Register (Master Traceability Index)

**Date:** 2026-07-10. This is the single index of **every** finding raised across all six audit domains. It is the traceability backbone for the launch-readiness work: each finding has a stable ID, a severity, an owner class, and a status. Detail lives in the referenced per-domain document (or, where a domain's `05`–`08` write-up is not yet finalized, in that domain's audit-journal `result.findings` array).

**Status:** every finding is **Open — unremediated**. This audit made **zero** code changes; no fix has been applied. Nothing here is closed.

---

## 1. How IDs and severities are assigned

- **Enumerated in a written doc:** `LR-PAY-01…26` are defined in `03-payment-and-stripe-connect-audit.md` §7; `LR-SEC-01…21` in `04-security-audit.md` §7. Severities below match those documents exactly.
- **Not yet in a finalized doc:** the privacy (`LR-PRIV`), database (`LR-DB`), operations (`LR-OPS`), and testing (`LR-TEST`) write-ups (`05`–`08`) are not finalized. Their IDs are assigned here **in the order the findings appear in each domain's audit-journal `result.findings` array** (workflow `wf_62d38caf`), and severities are taken verbatim from those arrays. When `05`–`08` are written, they must adopt these IDs.
- **Consolidated blockers.** `11-launch-blockers.md` groups the Critical + High findings under short `C-#` / `H-#` labels for the executive view. Those are **cross-references, not separate findings** — the mapping is in §4. Where a `C-`/`H-` id spans two domain findings, both domain rows carry the same cross-reference.

---

## 2. Severity tally (domain-level)

| Severity | Payments | Security | Privacy | Database | Ops/DR | Testing | **Total** |
|---|---:|---:|---:|---:|---:|---:|---:|
| Critical | 1 | 0 | 0 | 0 | 1 | 0 | **2** |
| High | 1 | 4 | 3 | 2 | 3 | 4 | **17** |
| Medium | 8 | 8 | 5 | 3 | 3 | 2 | **29** |
| Low | 9 | 7 | 4 | 3 | 1 | 1 | **25** |
| Informational | 7 | 2 | 0 | 2 | 2 | 0 | **13** |
| **Total** | **26** | **21** | **12** | **10** | **10** | **7** | **86** |

**Reconciliation with `11-launch-blockers.md` (2 Critical / 13 High).** The 17 domain-level Highs consolidate to 13 executive Highs because some merge and one folds into a Critical: `LR-SEC-03`+`LR-SEC-04` → **H-5**; `LR-OPS-02`+`LR-TEST-01` → **H-6**; `LR-TEST-03`+`LR-TEST-04` → **H-13**; and `LR-DB-02` (backups, rated High by the DB auditor) folds into **C-2** (rated Critical by the Ops auditor, `LR-OPS-01`). Net: 2 Critical, 13 High — consistent with doc `11`.

---

## 3. Master register (grouped by severity)

Owner class: **Eng** = engineering · **Owner** = owner config/approval/plan · **Lawyer** = legal / privacy-pro · **Tax** = accounting/tax pro · combinations where both are needed. "Doc" cites the detail source; `05–08*` = journal-sourced pending its write-up; `= C-/H-` = consolidated id in `11`.

### CRITICAL (2)

| ID | Sev | Domain | Component | One-line description | Doc | Owner class | Status |
|---|---|---|---|---|---|---|---|
| LR-PAY-01 | Critical | Payments | Auto-accept capture (key-only) | Auto-accepted Stripe card orders release to the kitchen but are never captured; the ~7-day hold expires and the restaurant is paid nothing. **Latent — 0 live exposure today.** | 03 §7 · = C-1 | Eng (owner approves stage) | Open — unremediated |
| LR-OPS-01 | Critical | Ops/DR | Backups / Disaster Recovery | No automated DB backup, no scheduled `pg_dump`, no tested restore; Neon PITR tier unverified; `prisma db push` has no down-migrations. | 05–08* · = C-2 | Owner + Eng | Open — unremediated |

### HIGH (17)

| ID | Sev | Domain | Component | One-line description | Doc | Owner class | Status |
|---|---|---|---|---|---|---|---|
| LR-PAY-02 | High | Payments | Disputes / chargebacks | `charge.dispute.*` not on the per-restaurant webhook; disputes invisible, order stays `paid`, reward never clawed back. | 03 §7 · = H-1 | Eng (Stripe review) | Open — unremediated |
| LR-SEC-01 | High | Security | Impersonation audit | Superadmin/reseller "view as" writes no durable record of who impersonated whom, when, or what. | 04 §7 · = H-4 | Eng | Open — unremediated |
| LR-SEC-02 | High | Security | Intra-tenant RBAC | `requireRestaurantAccess` exists but ~7/291 routes call it; `kitchen_staff` can edit prices, promos, fees, reward rules. | 04 §7 · = H-3 | Eng (owner sets matrix) | Open — unremediated |
| LR-SEC-03 | High | Security | Dependency — Next.js | `next@16.2.4` HIGH advisories (App-Router/proxy bypass, redirect cache-poisoning, CSP-nonce XSS); fix = `16.2.10`. Not applied. | 04 §7 · = H-5 | Owner sign-off + Eng | Open — unremediated |
| LR-SEC-04 | High | Security | Dependency — undici/fast-uri | `undici<=6.26.0` + `fast-uri<=3.1.1` HIGH; in-place non-forcing `npm audit fix`. Not applied. | 04 §7 · = H-5 | Owner sign-off + Eng | Open — unremediated |
| LR-PRIV-01 | High | Privacy | Data retention / lifecycle | Policy promises 90-day / 7-year anonymization but no cron implements it; CartSession/WebsiteVisit/Prospect grow forever. | 05–08* · = H-9 | Lawyer + Eng | Open — unremediated |
| LR-PRIV-02 | High | Privacy | Data-subject rights | No self-service access/export/deletion; deletion is manual email; no per-customer delete/export tool. | 05–08* · = H-10 | Lawyer / Privacy-pro | Open — unremediated |
| LR-PRIV-03 | High | Privacy | Marketing consent / CASL | Cart-recovery email sent to never-opted-in guests; only known opt-outs suppressed. | 05–08* · = H-11 | Lawyer | Open — unremediated |
| LR-DB-01 | High | Database | Order-create saga durability | `reserveCredit` debits the wallet before `order.create`; the spend-ledger row is written after; no transaction spans them. | 05–08* · = H-2 | Eng | Open — unremediated |
| LR-DB-02 | High | Database | Backups / restore | No automated app backup, no tested restore, Neon PITR unverified — the DB is the sole source of truth. (Folds into C-2.) | 05–08* · → C-2 | Owner + Eng | Open — unremediated |
| LR-OPS-02 | High | Ops | CI / supply-chain | No `.github/workflows`; tests run only on manual preflight; push to `main` deploys to prod; no dep/secret scan. | 05–08* · = H-6 | Eng | Open — unremediated |
| LR-OPS-03 | High | Ops | Monitoring / alerting | Sentry catches thrown errors only; money/webhook/cron use `console.error`+500; no uptime/cron/webhook/backup alerts. | 05–08* · = H-7 | Eng | Open — unremediated |
| LR-OPS-04 | High | Ops | Incident response / DR governance | No IR procedure, no breach procedure, no status page, no RTO/RPO, one-line rollback note only. | 05–08* · = H-8 | Eng + Owner | Open — unremediated |
| LR-TEST-01 | High | Testing | CI / release gate | 591 tests run only on manual preflight; Vercel build does not run the suite. | 05–08* · = H-6 | Eng | Open — unremediated |
| LR-TEST-02 | High | Testing | Authz / tenant-isolation tests | Zero tests assert per-route auth (401 / 403 / 404) or restaurant-scoped ownership on writes. | 05–08* · = H-12 | Eng | Open — unremediated |
| LR-TEST-03 | High | Testing | Webhook idempotency / ordering tests | Claim-first dedup / replay / out-of-order webhook logic is subtle and untested. | 05–08* · = H-13 | Eng | Open — unremediated |
| LR-TEST-04 | High | Testing | Payment-scenario coverage | The 14 checkout money-path edge scenarios are implemented but untested. | 05–08* · = H-13 | Eng | Open — unremediated |

### MEDIUM (29)

| ID | Sev | Domain | Component | One-line description | Doc | Owner class | Status |
|---|---|---|---|---|---|---|---|
| LR-PAY-03 | Medium | Payments | PayPal out-of-band refunds | Dashboard-issued PayPal refunds never sync order state or reward wallet (webhook never registered). | 03 §7 | Eng | Open — unremediated |
| LR-PAY-04 | Medium | Payments | Auto-reject cron / PayPal | Stale released PayPal orders are flipped `rejected` but the hold is never voided. | 03 §7 | Eng | Open — unremediated |
| LR-PAY-05 | Medium | Payments | Abandoned sweep / Stripe | 30-min sweep cancels DB-only; `paymentIntentId` not stamped at creation; card hold persists ~7 days. | 03 §7 | Eng | Open — unremediated |
| LR-PAY-06 | Medium | Payments | Cancelled-order resurrection | `verify` ignores `Order.status`; late payment on a cancelled order fires the full fan-out with no void. | 03 §7 | Eng | Open — unremediated |
| LR-PAY-07 | Medium | Payments | Reconciliation | Stripe↔Order state compared only at confirmation-page render; no drift-detection cron. | 03 §7 | Eng | Open — unremediated |
| LR-PAY-08 | Medium | Payments | Webhook registration coverage | `ensureRestaurantStripeWebhook` fires only on Test-connection; no backfill for existing providers. | 03 §7 | Eng | Open — unremediated |
| LR-PAY-09 | Medium | Payments | Entitlement / webhook dependence | `grantingAddOnWhere` trusts `status` indefinitely; no period cutoff/reconcile — revenue leak if a webhook is missed. | 03 §7 | Eng | Open — unremediated |
| LR-PAY-10 | Medium | Payments | Duplicate plan subscription | Plan checkout has no active-sub guard; a second subscription can be created and double-bill. | 03 §7 | Eng | Open — unremediated |
| LR-SEC-05 | Medium | Security | GloriaFood import SSRF | Authenticated admin import doesn't clamp the pasted host (the public path does). | 04 §7 | Eng | Open — unremediated |
| LR-SEC-06 | Medium | Security | Customer JWT revocation | 30-day hand-rolled customer JWTs; logout/reset don't invalidate; no `tokenVersion`. | 04 §7 | Eng (schema, both branches) | Open — unremediated |
| LR-SEC-07 | Medium | Security | Anti-enumeration timing | `DUMMY_HASH` isn't a valid bcrypt digest; a timing oracle enumerates customer emails. | 04 §7 | Eng | Open — unremediated |
| LR-SEC-08 | Medium | Security | Password policy | Customer signup/reset accept 8-char no-complexity passwords; bcrypt cost 10 vs 12 elsewhere. | 04 §7 | Eng + Owner (product) | Open — unremediated |
| LR-SEC-09 | Medium | Security | Rate limit — order create | `POST /api/orders` (money-critical) has zero per-IP rate limit. | 04 §7 | Eng | Open — unremediated |
| LR-SEC-10 | Medium | Security | Rate limit — geocode proxy | Nominatim proxy has no rate limit; one abuser can get the shared egress IP banned platform-wide. | 04 §7 | Eng | Open — unremediated |
| LR-SEC-11 | Medium | Security | Rate limit — signup | Customer signup endpoints have no rate limit; unbounded accounts + verification-email spam. | 04 §7 | Eng | Open — unremediated |
| LR-SEC-12 | Medium | Security | Webhook error reporting | Per-restaurant Stripe webhook catches with `console.error` only — silent 500s on Stripe retries, no Sentry. | 04 §7 | Eng | Open — unremediated |
| LR-PRIV-04 | Medium | Privacy | Subprocessor disclosure | Published subprocessor list omits Twilio, PayPal, Vercel Blob, and APNs/FCM. | 05–08* | Lawyer / Privacy-pro | Open — unremediated |
| LR-PRIV-05 | Medium | Privacy | PII at rest (plaintext) | All customer PII is stored plaintext; only secret credentials/payout details are AES-256-GCM encrypted. | 05–08* | Lawyer + Eng | Open — unremediated |
| LR-PRIV-06 | Medium | Privacy | Cross-border / DPA | US processing likely (region unpinned); no DPA/SCC artifact in-repo; no B2B DPA offered to restaurants. | 05–08* | Lawyer | Open — unremediated |
| LR-PRIV-07 | Medium | Privacy | Tracking / prospect retention | Analytics rows, cart emails/phones, and imported prospect contacts accumulate indefinitely; no TTL/purge. | 05–08* | Lawyer + Eng | Open — unremediated |
| LR-PRIV-08 | Medium | Privacy | Jurisdiction gating (default-deny) | No signup country allowlist; `Restaurant.country` defaults `"US"`; platform open worldwide. | 05–08* · see 09 | Lawyer + Eng | Open — unremediated |
| LR-DB-03 | Medium | Database | Migration model | `prisma db push`, no versioned/down migrations; `migration_lock.toml` declares `sqlite` vs the `postgresql` datasource. | 05–08* | Eng | Open — unremediated |
| LR-DB-04 | Medium | Database | Cron memory bounds | `prospect` / `prospectImport` / per-minute `order` `findMany` calls have no `take` cap. | 05–08* | Eng | Open — unremediated |
| LR-DB-05 | Medium | Database | Coupon usedCount reconciliation | Classic `Coupon.usedCount` has no per-order ledger (unlike promos); given back only on create-failure — drift risk. | 05–08* | Eng | Open — unremediated |
| LR-OPS-05 | Medium | Ops | Payment reconciliation | On release, `intent.amount` is never compared to `order.total`; no reconciliation cron, no mismatch alert. | 05–08* | Eng | Open — unremediated |
| LR-OPS-06 | Medium | Ops | Structured logging / redaction | Plain `console.*`; no trace/correlation id; Vercel runtime logs pass through no redaction allowlist. | 05–08* | Eng | Open — unremediated |
| LR-OPS-07 | Medium | Ops | Auth / security alerting | No alert on repeated lockouts, role/owner changes, or new-admin creation. | 05–08* | Eng | Open — unremediated |
| LR-TEST-05 | Medium | Testing | DB constraint / drift tests | P2002 dedup + FK/cascade behavior never asserted against a real schema (in-memory mocks only). | 05–08* | Eng | Open — unremediated |
| LR-TEST-06 | Medium | Testing | E2E / load / failure-injection | No browser E2E of order→pay→kitchen; no load/soak vs the 100→10k target; no failure injection. | 05–08* | Eng | Open — unremediated |

### LOW (25)

| ID | Sev | Domain | Component | One-line description | Doc | Owner class | Status |
|---|---|---|---|---|---|---|---|
| LR-PAY-11 | Low | Payments | Admin refund atomicity | Stripe-then-DB not atomic; a crash + different-amount retry can over-refund; kill-flow refund uses no idempotency key. | 03 §7 | Eng | Open — unremediated |
| LR-PAY-12 | Low | Payments | Accepted-method enforcement | Server doesn't validate `paymentMethod` against the restaurant's configured methods; cash bypass at prepaid-only stores. | 03 §7 | Eng | Open — unremediated |
| LR-PAY-13 | Low | Payments | Client secret in URL | `clientSecret` + publishable key passed as query params (browser history / CDN logs). Not cardholder data. | 03 §7 | Eng | Open — unremediated |
| LR-PAY-14 | Low | Payments | PayPal zero-decimal currency | `toFixed(2)` breaks PayPal checkout for JPY / HUF / TWD. | 03 §7 | Eng | Open — unremediated |
| LR-PAY-15 | Low | Payments | PayPal safety-net inert | PayPal webhooks never registered; tab-close recovery + refund sync can't fire. | 03 §7 | Eng | Open — unremediated |
| LR-PAY-16 | Low | Payments | EOD digest bucketing | PayPal-paid and reward_credit orders mis-counted as offline/till in the EOD digest. | 03 §7 | Eng | Open — unremediated |
| LR-PAY-17 | Low | Payments | Invoice plan/add-on conflation | An add-on invoice mutates plan-level `subscriptionStatus` / `currentPeriodEnd`. | 03 §7 | Eng | Open — unremediated |
| LR-PAY-18 | Low | Payments | Plan change bypasses EU-VAT | `change-plan` doesn't call `euVatSubscriptionBlock`, unlike the checkout routes. | 03 §7 | Tax + Eng | Open — unremediated |
| LR-PAY-19 | Low | Payments | Uncollectible / voided invoices | `invoice.marked_uncollectible` / `voided` have no lifecycle handling or alert. | 03 §7 | Eng | Open — unremediated |
| LR-SEC-13 | Low | Security | Reseller SVG upload XSS | `image/svg+xml` allow-listed and stored public; the blob URL is directly navigable and executes script (blob origin). | 04 §7 | Eng + Owner (policy) | Open — unremediated |
| LR-SEC-14 | Low | Security | Menu-image cron fetch | `fetch(sourceUrl)` with no host allow-list (defense-in-depth; not attacker-controllable today). | 04 §7 | Eng | Open — unremediated |
| LR-SEC-15 | Low | Security | No MFA | No second factor anywhere, including superadmin. | 04 §7 | Eng + Owner (roadmap) | Open — unremediated |
| LR-SEC-16 | Low | Security | Signup enumeration | Signup endpoints explicitly confirm "account already exists." | 04 §7 | Eng | Open — unremediated |
| LR-SEC-17 | Low | Security | Customer login lockout | Customer systems have no DB lockout backstop; weak under a shared-store outage. | 04 §7 | Eng (or config, LR-SEC-20) | Open — unremediated |
| LR-SEC-18 | Low | Security | Unauth order-status PII | `GET /api/orders/[id]` returns customer name + delivery address by `cuid` with no token/ownership check. | 04 §7 | Eng + Owner (by-design?) | Open — unremediated |
| LR-SEC-19 | Low | Security | PII in logs | Forgot-password logs the email (enumeration oracle); order-alert cron logs the customer phone. | 04 §7 | Eng | Open — unremediated |
| LR-PRIV-09 | Low | Privacy | Marketing consent model | Single opt-in checkbox, no confirmation email; default checked/unchecked state unverified. | 05–08* | Lawyer | Open — unremediated |
| LR-PRIV-10 | Low | Privacy | Legal-docs localization | Legal pages are English-only vs the 38-language rule; each self-labelled a v1 template pending review. | 05–08* | Lawyer + Eng | Open — unremediated |
| LR-PRIV-11 | Low | Privacy | Age / children | Policy states 18+ / no under-16, but no age gate/attestation at signup or checkout. | 05–08* | Lawyer | Open — unremediated |
| LR-PRIV-12 | Low | Privacy | Mandatory phone collection | Phone is required at customer signup — a data-minimisation / lawful-basis question. | 05–08* | Lawyer | Open — unremediated |
| LR-DB-06 | Low | Database | Best-effort compensation | Order-create-failure counter rollbacks are unawaited fire-and-forget; reward re-credit is only `.catch`-logged. | 05–08* | Eng | Open — unremediated |
| LR-DB-07 | Low | Database | Order-page hot-path caching | ~8 sequential uncached DB round-trips per ordering-page render; no `unstable_cache`/`revalidate`. | 05–08* | Eng | Open — unremediated |
| LR-DB-08 | Low | Database | Reward ledger nullable-orderId | `@@unique([accountId, orderId, reason])` doesn't dedupe rows with `orderId = NULL` (Postgres treats NULLs as distinct). | 05–08* | Eng | Open — unremediated |
| LR-OPS-08 | Low | Ops | Error-tracking config | Sentry silently no-ops if the DSN is unset in prod; no post-deploy smoke test confirms events arrive. | 05–08* | Eng + Owner (config) | Open — unremediated |
| LR-TEST-07 | Low | Testing | DR backup/restore testing | No documented or rehearsed backup-restore drill / restore-verification runbook. | 05–08* | Owner + Eng | Open — unremediated |

### INFORMATIONAL (13)

| ID | Sev | Domain | Component | One-line description | Doc | Owner class | Status |
|---|---|---|---|---|---|---|---|
| LR-PAY-20 | Info | Payments | Connect-era webhook dead code | The platform `payment_intent.*` handler is unreachable for key-only orders — source of the LR-PAY-01 false assurance. | 03 §7 | Eng | Open — unremediated |
| LR-PAY-21 | Info | Payments | Negative balance (by design) | Refund-after-payout draws the restaurant's own balance/bank; the platform is never liable. | 03 §7 | Lawyer (terms) | Open — unremediated |
| LR-PAY-22 | Info | Payments | Cash refunds no record | A cash refund is a physical drawer event with no `refundedAmount` / audit trail. | 03 §7 | Eng (optional) | Open — unremediated |
| LR-PAY-23 | Info | Payments | Cash never terminal | Cash orders stay `paymentStatus="pending"` forever; "pending" is overloaded — a future-filter landmine. | 03 §7 | Eng | Open — unremediated |
| LR-PAY-24 | Info | Payments | Gift-card liability | Gift cards are menu items with exclusion flags; no stored-value/liability ledger (accounting disclosure gap). | 03 §7 | Tax / Accounting | Open — unremediated |
| LR-PAY-25 | Info | Payments | Promo codes unrestricted | `allow_promotion_codes:true` with no app-side scoping; rely on per-code Stripe-dashboard restriction. | 03 §7 | Owner (Stripe config) | Open — unremediated |
| LR-PAY-26 | Info | Payments | Add-on proration matrix | Plan switches prorate; add-ons have no switch path (by design) — documented so future work doesn't assume it. | 03 §7 | Eng (note) | Open — unremediated |
| LR-SEC-20 | Info | Security | Cross-isolate rate limiting | Limiter degrades to per-isolate without Upstash/KV env configured in prod. | 04 §7 | Owner (config) | Open — unremediated |
| LR-SEC-21 | Info | Security | next-auth → uuid | Moderate advisory; only fix is a breaking `next-auth` v3 downgrade — tracked accepted risk. | 04 §7 | Eng (track) | Open — unremediated |
| LR-DB-09 | Info | Database | Loose FK on side-tables | `PromotionUsage` / `CustomerCoupon` / `RewardLedger` `orderId` have no FK (deliberate, to keep the hot Order table lean). | 05–08* | Eng (note) | Open — unremediated |
| LR-DB-10 | Info | Database | Float money representation | Monetary values are `Float` with `round2` / `Math.round(x*100)/100` discipline rather than integer cents. | 05–08* | Eng (note) | Open — unremediated |
| LR-OPS-09 | Info | Ops | Runbooks deliverable | The 14 requested runbooks (Stripe/Vercel/Neon outage, dup order/payment, breach, …) are to be adopted. | 05–08* | Eng + Owner | Open — unremediated |
| LR-OPS-10 | Info | Ops | RUNBOOKS.md content | A ready-to-save operational runbook set is drafted (to land as `08-incident-response-and-runbooks.md`). | 05–08* | Eng + Owner | Open — unremediated |

---

## 4. Consolidated-blocker cross-reference (`11-launch-blockers.md`)

| Consolidated | Severity | Domain finding(s) | Short title |
|---|---|---|---|
| C-1 | Critical | LR-PAY-01 | Auto-accepted card orders never captured |
| C-2 | Critical | LR-OPS-01 (+ LR-DB-02) | No automated DB backup / no tested restore |
| H-1 | High | LR-PAY-02 | Disputes / chargebacks invisible |
| H-2 | High | LR-DB-01 | Order-create saga not atomic |
| H-3 | High | LR-SEC-02 | Intra-tenant RBAC helper unused |
| H-4 | High | LR-SEC-01 | Impersonation not audit-logged |
| H-5 | High | LR-SEC-03 + LR-SEC-04 | Next.js + undici/fast-uri advisories |
| H-6 | High | LR-OPS-02 + LR-TEST-01 | No CI / release gate |
| H-7 | High | LR-OPS-03 | No monitoring / alerting |
| H-8 | High | LR-OPS-04 | No incident-response / DR governance |
| H-9 | High | LR-PRIV-01 | Retention promises unimplemented |
| H-10 | High | LR-PRIV-02 | No self-service data rights |
| H-11 | High | LR-PRIV-03 | CASL cart-recovery consent |
| H-12 | High | LR-TEST-02 | No authorization / isolation tests |
| H-13 | High | LR-TEST-03 + LR-TEST-04 | No webhook-idempotency / payment-scenario tests |

---

## 5. Notes on use

- **Traceability:** when a fix is approved and shipped, update that finding's **Status** here (e.g. `Fixed — commit <sha>, verified <date>` or `Risk-accepted in writing — <date>`), so this register stays the single source of truth for remediation state.
- **Owner-class column** is a routing hint, not an assignment of liability: **Lawyer**/**Tax** items must not be self-decided by engineering (per `00` §6); **Owner** items need config/plan/approval action; **Eng** items are implementable under the staged plan in `10-release-and-rollback-plan.md`.
- **No secrets** appear in this register or any referenced document; the security scan reports pattern names only.

*End of 12 — Evidence Register.*
