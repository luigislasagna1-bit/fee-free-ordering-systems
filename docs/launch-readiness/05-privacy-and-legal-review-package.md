# Launch-Readiness Audit — 05: Privacy & Legal Review Package

**Date:** 2026-07-10. Companion to `01-system-inventory.md`, `02-architecture-and-data-flow.md`, `03-payment-and-stripe-connect-audit.md`, and `04-security-audit.md`.

**Audit context.** The platform went **live on 2026-07-10**; this deliverable governs continuing live operation, not a pre-launch gate. It was produced by a single **read-only** evidence-gathering pass over `C:\FeeFreeOrderingSystems`. Evidence sources: `prisma/schema.prisma` (3,923 lines, ~90 models), the legal pages under `src/app/{privacy,terms,refund,account-deletion}`, the consent components/endpoints, the 17 Vercel cron jobs (`vercel.json`), and the deletion/marketing code paths. No code was modified.

---

> ## ⚠️ DISCLAIMER — THIS IS NOT LEGAL ADVICE
>
> **This document draws NO legal conclusions.** It is an **evidence package + question list** assembled for a Canadian privacy lawyer / privacy professional to convert into compliance decisions. Every item tagged **`LAWYER REVIEW`** is a judgment a licensed professional must own before it can be relied upon.
>
> The auditor is not a lawyer. The owner (Luigi) is a **first-time software builder** who cannot self-assess these questions — a privacy pro should own the sign-off. Where the code contradicts the published Privacy Policy, that gap is flagged as a finding so counsel can decide whether to fix the code or revise the policy. Nothing here reproduces a secret value.
>
> **Jurisdictional scope of this package: Canada-first (PIPEDA / CASL).** US-state (CCPA/CPRA + the state patchwork), EU/EEA (GDPR), and UK (UK-GDPR/PECR) items are surfaced but explicitly flagged as **separate professional reviews** — do not treat the Canadian analysis as covering them.

---

## 1. Data inventory — data map (by actor)

**Legend:** `ENC` = AES-256-GCM at rest (`src/lib/encrypt.ts`); `HASH` = bcrypt; `PLAIN` = plaintext in Neon Postgres (protected only by DB access control + TLS-in-transit).

| Actor | Personal fields | Table(s) | Storage | Collection point | Shared with 3rd parties | Deleted? |
|---|---|---|---|---|---|---|
| Customer (guest) | customerName, customerEmail, customerPhone, deliveryAddress/City/Zip, deliveryAddressData (JSON), notes | `Order` (schema L1216) | PLAIN | Checkout `POST /api/orders` | Restaurant (fulfilment), Stripe/PayPal (payment token + last4), ShipDay (delivery), Resend (email), Google Maps (geocode), Twilio (missed-order voice call) | **No automated purge** |
| Customer (per-restaurant acct) | name, email, phone, address, notes, passwordHash, marketingConsent(+At), lastOrderAt, totalSpent, chainCustomerId | `Customer` (L1551) | passwordHash = HASH, rest PLAIN | Signup / checkout | Resend, Autopilot marketing | **No automated purge** |
| Customer (marketplace acct) | email, phone, name, passwordHash | `CustomerAccount` (L1640) | HASH + PLAIN | `/account` signup | Resend | **No automated purge** |
| Customer addresses | label, street, city, state, zip, country, lat, lng | `CustomerAddress` (L1687), `RestaurantCustomerAddress` (L1713) | PLAIN | Address book | Google Maps, ShipDay | Cascade on acct delete only |
| Customer (abandoned) | customerEmail, customerPhone, cartJson, sessionToken | `CartSession` (L2354) | PLAIN | Public heartbeat `/api/public/cart-session` | Resend (recovery email) | **NO purge cron** |
| Customer (reservation) | customerName, customerEmail, customerPhone, partySize, notes | `Reservation` (L2733) | PLAIN | Booking flow | Resend, Twilio | Manual admin delete only |
| Restaurant owner | email, name, passwordHash, phone, business address, emailVerifyToken | `User` (L734), `Restaurant` (L10) | HASH + PLAIN | `/signup` | Stripe, Resend, Sentry | Manual (superadmin) |
| Owner billing identity | legalName, taxId, billingEmail, full address, PEC, sdiCode | `RestaurantBillingProfile` (L2813) | PLAIN | Billing setup | Stripe (tax_id) | Cascade on restaurant delete |
| Owner payment creds | Stripe secret / webhook keys | `PaymentProvider` (L2842), `PlatformSettings` (L766) | **ENC** | Payments config | Stripe | — |
| Restaurant employee | email, name, passwordHash, role; notification email; push token; deviceHash | `User`, `NotificationRecipient` (L604), `KitchenPushToken` (L3911), `KitchenDevice` | HASH + PLAIN | Owner adds staff | Resend, APNs/FCM | Manual |
| Reseller | companyName, VAT, website, country, applicationNotes, payoutDetails | `ResellerProfile` (L2878) | payoutDetails = **ENC**, rest PLAIN | Reseller signup | Superadmin (manual payout) | Cascade on user delete |
| Support contact / prospect | name, email, phone (CSV import) | `Prospect` (L2418), `ProspectImport` | PLAIN | Owner CSV upload | Resend (invite email) | **NO purge cron** |
| Bug-report filer | authorEmail, authorName (verbatim) | `ResellerReport` (L3716) | PLAIN | Reseller report form | Superadmin | Kept verbatim by design |
| Website visitor | sessionHash, country, referrer, utm, deviceType, landingPath, IP-derived geo | `WebsiteVisit` (L3501), `WebsiteFunnelEvent`, `MenuItemView`, `SmartLinkScan`, `ConnectivityEvent` | PLAIN | Tracking beacons | Restaurant-configured GA4 / Meta Pixel | **NO purge cron** |

