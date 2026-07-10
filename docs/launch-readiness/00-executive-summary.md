# Launch-Readiness Audit — 00: Executive Summary

**Date:** 2026-07-10 · **Auditor:** Claude (acting as senior security engineer / payments architect / privacy engineer / DB reliability engineer / release manager) · **Scope:** ~200,000-line multi-tenant SaaS ordering platform, LIVE as of 2026-07-10 with one owner-operated restaurant taking real card payments.
**Method:** read-only investigation across 9 phases by ~20 specialist sub-agents, findings verified against live production data (read-only) where exposure mattered. No production changes were made by this audit. Full detail in `01`–`12`.

> **This is not a compliance certification.** No claim of "PCI compliant," "GDPR compliant," "legal," or "secure" is made. Several findings require sign-off by qualified legal, privacy, tax, and payments professionals — listed in §6.

---

## 1. Overall launch verdict

# ⚠️ READY ONLY FOR RESTRICTED PILOT AFTER LISTED FIXES

**Plain-language version:** the platform is **safe to keep running as it is today** — one owner-operated restaurant, in Canada, taking card payments — because the parts that would hurt a customer or leak data are sound. It is **NOT yet ready to onboard other people's restaurants** or to expand beyond Canada. Two Critical items and a cluster of operational gaps must close first.

Why not worse: the highest-stakes properties are **verified good** — a customer can't be over/under-charged (server recomputes every total from immutable records), one restaurant can't reach another's data (25+ write routes sampled, no access-control holes, prior IDOR fixes intact), and card numbers never touch your servers (Stripe collects them directly, keeping you in the lightest PCI scope).

Why not better: there are **2 Critical** findings and **13 High**. One Critical is a *latent* money-loss bug (harmless today, dangerous on a settings change); the other is the **absence of a tested database backup** — unacceptable indefinitely for a system that is the sole record of customer wallets and payments. The Highs are dominated by the *operational maturity* a live payments business needs but doesn't yet have: no automated backups, no monitoring/alerting, no incident response, no CI, and unimplemented privacy-policy promises.

---

## 2. Critical launch blockers (must fix)

1. **C-1 — Auto-accepted card orders are never captured** *(latent; zero exposure today, triggers if any restaurant enables auto-accept + online card).* Restaurant would deliver food and collect nothing. ~1-hour fix.
2. **C-2 — No automated DB backup, no tested restore.** *(live risk now.)* A bad schema push or Neon incident has no proven recovery path.

## 2b. High blockers (summary — full detail in `11`)

Payments: **disputes/chargebacks are invisible** (H-1); **order-create wallet saga isn't atomic** (H-2).
Security: **RBAC helper unused → staff can edit prices/promos** (H-3); **impersonation not audit-logged** (H-4); **Next.js + undici/fast-uri security advisories** (H-5).
Operations: **no CI/release gate** (H-6); **no monitoring/alerting** (H-7); **no incident-response/DR** (H-8).
Privacy (lawyer review): **retention promises unimplemented** (H-9); **no self-service data rights** (H-10); **CASL cart-recovery consent** (H-11).
Testing: **no authorization/isolation tests** (H-12); **no webhook-idempotency/payment-scenario tests** (H-13).

---

## 3. Payment architecture summary

**Model: key-only direct charges.** Each restaurant pastes its OWN Stripe secret + publishable keys (encrypted at rest, AES-256-GCM). Customer cards are charged **directly on the restaurant's own Stripe account**, using authorize-then-capture (manual capture). There is **no Stripe Connect money flow in production** (Connect code exists but is legacy/unused) and **no platform fee on customer orders**. The platform's own Stripe account bills **subscriptions/add-ons only**.

- **Merchant of record:** each **restaurant**, on its own account. Fee Free Ordering is **not in the customer money flow**.
- **Dispute / chargeback responsibility:** the **restaurant** (their account is debited). ⚠️ Today the platform is *blind* to these events (H-1).
- **Negative-balance / refund / Stripe-fee responsibility:** the **restaurant**. Fee Free bears none of it.
- **Card data:** never touches Fee Free servers, DB, logs, or analytics (Stripe Payment Element). Designed to be **SAQ-A** eligible; formal attestation is a QSA/Stripe matter, not claimed here.
- **Server price authority:** every price, tax, fee, tip, and total is recomputed server-side from immutable menu/pricing records; client-supplied amounts are ignored. A crafted client cannot underpay or push an unpaid order to the kitchen.

The full Money-Movement Responsibility Matrix and 15 payment sequence diagrams are in `03`.

---

## 4. Top ten risks (priority order)

1. **No tested backup/restore** (C-2) — sole source of truth, no proven recovery.
2. **Auto-accept capture bug** (C-1) — silent uncollected revenue the instant the setting flips.
3. **Disputes invisible** (H-1) — auto-lost chargebacks, overstated revenue.
4. **No monitoring** (H-7) — a silently failing cron or stuck payment goes unnoticed.
5. **Order-create saga non-atomic** (H-2) — a crash mid-order can debit a wallet with no ledger row.
6. **RBAC helper unused** (H-3) — any staff account can change prices/promos (matters when real restaurants add employees).
7. **No CI** (H-6) — production protected only by developer discipline; one skipped preflight can ship a broken build.
8. **Dependency advisories** (H-5) — known Next.js proxy-bypass / cache-poisoning classes on the customer hot path.
9. **Privacy promises unimplemented** (H-9/H-10/H-11) — policy says things the code doesn't do; CASL exposure on cart-recovery email.
10. **Impersonation not logged** (H-4) — highest-privilege action has no forensic trail.

