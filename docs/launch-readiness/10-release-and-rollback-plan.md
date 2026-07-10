# Launch-Readiness Audit — 10: Release & Rollback Plan

**Date:** 2026-07-10. Companion to `00-executive-summary.md` (§5 staged remediation) and `11-launch-blockers.md`. Specific to THIS repo's tooling: Next.js 16 on Vercel, Prisma + two Neon Postgres branches, `prisma db push` (no versioned migrations), `npm run preflight`, and `scripts/push-schema-to-both.ts`.

> **Scope.** This is the discipline for shipping the approved remediation fixes safely while the platform is LIVE. Nothing here deploys new live keys or migrations by itself — every step waits for the owner to approve a specific stage.

---

## 1. Protected launch-readiness branch model

- **`main` is the production branch.** Push to `main` deploys straight to production on Vercel (there is no CI gate today — see H-6 / LR-OPS-02 / LR-TEST-01). Treat every push to `main` as a production deploy.
- **Never commit remediation work directly to `main`.** Each approved fix gets its **own short-lived branch** off `main`, e.g. `fix/lr-pay-01-auto-accept-capture`, `fix/lr-sec-02-rbac-manager-gate`. One finding (or one tightly-coupled cluster) per branch.
- **A branch merges to `main` only after:** the pre-deploy checklist (§7) passes locally, the change has been reviewed (adversarially for money paths — §7), and the owner has approved the stage it belongs to.
- **Recommended protection (owner action on GitHub `luigislasagna1-bit/fee-free-ordering-systems`):** require a PR + one approval before merge to `main`, and once H-6 ships, require the CI status check (preflight + `npm audit` + secret scan) to pass. Until CI exists, the "gate" is this checklist run by hand — so it must actually be run, bottom-up, every time.
- **One stage at a time.** The staged sequence in §6 is ordered by value and blast radius. Do not batch stages; ship, verify in production, then start the next.

---

## 2. Verified source-code backup (git remote + tag before each stage)

The code's off-machine backup is the GitHub remote. Make it verifiable, not assumed.

- **Remote:** `origin` → `https://github.com/luigislasagna1-bit/fee-free-ordering-systems.git`. Confirm `git remote -v` and that `git push` succeeds before relying on it as a backup.
- **Tag before each stage.** Immediately before starting a remediation stage, tag the current known-good production commit so there is a named, immutable rollback point:
  ```
  git tag -a pre-stage-1-money-correctness -m "Known-good prod before Stage 1"
  git push origin pre-stage-1-money-correctness
  ```
  Use one tag per stage (`pre-stage-2-backups`, `pre-stage-3-access`, …). These complement the hardware-verified checkpoint tags already in the repo (e.g. `kitchen-display-verified-2026-07-03`) — the same revert-point discipline, applied to launch remediation.
- **Verify the push landed.** `git ls-remote --tags origin | grep pre-stage-` before proceeding. A backup you didn't confirm is not a backup.

---

## 3. Verified database backup — REQUIRED before any schema change

This ties directly to the Critical **C-2** (no tested backup / no proven restore — `11-launch-blockers.md`). The database is the **sole** source of truth for customer wallets, promo/coupon caps, orders, payments, and subscriptions. A code rollback does **not** roll back the database (§8).

**Hard rule: no `prisma db push` against production without a verified, restorable backup taken first.**

- **Before any schema change:** capture a `pg_dump` of the production Neon branch to off-Neon storage, and **confirm the dump is non-empty and restorable** (restore it to a scratch Neon branch and sanity-check row counts) — not just that the command exited 0.
- **Standing gap this closes:** there is currently no scheduled `pg_dump`, no documented restore drill, and Neon PITR retention on the production plan is unverified. Stage 2 (§6) makes the backup routine and proven; until it does, every schema push is preceded by a **manual** dump + restore check.
- **PITR is a floor, not the plan.** Confirm and document Neon's point-in-time-recovery window on the actual production plan, but do not treat it as a substitute for an independent off-Neon dump (a bad `db push` or a dropped table inside the window still needs a clean artifact to restore from).

---

## 4. Migration discipline — expand-and-contract (because there are no down-migrations)

Schema is managed by **`prisma db push`**, which has **no down-migrations** and no versioned migration history. A bad push cannot be "migrated back" — it can only be re-pushed forward or restored from backup. Therefore all schema changes are **additive-and-reversible-by-design**:

