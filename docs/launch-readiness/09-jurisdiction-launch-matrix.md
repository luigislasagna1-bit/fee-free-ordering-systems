# Launch-Readiness Audit — 09: Jurisdiction Launch Matrix

**Date:** 2026-07-10. Companion to `00-executive-summary.md` (§7 launch recommendation) and the privacy evidence gathered in phase 8. Source of the tier list: the privacy/legal evidence sub-agent's drafted jurisdiction allowlist (workflow `wf_62d38caf`, finding **LR-PRIV-08**).

> **This is not legal advice.** It is an engineering + operations gate that says *where the platform is technically and commercially cleared to operate*. Each tier below still requires sign-off from a qualified lawyer / privacy pro / tax pro for that jurisdiction. Nothing here certifies compliance with any framework.

---

## 1. Governing principle — DEFAULT-DENY

**A country is UNAVAILABLE until it has passed four independent reviews: technical, payments, tax, and legal/privacy.** Legal exposure grows *only when we deliberately expand it*, never by accident of a signup form being reachable from an IP in another country.

- The allowlist is the source of truth. If a country is not explicitly on the ALLOW list, restaurant signup (and ideally diner ordering) is **blocked or queued for manual review**.
- Adding a country is a deliberate act gated on that country's four reviews — not a default.
- "We haven't looked at country X yet" always resolves to **DENY**, never "probably fine."

---

## 2. Current enforcement state — read this first

**There is NO jurisdiction gate in the code today. The platform is worldwide-by-default.** This matters because the matrix below describes the *target* posture; the default-deny gate itself is an unbuilt work item (tracked as **LR-PRIV-08**, Medium).

Evidence from the codebase (read-only audit):

- **`Restaurant.country` defaults to `"US"`** (`prisma/schema.prisma:22`, `String @default("US")`). A restaurant that signs up without setting a country lands as US — the one jurisdiction we are explicitly *not* clearing at launch.
- **No signup geo-gate exists.** `src/app/api/restaurants/profile/route.ts` and the signup routes accept and store `country` but never restrict on it. There is no IP-country check, no allowlist test, no "queue for review" branch anywhere in the signup or ordering path.
- **Currency is per-restaurant, not a gate.** Money is rendered via `formatCurrency(amount, restaurant.currency)` and Stripe charges use the restaurant's configured currency — but currency is a display/settlement setting, not an availability control. A EUR- or GBP-configured restaurant can onboard today with no legal review.
- **The only country-aware code that already exists** is the cookie/tracking consent gate: `TrackingConsentGate` (`src/components/order/TrackingConsentGate.tsx:22-29`) holds `CONSENT_REQUIRED_COUNTRIES` — EU-27 + EEA (`IS, LI, NO`) + UK (`GB, UK`) + Switzerland (`CH`) — and forces prior opt-in for GA4/Meta Pixel there (and when country is unknown). **This is the pattern to mirror** for the signup allowlist: a small, auditable country `Set` consulted at a single choke point.