---

## 5. Safe remediation plan (small, reversible stages — each: own branch, atomic commits, tests, review, no deploy of live keys)

- **Stage 1 — Money correctness (engineering, ~½ day).** C-1 auto-accept capture + H-1 dispute visibility (both ride the per-restaurant webhook already shipped) + H-2 order-create atomicity. High value, low blast radius, fully testable.
- **Stage 2 — Backups & recovery (owner + engineering, ~½ day).** Confirm Neon PITR tier; one real restore drill; daily `pg_dump` to off-Neon storage + backup-failure alert. Closes C-2.
- **Stage 3 — Access hardening (engineering, ~½ day).** H-3 wire `requireRestaurantAccess` into money/config routes; H-4 impersonation audit log.
- **Stage 4 — Dependencies (engineering, ~2 h, owner-approved).** H-5 Next 16.2.10 + non-forcing `npm audit fix`; preflight; verify proxy/routes.
- **Stage 5 — Operational safety net (engineering, ~1–2 days).** H-6 CI (preflight + audit + secret scan); H-7 uptime + synthetic-order probe + cron heartbeat + reportError wiring; H-8 adopt runbooks, define RTO/RPO, status page.
- **Stage 6 — Test coverage (engineering, ongoing).** H-12 authorization/isolation harness; H-13 webhook-idempotency + payment-scenario suites.
- **Stage 7 — Privacy remediation (lawyer/privacy-pro FIRST, then engineering).** H-9 retention crons or policy revision; H-10 DSAR tooling; H-11 CASL consent gating. Do not self-decide these.

**Nothing in Stages 1–6 requires new live keys, production migrations, or touching the current happy path. Implementation waits for your explicit approval, one stage at a time.**

---

## 6. Professional review checklist (before broadening)

- **Technology / SaaS lawyer** — platform terms, restaurant service agreement, reseller agreement, limitation of liability, the key-only merchant-of-record structure (each restaurant is its own MoR — confirm the platform isn't inadvertently a payment facilitator / money transmitter).
- **Privacy lawyer / privacy professional** — PIPEDA + CASL (Canada, first), privacy policy vs actual behavior gaps (H-9), DSAR process (H-10), cart-recovery consent (H-11), subprocessor list reconciliation, mandatory-phone data-minimization. Separate reviews for US-state laws and GDPR/UK before entering those markets.
- **Accountant / international tax professional** — sales-tax/GST/HST handling, EU-VAT (already partially built), invoice issuer structure, restaurant 1099/T-slip questions.
- **Stripe / payments specialist** — confirm key-only direct-charge model + dispute handling; review whether a per-restaurant webhook + reconciliation job satisfies their expectations.
- **PCI qualified security professional (QSA)** — confirm SAQ-A eligibility and produce the attestation (do not self-attest).
- **Independent penetration tester** — external test of auth, tenant isolation, and the payment/webhook surface before onboarding third-party restaurants.
- **Cyber-insurance provider** — coverage for a platform holding customer PII + facilitating card payments.

---

## 7. Launch recommendation

- **Initial jurisdiction:** **Canada only.** Default every other country to unavailable until it has technical + payments + tax + legal review (see `09-jurisdiction-launch-matrix.md`).
- **Initial scale:** **continue the current single restaurant (Luigi's own).** This is a legitimate live pilot and is safe to continue with Stage 1 + Stage 2 fixes prioritized.
- **Gate to onboard restaurant #2 (first non-owner / real third party):** Critical C-1 and C-2 closed; H-1 (disputes), H-3 (RBAC), H-7 (monitoring) closed; a backup restore drill passed; the CASL/retention lawyer review at least *started*.
- **Gate to broader launch (many restaurants, marketing push):** all Critical closed, all High closed or explicitly risk-accepted in writing, CI live, independent pen-test passed, legal + privacy sign-off obtained, backup/restore proven, monitoring + incident response operational.
- **Transaction limits during pilot:** keep the existing $10,000 per-order cap; watch for stuck `authorized` orders (the C-1 signal) via the audit script until the fix ships.
- **Monitoring period:** run the current single-store pilot for a defined window (suggest ≥2–4 weeks) with Stage 1/2/5 in place before onboarding a second restaurant.
- **Rollback triggers:** any stuck-capture order, any webhook backlog, any customer-facing payment error rate spike, any data-integrity mismatch → follow `08` runbooks; code rollback via Vercel promote-previous (never change `ENCRYPTION_KEY`).

---

## 8. Final gate (all required before live credentials broaden beyond the pilot)

☐ No unresolved Critical findings · ☐ Highs closed or explicitly accepted in writing · ☐ Payment + tenant-isolation tests passing · ☐ Backup restore drill passed · ☐ Stripe money-flow reviewed · ☐ Legal + privacy documents reviewed · ☐ Monitoring + incident response operational · ☐ Controlled staging test · ☐ Independent security test · ☐ Explicit human approval.

*Implementation of any fix waits for the owner to select an approved remediation stage. This audit changed no application behavior.*