1. **Additive only, never drop-then-add in one step.** To rename/replace a column: (a) add the new column, (b) backfill + dual-write in code, (c) cut reads over to the new column, (d) only in a *later, separate* deploy remove the old column once nothing reads it. Never drop and add in the same change — a code rollback would then hit a schema that no longer matches.
2. **Audit for full-table rewrites first.** Before pushing, run `prisma migrate diff` (from → to) to inspect the generated SQL and confirm the change is additive and won't trigger a full-table rewrite / long lock on a hot table (`Order`, `MenuItem`, and other high-row tables per the scale rules in AGENTS.md). Prefer nullable columns or separate side-tables for sparse data over widening hot tables.
3. **Apply to BOTH Neon branches via the repo script.** Use `scripts/push-schema-to-both.ts` (or `npm run` its wrapper) so dev and prod branches stay aligned — never push against only one. The script runs plain `prisma db push` **without** `--accept-data-loss` (it is additive-by-default and refuses destructive changes), which is exactly the guard we want; do not add `--accept-data-loss` to force a destructive change past it.
4. **Know the drift landmine.** `prisma/migrations/migration_lock.toml` declares `provider = "sqlite"` while the live datasource is `postgresql` (LR-DB-03). This is a known inconsistency in the migration metadata — do not "fix" it casually mid-remediation; it is a documented item to address deliberately, not a surprise to trip over during a push.
5. **`db push` is not atomic across statements.** If a multi-statement push fails partway, the schema can be left half-applied — which is the whole reason the backup in §3 is mandatory *before* the push, not after.

---

## 5. Atomic-commit discipline per approved fix

- **One logical change per commit.** Each commit does exactly one thing and leaves the tree building. No "and while I was in there" changes riding along — those defeat per-change rollback (§9) and adversarial review.
- **Reference the finding ID** in the commit subject, e.g. `LR-PAY-01: capture auto-accepted card orders in verifyAndReleaseOrderPayment`.
- **Keep code and schema in separate commits** where possible, so a code-only rollback (Vercel promote-previous) never leaves a commit that assumed a schema that the expand/contract sequence hasn't reached yet.
- **i18n moves with the string.** Any commit that touches a user-facing string includes the `en.json` change **and** all 37 other locales in the same commit — parity is part of "done," never a follow-up (AGENTS.md standing rule).
- **Commit trailer** per repo convention: `Co-Authored-By: Claude <noreply@anthropic.com>`.

---

## 6. Staged remediation sequence (mirrors `00-executive-summary.md` §5)

Ship in order; verify each in production before the next. Each stage = own branch(es), atomic commits, pre-deploy checklist, review, owner approval. **None of Stages 1–6 requires new live keys or a production migration on the current happy path.**

- **Stage 1 — Money correctness (engineering, ~½ day).** C-1 / LR-PAY-01 auto-accept capture + H-1 / LR-PAY-02 dispute visibility (both ride the per-restaurant webhook shipped `91d11c07`) + H-2 / LR-DB-01 order-create atomicity. High value, low blast radius, fully testable.
- **Stage 2 — Backups & recovery (owner + engineering, ~½ day).** Confirm Neon PROD PITR tier; run ONE real restore drill to a scratch branch and document it; add a scheduled daily `pg_dump` to off-Neon storage + a backup-failure alert. Closes C-2 (§3).
- **Stage 3 — Access hardening (engineering, ~½ day).** H-3 / LR-SEC-02 wire `requireRestaurantAccess(…, MANAGER)` into money/config routes; H-4 / LR-SEC-01 impersonation audit log.
- **Stage 4 — Dependencies (engineering, ~2 h, owner-approved).** H-5 / LR-SEC-03 Next → `16.2.10` + non-forcing `npm audit fix` for LR-SEC-04 (`undici`/`fast-uri`); preflight; verify proxy + routes. Blocked only on the standing no-auto-upgrade rule.
- **Stage 5 — Operational safety net (engineering, ~1–2 days).** H-6 CI (preflight + `npm audit` + secret scan); H-7 / LR-OPS-03 uptime + synthetic-order probe + cron heartbeat + wire `reportError()` into every money/webhook/cron catch (incl. LR-SEC-12); H-8 / LR-OPS-04 adopt runbooks, define RTO/RPO, status page.
- **Stage 6 — Test coverage (engineering, ongoing).** H-12 / LR-TEST-02 authorization/isolation harness; H-13 / LR-TEST-03+04 webhook-idempotency + payment-scenario suites.
- **Stage 7 — Privacy remediation (lawyer / privacy-pro FIRST, then engineering).** H-9 / LR-PRIV-01 retention crons or policy revision; H-10 / LR-PRIV-02 DSAR tooling; H-11 / LR-PRIV-03 CASL consent gating; plus the jurisdiction allowlist gate (LR-PRIV-08, see `09-jurisdiction-launch-matrix.md`). Do not self-decide these.