Server logs (IP, UA, pages) per Privacy Policy §2 are captured at the Vercel / hosting layer (not in the schema).

---

## 2. Encryption-status summary

**AES-256-GCM (`ENC`) is applied ONLY to secrets** — not to any customer PII:

- `PlatformSettings` Stripe / Resend keys
- `PaymentProvider` secret + webhook keys
- `ShipdayConfig.apiKey` (schema L3310)
- `ResellerProfile.payoutDetails` (L2904)

Passwords are bcrypt (`User.passwordHash`, `Customer.passwordHash`, `CustomerAccount.passwordHash`).

**EVERYTHING ELSE is stored PLAINTEXT in Neon Postgres** — all customer names, emails, phones, delivery addresses, order contents, reservation details, prospect lists, and billing tax IDs — protected only by database access control + TLS-in-transit (Privacy Policy §10). There is no column-level encryption or tokenization of customer PII.

**`LAWYER / SECURITY REVIEW`:** whether plaintext PII at rest is acceptable for the target jurisdictions is a professional call; document the risk-accept decision. (See finding **LR-PRIV-05**.)

---

## 3. Subprocessor reconciliation (disclosed vs actual)

**Disclosed in Privacy Policy §4:** Stripe, Resend, PrintNode, ShipDay, Google Maps, Vercel, Neon, Sentry.

**Found in code but NOT in the §4 subprocessor list:**

| Subprocessor | Purpose | Evidence | Data that leaves |
|---|---|---|---|
| **Twilio** | Voice calls for missed-order alerts | `Order.alertCallAt` (L1300); `cron/order-alert-calls` | Restaurant phone + order context → Twilio (US) |
| **PayPal** | Alternative payment rail | `Order.paypalOrderId / AuthorizationId / CaptureId` (L1265) | Payment identifiers, order amount |
| **Vercel Blob** | Image / asset storage | logo / banner / receipt / marketing uploads | Uploaded images |
| **APNs / FCM** | Push notifications | `KitchenPushToken` (L3911) | Device push tokens |
| **Meta Pixel / GA4** | Restaurant-configured analytics | `Restaurant.facebookPixelId / googleAnalyticsId` (L367–368) | Disclosed in §7 as **restaurant-controlled** but absent from the §4 list |

**`LAWYER REVIEW`:** reconcile the published subprocessor list with actual data flows; decide whether a standalone subprocessor page + DPA are needed (none exists today). (See finding **LR-PRIV-04**.)

---

## 4. Consent status

### 4.1 Marketing (email)

- **Single opt-in** checkbox at checkout (`orders/route.ts` L1798–1837). Sticky / authoritative, audit-stamped (`Customer.marketingConsent` + `marketingConsentAt`, L1590–1594). **NOT double opt-in** (no confirm-email step).
- Default checked-vs-unchecked state is **client-side** (`OrderingPageClient`) — **VERIFY the box ships unchecked** for CASL express consent (not confirmed in this pass).
- Working unsubscribe: RFC 8058 one-click POST + human-confirm GET at `/api/public/unsubscribe` with signed tokens (`src/lib/unsubscribe.ts`).

### 4.2 Cart-recovery email — the CASL gap

