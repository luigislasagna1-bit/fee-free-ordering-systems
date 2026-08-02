# Apple submission — Branded Customer Apps (per-tenant runbook)

Per-restaurant runbook. **Apple guideline 4.2.6 (verified in force June 2026)
mandates that each white-label app be submitted from the CLIENT's own Apple
Developer account — no fleet account option exists** for template apps. This
is the onboarding long pole (D-U-N-S + org enrollment can take weeks) — the
wizard starts it at stage 4 and the superadmin Apple platform card mirrors
this checklist.

## 0. Owner prerequisites (wizard-guided; each blocks everything after it)

- [ ] **D-U-N-S number** for the restaurant's legal entity (free via Apple's
      lookup/request tool; up to ~2 weeks if they don't have one).
      ⚠️ Pilot: Luigi's restaurant may ALREADY have D-U-N-S + enrollment from
      the GloriaFood branded-app flow (his screenshots show their pipeline
      step 1/8 in progress) — check and reuse before enrolling fresh.
- [ ] **Apple Developer Program, ORGANIZATION** enrollment ($99/yr): legal
      entity name, business-domain email (not gmail), live website. The
      person enrolling must have legal authority (Account Holder).
- [ ] **Agreements accepted** in App Store Connect (Account Holder only —
      we cannot do this; unaccepted paid-apps agreement silently blocks
      submission).
- [ ] Our publishing Apple ID invited with **Admin** role + "Access to
      Certificates, Identifiers & Profiles".
- [ ] **ASC API key** generated (Users and Access → Integrations → App Store
      Connect API → Team key, Admin role). Owner sends us: the `.p8` file,
      Key ID, Issuer ID. → superadmin credential `apple_asc_key` (p8
      encrypted; keyId/issuerId/teamId companions). The .p8 downloads ONCE —
      if lost, revoke + regenerate.

## 1. Our setup (once per tenant, ~15 min)

- [ ] Superadmin "Verify access" (`accessVerifiedAt`).
- [ ] Record the **Team ID** on the credential row — the AASA route serves
      `<teamId>.<bundleId>` from it; deep links dead until set.
- [ ] **APNs auth key intake**: in THEIR portal (Keys → +, APNs enabled)
      create an APNs key, upload the .p8 + Key ID + Team ID into OUR
      Firebase project's iOS app registration for this tenant. ~5 min,
      manual, once. Without it push registration succeeds but delivery
      silently fails.
- [ ] Register the **bundle ID** (from the platform card, derived
      `com.<domainroot>.orderapp`) — via ASC API or portal; explicit App ID;
      capabilities: Push Notifications, Associated Domains.
- [ ] Create the **first app record** in ASC (name = wizard appName, SKU =
      slug, bundle id) + **age rating questionnaire** — both are things the
      ASC API cannot do; do them in the UI with the owner if their role
      blocks us.

## 2. Build + TestFlight (Codemagic `customer-ios` workflow — macOS only)

Trigger with env vars (see docs/CUSTOMER_APP_PIPELINE.md): `FF_MANIFEST_JSON`
(base64 of gen-build-manifest output), `TENANT_ASC_KEY_P8/KEY_ID/ISSUER_ID`
(decrypted from the credential row — paste into Codemagic env for the run,
never commit), `FF_GSERVICE_PLIST_B64` (tenant's GoogleService-Info.plist).
The workflow signs on the TENANT's team (the one reused distribution PEM
mints a cert per team), builds, and publishes to THEIR TestFlight.

- [ ] Install via TestFlight on a real device. Verify: branded splash/icon,
      menu loads from their host, card payment + 3DS, push permission prompt
      after first order + a real order-status push, deep link opens the app,
      offline screen, no PayPal button visible.

## 3. App Store submission (the 4.2 litmus test)

- Listing copy from the approved wizard config; screenshots of THEIR real
  menu (6.7" + 13" iPad if iPad enabled — we ship iPhone-only v1).
- Privacy nutrition labels: same data set as the Play data-safety form
  (name/email/phone/address/orders, linked to identity, no tracking).
  `PrivacyInfo.xcprivacy` is already in the shell template.
- Review notes: include a WORKING demo account for their restaurant (test
  customer with a saved address) and one sentence: "This is the official
  ordering app for <restaurant>, operated by the restaurant under its own
  developer account; ordering, push order tracking, and app-links are
  native-integrated."
- Submit. **Guideline 4.2 (minimum functionality) is the risk**: our binary
  answer is order-status push + verified deep links + native chrome +
  offline handling. If rejected on 4.2 anyway: respond in Resolution Center
  listing the native capabilities first, escalate to a call if needed —
  and DO NOT sell iOS to more tenants until the pilot passes (plan gate).

## 4. After approval

- [ ] Store URL into the platform card → `live` (owner + reseller emailed).
- [ ] Record build number.
- [ ] Calendar the annual traps: membership renewal ($99 — lapse pulls the
      app), agreement re-acceptance after Apple updates terms, ~April SDK
      floor bumps (rebuild fleet-wide).

## Custom-domain warning

The `applinks:` host is compiled into the binary. If the tenant changes
their custom domain later, iOS needs a REBUILD + re-release (Android too,
for the autoVerify host). Surface this in superadmin before approving a
domain change on a live-app tenant.