---

## 7. Pre-deploy checklist (run before every merge to `main`)

1. **`npm run preflight` — read the output BOTTOM-UP.** Preflight runs `tsc --noEmit && vitest run && prisma generate && next build`. Next.js prints build errors **after** the route table, so a casual skim makes a failed build look successful. Look explicitly for `> Build error occurred` / `Command "npm run build" exited with 1`. Preflight is the exact sequence Vercel runs and fail-fasts — this is mandatory for any change touching build-critical files (proxy, route handlers, `next.config`, prisma schema, `package.json`).
2. **i18n parity (if any user-facing string changed).** Run the all-38-locale parity audit (`i18n-parity-all.ts`, not the 4-locale `i18n-audit.ts`) and confirm 0 missing / extra / placeholder-arg / rich-tag mismatches across all 38 locales.
3. **Adversarial review for money paths.** Any change touching orders, payments, refunds, reward ledger, promos, or webhooks gets a deliberate "how could this double-charge, leak, or skip an idempotency guard?" review before merge — not just a correctness read. Confirm idempotency keys are intact and webhooks stay idempotent (Stripe/ShipDay/Resend all retry).
4. **No `middleware.ts`.** Confirm no `middleware.ts` was introduced anywhere (Next 16 uses `src/proxy.ts`; a stray `middleware.ts` breaks the Vercel build with `ENOENT: middleware.js.nft.json`).
5. **Schema changes:** DB backup verified (§3), `migrate diff` reviewed for full-table rewrites (§4), applied via `push-schema-to-both.ts` to both branches.
6. **Source-code + tag backup confirmed** for the stage (§2).

---

## 8. Rollback — Vercel promote-previous (code only)

- **Code rollback = Vercel "Promote to Production" on the previous known-good deployment** (or `vercel rollback`). This reverts the *application* to the prior build instantly.
- **It does NOT roll back the database.** Vercel promote-previous only changes which code bundle serves traffic; Neon's schema and data are untouched. This is precisely why schema changes must be **expand-and-contract / additive-only** (§4): the previous code build must still run correctly against the *new* schema. If a change dropped or renamed a column, promoting the previous build would crash against a schema that no longer matches — so we never do destructive schema changes in a single step.
- **When to roll back:** any stuck-capture order, webhook backlog, customer-facing payment-error-rate spike, or data-integrity mismatch (per the rollback triggers in `00` §7). Promote previous first (stops the bleeding), then diagnose.
- **DB recovery is a separate procedure:** if data (not just code) is wrong, restore from the §3 backup / Neon PITR to a scratch branch, verify, then cut over — this is an incident-response action, not a deploy rollback.

---

## 9. Rules that never bend

- **`ENCRYPTION_KEY` must NEVER change.** It is the AES-256-GCM key that decrypts every restaurant's Stripe secret + publishable keys, PayPal credentials, ShipDay/PrintNode keys, Resend/reseller payout details, and more (`src/lib/encrypt.ts`, consumed across `payment-provider`, `printnode/*`, `email-settings`, `driver-pool`, `reseller/profile`, and others). Rotating or losing it renders all encrypted credentials undecryptable — restaurants silently stop being able to take payment. It is not a deploy variable to tweak; changing it is a catastrophic, non-reversible event. Confirm it is identical across every environment and never regenerated.
- **Per-change rollback method is part of the change.** Every approved fix must state *how it rolls back* before it ships: code-only → Vercel promote-previous; schema change → the additive expand step is safe to leave in place, and the contract step is deferred to a later deploy, so there is nothing to "undo" under a code rollback. If a change cannot be rolled back by promote-previous alone, that is a design smell — restructure it as expand/contract until it can.
- **Both Neon branches stay aligned.** Never push schema to only one branch (`push-schema-to-both.ts`).
- **Preflight before build-critical pushes, read bottom-up.** Skipping it has already cost multiple debug cycles and one multi-hour admin outage.

---

*End of 10 — Release & Rollback Plan.*