- Sent to abandoned-cart emails (`autopilot.ts` L614–633). Only **KNOWN customers who explicitly opted OUT** are suppressed. A brand-**NEW** guest who merely typed an email at checkout (no `Customer` row, no opt-in) **still receives a marketing nudge**.
- Every send carries a per-recipient unsubscribe link (mitigating).
- **`LAWYER REVIEW`:** is this valid CASL implied consent (inquiry / existing-business-relationship), or must it stop until express consent? (See finding **LR-PRIV-03**.)

### 4.3 Cookie / tracking

- `TrackingConsentGate.tsx` region-gates restaurant GA4 / Pixel: **prior opt-in required** for EU27 / EEA / UK / CH **and when the country is unknown** (privacy-safe default); opt-out (loads by default) for CA / US / other.
- Choice stored per-restaurant in `localStorage` (`ff-tracking-consent`). Only functional platform cookies otherwise (`fee-free-locale`, session token, `feefree_ref`) — disclosed in §7. No platform-level ad trackers.

### 4.4 SMS & mandatory phone

- **No SMS-marketing consent field exists.** Twilio is used only for outbound voice calls to the **RESTAURANT**, not for customer SMS marketing.
- **Phone is REQUIRED at customer signup** (MEMORY 2026-07-09). **`LAWYER REVIEW`** on data-minimisation / lawful basis for mandatory phone. (See finding **LR-PRIV-12**.)

---

## 5. Data-subject rights status

**NO self-service access, export, or deletion exists anywhere in the product.**

- **Access / portability:** no export tooling found. Privacy Policy §6 promises "machine-readable" portability, fulfilled **manually via `support@` only**.
- **Deletion:** `/account-deletion` is an **EMAIL-REQUEST page** (email `support@feefreeordering.com`, subject "Delete my account"); **no in-app delete button** (confirmed absent from `src/app/account/page.tsx` + `AccountActions.tsx`). Fulfilment is manual: a superadmin runs `deleteRestaurantCompletely()` (`src/lib/delete-restaurant.ts`), which **hard-deletes a whole restaurant** and its ~55 scoped tables via retry-ordered `deleteMany`. **NO per-customer deletion helper exists** — erasing one marketplace customer's data across restaurants is untooled.
- **Correction:** profile edits exist in `/account`; no documented rights workflow.
- All rights requests funnel to a **single human inbox** (`support@feefreeordering.com`) with a 30-day SLA in policy.

**`LAWYER / PRIVACY-PRO REVIEW`:** whether manual-only fulfilment meets PIPEDA (and CCPA/GDPR if enabled) response obligations at scale. (See finding **LR-PRIV-02**.)

---

## 6. Retention — policy promises vs code reality

**Privacy Policy §5 + account-deletion page promise:** orders kept 7 years; **CLOSED ACCOUNTS deleted / anonymized within 90 DAYS**; server logs 30 days; backups 30-day rolling.

**CODE REALITY** — the only automated deletions across the 17 crons (`vercel.json`) are:

- `cleanup-sandboxes` (unclaimed import-to-try trial menus past TTL)
- `import-menu-images` (transient `PendingMenuImage` rows)

There is **NO cron** that: (a) anonymizes closed accounts at 90 days, (b) purges `CartSession` (holds `customerEmail` / `customerPhone` indefinitely), (c) purges `WebsiteVisit` / `WebsiteFunnelEvent` / `MenuItemView` / `SmartLinkScan` / `ConnectivityEvent`, (d) purges `Prospect` CSV-import PII, or (e) purges `PrintLog`. **No anonymization routine exists in code at all.**

The 7-year "then anonymized" promise and the 90-day closed-account promise are therefore **NOT backed by any implemented mechanism** — they depend entirely on manual action that has no tooling.

**`LAWYER + ENGINEERING REVIEW`** — HIGH launch risk. (See findings **LR-PRIV-01**, **LR-PRIV-07**.)

---

## 7. Legal-documents inventory

**Present and SUBSTANTIVE (filled, not placeholder)** — a grep for `lorem` / `TODO` / `TBD` / `[insert` returned nothing:

| Page | Size | Last updated | Notes |
|---|---|---|---|
| `/privacy` | 12.5 KB | May 23 2026 | Self-labelled "v1 template … should be reviewed by a Canadian lawyer before relying on it" |
| `/terms` | 13.8 KB | Jun 6 2026 | §1 states entity is "operated from Ontario, Canada" |
| `/refund` | 7.6 KB | — | — |
| `/account-deletion` | — | Jun 18 2026 | Email-request flow (see §5) |

