# Launch-Readiness Audit — 01: System Inventory

**Date:** 2026-07-10. **Scope:** full-system inventory of Fee Free Ordering (repo `C:\FeeFreeOrderingSystems`).
**Operational status at audit time:** the platform is **LIVE** as of tonight (2026-07-10). Platform Stripe is live under **Fee Free Ordering Inc.**; the first restaurant (**Luigi's Lasagna**) has live Stripe keys and a verified real card charge. This audit governs **continuing live operation**, not a pre-launch gate.
**Payment model (authoritative):** **key-only** — each restaurant's own Stripe account charges the customer directly via that restaurant's stored (AES-256-GCM-encrypted) secret key. There is **no Stripe Connect money flow in production** (Connect code exists as a legacy path only) and **no platform fee on customer orders**. The platform Stripe account bills **subscriptions/add-ons only**.
**Repo state at audit time:** production branch is `main`, auto-deployed by Vercel. The only uncommitted changes are an authorized money-path hardening batch being pushed tonight: order-number unique constraint + retry, webhook dedup atomicity, ShipDay webhook fail-closed, per-restaurant refund-sync webhook, shared zero-decimal currency helper.

---

## 1. Applications & clients

### 1.1 Web surfaces (`src/app`)

**Customer-facing ordering**

| Surface | Path | Notes |
|---|---|---|
| Customer ordering page | `src/app/order/[slug]/` | Menu, cart, checkout, pizza builder, bundle/combo composers, delivery zone map, promo/freebie modals. Hot path, rendered fresh per request. Key clients: `OrderingPageClient.tsx`, `CheckoutModal.tsx`, `PizzaBuilder.tsx`, `BundleComposerModal.tsx`, `ComboComposerModal.tsx` |
| Customer account area | `src/app/account/` | Login/signup, order history, saved addresses, password reset, marketplace profile |
| Marketplace | `src/app/marketplace/`, `src/app/marketplace/[slug]/` | Multi-restaurant browse grid; served as "/" on the marketplace domain via proxy rewrite |
| Hosted restaurant site | `src/app/site/[slug]/` | White-label-aware mini-website (`loadHostedSite`) |
| Embeddable widget | `src/app/embed/widget/` + `embed/widget.js` | Ordering widget for restaurants' own sites |
| Smart-link redirect | `src/app/m/[code]/` | Marketing Studio 302 with ref/utm attribution, scan recorded via `after()`, no-store headers |

**Operator consoles**

| Surface | Path | Notes |
|---|---|---|
| Restaurant admin | `src/app/admin/` | ~40 sections: orders, menu, promotions, rewards, payments, delivery, hours, reports, reservations, receipts, kitchen/KDS settings, marketing-studio, autopilot, growthnet, billing, integrations, locations, POS, phone-ordering, website, publishing |
| Kitchen display (KDS) | `src/app/kitchen/` | Polled every 4s; also the remote URL loaded by both native apps. Printer setup (`NativePrinterSetup.tsx`, `PrinterSetupModal.tsx`), countdown, end-of-day, kitchen login |
| Superadmin | `src/app/superadmin/` | Platform owner: restaurants, resellers, billing, payouts, add-ons, marketplace settlements, platform settings |
| Reseller console | `src/app/reseller/` | Restaurants, commissions, payouts, sales, branding, notifications; superadmin impersonation banner |
| Reseller reports | `src/app/reseller-reports/` | Bug/feature report feed + notifications |

**Auth / lifecycle:** `src/app/login`, `signup`, `register` (permanent redirect → /signup), `forgot-password`, `reset-password`, `verify-email`, `account-deletion/` (Google Play Data Safety + Apple requirement).

**Marketing / SEO (public):** `src/app/page.tsx` + `HomeClient.tsx` (homepage); `src/app/[slug]/` (programmatic SEO landing pages, data in `src/data/solution-pages`); `online-ordering-for/`, `vs/`, `for/`, `features/`, `pricing/`, `faq/`, `never-miss-an-order/`, `gloriafood-alternative/`; `partners/` (+ `partners/apply`); `demo/`; `import/` (import-to-try); `privacy`, `terms`, `refund`; `robots.txt`, `sitemap`, `sitemap.xml`.

**Utility:** `src/app/flyer-print/` (auth-gated chrome-less QR flyer), `src/app/billing-invoice/[id]/` (printable invoice).

### 1.2 Native apps

Both are **Capacitor remote-URL WebView shells** — no bundled web assets; app updates ship via web deploy.

- **Kitchen Order App** (`com.feefreeordering.kitchen`)
  - Config: `capacitor.config.ts` — WebView loads `https://feefreeordering.com/kitchen`; push foreground presentation = none (web ring engine owns foreground alarm; native push sound only when backgrounded/locked).
  - Android: `android/`, native sources in `android/app/src/main/java/com/feefreeordering/`:
    - `directprinter/DirectPrinterPlugin.java` + `directprinter/StarXpandBridge.kt` — LAN thermal printing (raw ESC/POS TCP :9100 + StarXpand SDK bitmap path for Star TSP143IIIW).
    - `kitchen/OrderAlarmPlugin.java`, `OrderAlarmService.java` — native screen-off order ring (baked mp3, loops until accept).
    - `kitchen/KitchenMessagingService.java` (FCM), `KitchenKeepAliveService.java`, `BootReceiver.java`, `HeartbeatReceiver.java`, `MainActivity.java`.
    - Release signing: `android/keystore.properties` → `feefree-release.jks` (**single local copy; off-machine backup flagged and outstanding**). Play submission via ORG account (`PLAY_STORE_SUBMISSION.md`).
  - iOS: `ios/App/`, built in the cloud via `codemagic.yaml` (workflow `ios-kitchen`, signs + uploads to TestFlight). Push ring works (APNs); continuous ring provided by the per-minute `/api/cron/ios-ring-pending` cron.
- **Marketplace customer app** — config only: `capacitor.marketplace.config.ts`; `/android-marketplace` and `/ios-marketplace` directories are **not yet created** (setup documented in the file).

### 1.3 Edge proxy — `src/proxy.ts`

Next.js 16 `proxy` (462 lines) — replaces `middleware.ts`; creating any `middleware.ts` breaks the Vercel build (`ENOENT middleware.js.nft.json`). Responsibilities:

- **Host-based multi-tenant routing** via `decideHost()` in `src/lib/domains/resolve.ts`, cached by in-process LRU (`src/lib/domains/lru.ts`), backed by an internal resolve-host API guarded by `INTERNAL_API_SECRET`. Host classes: platform apex/www (marketing), `app.<domain>` (console passthrough), tenant subdomains and verified custom domains (rewrite to `/order/<slug>/...` preserving the visible URL), marketplace domain (`MARKETPLACE_DOMAIN`; "/" → `/marketplace`, operator paths 301 back to platform), neutral reseller host (`NEUTRAL_RESELLER_HOST`, default restaurantownerlogin.com), reseller white-label hosts (branded login/signup rewrites).
- **Superadmin `/admin` → `/superadmin` path mapping** (`ADMIN_TO_SUPERADMIN` regex table).
- **Lapsed custom domain** → 302 to the restaurant's free platform link.
- **Cache-safety rule:** every auth-state-dependent redirect carries `Cache-Control: no-store, no-cache, must-revalidate` + `Pragma: no-cache` + `Expires: 0` (browsers cache 307s aggressively; mandatory per `AGENTS.md`).
- Branded order URLs built via `restaurantOrderUrl()` (`src/lib/restaurant-url.ts`), never `NEXT_PUBLIC_APP_URL`.

### 1.4 Printing pipeline (GOLDEN — locked)

Server-side byte generation → native TCP delivery. `src/lib/receipt-schema.ts` + `src/lib/default-receipt-config.json` (template config), `src/lib/receipt.ts` (ESC/POS + StarPRNT/Star Line/plaintext builder), `src/lib/escpos.ts`, `src/lib/receipt-lines.ts`, `src/lib/kitchen-receipt-payload.ts`. APIs: `src/app/api/kitchen/print-job/[orderId]/route.ts`, `print-job/reservation/[id]/route.ts`, `print-job-token/route.ts` (base64 printer bytes). Client bridge: `src/lib/native-printer.ts` (falls back to browser/PrintNode on web). Golden-pipeline snapshot in `.revert-staging/`. Do not modify.

---

## 2. API surface

**291 `route.ts` files** under `src/app/api`. Family breakdown:

| Family | Routes | Purpose |
|---|---|---|
| `admin` | 84 | Restaurant-owner console APIs (menu, promos, orders, payments, settings) |
| `restaurants` | 34 | Restaurant-scoped public/customer APIs (menu fetch, ordering context) |
| `superadmin` | 27 | Platform administration |
| `kitchen` | 26 | KDS: orders poll, print-job bytes, device/push registration, end-of-day |
| `menu` | 19 | Menu operations |
| `cron` | 18 | Scheduled jobs (17 wired in `vercel.json` + 1 manual, see §3) |
| `public` | 15 | Unauthenticated endpoints (unsubscribe, geocode search, etc.) |
| `reseller` | 14 | Reseller console APIs |
| `reseller-reports` | 11 | Bug/feature report workflow |
| `customer` | 9 | Restaurant-customer account APIs |
| `auth` | 7 | NextAuth + auth flows |
| `webhooks` | 4 | `stripe` (platform), `restaurant-stripe/[restaurantId]` (per-restaurant), `paypal`, `shipday` |
| `stripe` | 4 | Stripe Connect (connect/refresh/return/status) — **legacy path; no Connect money flow in production** |
| `orders` | 4 | Order placement + status (checkout hot path) |
| `menus` | 4 | Multi-menu management |
| `twilio` | 2 | `support-call`, `support-whisper` (inbound voice TwiML) |
| `track` | 2 | Visit/analytics tracking |
| `paypal` | 2 | PayPal connect |
| `widget`, `upload`, `partners`, `internal`, `import` | 1 each | Embed widget API, uploads, partner application, internal resolve-host (proxy), menu import |

---

## 3. Scheduled jobs

**17 crons** defined in `vercel.json`; handlers in `src/app/api/cron/*/route.ts`. Auth: `Bearer $CRON_SECRET` (`src/lib/cron-auth.ts`); several also allow superadmin manual trigger. Crons **fail closed** without `CRON_SECRET` set in the Vercel environment (per `GO-LIVE-TODAY.md`).

| Path | Schedule | Purpose |
|---|---|---|
| `/api/cron/vip-schedules` | `*/5 * * * *` | Fire due VipSchedules (recurring Reward-Dollar grants); idempotent via reward ledger |
| `/api/cron/commissions` | `0 7 * * *` | Promote reseller commissions pending → available after 7-day hold |
| `/api/cron/daily-digest` | `0 8 * * *` | Morning digest catch-up; self-dispatches monthly digest on UTC day 1 |
| `/api/cron/eod-digest-closing` | `* * * * *` | End-of-day digest after each restaurant's closing time (header comment says "every 30 minutes" but `vercel.json` runs it every minute — doc/config mismatch) |
| `/api/cron/marketplace-settle` | `5 0 1 * *` | Monthly marketplace settlement |
| `/api/cron/auto-reject-stale-orders` | `*/5 * * * *` | Auto-reject orders unaccepted past cutoff |
| `/api/cron/autopilot` | `0 * * * *` | Hourly autopilot marketing campaigns; idempotent via AutopilotSend dedup table |
| `/api/cron/kickstarter-invites` | `15 * * * *` | Drip Kickstarter invite emails, throttled for Resend rate limits |
| `/api/cron/auto-complete-orders` | `*/2 * * * *` | Auto-complete accepted orders for Simple-mode kitchens |
| `/api/cron/reports-snapshot` | `0 3 * * *` | Roll up yesterday's orders into ReportDailySnapshot |
| `/api/cron/order-alert-calls` | `* * * * *` | Twilio voice call ~90s after ring starts unaccepted |
| `/api/cron/ios-ring-pending` | `* * * * *` | iOS continuous order ring — re-push APNs until pending order accepted |
| `/api/cron/publish-scheduled-menus` | `* * * * *` | Activate menus whose `scheduledActivateAt` arrived (atomic one-active) |
| `/api/cron/dunning` | `0 13 * * *` | Failed-payment grace-window emails/SMS, then enforcement |
| `/api/cron/import-menu-images` | `* * * * *` | GloriaFood menu photo drip-importer (PendingMenuImage) |
| `/api/cron/cleanup-sandboxes` | `30 4 * * *` | Delete unclaimed import-to-try sandboxes past TTL (batched, take 200) |
| `/api/cron/expire-addon-trials` | `10 6 * * *` | End free partner periods for test-era add-on subscriptions |

Not scheduled: `/api/cron/monthly-digest` — **manual trigger only**; the daily-digest handler self-dispatches monthlies on UTC day 1.

---

## 4. Third-party integrations

| Service | Data sent | Credential location | Encrypted at rest |
|---|---|---|---|
| Stripe — platform account (**live**, Fee Free Ordering Inc.; **subscriptions/add-ons only**) | Subscription/invoice amounts; restaurant billing details (`RestaurantBillingProfile`) | `PlatformSettings.stripeSecretKeyEnc` + `stripeWebhookSecretEnc` (DB wins); env fallbacks `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET`/`STRIPE_CONNECT_WEBHOOK_SECRET` (`src/lib/stripe.ts`) | Yes (DB, AES-256-GCM); publishable key plain by design |
| Stripe — per-restaurant (**live for Luigi's Lasagna**; key-only customer charges) | PaymentIntent create/capture/refund; metadata = `{ orderId, restaurantId }` **only** (no customer PII; `src/lib/stripe.ts` ~line 554); `capture_method: manual`; platform fee always 0 | `PaymentProvider.secretKeyEnc` + `webhookSecretEnc` per restaurant; `publishableKey` plain | Yes (AES-256-GCM) |
| PayPal (per-restaurant, direct REST — `src/lib/paypal.ts`) | Order create/authorize/capture/refund amounts; idempotent via `PayPal-Request-Id` | `Restaurant.paypalClientIdEnc` + `paypalSecretEnc`; `paypalEnvironment`/`paypalMerchantEmail`/`paypalWebhookId` plain (non-secret) | Yes (AES-256-GCM) |
| Resend (email — `src/lib/email.ts`) | Customer emails: names, order contents, addresses, reset/verify links; marketing gated by `marketingConsent`; staff/reseller/billing notifications; cold-outreach Prospect emails | `PlatformSettings.resendApiKeyEnc` (superadmin UI); env fallback `RESEND_API_KEY` | Yes (DB); env fallback plaintext |
| Twilio (SMS `src/lib/sms.ts`; voice `src/lib/voice-call.ts`; inbound `src/app/api/twilio/*`) | Phone numbers + short order text / TwiML speech; missed-order calls go to the restaurant's `alertPhone` | `FFOS_TWILIO_ACCOUNT_SID` / `FFOS_TWILIO_AUTH_TOKEN` / `FFOS_TWILIO_FROM_NUMBER` env only; nothing in DB | No (plaintext env) |
| ShipDay (`src/lib/shipday.ts` → api.shipday.com) | **Largest customer-PII egress:** customerName, customerAddress, customerEmail, customerPhoneNumber, delivery lat/lng, line items, tip | `ShipdayConfig.apiKeyEnc` per restaurant; inbound webhook shared secret `SHIPDAY_WEBHOOK_TOKEN` (env) | Yes (API key); webhook token plaintext env. Webhook historically accepted any caller when token unset — **fail-closed fix in tonight's hardening batch** |
| FCM / APNs (kitchen push — `src/lib/push.ts`, hand-rolled OAuth JWT) | Order-alert payloads to device tokens (`KitchenPushToken`); dead tokens pruned | `FIREBASE_SERVICE_ACCOUNT` env (full service-account JSON incl. RSA private key); APNs auth key in Firebase console, not repo | No (plaintext env) |
| PrintNode (cloud printing) | Receipts incl. customer name/address/phone on delivery tickets (only when this path enabled; native StarXpand path is LAN-only) | `PrinterSettings.printNodeApiKeyEnc` per restaurant | Yes (AES-256-GCM) |
| Google Maps (Maps JS, Places, Distance Matrix, geocoding) | Addresses + lat/lng | `PlatformSettings.googleMapsApiKey` plain **by documented design** (referrer/API-restricted, browser-exposed); env fallbacks `GOOGLE_MAPS_API_KEY`, `GOOGLE_DISTANCE_MATRIX_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`. Legacy `Restaurant.googleMapsApiKey` column exists but is ignored everywhere (standing rule) | No — plain by design |
| Nominatim / OpenStreetMap (`src/lib/geocode.ts`, `/api/public/geocode/search`) | Raw customer address strings (User-Agent FeeFreeOrderingSystems/1.0) | None | n/a |
| Anthropic Claude (`@anthropic-ai/sdk`) | Uploaded menu PDFs (`src/lib/menu-extractor.ts`); reseller bug-report text (`src/lib/reseller-reports-ai.ts`) | `ANTHROPIC_API_KEY` env | No (plaintext env) |
| Sentry (`@sentry/nextjs`) | Error events + stack traces | `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` (DSNs not secret); `SENTRY_AUTH_TOKEN` build-time only | n/a |
| Upstash Redis / Vercel KV (`src/lib/rate-limit.ts` — **planned**, launch blocker #9) | Rate-limit counters (bucket keys incl. IPs); fail-open on outage | `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` (KV_* aliases accepted) | No (plaintext env) |
| Vercel Blob (`@vercel/blob`) | Menu/promo images, kitchen sounds, reseller assets, report screenshots, APKs (see §6.5) | `BLOB_READ_WRITE_TOKEN` env | No (plaintext env) |
| Vercel API (custom-domain registration — `src/lib/domains`) | Tenant domain add/verify calls | `VERCEL_TOKEN` / `VERCEL_PROJECT_ID` / `VERCEL_TEAM_ID` env | No (plaintext env) |
| Meta Pixel + Google Analytics (per restaurant) | Customer page views/events from the browser only, consent-gated (`src/components/order/TrackingScripts.tsx`, `TrackingConsentGate.tsx`); no server-side PII forwarding | `Restaurant.facebookPixelId`, `Restaurant.googleAnalyticsId` (plain IDs, not secrets) | n/a |
| SerpAPI | Restaurant-name ranking queries (admin Google-rank report) | `SERPAPI_KEY` env | No (plaintext env) |
| Tawk.to | Support-chat bubble; public IDs only | `NEXT_PUBLIC_TAWK_PROPERTY_ID` / `NEXT_PUBLIC_TAWK_WIDGET_ID` | n/a (public) |
| EU VIES (ec.europa.eu) | VAT-ID validation, fail-soft (`src/lib/vies.ts`) | None | n/a |
| Codemagic (iOS CI — `codemagic.yaml`) | Build artifacts to TestFlight | No secrets in repo; Codemagic secure group `ios_signing` (`IOS_SIGNING_KEY_PEM`) + App Store Connect integration `ff-asc-key` | Held by Codemagic |

---

## 5. Secrets & credentials inventory (variable names only — no values)

### 5.1 Environment variables — documented in `.env.example`

Active placeholders: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_SERVER` (**stale — unused anywhere in src/ or scripts/**), `ENCRYPTION_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (**stale name — code reads `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`**, `src/lib/maps-key.ts`), `PLATFORM_DOMAIN`, `MARKETPLACE_DOMAIN`, `DOMAIN_PROVIDER`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SHIPDAY_WEBHOOK_TOKEN`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `NEXT_PUBLIC_TAWK_PROPERTY_ID`, `NEXT_PUBLIC_TAWK_WIDGET_ID`.

Commented-out (documented, off by default): `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `INTERNAL_API_SECRET`, `SENTRY_FORCE_ENABLE`, `NEXT_PUBLIC_SENTRY_FORCE_ENABLE`.

### 5.2 Environment variables — used in code but MISSING from `.env.example`

Security-relevant / go-live critical: `CRON_SECRET` (`src/lib/cron-auth.ts`), `ORDER_STATUS_SIGNING_KEY` (falls back to `NEXTAUTH_SECRET`; `src/lib/order-status-token.ts`), `BLOB_READ_WRITE_TOKEN`, `FFOS_TWILIO_ACCOUNT_SID`, `FFOS_TWILIO_AUTH_TOKEN`, `FFOS_TWILIO_FROM_NUMBER`, `SUPPORT_LINE_NUMBER`, `SUPPORT_FORWARD_TO_NUMBER`, `ANTHROPIC_API_KEY`, `FIREBASE_SERVICE_ACCOUNT` (full service-account JSON — highest-value plaintext env secret after `ENCRYPTION_KEY`/`DATABASE_URL`), `GOOGLE_MAPS_API_KEY`, `GOOGLE_DISTANCE_MATRIX_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, `STRIPE_CONNECT_WEBHOOK_SECRET`, `STRIPE_ENABLED`, `STRIPE_WHITE_LABEL_FULL_PRICE_ID`.

Config / ops (hardcoded defaults, env-overridable): `REPORTS_OPS_EMAIL`, `PLATFORM_OPS_EMAIL`, `ADDON_OWNER_EMAIL`, `SHIPDAY_PARTNER_EMAIL`, `NEUTRAL_RESELLER_HOST`, `NEXT_PUBLIC_PLATFORM_DOMAIN`, `NEXT_PUBLIC_MARKETPLACE_DOMAIN`, `NEXT_PUBLIC_CALENDLY_URL`, `SERPAPI_KEY`, `IOS_ALARM_SEGMENTS`, `AUTO_REJECT_TIMEOUT_MINUTES`, `CRON_FORCE_MONTHLY`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`.

Script-only / platform-provided: `CAPTURE_DATABASE_URL`, `APPLY`, `AUDIT_BASE`, `TAWK_BASE`; `NODE_ENV`, `VERCEL_ENV`, `NEXT_PUBLIC_VERCEL_ENV`, `NEXT_RUNTIME`, `CI` (injected). `.env.local` additionally carries `VERCEL_OIDC_TOKEN` (Vercel env-pull provenance).

### 5.3 DB-stored encrypted credentials (AES-256-GCM triples `*Enc`/`*Iv`/`*Tag` via `src/lib/encrypt.ts`, key = `ENCRYPTION_KEY`)

- `PlatformSettings.resendApiKeyEnc`, `PlatformSettings.stripeSecretKeyEnc`, `PlatformSettings.stripeWebhookSecretEnc`
- `PaymentProvider.secretKeyEnc` (restaurant Stripe secret key), `PaymentProvider.webhookSecretEnc` (restaurant Stripe webhook secret — added in the 2026-07-10 hardening batch)
- `Restaurant.paypalClientIdEnc`, `Restaurant.paypalSecretEnc`
- `ShipdayConfig.apiKeyEnc`
- `PrinterSettings.printNodeApiKeyEnc`
- `ResellerProfile.payoutDetails` (+Iv/Tag; encrypted JSON blob, e.g. reseller PayPal payout email — `prisma/schema.prisma` ~lines 2901-2906)

Encryption pattern: random 12-byte IV per value; decrypt failures caught and logged (email path alerts via Sentry in prod). **Rotating `ENCRYPTION_KEY` without re-encrypting silently kills email/Stripe/PayPal/ShipDay/PrintNode decryption** — `LAUNCH-READINESS.md:96`: "never change ENCRYPTION_KEY".

### 5.4 DB columns plain BY DESIGN (documented rationale in schema comments)

`PlatformSettings.stripePublishableKey`, `PaymentProvider.publishableKey` (client-exposed anyway); `PlatformSettings.googleMapsApiKey` (referrer/API-restricted); `Restaurant.googleMapsApiKey` (legacy, ignored by all code paths — cleanup candidate); `Restaurant.paypalEnvironment` / `paypalMerchantEmail` / `paypalWebhookId`, `Restaurant.stripeAccountId` (identifiers, not secrets).

### 5.5 Hashed / token columns (sensitive, not encrypt.ts)

`User.passwordHash`, `Customer.passwordHash`, `CustomerIdentity.passwordHash` (never logged, standing rule); `PasswordResetToken`, `CustomerPasswordResetToken`, `emailVerifyToken`/`passwordResetToken` columns (single-use, stored plain, short-lived); `Restaurant.kitchenSessionToken` (plaintext session token column); `KitchenPushToken` (FCM device tokens, plain, revocable); `MenuSandbox.ipHash`, `WebsiteVisit`/funnel `sessionHash`, `KitchenDevice.deviceHash` (hashed identifiers only).

### 5.6 Off-repo credentials

Codemagic secure group `ios_signing` (`IOS_SIGNING_KEY_PEM`) + App Store Connect integration `ff-asc-key`; APNs auth key in the Firebase console; Android release keystore `feefree-release.jks` + `android/keystore.properties` (**single local copy — no off-machine backup**, flagged in `LAUNCH-READINESS.md:44`).

### 5.7 Known gaps (structural; no values inspected)

1. `.env.example` is materially incomplete (§5.2 list) — a fresh-environment rebuild would silently lose SMS/voice/push/cron/uploads — and carries two stale entries (`EMAIL_SERVER`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`).
2. `FIREBASE_SERVICE_ACCOUNT` and `FFOS_TWILIO_AUTH_TOKEN` are the highest-value plaintext env secrets (acceptable in Vercel env storage; most damaging to leak after `ENCRYPTION_KEY` and `DATABASE_URL`).
3. `/api/webhooks/shipday` accepted unauthenticated callers when `SHIPDAY_WEBHOOK_TOKEN` was unset (warning only) — fail-closed fix ships in tonight's hardening batch; confirm the env var is set in prod.

---

## 6. Data stores

### 6.1 Prisma model domains (`prisma/schema.prisma`, 3,923 lines, **87 models**)

| Domain | Count | Models |
|---|---|---|
| Restaurant / menu | 20 | Restaurant, LocationInvite, SandboxRestaurant, Menu, MenuCategory, MenuChangeLog, PendingMenuImage, MenuItem, ItemVariant, ModifierGroup, ModifierOption, DeliveryZone, OpeningHours, RestaurantHoliday, ReceiptTemplate, ServiceFee, ReservationSettings, ReservationTable, ShipdayConfig, PaymentProvider |
| Orders / payments | 7 | Order, OrderItem, OrderItemModifier, OrderRating, CartSession, Reservation, MarketplaceSettlement |
| Customers / rewards / marketing | 24 | Customer, CustomerAccount, CustomerPasswordResetToken, CustomerAddress, RestaurantCustomerAddress, Coupon (retired), Promotion, PromotionUsage, CustomerCoupon, CustomerGroup, CustomerGroupPromotion, CustomerGroupMember, VipSchedule, VipScheduleGrant, RewardAccount, RewardLedger, RewardEarnRule, AutopilotState, AutopilotCampaign, AutopilotSend, AutopilotStep, KickstarterState, ProspectImport, Prospect |
| Billing / add-ons | 6 | SubscriptionPlan, SubscriptionInvoice, RestaurantBillingProfile, AddOn, RestaurantAddOn, MarketplaceListing |
| Reseller | 12 | ResellerProfile, RestaurantAccess, CommissionTransaction, PayoutRequest, ResellerReport, ResellerNotification, ResellerReportSeen, ResellerReportVerification, ResellerReportUpvote, ResellerReportActivity, ResellerReportComment, ResellerReportInvite |
| Platform / auth | 3 | User, PlatformSettings, PasswordResetToken |
| Webhook-event logs | 2 | StripeWebhookEvent (schema line 703), PaypalWebhookEvent (line 719) — idempotency/dedup ledgers keyed on provider event IDs |
| Kitchen / devices | 3 | KitchenDevice, NotificationRecipient, KitchenPushToken |
| Audit / logs / analytics | 10 | MenuChangeLog (menu audit trail, actorEmail/actorName), PrinterSettings, PrintLog, ReportDailySnapshot, WebsiteVisit, WebsiteFunnelEvent, MenuItemView, SmartLink, SmartLinkScan, MarketingAsset, ConnectivityEvent |

### 6.2 PII-bearing models

**Customer PII (highest sensitivity):**
- `Order`: customerName, customerEmail, customerPhone, deliveryAddress, deliveryCity, deliveryZip, deliveryLat/Lng
- `Customer`: name, email, phone, address (+ emailVerifyToken); indexed by (restaurantId, email) and (restaurantId, phone)
- `CustomerAccount`: email (unique), name, phone, emailVerifyToken
- `CustomerAddress` + `RestaurantCustomerAddress`: street, city, zip, lat/lng
- `Reservation`: customerName, customerEmail, customerPhone
- `CartSession`: customerEmail, customerPhone — **abandoned-cart PII persists even when no order was placed**
- `CustomerCoupon`, `CustomerGroupMember`, `CustomerGroupPromotion`, `VipSchedule`, `VipScheduleGrant`, `AutopilotSend`: email/phone copies for targeting
- `Prospect` / `ProspectImport`: cold-outreach names/emails/phones — **people who never signed up**
- `OrderRating`: linked to orders

**Staff/owner PII:** `User` (email, name, passwordHash), `Restaurant` (phone, email, alertPhone, address, lat/lng), `NotificationRecipient` (email), `SandboxRestaurant` (email), `MenuChangeLog` (actorEmail/actorName), `RestaurantBillingProfile` (billingEmail, legalName, addressLine1/2, city, postalCode).

**Reseller PII:** `ResellerProfile` (companyName, companyVatId, stripeCustomerId, encrypted payoutDetails), `ResellerReport*` family (author/voter/recipient emails and names), `ResellerReportInvite` (email unique).

**Analytics models hold no direct PII:** `WebsiteVisit` = sessionHash (random per-tab id), channel, referrer, utm, landingPath, deviceType, country, refCode — no IP or email stored.

**Card data: VERIFIED ABSENT.** Schema grepped case-insensitively for cardNumber/pan/cvv/cvc/securityCode/last4/cardBrand: zero card-data fields. The DB stores only provider reference IDs (`Order.paymentIntentId`, `Order.paypalOrderId`/`paypalAuthorizationId`/`paypalCaptureId`, Stripe customer/subscription/invoice/price/product IDs) and the encrypted credential triples of §5.3.

### 6.3 Client-side browser storage

Customer ordering page (`src/app/order/[slug]/OrderingPageClient.tsx`):
- localStorage `ff-guest-info` — **the one PII item in the browser**: guest checkout name, email, phone, address, city, zip, unit, buzzer, deliveryNotes, neighbourhood, building, floor, parking (device-global pre-fill; code comment ~line 4050 notes it never stores card data; cleared at line 1652)
- localStorage `ff-ordered-{restaurantId}-{channel}` (has-ordered flag); sessionStorage `ff-popup-{restaurantId}` (promo popup seen); `ff_reservation_draft` (also `reservation/ReservationPageClient.tsx:80`); `ff_reorder_{slug}` (status page, account OrderAgainButton, MarketplaceReorderCard)
- sessionStorage `ff_session_hash` — random per-tab analytics id (`src/lib/visit-tracker.ts:26`)

Kitchen display (`src/app/kitchen/KitchenDisplay.tsx`) — device prefs only, no PII: `kds-alert-volume`, `kds-alert-muted`, `kds-alert-sound`, `kds-theme`, `kds-zoom`, `kds-device-hash`, `kds-cleared-orders`, `kds-cleared-complete`, `ffo:kitchen-autoprinted`.

### 6.4 Cookies

**Server-set session cookies (all httpOnly):**

| Cookie | Set by | Flags |
|---|---|---|
| `__Secure-next-auth.session-token` (plain name on dev/tunnel) | Admin NextAuth JWT — `src/lib/auth.ts:96-116` | httpOnly, sameSite=lax, path=/, secure in prod |
| `__Secure-next-auth.kitchen-session-token` (plain on dev) | Kitchen NextAuth jar — `src/lib/auth-kitchen.ts:32-52` | httpOnly, sameSite=lax, secure in prod; coexists with admin (resolution in `src/lib/session.ts` getSessionUser, preferKitchen tiebreak) |
| `ff_rest_account` | Restaurant-customer signed JWT — `src/lib/restaurant-customer-session.ts:48,141-147` | httpOnly, sameSite=lax, secure in prod, maxAge 30 days |
| `ff_customer` | Marketplace customer — `src/lib/customer-session.ts:30,85-91` | Same flags, 30 days |
| `sa_impersonate`, `partner_impersonate` (DB-revalidated via resellerCanImpersonate), `sa_reseller_impersonate`, `active_location` | Defined `src/lib/session.ts:8-21`; set by impersonate/switch API routes | httpOnly, sameSite=lax |

No reseller-specific session cookie — resellers use the admin NextAuth session with role `reseller_partner`.

**Client-set cookies (non-httpOnly by nature, non-sensitive):** `fee-free-locale` (`LanguageSwitcher.tsx:41`, `AuthLanguageSwitcher.tsx:12`, `PublicNav.tsx:26`), `ff-staff-locale` (`StaffLanguageSwitcher.tsx:17`), `feefree_ref` + `feefree_claim` (signup referral/claim, `SignupForm.tsx:102/111`, samesite=lax).

### 6.5 Blob storage (Vercel Blob; falls back to `public/uploads/` locally — `src/app/api/upload/route.ts:14-16`)

| Path prefix | Contents | Source |
|---|---|---|
| `{restaurantId}/{filename}` | Menu item images, logos, promo tiles (5 MB cap) | `src/app/api/upload/route.ts:57` |
| `{restaurantId}/menu/{filename}` | GloriaFood drip-imported menu photos | `src/app/api/cron/import-menu-images/route.ts:97` |
| `{restaurantId}/{filename}` | Custom kitchen alert sounds | `src/app/api/restaurants/kitchen-sound/route.ts:89` |
| `reseller/{resellerProfileId}/{filename}` | Reseller branding assets/logos | `src/app/api/reseller/upload/route.ts:72` |
| `reseller-reports/{filename}` | Bug-report screenshots — **can incidentally contain customer PII from admin screens** | `src/app/api/reseller-reports/upload/route.ts:68` |
| (upload-url) | PDF menu imports | `src/app/api/menu/import-pdf/upload-url/route.ts` |
| APKs | Android binaries | `scripts/upload-apk-to-blob.ts` |

No customer documents, payment artifacts, or PII-table exports go to Blob.

---

## 7. Environments & deployment

- **Host:** Vercel, project `fee-free-ordering-systems` (`.vercel/project.json` — projectId `prj_KCuuztkCePw968OQCcGm99b3jyRr`, team `team_KQcUq1AsJDyo5fJzUxSnuZgB`).
- **Deploy trigger:** push to `origin main` (GitHub `luigislasagna1-bit/fee-free-ordering-systems`) → Vercel builds and promotes to production. **No CI exists** (`.github/workflows` absent). No `ignoreCommand`/`builds` overrides in `vercel.json` (which contains only the 17 cron definitions).
- **Build:** `package.json` → `"build": "prisma generate && next build"`, `"postinstall": "prisma generate"`. `next.config.ts` wraps next-intl then Sentry (order load-bearing) and sets security headers (nosniff, HSTS without preload, Permissions-Policy, frame-ancestors scoped to non-embed/non-order paths).
- **Preflight:** `"preflight": "tsc --noEmit && vitest run && prisma generate && next build"` (~533 tests), mandated by `AGENTS.md` before pushes touching build-critical files. **Convention only — no pre-commit hook or CI gate enforces it.**
- **Databases:** two Neon Postgres branches, toggled by commenting in `.env.local`: active dev = `ep-purple-brook-aqf9es77...`; commented prod = `ep-dawn-tree-aqezijfh-pooler...`. Repo-wide grep confirms no third endpoint — the model is exactly dev + prod. `scripts/run-on-prod.ts` physically rewrites `.env.local` to activate the prod URL, runs the script, restores the file (needed because `prisma.config.ts` loads `.env.local` with `override:true`).
- **Local dev:** `npm run dev` = `next dev --port 3001`, against the dev Neon branch.
- **Staging: NONE.** No staging DB URL exists; "staging" mentions in docs are informal (`LAUNCH-PLAN.md:76`, `STABILIZATION-PLAN.md:102`). Vercel **preview deployments exist for non-main branches but share nothing verified** — their `DATABASE_URL` and env posture are configured in the Vercel dashboard and are not determinable from the repo; with only two Neon branches, a preview deploy necessarily points at either dev or prod. De facto pre-prod path: local 3001 on dev branch → preflight → push to main.
- **Schema changes:** applied via `prisma db push` to BOTH branches through `scripts/push-schema-to-both.ts` (mandated by `AGENTS.md`). **No versioned migrations** — `prisma/migrations/` holds a single vestigial `20260502013358_init` (last touched 2026-05-14); every change since went through `db push`, so `prisma migrate dev` would detect drift and offer a reset (catastrophic against prod). **No down-migrations** — reversing a schema change is a manual SQL exercise. Deploys and schema are decoupled (Vercel builds never apply schema); ordering is manual. `db push` without `--accept-data-loss` refuses destructive changes — the de facto guard rail.
- **Rollback:** Vercel instant-promote of a prior deployment. Documentation is one line (`LAUNCH-READINESS.md:96`: keep previous deploy pinned; keep sandbox Stripe keys; never change `ENCRYPTION_KEY`). **No step-by-step rollback runbook exists**, and code rollback does not roll back the database — promote-back against a newer schema is only safe for additive changes; that interaction is undocumented. Hardware-verified git tags (`kitchen-verified-v2.8`, `kitchen-display-verified-2026-07-03`, `marketing-suite-verified-2026-06-09`) are code-revert points, not deploy procedure.
- **Branch state:** `main` is production (at 374cbb8f, 2026-07-10). ~44 local branches; all others stale or merged in substance (~18 `[gone]`, a 2026-06-15 kitchen/push cluster, late-June/July stragglers). Cleanup is safe housekeeping, not performed (read-only audit). The only uncommitted working-tree changes are the authorized 2026-07-10 money-path hardening batch (see header).

---

## 8. Backup & recovery status

**What exists (plainly): nothing automated.**

- No pg_dump script, no scheduled backup job, no `.github/workflows` of any kind, no restore-test documentation anywhere in the repo.
- The only files matching "backup" in `scripts/` are one-off data snapshots (`scripts/_luigi-hours-backup.json`, `scripts/_hours-backup.json` — saved opening-hours JSON, not a mechanism).
- `scripts/push-schema-to-both.ts` is a schema-parity tool, not a backup.

**What is only recommended (unexecuted checklist items):**

- `GO-LIVE-TODAY.md:14`: "[ ] pg_dump backup of prod Neon before flipping anything (and confirm Neon PITR is on a paid tier)" — unchecked.
- `LAUNCH-READINESS.md:20` (blocker #2): confirm Neon prod PITR/backups, verify 7-30 day PITR on a paid tier, document restore, manual pg_dump before first go-live and before every schema push — explicitly flags "no verified backups"; lines 82 and 105 repeat the manual pg_dump instruction in the runbook.
- `LAUNCH-READINESS.md:44`: Android keystore `feefree-release.jks` is a single local copy with no off-machine backup.

**Restore testing: not documented anywhere** — `LAUNCH-READINESS.md:20` itself asks for the restore procedure to be written, confirming it does not exist.

**Net position:** with the platform now live and taking real card payments, durability rests entirely on whatever PITR tier the Neon account happens to be on — **which is unverified**. This is the single largest recovery gap in the system.
