# Fee Free Ordering Systems — Soft Launch Plan

_Originally compiled 2026-05-26. Heavily updated 2026-05-28 after the full Claude-side cleanup pass._

This document is the **single source of truth** for what ships at soft launch vs. what's marked "Coming Soon." Read top-to-bottom before launch day.

---

## Part 1 — What's Blocking Soft Launch

These are the only things between us and inviting the first batch of real restaurants. Everything else either works or is correctly badged as Coming Soon.

### 1.1 — Code work — **ALL CLAUDE-SIDE COMPLETE ✅**

Original task list (ships at soft launch):

| # | Item | Est | Status | Notes |
|---|---|---|---|---|
| 1 | **Kitchen notification sounds** (task #116) | 2-3h | ✅ **Shipped 2026-05-28** | GloriaFood sample MP3 — Web Audio decoded buffer, leading-150ms trim, high-pass @ 80Hz to cut hum. Strict "no auto-fallback" mode after Luigi reported hearing both sample + synth layered. Dynamic ring cadence: 3s when fresh, escalating to 250ms in the last 30s before auto-reject. Sound picker in settings (GloriaFood Ding vs. Classic Bell). Commits 299124a, 05e4c17. |
| 2 | **PayPal integration** (task #117) | 1 day | ✅ **Shipped 2026-05-28** | Per-restaurant REST app model — each restaurant pastes their own PayPal Business REST app's Client ID + Secret, encrypted at rest with AES-256-GCM. Direct charges: money flows to restaurant's PayPal balance, platform takes 0%. Same authorize-then-capture lifecycle as Stripe Connect. Webhook receiver at `/api/webhooks/paypal`. Expandable step-by-step instructions in admin for non-developer owners. Commits 75e1281, 3efdaa8, 90151b5. |
| 3 | **Coming Soon badging audit** (task #118) | 2-3h | ✅ **Shipped 2026-05-27** | Banners on Autopilot, Brand Reports, Marketplace home. Every unwired feature honestly badged. Commit 80df889. |

Bonus work shipped 2026-05-28 (became necessary as Luigi tested):

| Item | Notes |
|---|---|
| ✅ **Order email semantics** | Placement-time email said "Order Confirmed" before kitchen accepted, then "Rejected" if declined — contradictory. Now: "Order Received — awaiting confirmation" on placement; "Order Confirmed" only after kitchen accepts; "Order Not Accepted" with rejection reason in rose callout on reject. Commit 42646a7. |
| ✅ **Kill all "Free Trial" wording** | Trial concept removed entirely. All new restaurants land on FREE plan (no countdown, no card required). Schema default + all signup flows + Stripe checkout + admin/reseller UI + email templates + 5 i18n files + sales pages updated. Commit faaf9d8. |
| ✅ **100-order/month cap enforcement** | The promise the new FREE-plan copy made now actually exists. Counter on Restaurant, lazy monthly rollover, hard-block at 100 unless restaurant has any active paid add-on (or upgrades to FREE Unlimited Orders, the new $14.99/mo SKU). Soft-warning banner at 80, urgent banner at 100. Always-visible progress bar on /admin/billing. Commit 98a16b4. |
| ✅ **Billing page rewrite** | Removed legacy "Available plans / Switch to this plan" picker. New Add-ons overview listing every catalog item with this restaurant's status + activation/renewal dates + Subscribe/Manage links. Commit 4eb452e. |
| ✅ **Marketplace dual-billing surface** | Both PAYG ($3/order) and Monthly ($199.99 unlimited) shown wherever marketplace appears. Current plan highlighted. Switch link to the other. Commit 157ab23. |
| ✅ **Marketplace Monthly→PAYG switch flow** | "Switch to Pay-As-You-Go" now actually works (was redirecting Monthly subscribers to settings page with no actionable PAYG option). Schedules Stripe cancel-at-period-end + a flag on MarketplaceListing the webhook reads to preserve the listing across the transition. Undo button. Commit 44f406e. |
| ✅ **Stripe Connect status semantics aligned** | The status-poll endpoint required both `chargesEnabled && payoutsEnabled` for "connected" — but the webhook used only `chargesEnabled`. The disagreement caused Luigi's setup wizard to show "1 step left" forever even with charges live. Fixed: polling endpoint + the /admin/payments banner + the setup-checklist now key off `stripeChargesEnabled` (the actual Stripe truth) rather than the lossy local status field. Commits ebac206, 65aaf98. |
| ✅ **PayPal saved in payment methods** | The PUT /api/restaurants/payment-methods whitelist was stripping "paypal" out before save. Added it. Commit 65aaf98. |
| ✅ **Trial-days column removed from /superadmin/add-ons** | Cosmetic leftover from the killed-trial system. Commit 640a4ff. |
| ✅ **Per-restaurant customer accounts + admin-assigned coupons** (Task #5) | NEW FEATURE. Restaurants now offer customers a per-restaurant signup (separate from marketplace identity) bundled with the platform — free for everyone. Customers sign up at `/order/<slug>/account/signup`, get a dashboard showing their personal coupons + order history. Admins assign personal coupons from `/admin/customers/<id>`. Multi-location chains: signup at any location auto-replicates Customer rows across siblings so one set of creds works chain-wide. Commit c002816. |

**Total Claude-side work: ~~~2 days~~ DONE.** Luigi-side: see Part 1.2 below.

### 1.2 — User work (only Luigi can do these) — **THE FULL DAY PLAN**

Ordered for a focused day: blockers first, then verification of recent work, then UATs.

| # | Item | Est | Status | Notes |
|---|---|---|---|---|
| **A** | **Stripe payouts verification** (blocker for real money) | ~15-30 min with Stripe | Pending | Stripe's flagged your account as `payouts: pending` — they want bank-verification docs (utility bill, ID, business registration, etc.) before they'll send money to your bank. Email from Stripe was sent during onboarding. Open Stripe Express dashboard → Settings → Verification → upload what they ask for. Charges already work; this just unlocks payouts. |
| **B** | **Stripe TEST → LIVE switch** (task #14) | 30 min | Pending | If still on test mode: flip toggle in Stripe dashboard → recreate Products + Prices → paste new `price_xxx` into Vercel env → re-register webhook in live mode → test $1 transaction + refund. |
| **C** | **Verify Task #5 on prod** (just shipped) | 10 min | Pending | Walk the full per-restaurant account flow in incognito: signup → admin assigns a personal coupon → customer dashboard shows it → place order with code → place another order LOGGED OUT with same code (should silently not apply). |
| **D** | **UAT: new-account E2E** (task #47) | 30 min | In progress | Fresh signup at a new email → setup wizard 100% complete → publish → place a first order from a guest browser. |
| **E** | **UAT: reseller flow** (task #48) | 30 min | In progress | Apply → approve → add restaurants → commission rollup → payout. |
| **F** | **UAT: kitchen printer** (task #67) | 30 min | In progress | Real prod order → StarXpand → physical TSP143IIIW receipt. |
| **G** | **UAT: multi-location** (task #68) | 30 min | Pending | Parent → child location → menu inheritance → revert-to-brand. Customer signup at parent should now auto-create a Customer row at the child (new this session — Task #5). |
| **H** | **UAT: reservations E2E** (task #69) | 30 min | Pending | Customer books → admin pending → confirm → seated. |
| **I** | **UAT: Reports smoke-test** | 15 min | Pending | Incognito order → Funnel + Visits + Heatmap populate. |
| **J** | **UAT: Custom Domain flow** | 30 min | Pending | One reseller subscribes to Full → connects domain → DNS verification → branded login renders. |
| **K** | **UAT: Menu PDF import** | 10 min | Pending | Upload a real menu (AYCE-style or 100+ pages) → items + categories appear. |

**Total Luigi-side: ~4-5 hours.** Fits in one focused day with breaks.

---

## Part 2 — What's Built (and how far it's actually been tested)

**Important framing:** Nothing in this section is "100% tested." Everything below is **built and works in the happy path I or Luigi clicked through**, but until each subsystem has (a) a Luigi UAT on prod and (b) at least one real-customer transaction, it is not trusted for launch. Use the status column to see the honest gap between "shipped" and "trusted."

**Verification levels:**
- 🔵 **Built** — code exists, deployed, compiles, no known errors
- 🟡 **Dev-tested** — Claude or Luigi clicked through the happy path once in dev/staging
- 🟠 **Prod-UAT'd** — Luigi ran the full walkthrough on production (this is what Part 1.2 unblocks)
- 🟢 **Real-customer-verified** — an actual paying customer / restaurant used it end-to-end without intervention

**Today, almost nothing is past 🟡. Zero subsystems are 🟢 because Stripe LIVE hasn't been switched on yet.** That's the work Part 1.2 + the first batch of soft-launch restaurants will do.

### Reports system (16 sub-pages, all wired) — 🟡 Dev-tested
- Dashboard with KPI cards + vs-prev-period deltas + first-order welcome state
- Sales → Trend + Summary (with chart/table toggle + previous-period overlay)
- Menu Insights → Categories + Items (with revenue % column)
- Online Ordering → Funnel (all 7 steps tracked), Clients (cohort analysis), Reservations, Connectivity Health (7-day timeline + per-day uptime), Promotions Stats, Website Visits (stacked-bar by channel), Delivery Heatmap (Leaflet, blue→red), Google Ranking (SEO health checklist — rank chart awaits SerpAPI)
- List View → Orders + Clients (paginated, sortable, unbounded exports)
- All 7 reports have working CSV/XLS export with active filters preserved
- 4-year data retention enforced in schema
- Daily ReportDailySnapshot rollup cron scheduled at 3am UTC
- _Gap to 🟢: needs a real order to flow through Funnel + Visits + Heatmap on prod (UAT #10)_

### White-label Phase 1 + 2 + 2c — 🟡 Dev-tested
- Basic ($9.99/mo) — imprint + logo on emails
- Full ($29/mo) — adds custom domain + branded login
- Custom domain end-to-end: connect, Vercel API, DNS records, registrar guides (GoDaddy/Namecheap/Cloudflare/etc), auto-poll every 20s, ETA banner, support escalation mailto, pre-flight modal, www/apex normalization, SSL via Let's Encrypt
- Superadmin audit panel at `/superadmin/resellers/<id>`
- _Gap to 🟢: needs a reseller to subscribe to Full → connect a real domain → DNS → branded login render (UAT #11)_

### Custom Domain for Restaurants ($9.99 add-on) — 🔵 Built, not yet UAT'd in prod
- Same Vercel-backed flow as reseller domain
- Pre-flight modal explaining DNS takedown risk + email safety
- Registrar guides (per-registrar steps)
- Auto-polling, ETA banner, support link
- www / apex matching
- _Gap to 🟢: same as reseller domain — needs a real restaurant to connect a real domain end-to-end_

### Menu PDF Import — 🟡 Dev-tested (one real menu)
- Claude Sonnet 4.5 extraction with streaming (32k max_tokens)
- Auto-splits PDFs over 80 pages, merges results (deduped by category + item name)
- AYCE / fixed-price menus supported (items with $0 prices come through)
- Dedup on re-import (won't duplicate existing items)
- Pre-launch validated by Luigi: 125-page Italian menu → 239 items in one upload (one test, one menu, one language)
- _Gap to 🟢: needs 2-3 more menus (different cuisines, AYCE, drinks-heavy, multilingual) to confirm extraction quality holds (UAT #12)_

### Kitchen Printer (Direct LAN) — 🟡 Dev-tested (verified working 2026-05-24)
- StarXpand SDK with native bitmap printing (TSP143IIIW verified working)
- mDNS auto-discovery + subnet scan
- Per-template receipt customization (live preview)
- Two workflow modes: Simple (GloriaFood-style accept-only) + Tracking (full state machine)
- Kitchen first-time tour
- PrintNode demoted to opt-in backup
- _Gap to 🟢: prod UAT — real order placed online → printer in Luigi's kitchen physically prints (UAT #7). The pipeline is locked GOLDEN but has never run against a real prod order on the live Stripe path_

### Capacitor Native Apps (foundations) — 🔵 Built (kitchen) / 🔵 Scaffolded (marketplace)
- **Kitchen Display app** — fully working, ready for store submission (commit 78)
- **Marketplace app** — Capacitor config scaffolded, awaits `npx cap add ios/android` + cert setup (commit 694d374)
- _Gap to 🟢: neither app is in any store yet; kitchen app needs a TestFlight build at minimum before launch_

### Marketing surfaces — 🟡 Dev-tested
- Hosted marketing site at `/site/<slug>` (Sales Optimized Website add-on)
- Programmatic SEO landing pages (`/{cuisine}-delivery-{city}`)
- Sticky nav + full-screen hero + Special Offers section pulling from active promotions
- Embed widget (3 modes: button, iframe, popup) with 4 position options
- Subdomain routing (`<slug>.feefreeordering.com`)
- Custom domain routing per restaurant
- _Gap to 🟢: SEO landing pages have never been indexed by Google in prod; embed widget has never been dropped into a real third-party site_

### Visit + Funnel Tracking — 🔵 Built, 🟡 partial in dev
- Beacon on `/order/<slug>` AND `/site/<slug>` AND SEO landing pages
- Channel detection (utm + referrer + Vercel geo → direct/marketplace/email/organic/paid_ads/social/referral/affiliate/internal)
- 7-step funnel: visit → menu_browsed → item_added → checkout_open → checkout_info → payment_open → order_placed
- Rate-limited beacons (60/min visit, 120/min event)
- 4-year retention
- _Gap to 🟢: intermediate funnel steps (menu_browsed / item_added / checkout_open / checkout_info / payment_open) are only partially wired — only visit → order_placed is confirmed end-to-end. Listed in Phase 3 post-launch fixes_

### Stripe Connect (= GloriaFood model) — 🟡 Dev-tested on TEST mode only
- Direct charges, restaurant owns the Stripe account, funds go directly to them
- Authorize-then-capture for delayed orders
- Marketplace settlement cron with monthly summary emails
- Refund handling including insufficient balance edge case
- White-label tier subscription with prorated tier-swap
- _Gap to 🟢: **THE BIG ONE.** Stripe is still in TEST mode. Until task #14 (LIVE key swap + $1 real transaction + refund) happens, nothing here is trusted. Every other "ready" subsystem depends on this working for end-to-end customer flow_

### Marketplace platform (`feefreefood.com`) — 🟡 Dev-tested
- Browse page with search + cuisine filters + sort
- Per-restaurant tiles linking to order pages
- `?from=marketplace` attribution + card-only enforcement
- $3/order billing with monthly cap
- PWA manifest installable on phones (poor-man's native app)
- _Gap to 🟢: zero restaurants live on it yet, so the browse page is empty and search has never been hit with real traffic_

### Customer Accounts — 🔵 Built
- Signup, login, password reset, email verification
- Address book + order history
- Cross-restaurant identity via CustomerAccount
- _Gap to 🟢: needs a real customer to sign up, place an order, log back in, repeat (covered by UAT #5)_

### Reseller Program (commission tiers 0/5/10/15%) — 🔵 Built (one full session of UI work, no real reseller yet)
- 4-tier commission table by active-paying count
- Application → approval → onboarding emails
- Pending Restaurants page, Performance, Sales & Marketing kits
- Per-restaurant detail with service icons
- Payout request → manual transfer → webhook updates
- _Gap to 🟢: needs UAT #6 — real apply → approve → add restaurants → commission rollup → payout. No real payout has ever been issued_

### Compliance + Operational — 🟡 Mostly dev-tested
- Privacy Policy, Terms of Service, Refund Policy pages
- Sentry error monitoring
- Email deliverability (SPF / DKIM / DMARC)
- i18n: en / fr / es / it / pt translations
- Mobile admin responsiveness
- 16 GloriaFood-style React Email templates
- _Gap to 🟢: email deliverability only proven for transactional templates that have actually fired in dev; the unused templates (ScheduledOrderReminder etc.) have never sent. Sentry has logged dev errors but no prod incident has tested the alerting loop yet_

---

### Summary table — verification status at a glance

| Subsystem | Status | What unlocks 🟢 |
|---|---|---|
| Reports (16 sub-pages) | 🟡 Dev-tested | UAT #10 — real order populates Funnel + Visits + Heatmap |
| White-label Phase 1/2/2c | 🟡 Dev-tested | UAT #11 — reseller subscribes Full → real domain → branded login |
| Custom Domain (restaurant) | 🔵 Built | Real restaurant connects a real domain |
| Menu PDF Import | 🟡 Dev-tested (1 menu) | UAT #12 — 2-3 more menus, different cuisines |
| Kitchen Printer (LAN) | 🟡 Dev-tested | UAT #7 — real prod order prints physically |
| Capacitor apps | 🔵 Built / Scaffolded | TestFlight + Play Console builds |
| Marketing surfaces | 🟡 Dev-tested | Google indexes a landing page; embed lives on a real site |
| Visit + Funnel Tracking | 🔵/🟡 partial | Wire intermediate funnel steps (Phase 3 post-launch) |
| Stripe Connect | 🟡 TEST mode only | **Task #14 — LIVE switch + real $1 + refund** |
| Marketplace platform | 🟡 Dev-tested | First real restaurant goes live and gets browsed |
| Customer Accounts | 🔵 Built | UAT #5 — real customer signs up + orders + returns |
| Reseller Program | 🔵 Built | UAT #6 — real apply → approve → payout |
| Compliance / Email / Sentry | 🟡 Partial | First prod incident tests the alerting loop |

**Until Stripe LIVE is on and one real order has flowed all the way through Customer Account → Stripe → Kitchen Printer → Reports, treat the entire system as 🟡 at best.** That single end-to-end run is what flips everything connected by it from 🟡 → 🟠 → 🟢.

---

## Part 3 — Post-Launch Features (Mark "Coming Soon")

These show up in the product today but **don't actually work**. They need consistent "Coming Soon" badging so soft-launch restaurants don't try them and get frustrated. Task #118 will audit + brand them all consistently.

### 3.1 — Already correctly labeled "Coming Soon" ✅
- **Phone Ordering / AI agent** (`/admin/phone-ordering`) — full teaser landing page, no backend. Add-on has `comingSoon=true` flag in superadmin.

### 3.2 — Need to be labeled "Coming Soon" ⚠️

These have UI surfaces or add-on entries but **no working backend**:

**Audit complete 2026-05-27** — task #118 closed. Status of every row below:

| Feature | Entitlement Slug | Where It Appears | Status |
|---|---|---|---|
| **POS Module** | `in_house_pos` | Add-on catalog | ✅ Already flagged `comingSoon: true` in seed-addons.ts |
| **App Store Listing** | `app_store_listing` | Add-on catalog | ✅ Covered — bundled under `branded_mobile_app` parent (`comingSoon: true`) |
| **Branded PWA** | `branded_pwa` | Add-on catalog | ✅ Covered — bundled under `branded_mobile_app` parent (`comingSoon: true`) |
| **Branded Mobile App** (per restaurant) | `branded_mobile_app` | Add-on catalog (`AddOnsClient.tsx:26`) | ✅ Already flagged `comingSoon: true` |
| **Customer Segmentation** | `customer_segmentation` | Entitlement only, no UI | ✅ Covered by `advanced_promos` parent + banner on Autopilot page |
| **Automated Campaigns** (segment-based) | `automated_campaigns` | Autopilot | ✅ Amber "Segment-based targeting — Coming Soon" banner added to `AutopilotClient.tsx` above the campaign cards |
| **SerpAPI Rank Tracking** | (env-gated) | Google Ranking report | ✅ Already gracefully degrades with amber banner. Post-launch task #121 |
| **Marketplace iOS/Android Apps** | n/a | Marketplace page | ✅ Amber "Native iOS & Android apps — Coming Soon" section added to `src/app/marketplace/page.tsx` with PWA Add-to-Home-Screen instructions |
| **Per-restaurant Branded Mobile App** | n/a | Add-on catalog | ✅ Covered — `branded_mobile_app` add-on already `comingSoon: true` |
| **Cross-location Reports** | n/a | Reports area | ✅ Chain-wide revenue/orders/top-items/per-location breakdown **already shipped** in `BrandReports.tsx`. Added amber "Deeper chain-wide reports (Funnel, Visits, Heatmap, Connectivity, custom date ranges) — Coming Soon" banner. Original launch-plan claim was incorrect — basic chain reports work today |
| **Scheduled-order Email Reminders** | n/a | Internal template only | ✅ No badge needed — the checkout scheduling UI never promises a reminder email, so there's no false expectation. Wire the cron post-launch (Phase 4) |
| **Reservation Deposits** | `reservation_deposits` | Add-on catalog | ✅ Already flagged `comingSoon: true` |
| **Custom Domain via Cloudflare** | `custom_domain` (Cloudflare path) | Add-on catalog | ✅ Already flagged `comingSoon: true`. Vercel-backed path ships today |
| **Driver Pool** | (n/a) | Add-on catalog | ✅ Already flagged `comingSoon: true` (ShipDay REST not wired) |

### 3.3 — Suggested Coming Soon UI pattern

```tsx
<div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
  <div className="flex items-start gap-3">
    <Clock className="w-5 h-5 text-amber-600 mt-0.5" />
    <div className="flex-1">
      <h3 className="text-sm font-bold text-amber-900">
        {featureName} — Coming Soon
      </h3>
      <p className="text-xs text-amber-900 mt-0.5">
        {one-sentence-description}
      </p>
      <button className="mt-2 text-xs font-semibold text-amber-900 underline">
        Notify me when this launches →
      </button>
    </div>
  </div>
</div>
```

Don't show pricing on Coming-Soon features (or show "Pricing TBD"). Capture interested-owners' emails to build a wait-list — turn the deferred features into a marketing asset.

---

## Part 4 — Post-Launch Roadmap (priority-ordered)

After soft launch lands and we have first-customer feedback, ship these in this order:

### Phase 1 — Mobile parity with GloriaFood (week 1-3 post-launch)
- **Task #116** — Kitchen ring sounds (actually should be PRE-launch per Part 1, listing here for completeness)
- **Task #119** — Marketplace native iOS/Android apps to App Store + Play Store
- **Task #120** — Per-restaurant branded mobile app add-on (the big one)

### Phase 2 — Revenue features (week 4-8)
- **Task #117** — PayPal integration (also pre-launch per Part 1; here for completeness)
- **Customer Segmentation** + segment-based Autopilot campaigns
- **Phone Ordering AI agent** (wire backend to existing teaser)

### Phase 3 — Reports + SEO (week 8-12)
- **Task #121** — SerpAPI rank tracking cron + chart
- **Dashboard reads from ReportDailySnapshot** (scale optimization once 10k+ orders/month)
- **Cross-location reports** for brand parents (multi-restaurant rollups)
- **Funnel intermediate steps** wiring (currently visit→order_placed works; menu_browsed/item_added/etc only partially)
- **Weekly Reports email digest** (we have daily + monthly; weekly was discussed but skipped as email-overload — revisit based on owner feedback)

### Phase 4 — Polish + scale (post-week-12)
- **POS Module** (real integration with Square / Toast / Clover for in-store sync)
- **Branded PWA** add-on (per-restaurant PWA branding distinct from hosted site)
- **Scheduled-order email reminders** (template exists; cron not wired)

---

## Part 5 — The Notification Sound Issue (Luigi's specific callout) — CORRECTED

I previously claimed in this doc that "there is literally no notification sound code in the codebase." **That was wrong.** Luigi corrected me: the kitchen display has always had a sound. I had grepped for the wrong patterns (`Audio(` / `.mp3`) and missed the actual implementation, which uses the Web Audio API instead.

### What actually exists today

File: `src/app/admin/kitchen/KitchenDisplay.tsx` lines 425-554.

- **Synthesizer**, not a sample. `ringBellOnce()` builds a struck-bell tone from 4 sine partials at harmonic ratios 1.000 / 2.756 / 5.404 / 8.933, fundamental 880 Hz (A5), exponential decay 1.2s.
- **Loop** every 1500ms until silenced (comment says "≈ GloriaFood cadence").
- **Volume slider + mute toggle**, persisted in localStorage (`kds-alert-volume`, `kds-alert-muted`).
- **Autoplay unlock** on first pointer/keypress.
- **Test button** to preview one strike.
- **`silenceAlert()`** stops the loop on Acknowledge.

So the infrastructure is solid. The problem is that a synthesized 4-partial bell can't sound like the specific recorded ding from the GloriaFood video Luigi referenced — Luigi already flagged that one attempt to "match it" didn't actually improve anything.

### The real task #116

**Swap the synthesis for sample playback. Keep everything else.**

1. **Source audio from Luigi.** Extract the ding from his GloriaFood reference video, save as `public/sounds/gloriafood-ding.mp3`. Without the actual file, any picked-from-stock ding will miss again.
2. **Add additional options** for restaurants to choose from:
   - `gloriafood-ding.mp3` — loud, sharp, the one Luigi wants by default
   - `soft-chime.mp3` — single bell ~1s
   - `classic-ring.mp3` — telephone bell ~2s
   - `kitchen-alarm.mp3` — long alarm-style, kitchen-loud
3. **Replace the oscillator path in `ringBellOnce`** with `new Audio(selectedUrl).play()` — preserve the existing volume scaling (multiply `audio.volume` by the slider value), mute check, and loop scheduler.
4. **Sound-picker UI** in the kitchen settings panel (right next to the existing volume slider):
   - Dropdown: "Notification sound" → list of options
   - Test button (already exists — just point it at the new playback function)
   - Persist selection to localStorage (`kds-alert-sound`)
5. **Autoplay unlock and loop cadence stay as-is** — they already work.

Implementation: ~2 hours once the source audio file is in `public/sounds/`. No new dependencies needed — browser-native `Audio` element is enough.

---

## Part 6 — Mobile App Strategy (full picture)

You asked about three mobile apps. Here's the strategy across all of them:

### 6.1 — Kitchen Display app ✅ DONE
- Capacitor wrapping `feefreeordering.com/kitchen` in a native shell
- Native printer plugin (DirectPrinter via TCP socket) for Star printers
- Ready for App Store + Play Store submission
- AppId: `com.feefreeordering.kitchen`

### 6.2 — Marketplace customer app ⚠️ SCAFFOLDED (task #119)
- Capacitor config done (`capacitor.marketplace.config.ts`)
- AppId: `com.feefreeordering.marketplace`
- PWA already works today (manifest + install prompt on iOS Safari + Android Chrome)
- Native wrapper requires: `cap add ios/android` → icon generation → certs → store listings → submit
- Goes to App Store as "Fee Free Marketplace" — your customers download once, get every restaurant on the platform in one app

### 6.3 — Per-restaurant Branded App 🔵 NEW (task #120)
- This is the GloriaFood-style premium offering
- Each restaurant gets their OWN-branded iOS + Android app
- Same architecture as the marketplace app but with: their logo, their colors, their splash, their app name, their menu
- Implementation:
  - Capacitor config generated dynamically per restaurant (template-driven)
  - Web build serves at `feefreeordering.com/order/<slug>?embedded=branded-app`
  - We build + sign + submit on their behalf, OR they bring their own Apple/Google developer accounts
  - Updates ship via web deploy (remote-URL WebView) — no resubmission per change
- Pricing: TBD — probably a premium tier like $99-149/mo OR one-time setup + monthly hosting
- Big build — multi-week post-launch

### 6.4 — Why three apps (architecture)
Three apps are right because the audiences are different:
- **Kitchen app** → restaurant staff, locks to one restaurant context, has native printer
- **Marketplace app** → customers, all restaurants in one place, our brand
- **Branded app** → customers OF ONE specific restaurant, that restaurant's brand, monetized as add-on

All three use the same remote-URL WebView pattern so a web deploy updates all of them — no per-fix App Store review cycle.

---

## Part 7 — Risk Register for Soft Launch

Things that could go wrong on day 1:

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Restaurant signs up, no notification sound, misses orders | **HIGH** | Lost revenue + reputation | Task #116 must ship pre-launch |
| Restaurant wants to use PayPal | Medium | Lost signups (some won't use Stripe) | Task #117 should ship pre-launch OR be clearly badged "Stripe today, PayPal coming next month" |
| Confused owner clicks "Branded Mobile App" add-on, pays for it, gets nothing | Medium | Refund request + bad review | Task #118 — Coming Soon badging |
| Stripe LIVE keys forgotten / wrong | Low | Total payment failure | Task #14 + transaction test |
| Big restaurant uploads 200+ page menu, server times out | Low | Failed onboarding | Already mitigated by auto-splitter (commit 15bc4c8) — handles up to 400 pages |
| Customer hits checkout but card fails silently | Low | Cart abandonment | Existing error handling is robust; monitor Sentry day 1 |
| Reseller domain takes a customer's existing site offline | Medium | Restaurant loses other business | Pre-flight modal already warns; reseller has to acknowledge before connect |
| Custom-domain SSL fails to provision | Low | Domain shows browser warning | Vercel auto-retries; we surface error in admin UI |
| ShipDay misfires on dispatch | Medium | Driver doesn't show up | Existing ShipDay UAT (#67) covers this |
| Marketplace billing decrement bug we didn't catch | Low | We bill twice or zero | Already fixed (#18) — verified $3-per-order pipeline end-to-end (#30) |

---

## Part 8 — Soft Launch Day-Of Checklist

Print this and tape it next to your monitor on launch day:

### T-minus 24 hours
- [ ] All Claude work from Part 1.1 deployed + smoke-tested
- [ ] All UATs in Part 1.2 completed
- [ ] Stripe LIVE keys swapped (#14)
- [ ] One real transaction tested end-to-end through Stripe LIVE
- [ ] Coming Soon badges audit complete (#118)
- [ ] Sentry dashboard open + alerts configured
- [ ] Vercel logs streaming + alerts on 5xx > 5%
- [ ] All four `.env.example` files checked in for new restaurants
- [ ] Admin password rotated if anyone other than Luigi had it

### T-minus 1 hour
- [ ] Final `git status` clean
- [ ] Final Vercel deploy green
- [ ] One end-to-end test on prod: signup → setup → publish → order → kitchen receives → printer prints → refund test
- [ ] Customer support inbox monitored (luigi@... or similar)

### T-zero — invite the first 5-10 restaurants
- [ ] Send the welcome email manually (template exists)
- [ ] Personal Slack / WhatsApp / call follow-up within 1 hour
- [ ] Watch Sentry for the first hour
- [ ] Watch the orders endpoint for the first real order
- [ ] When the first order lands: photograph it, celebrate

### Day 1 post-launch
- [ ] Daily digest emails fire at 8am UTC
- [ ] Marketplace settlement cron runs (next month)
- [ ] Add-on subscriptions show correct invoice in Stripe
- [ ] No P0 bugs in Sentry
- [ ] Onboard the next batch based on first batch's experience

---

## Part 9 — Long-Term Wish List (Not Soft-Launch)

Pulled from various session discussions, recorded so we don't lose them:

- **Loyalty / rewards** (points per order, redemption, tiers)
- **Gift cards** (per restaurant + marketplace-wide)
- **Online catering quotes** with deposit flow
- **Group ordering** (one cart, multiple people contribute items)
- **Allergen filtering** on the order page (menu items already track allergens 1-14 per Italian standards)
- **AI menu translator** (paste English menu → get Italian + Spanish + Portuguese auto-translated)
- **Voice ordering** (customer-side: "Hey Siri, order from Luigi's") — separate from Phone Ordering (restaurant-side AI agent)
- **Driver app** for restaurants running their own delivery
- **Tablet kiosk mode** for in-store self-ordering
- **WhatsApp / SMS notifications** to customers (currently email-only)
- **Stripe Terminal** integration for in-store card payments via the kitchen tablet
- **Real-time order map** showing delivery driver positions
- **Customer reviews** + ratings (we link out to Google Business today; could host internally)
- **Loyalty integration** with existing programs (Fivestars, Punchh, etc.)
- **Inventory tracking** + auto 86-ing items when stock = 0
- **Multi-currency** (we display USD; need EUR for Italian restaurants like Luigi's UAT target, GBP, CAD)

---

## Part 10 — TL;DR For Luigi

**Soft launch ships when:**
1. Kitchen sounds shipped + you send me the GloriaFood ring audio file ✓
2. PayPal added ✓
3. Coming Soon badges everywhere ✓
4. You complete 9 UATs + Stripe LIVE switch ✓

**Everything else** in the product is either 🔵 Built or 🟡 Dev-tested — meaning it works in the happy path I or you have clicked through, but nothing is 🟢 Real-customer-verified yet. The 9 UATs + first batch of soft-launch restaurants are what move it from 🟡 to 🟢. Unwired features are honestly labeled "Coming Soon" so no one expects what isn't there.

**Post-launch priorities** in order:
1. Marketplace native apps to stores
2. Per-restaurant branded mobile app (the big revenue feature)
3. Customer segmentation + segment-based autopilot
4. Phone Ordering AI agent backend
5. SerpAPI rank tracking

**Sleep well. We're closer than it feels.**