- All four self-describe as a **v1 template pending Canadian-lawyer review** (source comments).
- All are **ENGLISH-ONLY** (locale cookie is read but the body is hard-coded EN) — contradicts the 38-language i18n standing rule for user-facing text. Whether legal docs must be localized per the restaurant's market is a **`LAWYER`** call. (See finding **LR-PRIV-10**.)

**MISSING:**

- No standalone **Data Processing Agreement (DPA)** for restaurant / reseller B2B customers (arguably controllers of their diners' data).
- No dedicated **subprocessor page** (only the inline §4 list, which is incomplete — see §3).
- No standalone **cookie policy** (folded into §7).
- Entity legal name (`PlatformSettings.companyLegalName` is a configurable field, may be blank) and governing law should be confirmed by counsel.

---

## 8. Cross-border processing

- Business + first restaurant are in **Ontario, Canada** (Terms §1).
- Data stores: **Neon** (managed Postgres) + **Vercel** (hosting / edge). `vercel.json` and `next.config` declare **NO pinned region** — the default Vercel / Neon region is almost certainly **US (us-east / iad1)**; confirm the actual Neon project region out-of-band.
- Core subprocessors are **US-based**: Stripe, Resend, Twilio, PayPal, Sentry, Meta / Google.
- Privacy Policy §9 acknowledges US/EU processing and asserts reliance on "standard contractual clauses or equivalent safeguards" — but **NO DPA/SCC artifact exists in-repo** to evidence that.
- **EU implications:** if any restaurant or diner is in the EU/EEA/UK, GDPR / UK-GDPR controller-vs-processor roles, an Art. 30 record, a DPA with restaurants, and a transfer-impact assessment for the US flows are all professional-review items. The platform already treats EU/EEA/UK/CH specially for cookie consent (good signal) but has no matching DPA / transfer framework.

**`LAWYER REVIEW` per region.** (See finding **LR-PRIV-06**.)

---

## 9. Jurisdiction allowlist — recommendation (DRAFT for lawyer sign-off)

Recommend a **DEFAULT-DENY** posture: explicitly enumerate the countries the platform accepts restaurant signups (and ideally diner orders) from, and block / queue-for-review everything else, so legal exposure only grows deliberately.

Proposed tiers (**DRAFT — each needs its own professional review before enabling**):

- **TIER 1 — LAUNCH (Canada-first): `CA` only.** Where the business, entity, first restaurant, and the drafted PIPEDA-oriented policies already sit. Lowest incremental legal work. **Start here.**
- **TIER 2 — requires a SEPARATE US review before enabling: `US`.** Adds state privacy laws (CCPA/CPRA + the growing state patchwork), state sales-tax / marketplace-facilitator questions, and TCPA for any phone/SMS. **Do NOT enable on the Canadian analysis.**
- **TIER 3 — requires a SEPARATE EU/EEA review: EU27 + EEA.** Needs GDPR controller/processor mapping, a DPA with restaurants, Art. 30 records, SCCs/TIA for US subprocessors, and the VAT handling that partially exists (`RestaurantBillingProfile` VIES logic).
- **TIER 4 — requires a SEPARATE UK review: `UK`.** UK-GDPR + ICO registration + UK cookie (PECR) specifics.
- **DENY by default:** all other countries until a jurisdiction is explicitly cleared.

**Implementation note (evidence):** there is currently **NO signup-country allowlist gate** in code — `Restaurant.country` defaults to `'US'` (schema L22) and signups are not geo-restricted. A default-deny allowlist would be new work. The cookie-consent gate's country set (`TrackingConsentGate` `CONSENT_REQUIRED_COUNTRIES`) is a good pattern to mirror. Confirm the launch allowlist with counsel before wiring it. (See finding **LR-PRIV-08**.)

---

## 10. QUESTIONS FOR PROFESSIONAL REVIEW

Ordered **Canadian PIPEDA / CASL first** (the launch jurisdiction), then cross-jurisdiction items flagged as **separate reviews**.

### 10.1 Canada — PIPEDA / CASL (launch jurisdiction)

1. **`LAWYER REVIEW`** — Is plaintext customer PII at rest (names / emails / phones / addresses / order history in Neon) acceptable for a CA launch, or is column-level encryption / tokenization required? *(→ LR-PRIV-05)*
2. **`LAWYER REVIEW`** — Does the manual-only, email-based DSAR process (access / export / deletion via `support@`, 30-day SLA) satisfy PIPEDA? *(→ LR-PRIV-02)*
3. **`LAWYER REVIEW`** — The Privacy Policy promises 90-day closed-account anonymization and 7-year-then-anonymize for orders, but NO code performs this. Must these be automated before we make the promise, or is a documented manual process enough? *(→ LR-PRIV-01)*
4. **`LAWYER REVIEW`** — Cart-recovery emails go to brand-new guests who never opted in (only known opt-outs are suppressed). Is this valid CASL implied consent (inquiry / EBR), or must it stop until express consent? *(→ LR-PRIV-03)*
5. **`LAWYER REVIEW`** — Is single opt-in (checkbox, no confirmation email) sufficient for CASL express consent? Confirm the checkbox must be unchecked-by-default. *(→ LR-PRIV-09)*
6. **`LAWYER REVIEW`** — Phone is REQUIRED at customer signup — is that defensible under data-minimisation, and what is the stated lawful basis / purpose? *(→ LR-PRIV-12)*
7. **`LAWYER REVIEW`** — The published subprocessor list omits Twilio, PayPal, Vercel Blob, APNs/FCM, and GA4/Meta. Do we need a complete standalone subprocessor page + DPA? *(→ LR-PRIV-04)*
8. **`LAWYER REVIEW`** — Do we need a DPA offered to restaurant / reseller B2B customers (they are arguably controllers of their diners' data; we are the processor)? Who is controller vs processor for diner data? *(→ LR-PRIV-06)*
9. **`LAWYER REVIEW`** — Must the legal pages be localized into the 38 supported languages, or does English-only suffice with per-market notice? *(→ LR-PRIV-10)*
10. **`LAWYER REVIEW`** — Confirm the operating legal entity name, registered address, and governing law (`PlatformSettings.companyLegalName` may be blank). *(→ §7)*
11. **`LAWYER REVIEW`** — Age gating: policy says 18+ / no under-16 collection, but nothing enforces age at signup — is a checkbox / attestation needed? *(→ LR-PRIV-11)*
12. **`LAWYER REVIEW`** — Restaurant-configured GA4 / Meta Pixel: confirm the "restaurant is the controller" framing and whether the platform bears joint-controller duties. *(→ §3)*
13. **`LAWYER REVIEW`** — Sign off the jurisdiction allowlist tiers (§9) before any non-Canada signups are enabled. *(→ LR-PRIV-08)*

### 10.2 United States — CCPA / CPRA + state patchwork + TCPA (SEPARATE REVIEW — do not enable on the Canadian analysis)

14. **`LAWYER REVIEW`** — Confirm Neon / Vercel regions; do the US-based subprocessor flows require any additional disclosures for US-resident diners?
15. **`LAWYER REVIEW`** — Do the manual DSAR process and single-opt-in marketing model meet CCPA/CPRA "right to delete / know / opt-out of sale-or-share"?
16. **`LAWYER REVIEW`** — Does the required-phone + voice-call design implicate TCPA before any US phone/SMS contact is enabled?

### 10.3 EU / EEA — GDPR, and UK — UK-GDPR / PECR (SEPARATE REVIEWS)

17. **`LAWYER REVIEW`** — Cross-border: do the US subprocessor flows need SCCs + a transfer-impact assessment for any EU/UK data? Confirm Neon/Vercel regions. *(→ LR-PRIV-06, §8)*
18. **`LAWYER REVIEW`** — Controller vs processor mapping, Art. 30 record, and a DPA with restaurants before any EU/EEA signup is enabled. *(→ LR-PRIV-06)*
19. **`LAWYER REVIEW`** — UK-specific: ICO registration and PECR cookie specifics before any UK signup is enabled. *(→ §9 Tier 4)*

---

## 11. Findings

**12 privacy findings from the evidence pass** — **3 High, 5 Medium, 4 Low**. No Critical is asserted (severity of the retention/rights gaps is ultimately a legal determination — see disclaimer). Ordered by severity; IDs `LR-PRIV-01…12`. Items a lawyer must decide are marked **`LAWYER REVIEW`** in the professional-review field.

---

### LR-PRIV-01 — Published retention promises are not implemented in code
- **Severity:** High
- **Component:** Data retention / lifecycle
- **Affected paths:** `vercel.json`; `src/app/api/cron/*` (only `cleanup-sandboxes` + `import-menu-images` delete); `src/app/privacy/page.tsx` §5; `src/app/account-deletion/page.tsx`
- **Description:** The Privacy Policy and account-deletion page promise 90-day anonymization of closed accounts and 7-year-then-anonymize for orders, but NO cron or code path implements anonymization or account-close purging. The only automated deletions are unclaimed trial sandboxes and transient menu-import images.
- **Failure / scenario:** A regulator or a diner exercises a deletion / retention right and asks the platform to demonstrate the promised 90-day anonymization. There is no mechanism or log showing it ever runs; the promise is unbacked.
- **Impact:** Published retention commitments are not honoured by the system, creating a misrepresentation and PIPEDA/GDPR retention-limitation exposure at launch.
- **Evidence:** grep of `src/app/api/cron` for `delete`/`deleteMany` returns only `pendingMenuImage`; `cleanup-sandboxes` only touches `SandboxRestaurant`.
- **Recommended remediation:** Either build the anonymization / purge crons (closed-account sweep, `CartSession` / `WebsiteVisit` / `Prospect` TTL purges) OR revise the policy to match reality and document a manual process with evidence.
- **Professional review required:** **`LAWYER REVIEW`** + engineering — Canadian privacy lawyer to decide policy-vs-code reconciliation.

### LR-PRIV-02 — No self-service data-subject rights; deletion is manual and per-customer erasure is untooled
- **Severity:** High
- **Component:** Data-subject rights (deletion / export)
- **Affected paths:** `src/app/account-deletion/page.tsx`; `src/app/account/page.tsx`; `src/app/account/AccountActions.tsx`; `src/lib/delete-restaurant.ts`
- **Description:** No self-service access, export, or deletion. Deletion is an email request fulfilled manually; `deleteRestaurantCompletely()` hard-deletes an entire restaurant but there is NO per-customer deletion tool, so erasing one diner's data (especially across restaurants via `CustomerAccount`) is untooled.
- **Failure / scenario:** A marketplace diner who ordered from 5 restaurants requests erasure. Staff must manually locate and delete rows across many `Customer` records with no helper — error-prone and slow.
- **Impact:** Manual-only rights fulfilment may miss DSAR deadlines and risks incomplete erasure at scale (target is 10,000+ users).
- **Evidence:** `/account-deletion` is an email-request page; no in-app delete button in `AccountActions.tsx`; `delete-restaurant.ts` operates at restaurant granularity only.
- **Recommended remediation:** Privacy-pro review of the DSAR workflow; consider a per-customer delete/export helper mirroring `delete-restaurant.ts`.
- **Professional review required:** **`LAWYER REVIEW`** — confirm PIPEDA (and CCPA/GDPR if enabled) response adequacy.

### LR-PRIV-03 — Cart-recovery emails reach never-opted-in guests (CASL)
- **Severity:** High
- **Component:** Marketing consent / CASL
- **Affected paths:** `src/lib/autopilot.ts` L614–633
- **Description:** Cart-abandonment recovery emails are sent to any abandoned-cart email; only KNOWN customers who explicitly opted OUT are suppressed. A brand-new guest who merely typed an email at checkout (no `Customer` row, no opt-in) receives a marketing email.
- **Failure / scenario:** A first-time visitor types their email, abandons the cart, never consents; the autopilot cron emails them a discount offer.
- **Impact:** Potential CASL commercial-electronic-message violation if implied consent (inquiry / EBR) does not apply; per-message penalties.
- **Evidence:** Suppression only triggers when `knownCustomer && marketingConsent===false`; new guests fall through and are emailed. Every message carries an unsubscribe link (mitigating).
- **Recommended remediation:** Confirm the CASL implied-consent basis; if advised, gate the send on affirmative consent.
- **Professional review required:** **`LAWYER REVIEW`** — CASL specialist.

### LR-PRIV-04 — Subprocessor disclosure is incomplete
- **Severity:** Medium
- **Component:** Subprocessor disclosure
- **Affected paths:** `src/app/privacy/page.tsx` §4; schema `Order.paypal*` L1265; `cron/order-alert-calls` (Twilio); `KitchenPushToken` L3911
- **Description:** The published subprocessor list omits Twilio (voice calls with restaurant phone + order context), PayPal, Vercel Blob (uploaded images), and APNs/FCM. GA4/Meta appear only in §7, not the §4 list.
- **Failure / scenario:** A data-map audit compares disclosed vs actual recipients and finds undisclosed processors receiving personal data.
- **Impact:** Incomplete transparency disclosure; PIPEDA/GDPR accountability gap.
- **Evidence:** See §3 reconciliation table above.
- **Recommended remediation:** Update the policy and consider a standalone subprocessor page + DPA.
- **Professional review required:** **`LAWYER REVIEW`**.

### LR-PRIV-05 — All customer PII is plaintext at rest
- **Severity:** Medium
- **Component:** PII at rest (encryption)
- **Affected paths:** `prisma/schema.prisma` (`Customer` L1551, `Order` L1216, `Reservation` L2733, `Prospect` L2418, `CartSession` L2354); `src/lib/encrypt.ts`
- **Description:** AES-256-GCM protects only secret credentials / payout details; ALL customer PII (name, email, phone, delivery address, order contents, prospect lists, billing tax IDs) is stored plaintext, protected only by DB access control + TLS.
- **Failure / scenario:** A read-only DB credential leak or backup exposure discloses full customer contact + order history in cleartext.
- **Impact:** Elevated breach severity; whether acceptable is a jurisdiction-dependent risk decision.
- **Evidence:** `encrypt.ts` is invoked only on the secret fields enumerated in §2; no column-level encryption on PII models.
- **Recommended remediation:** Security / lawyer decision to risk-accept or mandate column-level encryption / tokenization for the highest-sensitivity fields.
- **Professional review required:** **`LAWYER REVIEW`** (+ security) — jurisdiction-dependent risk-accept decision.

### LR-PRIV-06 — No DPA / SCC artifact for cross-border and B2B controller relationships
- **Severity:** Medium
- **Component:** Cross-border transfers / DPA
- **Affected paths:** `vercel.json` (no region pin); `next.config`; `src/app/privacy/page.tsx` §9
- **Description:** US-based processing is likely (no region pinned) and §9 cites SCCs "or equivalent", but no DPA/SCC artifact exists in-repo and no DPA is offered to restaurant / reseller B2B customers who are arguably controllers of diner data.
- **Failure / scenario:** An EU restaurant onboards; a data authority asks for the DPA and transfer safeguards. None exist.
- **Impact:** Blocks compliant EU/UK operation; controller / processor roles are undefined.
- **Evidence:** No region pin in `vercel.json` / `next.config`; no DPA/SCC document in the repo.
- **Recommended remediation:** Produce a DPA + transfer-impact assessment before enabling EU/UK signups; confirm Neon / Vercel regions.
- **Professional review required:** **`LAWYER REVIEW`** — required if EU/UK is enabled (separate review).

### LR-PRIV-07 — Tracking + prospect PII accumulates with no TTL
- **Severity:** Medium
- **Component:** Retention of tracking + prospect PII
- **Affected paths:** schema `WebsiteVisit` L3501, `CartSession` L2354, `Prospect` L2418, `WebsiteFunnelEvent`, `MenuItemView`, `SmartLinkScan`, `ConnectivityEvent`
- **Description:** Analytics / behavioural rows, abandoned-cart emails/phones, and CSV-imported prospect contacts accumulate indefinitely — no TTL / purge cron. §5 implies short log retention.
- **Failure / scenario:** Years of visitor session data and never-converted prospect contacts sit in the DB with no expiry, contradicting storage-limitation expectations.
- **Impact:** Storage-limitation exposure; larger breach blast radius.
- **Evidence:** No purge cron for any of these tables (see §6).
- **Recommended remediation:** Define TTLs and implement purge crons.
- **Professional review required:** **`LAWYER REVIEW`** (+ engineering) to set the TTLs.

### LR-PRIV-08 — No jurisdiction allowlist (default-deny) on signup
- **Severity:** Medium
- **Component:** Jurisdiction gating (default-deny)
- **Affected paths:** `prisma/schema.prisma` `Restaurant.country` L22 (defaults `'US'`); no signup geo-gate found
- **Description:** There is no allowlist restricting where restaurants (or diners) can sign up; the legal docs are drafted for Canada (PIPEDA), yet the platform is open to any country, including EU/US where separate frameworks apply.
- **Failure / scenario:** A German or Californian restaurant signs up today and is served under Canada-oriented terms with no GDPR/CCPA machinery.
- **Impact:** Uncontrolled expansion of legal obligations beyond what the docs / processes cover.
- **Evidence:** `Restaurant.country` defaults `'US'`; no geo-gate in the signup path.
- **Recommended remediation:** Implement the default-deny allowlist (Canada-first, §9) after lawyer sign-off; mirror the `TrackingConsentGate` country-set pattern.
- **Professional review required:** **`LAWYER REVIEW`** — confirm the tier list before wiring.

### LR-PRIV-09 — Single opt-in marketing consent; default state unverified
- **Severity:** Low
- **Component:** Marketing consent model
- **Affected paths:** `src/app/api/orders/route.ts` L1798–1837; `OrderingPageClient` checkout box
- **Description:** Marketing consent is single opt-in (checkbox, no confirmation email). An audit timestamp exists (good). The default checked / unchecked state is client-side and was not verified in this pass.
- **Failure / scenario:** If the box ships pre-checked, CASL express consent may be invalid.
- **Impact:** Consent-validity risk.
- **Evidence:** Consent write + `marketingConsentAt` stamp confirmed server-side; default state lives in `OrderingPageClient` (unverified).
- **Recommended remediation:** Verify the checkbox default is unchecked; confirm single opt-in suffices for CASL.
- **Professional review required:** **`LAWYER REVIEW`** — confirm single opt-in adequacy.

### LR-PRIV-10 — Legal pages are English-only
- **Severity:** Low
- **Component:** Legal docs localization
- **Affected paths:** `src/app/{privacy,terms,refund,account-deletion}/page.tsx`
- **Description:** All legal pages are English-only despite the 38-language i18n standing rule for user-facing text; each is self-labelled a "v1 template" pending Canadian-lawyer review.
- **Failure / scenario:** A non-English diner in a non-English market accepts terms they cannot read.
- **Impact:** Notice / enforceability questions in some markets.
- **Evidence:** Bodies are hard-coded EN; the locale cookie is read but not applied to the legal body.
- **Recommended remediation:** Decide required localization; then translate per the i18n rule.
- **Professional review required:** **`LAWYER REVIEW`** — localization requirement.

### LR-PRIV-11 — No age gate despite an 18+/under-16 policy claim
- **Severity:** Low
- **Component:** Age / children
- **Affected paths:** `src/app/privacy/page.tsx` §8; `src/app/terms/page.tsx` §3
- **Description:** Policy states 18+ / no under-16 collection, but no age gate / attestation is enforced at signup or checkout.
- **Failure / scenario:** A minor orders / creates an account; the policy claim is unenforced.
- **Impact:** Minor-data collection risk.
- **Evidence:** No age field or attestation in the signup / checkout code paths.
- **Recommended remediation:** Decide whether an age attestation is needed; implement if advised.
- **Professional review required:** **`LAWYER REVIEW`** — attestation requirement.

### LR-PRIV-12 — Phone is mandatory at customer signup
- **Severity:** Low
- **Component:** Mandatory phone collection
- **Affected paths:** customer signup (phone REQUIRED per MEMORY 2026-07-09); schema `Customer.phone` L1556
- **Description:** Phone number is required at customer signup — a data-minimisation and lawful-basis question, especially where phone enables TCPA/CASL phone contact.
- **Failure / scenario:** A privacy review questions why phone is mandatory rather than optional.
- **Impact:** Data-minimisation challenge.
- **Evidence:** Signup enforces a non-empty phone (MEMORY 2026-07-09); `Customer.phone` at schema L1556.
- **Recommended remediation:** Review necessity + stated purpose; consider making it optional if not essential.
- **Professional review required:** **`LAWYER REVIEW`** — necessity + lawful basis.

---

## 12. Professional-review roadmap

| Priority | Findings | Rationale |
|---|---|---|
| **P1 — Canada launch blockers (lawyer decision now)** | LR-PRIV-01, LR-PRIV-02, LR-PRIV-03 | Retention promise-vs-code gap, manual-only DSAR, and never-opted-in cart-recovery are the three items most likely to be raised in a PIPEDA/CASL review of a live platform. |
| **P2 — Canada transparency / risk-accept** | LR-PRIV-04, LR-PRIV-05, LR-PRIV-07, LR-PRIV-09, LR-PRIV-12 | Subprocessor list, plaintext-PII risk decision, tracking/prospect TTLs, consent-default verification, mandatory phone — each needs a documented professional decision. |
| **P3 — Scope-control before expansion** | LR-PRIV-08, LR-PRIV-06 | Wire the default-deny allowlist and produce a DPA/SCC framework **before** any non-Canada signup is enabled. |
| **P4 — Consistency / documentation** | LR-PRIV-10, LR-PRIV-11 | Legal-doc localization decision and age attestation. |
| **Separate reviews (do not fold into Canada)** | US (Q14–16), EU/EEA + UK (Q17–19) | Each jurisdiction requires its own specialist sign-off; the Canadian analysis does not cover them. |

*This is an evidence package, not a compliance determination. Every remediation is subject to the AGENTS.md standing rules — no regressions (trace hot paths, run `npm run preflight`), i18n parity for any new user-facing string, and schema changes pushed to both Neon branches. No item here should be treated as resolved until a licensed professional has signed off on the corresponding `LAWYER REVIEW`.*
