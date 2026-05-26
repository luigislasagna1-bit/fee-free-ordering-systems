# Fee Free Ordering Systems — Soft Launch Plan

_Compiled 2026-05-26 after the post-Reports / post-WhiteLabel / post-PDF-import session._

This document is the **single source of truth** for what ships at soft launch vs. what's marked "Coming Soon." Read top-to-bottom before launch day.

---

## Part 1 — What's Blocking Soft Launch

These are the only things between us and inviting the first batch of real restaurants. Everything else either works or is correctly badged as Coming Soon.

### 1.1 — Code work still needed (Claude can build)

| # | Item | Est | Status | Notes |
|---|---|---|---|---|
| 1 | **Kitchen notification sounds** (task #116) | 2-3h | Not started | ZERO sound code exists. Multiple ring options (soft chime, classic ring, **loud GloriaFood-style ding that auto-repeats**), settings UI to pick + volume, autoplay-unlock on first interaction. Luigi flagged the prior attempt didn't match the GloriaFood reference — **need the original sound file from his video to use as source**. |
| 2 | **PayPal integration** (task #117) | 1 day | Not started | Same GloriaFood-style model as Stripe (per-restaurant accounts, direct charges, we never hold funds). Adds option alongside Stripe at checkout. |
| 3 | **Coming Soon badging audit** (task #118) | 2-3h | Not started | Mark every unwired feature consistently so nothing pretends to work. Full list in Part 3. |

### 1.2 — User work (only Luigi can do these)

| # | Item | Est | Status | Notes |
|---|---|---|---|---|
| 4 | **Stripe LIVE mode switch** (task #14) | 30 min | Pending | Toggle to live mode → recreate Products/Prices → paste new `price_xxx` IDs into Vercel env → re-register webhook in live mode → test $1 transaction + refund. |
| 5 | **UAT: new-account E2E** (task #47) | 30 min | In progress | Fresh signup → setup wizard → first published order. |
| 6 | **UAT: reseller flow** (task #48) | 30 min | In progress | Apply → approve → add restaurants → commission rollup → payout. |
| 7 | **UAT: kitchen printer** (task #67) | 30 min | In progress | Real order → StarXpand → physical TSP143IIIW receipt. |
| 8 | **UAT: multi-location** (task #68) | 30 min | Pending | Parent → child location → menu inheritance → revert-to-brand. |
| 9 | **UAT: reservations E2E** (task #69) | 30 min | Pending | Customer books → admin pending → confirm → seated. |
| 10 | **UAT: Reports smoke-test** | 15 min | Pending | Incognito order → Funnel + Visits + Heatmap populate. |
| 11 | **UAT: Custom Domain flow** | 30 min | Pending | One reseller subscribes to Full → connects domain → DNS verification → branded login renders. |
| 12 | **UAT: Menu PDF import** | 10 min | Pending | Upload a real menu (incl. AYCE-style or 100+ pages) → items + categories appear. |

**Total Claude-side work to soft-launch-ready:** ~2 days. Luigi-side: ~4 hours of testing across 9 walkthroughs.

---

## Part 2 — What's Already Ready

These shipped during this session or earlier and are production-ready:

### Reports system (16 sub-pages, all wired)
- Dashboard with KPI cards + vs-prev-period deltas + first-order welcome state
- Sales → Trend + Summary (with chart/table toggle + previous-period overlay)
- Menu Insights → Categories + Items (with revenue % column)
- Online Ordering → Funnel (all 7 steps tracked), Clients (cohort analysis), Reservations, Connectivity Health (7-day timeline + per-day uptime), Promotions Stats, Website Visits (stacked-bar by channel), Delivery Heatmap (Leaflet, blue→red), Google Ranking (SEO health checklist — rank chart awaits SerpAPI)
- List View → Orders + Clients (paginated, sortable, unbounded exports)
- All 7 reports have working CSV/XLS export with active filters preserved
- 4-year data retention enforced in schema
- Daily ReportDailySnapshot rollup cron scheduled at 3am UTC

### White-label Phase 1 + 2 + 2c (complete)
- Basic ($9.99/mo) — imprint + logo on emails
- Full ($29/mo) — adds custom domain + branded login
- Custom domain end-to-end: connect, Vercel API, DNS records, registrar guides (GoDaddy/Namecheap/Cloudflare/etc), auto-poll every 20s, ETA banner, support escalation mailto, pre-flight modal, www/apex normalization, SSL via Let's Encrypt
- Superadmin audit panel at `/superadmin/resellers/<id>`

### Custom Domain for Restaurants ($9.99 add-on)
- Same Vercel-backed flow as reseller domain
- Pre-flight modal explaining DNS takedown risk + email safety
- Registrar guides (per-registrar steps)
- Auto-polling, ETA banner, support link
- www / apex matching

### Menu PDF Import
- Claude Sonnet 4.5 extraction with streaming (32k max_tokens)
- Auto-splits PDFs over 80 pages, merges results (deduped by category + item name)
- AYCE / fixed-price menus supported (items with $0 prices come through)
- Dedup on re-import (won't duplicate existing items)
- Pre-launch validated by Luigi: 125-page Italian menu → 239 items in one upload

### Kitchen Printer (Direct LAN)
- StarXpand SDK with native bitmap printing (TSP143IIIW verified working)
- mDNS auto-discovery + subnet scan
- Per-template receipt customization (live preview)
- Two workflow modes: Simple (GloriaFood-style accept-only) + Tracking (full state machine)
- Kitchen first-time tour
- PrintNode demoted to opt-in backup

### Capacitor Native Apps (foundations)
- **Kitchen Display app** — fully working, ready for store submission (commit 78)
- **Marketplace app** — Capacitor config scaffolded, awaits `npx cap add ios/android` + cert setup (commit 694d374)

### Marketing surfaces
- Hosted marketing site at `/site/<slug>` (Sales Optimized Website add-on)
- Programmatic SEO landing pages (`/{cuisine}-delivery-{city}`)
- Sticky nav + full-screen hero + Special Offers section pulling from active promotions
- Embed widget (3 modes: button, iframe, popup) with 4 position options
- Subdomain routing (`<slug>.feefreeordering.com`)
- Custom domain routing per restaurant

### Visit + Funnel Tracking
- Beacon on `/order/<slug>` AND `/site/<slug>` AND SEO landing pages
- Channel detection (utm + referrer + Vercel geo → direct/marketplace/email/organic/paid_ads/social/referral/affiliate/internal)
- 7-step funnel: visit → menu_browsed → item_added → checkout_open → checkout_info → payment_open → order_placed
- Rate-limited beacons (60/min visit, 120/min event)
- 4-year retention

### Stripe Connect (= GloriaFood model)
- Direct charges, restaurant owns the Stripe account, funds go directly to them
- Authorize-then-capture for delayed orders
- Marketplace settlement cron with monthly summary emails
- Refund handling including insufficient balance edge case
- White-label tier subscription with prorated tier-swap

### Marketplace platform (`feefreefood.com`)
- Browse page with search + cuisine filters + sort
- Per-restaurant tiles linking to order pages
- `?from=marketplace` attribution + card-only enforcement
- $3/order billing with monthly cap
- PWA manifest installable on phones (poor-man's native app)

### Customer Accounts
- Signup, login, password reset, email verification
- Address book + order history
- Cross-restaurant identity via CustomerAccount

### Reseller Program (commission tiers 0/5/10/15%)
- 4-tier commission table by active-paying count
- Application → approval → onboarding emails
- Pending Restaurants page, Performance, Sales & Marketing kits
- Per-restaurant detail with service icons
- Payout request → manual transfer → webhook updates

### Compliance + Operational
- Privacy Policy, Terms of Service, Refund Policy pages
- Sentry error monitoring
- Email deliverability (SPF / DKIM / DMARC)
- i18n: en / fr / es / it / pt translations
- Mobile admin responsiveness
- 16 GloriaFood-style React Email templates

---

## Part 3 — Post-Launch Features (Mark "Coming Soon")

These show up in the product today but **don't actually work**. They need consistent "Coming Soon" badging so soft-launch restaurants don't try them and get frustrated. Task #118 will audit + brand them all consistently.

### 3.1 — Already correctly labeled "Coming Soon" ✅
- **Phone Ordering / AI agent** (`/admin/phone-ordering`) — full teaser landing page, no backend. Add-on has `comingSoon=true` flag in superadmin.

### 3.2 — Need to be labeled "Coming Soon" ⚠️

These have UI surfaces or add-on entries but **no working backend**:

| Feature | Entitlement Slug | Where It Appears | Action |
|---|---|---|---|
| **POS Module** | `in_house_pos` | Add-on catalog | Already flagged in task #66; verify Coming Soon copy is current |
| **App Store Listing** | `app_store_listing` | Add-on catalog | Add Coming Soon badge — no implementation exists |
| **Branded PWA** | `branded_pwa` | Add-on catalog | Add Coming Soon — separate from hosted site; never wired |
| **Branded Mobile App** (per restaurant) | `branded_mobile_app` | Add-on catalog (`AddOnsClient.tsx:26`) | Add Coming Soon — needs task #120 to build |
| **Customer Segmentation** | `customer_segmentation` | Entitlement only, no UI | Build minimal "Coming Soon" UI in Marketing Tools area |
| **Automated Campaigns** (segment-based) | `automated_campaigns` | Autopilot exists but no segmentation | Add note: "Segment-based targeting coming soon" |
| **SerpAPI Rank Tracking** | (env-gated) | Google Ranking report (chart) | Already gracefully degrades with amber banner — leave as-is, mark task #121 for post-launch |
| **Marketplace iOS/Android Apps** | n/a | Marketplace page footer? Marketing site? | Until task #119 ships, add "Native apps coming soon" mention. PWA install works today. |
| **Per-restaurant Branded Mobile App** | n/a | Add-on catalog | Until task #120 ships, "Coming soon" treatment |
| **Cross-location Reports** | n/a | Reports area | Brand-parent dashboard works for single chain; multi-location aggregation referenced in `src/lib/brand.ts:234` as Phase 2 — defer or label |
| **Scheduled-order Email Reminders** | n/a | Email templates exist (`ScheduledOrderReminder.tsx`); cron not enabled | Either enable the cron or mark "scheduled-order reminders coming soon" in scheduling UI |

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

## Part 5 — The Notification Sound Issue (Luigi's specific callout)

You mentioned the previous GloriaFood-style ring attempt didn't copy correctly. Here's what I found:

**Status:** There is **literally no notification sound code in the codebase**. The kitchen page polls `/api/kitchen/orders` every 4 seconds via `KitchenDisplay.tsx` but never plays audio when newOrderCount goes up. No `.mp3` or `.wav` files in `/public`. No `Audio` constructor calls anywhere. **The prior "attempt" must have been a discussion that never got built.**

When task #116 is implemented, we need:
1. **The actual GloriaFood reference sound file from your video** — please save a copy and drop it in this repo at `public/sounds/gloriafood-style-ding.mp3` (or similar). Without that source, I'd be picking a stock notification chime that won't match.
2. **Multiple options to offer** so each restaurant picks their preferred ring:
   - Soft chime (single bell, ~1s)
   - Classic phone ring (telephone bell, ~2s)
   - **Loud ding (GloriaFood-style — the one you want)**: short, sharp, **repeats every 3 seconds until acknowledged**
   - Restaurant alert (long alarm-style, kitchen-loud)
3. **Settings UI** under `/admin/notifications` or `/admin/services`:
   - Dropdown: "When a new order arrives, play:" → pick sound
   - Slider: volume (0-100%)
   - Toggle: "Repeat until I tap Acknowledge"
   - Test button: plays the chosen sound now so the owner can preview
4. **Browser autoplay handling**: the first user interaction with the kitchen page unlocks audio. Show a small "Click anywhere to enable order sounds" banner until they do.
5. **Per-device persistence** via localStorage so each kitchen tablet remembers its setting independently.

Implementation: ~2-3 hours once we have the source audio.

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

**Everything else** in the product either works today, gracefully degrades, or will be honestly labeled "Coming Soon" so no one expects what isn't there.

**Post-launch priorities** in order:
1. Marketplace native apps to stores
2. Per-restaurant branded mobile app (the big revenue feature)
3. Customer segmentation + segment-based autopilot
4. Phone Ordering AI agent backend
5. SerpAPI rank tracking

**Sleep well. We're closer than it feels.**