**Consequence:** until the gate ships, a German or Californian restaurant *can* sign up right now and would be served under Canada-oriented terms with no GDPR/CCPA machinery. The single-owner pilot (Luigi's Lasagna, Ontario) is unaffected, but this is the first thing to close before any second restaurant is onboarded from outside Canada.

---

## 3. The matrix

| Jurisdiction | Status | Gating reason | Reviews required before ENABLE |
|---|---|---|---|
| **Canada (CA)** | ✅ **ALLOW — pilot jurisdiction** | Business entity, first restaurant, and the drafted policies are all here (Ontario). Lowest incremental legal work. | PIPEDA + CASL review still **needed** (not yet done) — but the business and restaurant physically operate here, so it is the launch jurisdiction. See §4. |
| **United States (US)** | ⛔ **DENY** | State-privacy patchwork + sales-tax nexus + TCPA are unreviewed. `Restaurant.country` defaulting to `"US"` makes this the *most likely* accidental-onboarding country — treat with care. | US-state privacy (CCPA/CPRA + growing state laws) · state sales-tax / marketplace-facilitator nexus analysis · TCPA for phone/SMS · US-specific terms + privacy addendum. |
| **EU / EEA (EU-27 + IS, LI, NO)** | ⛔ **DENY** | GDPR controller/processor structure, DPA, and transfer framework do not exist in-repo. EU-VAT is *partially* built but not wired into every billing path. | GDPR controller-vs-processor mapping · DPA offered to restaurants (they are controllers of diner data) · Art. 30 records · SCCs + transfer-impact assessment for US subprocessors · finish EU-VAT (VIES) coverage incl. the `change-plan` gap (LR-PAY-18) · localized legal notices. |
| **United Kingdom (UK / GB)** | ⛔ **DENY** | UK-GDPR + ICO registration + PECR cookie rules are unreviewed (separate from EU post-Brexit). | UK-GDPR mapping · ICO registration/fee · PECR cookie specifics · UK-specific DPA + terms. |
| **All other countries** | ⛔ **DENY (default)** | Not reviewed. The default-deny principle applies. | Full technical + payments + tax + legal/privacy review for that specific jurisdiction before it is added. |

---

## 4. What each tier specifically needs before it can move to ALLOW

### Tier 1 — Canada (currently ALLOW as the pilot)
Already the operating jurisdiction, so it launches — but these remain open and should be closed while the pilot runs:
- **PIPEDA:** confirm the manual, email-based data-subject-rights process (access/export/deletion via `support@`, 30-day SLA) is adequate; decide whether plaintext customer PII at rest is acceptable or needs column-level encryption (LR-PRIV-05); reconcile the published retention promises with reality (LR-PRIV-01 — the 90-day/7-year commitments have **no** cron implementing them).
- **CASL:** confirm the cart-recovery email to never-opted-in guests is defensible implied consent, or gate it on express consent (LR-PRIV-03 / H-11); confirm the marketing checkbox ships unchecked-by-default (LR-PRIV-09); mandatory-phone-at-signup lawful basis (LR-PRIV-12).
- **Legal entity:** confirm operating entity name + registered address + governing law (`PlatformSettings.companyLegalName` may be blank).

### Tier 2 — United States (DENY until reviewed)
- **Privacy:** CCPA/CPRA plus the growing state patchwork (VA, CO, CT, …) — opt-out signals, "Do Not Sell/Share," and a US-facing rights workflow.
- **Tax:** state-by-state sales-tax **nexus** analysis and **marketplace-facilitator** obligations (does the platform's role make it a facilitator? — coordinate with the payments MoR structure).
- **Telecom:** TCPA consent for any phone or SMS contact.
- **Do NOT enable on Canadian analysis** — US frameworks are materially different and none of the above is built.

### Tier 3 — EU / EEA (DENY until reviewed)
- **GDPR:** controller/processor role mapping (restaurants are controllers of diner data; the platform is a processor for that data and a controller for its own), a **DPA** offered to restaurant/reseller B2B customers, Art. 30 records.
- **Transfers:** SCCs + a transfer-impact assessment for the US-based subprocessors (Neon/Vercel region is unpinned and likely US; Stripe, Resend, Twilio, PayPal, Sentry, Meta/Google are US) — LR-PRIV-06.
- **Tax:** finish the EU-VAT (Option A / VIES) coverage that is *partially* built, including closing the `change-plan` bypass (LR-PAY-18).
- **Cookies:** the `TrackingConsentGate` prior-opt-in path already exists for the EU/EEA — a good signal, but not a substitute for the DPA/transfer framework.

### Tier 4 — United Kingdom (DENY until reviewed)
- **UK-GDPR** mapping (separate instrument from EU GDPR post-Brexit).
- **ICO** registration + annual fee.
- **PECR** cookie specifics (UK cookie/ePrivacy rules).
- UK-specific DPA + terms.

### Default — all other countries
- **DENY** until a full four-review pass (technical + payments + tax + legal/privacy) is completed for that jurisdiction. No exceptions by convenience.

---

## 5. How enforcement works / should work

**Today:** it does not. There is no country allowlist anywhere in the signup or ordering path (§2). "Worldwide by default" is the live state.

**Target design (a discrete, small work item — LR-PRIV-08):**

1. **Single source of truth.** Add an `ALLOWED_SIGNUP_COUNTRIES` set (start = `{"CA"}`) in one module, mirroring the shape of `TrackingConsentGate`'s `CONSENT_REQUIRED_COUNTRIES`. Adding a country is a one-line, reviewable diff — which forces the four-review gate to be a deliberate act.
2. **Choke point at signup.** In the restaurant signup / profile-country write path, reject or **queue-for-manual-review** any country not in the set. Derive the country server-side where possible (don't trust a client field alone); at minimum validate the submitted `country` against the allowlist before creating the restaurant.
3. **Fix the unsafe default.** `Restaurant.country` defaulting to `"US"` (a DENY jurisdiction) is the wrong default under a Canada-only launch. Either require country explicitly at signup or change the default to the pilot jurisdiction — a schema change, so route it through `push-schema-to-both.ts` per the expand/contract discipline in `10-release-and-rollback-plan.md`.
4. **Diner-side (optional, second phase).** Ideally also gate diner ordering by the restaurant's cleared jurisdiction, so a DENY-country restaurant that slipped in cannot take orders. Lower priority than the signup gate.
5. **Auditability.** Log every allowlist rejection (country + reason) so expansion demand is visible and legitimate blocked signups can be followed up once a jurisdiction is cleared.

**Scale note:** the allowlist check is a set-membership test on a value already in the signup payload — zero added DB round-trips on the hot path. It belongs at the signup choke point, not in per-request middleware.

---

## 6. Bottom line

- **Launch scope: Canada only, single owner-operated restaurant.** This is safe to continue.
- **The default-deny gate is not yet built** — that is itself a launch-readiness work item (LR-PRIV-08), and the `Restaurant.country="US"` default actively works against a Canada-only posture.
- **No second restaurant from outside Canada** should be onboarded until (a) the allowlist gate ships and (b) that jurisdiction has passed its four reviews.
- Confirm the tier list with counsel before enabling any non-Canada signups (privacy sub-agent question #14).
