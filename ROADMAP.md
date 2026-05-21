# Fee Free Ordering Systems — Roadmap

> Snapshot as of 2026-05-21. This is a working plan, not a contract — phases
> can be reordered, scope can change, and some things will get cut. Use it
> to know what's queued and roughly what each phase is for.

## 🔬 Shipped 2026-05-21 — verify in prod

This batch landed on main on 2026-05-21. Each item needs a smoke test
against the live deployment before considering it done:

- Card-only enforcement on marketplace orders
- PAYG opt-in with Stripe SetupIntent card capture
- Auto-reject-stale-orders cron (every 5 min)
- Kitchen dispatch-mode toggle (`activeDispatchMode` column)
- Revert-to-brand-menu banner for child locations
- `/marketplace` published-only filter
- `setup_intent.succeeded` Stripe webhook handler

**External prerequisites:** `CRON_SECRET` set in Vercel env, Stripe
webhook subscribes to `setup_intent.succeeded` +
`checkout.session.completed`.

## Quick legend

- **🟢 Shipped** — code lives on `main` and is running in production
- **🟡 Open PR / awaiting merge** — branch exists, ready to land
- **🔵 Designed not built** — we've agreed on scope, code isn't written
- **🟣 Idea / parking lot** — discussed informally, no design yet
- **🔴 User action** — needs Luigi (or anyone with non-code access) to do it

---

## Currently shipped (recap, not in roadmap)

| Area | What |
|---|---|
| Kitchen UX | Continuous bell alert, silence button, single-strike test sound, GloriaFood-style alarm pattern |
| Kitchen UX | Test Order button that fires the full real-order pipeline (emails + bell + printout) |
| Kitchen UX | Reject Order with 7 preset reasons + Other custom textarea, auto-refund on reject for paid card orders, Reject button under Confirm/Cancel on the Accept Order prompt |
| Customer payments | Stripe Connect destination charges working end-to-end on prod |
| Customer payments | Email + name + phone all required at checkout (no more `(optional)` label) |
| Customer payments | Card orders deferred to kitchen until `payment_intent.succeeded` webhook fires |
| Customer payments | `statement_descriptor_suffix` so bank statements show "FEE FREE\* RESTAURANT NAME" |
| Customer payments | Connect `business_profile.name` snaps back to canonical restaurant name on every webhook |
| Multi-location | Master menu inheritance — brand sets menu, child locations inherit, child can "Customize" to break inheritance |
| Multi-location | Cross-location reports dashboard at `/admin/reports` for brand parents |
| Multi-location | Chain-wide promotions + coupons via `scope: "brand"` |
| Multi-location | Feature gate: child invites require `multi_location_management` entitlement |
| Marketplace M1 | Schema (`MarketplaceListing`, `ShipdayConfig`), AddOn seeds, entitlements |
| Marketplace M1 | Public `/marketplace` page (Fantuan-style grid) |
| Marketplace M1 | Admin `/admin/marketplace` page (locked view / editor / live preview) |
| Marketplace M1 | Auto-listing on subscription activate (webhook hook) |
| Ops | `scripts/push-schema-to-both.ts`, `scripts/reset-password-on-prod.ts`, `scripts/audit-both-dbs.ts` to manage the two-Neon-DB setup |

---

## Phase A — Open PRs (merge in any order)

These are sitting on GitHub waiting for the green button. Each is independent.

### 🟡 `marketplace-phase-m2` — savings tracker + smart-billing snapshot
Customer-side marketplace ribbon on `/order/[slug]?from=marketplace`. Every
marketplace order gets stamped with `viaMarketplace=true` and
`savedVsUberEatsCents`. `/admin/marketplace` gets a lifetime savings
hero card + "this month" stats + live smart-billing readout showing
whether per-order or flat cap is winning this cycle.

→ https://github.com/luigislasagna1-bit/fee-free-ordering-systems/pull/new/marketplace-phase-m2

### 🟡 `fix-admin-pages-logout-superadmin` — bug fix
Stop bouncing superadmins to `/login` when they click Add-ons (or
Publishing / Legacy Website / Notifications / Map Settings). Was an
infinite redirect loop that looked like being logged out.

→ https://github.com/luigislasagna1-bit/fee-free-ordering-systems/pull/new/fix-admin-pages-logout-superadmin

### 🟡 `roadmap-doc` — this file

---

## Phase B — Setup wizard + completion tracking (GloriaFood plan, Phase 2)

The big strategic plan saved in `~/.claude/plans/` had this as Phase 2 and
we haven't touched it. **Highest-priority remaining strategic piece**
because it unblocks the entire signup → activate funnel.

🔵 Scope:
- New "Setup progress" sidebar group at the top of `/admin`
- Each setup step shows green ✓ or ○ based on real Restaurant data
  (has menu items, has hours, has at least one service, has notification
   recipient, has payment provider configured, etc.)
- Sticky "Setup X% complete" banner in `AdminHeader` until done
- Reorganize the 13 flat sidebar items into 7 named sections matching
  the GloriaFood screenshot: Restaurant Basics / Services & Opening
  Hours / Payment Methods & Taxes / Taking Orders / Menu Setup /
  Publishing / Payments-Billing
- Setup completion gates publishing — `Restaurant.publishedAt` stays
  null until required steps are checked
- The setup checklist data layer already partially exists
  (`src/lib/setup-checklist-loader.ts`) — needs the UI built around it

Estimated size: ~600 lines of UI + minor backend tweaks. 1 PR.

---

## Phase C — Marketplace M2.5 (billing reconciliation)

The M2 PR shows the smart-billing math in the UI but Stripe still
charges the flat $199.99 each cycle. M2.5 closes the loop.

🔵 Scope:
- Monthly cron (or queue) at end-of-cycle: read each marketplace
  subscriber's `currentMonthOrders` × per-order rate. If lower than
  flat cap, issue a Stripe credit (or use Stripe metered billing /
  usage-based pricing API to charge the lower amount directly)
- Counter decrement on order cancel/refund — currently if a marketplace
  order is rejected the counter stays inflated by 1
- Email the restaurant a "Your marketplace bill" summary at end of
  cycle showing: orders, revenue, what UE would have charged, what
  we charged, savings

Estimated size: ~400 lines, a Vercel cron config, an email template. 1 PR.

---

## Phase D — Marketplace M3: ShipDay driver pool

🔵 Scope:
- ShipDay client lib (`src/lib/shipday.ts`) — typed wrapper around
  ShipDay's REST API for create-order, get-tracking-link, cancel
- New `/admin/delivery/pool` admin page — paste API key (encrypted at
  rest with platform `ENCRYPTION_KEY`), test-connection button,
  delivery-fee strategy config (pass-through / flat / tiered)
- **NEW kitchen display tab: "Delivery"** (per user's clarification —
  global setting, NOT per-order). Two routing modes:
  - In-store drivers (manual) — current behavior, default
  - Driver Pool (auto-dispatch to ShipDay) — every accepted delivery
    order pushes to ShipDay on accept
  Switching the mode is forward-only: already-accepted orders keep
  whatever routing they were dispatched under.
- Webhook handler at `/api/webhooks/shipday` — updates order status
  as ShipDay reports assignment → pickup → dropoff
- Per-restaurant delivery-fee logic at order creation time:
  customer pays what `ShipdayConfig.deliveryFeeMode` says; restaurant
  absorbs the gap if any. (Tiered rules let restaurants offer free
  delivery over a threshold, etc.)
- Kitchen receipt prints include ShipDay tracking link when applicable
- Entitlement gate: route only fires if `driver_pool` entitlement
  (granted by either the marketplace add-on or standalone driver_pool
  add-on) is active

Estimated size: ~1000 lines. 1 large PR or 2 sequential PRs.

---

## Phase E — Publishing module + Legacy Website widget (GloriaFood Phase 3)

Saved as Phase 3 of the original GloriaFood plan. Adjacent to the
Marketplace work — this builds the **embeddable widget** so a restaurant
can paste a snippet onto their existing website and accept orders without
sending the customer to our domain.

🔵 Scope:
- `Restaurant.widgetPublicId` (already in schema, set lazily on first publish)
- `/admin/publishing/legacy-website` rendering the embeddable HTML snippet
  the restaurant copy-pastes. Already partially built — needs the widget
  builder pulled together.
- Public `/embed/widget.js` script that drops an iframe-launcher button
  on the restaurant's site. Click → opens `/order/[slug]` in a modal
  iframe.
- `requireSetupComplete()` middleware guard preventing publish if
  required setup steps are open (depends on Phase B)
- Hosted Website tile in publishing → marked "Upgrade" (locked behind
  `hosted_marketing_page` entitlement, granted by the
  `hosted_website` add-on)

Estimated size: ~800 lines. 1 PR. Depends on Phase B for the setup-complete
gate.

---

## Phase F — Hosted website generator (GloriaFood Phase 6)

When a restaurant activates the `hosted_website` add-on, we generate a
public marketing page at `<slug>.feefreeordering.com` using their
existing data (logo, banner, hours, menu, theme).

🔵 Scope:
- Public route `/site/[slug]` (some scaffolding already exists)
- Wildcard subdomain routing — `*.feefreeordering.com` → `/site/<sub>`
- Re-uses `Restaurant.themeSettings`, `logoUrl`, `bannerUrl`, hours, menu
- Each location's hosted site reads its own menu (inheriting from
  parent if `useBrandMenu`)
- Custom domain support comes after (it's a separate `custom_domain`
  add-on — already in the catalog)

Estimated size: ~700 lines. 1 PR.

---

## Phase G — Marketplace M4: PWA + native shell + subdomain

🔵 Scope:
- PWA manifest + service worker for `/marketplace` so customers can
  "Add to Home Screen" and use it offline-friendly
- React Native (or Capacitor) wrapper for iOS/Android app store
  presence — opens the same `/marketplace` web view inside a native
  shell with push notifications
- Move marketplace to `marketplace.feefreeordering.com` subdomain so
  it has a proper standalone identity (separate from `<restaurant>.feefreeordering.com`)
- Customer accounts unified across the marketplace — sign in once,
  reorder from any restaurant you've ordered from before

Estimated size: PWA is small (~200 lines), native shell is a separate
project (~1-2 weeks of dedicated work), customer-account unification
is medium-sized (~600 lines + new schema).

---

## Phase H — Kitchen device tracking completion (GloriaFood Phase 4)

🔵 Scope:
- The `KitchenDevice` schema and `/api/kitchen/heartbeat` endpoint
  already exist. Missing: surface "Order-taking app connected:
  <device> · <Xs ago>" in the publishing checklist as a required step.
- Block publishing if no kitchen device has been seen recently.

Estimated size: ~100 lines. Tiny PR.

---

## Phase I — Cleanup / polish (idea pile)

🟣 Items mentioned in passing but never planned in detail. Group cleanup
PR or individual small PRs:

- **Marketplace search + filters** — currently the search bar on
  `/marketplace` is disabled. Restaurants filter by cuisine/tag/city/sort.
- **Marketplace M2 follow-ups**:
  - Counter decrement on order cancel
  - Email summary at end of billing cycle
- **Per-item availability override for inherited menus** — currently
  master menu is all-or-nothing. M5: child can override price /
  sold-out for specific items while still inheriting the rest.
- **Reseller polish** — reseller payout flow, commission dashboard, etc.
- **i18n for marketplace pages** — currently English-only. Need to
  translate /marketplace + /admin/marketplace into fr/es/it/pt.
- **Customer accounts** — currently every order creates a new Customer
  row tied to email. Real "create account" flow doesn't exist;
  customer history is read-only.
- **Branch hygiene** — 22 remote branches; most already merged. Sweep
  after every PR lands.
- **ShipDay live integration** — schema/UI exist (`activeDispatchMode`,
  DispatchModeToggle, DriverPoolClient). Missing: actual `src/lib/shipday.ts`
  REST wrapper, `/api/webhooks/shipday` status handler, kitchen receipt
  printing of tracking link. See Phase D.

---

## User actions (no code — Luigi only)

🔴
1. **Set add-on prices** in `/superadmin/add-ons` for Marketplace,
   Driver Pool, Multi-Location, Online Payments, etc. Click **Sync to
   Stripe** on each. Until prices are non-zero, the Subscribe button
   on `/admin/billing/add-ons` shows "Coming soon".
2. **Archive abandoned "Luigi's Lasagna & Pizzeria" Restricted Stripe
   Connect account** — the duplicate Connect account that's not the
   live one.
3. **DNS for `luigispizzapastawings.com`** — point to Vercel + add
   the domain in Vercel + set env vars + redeploy. (Stalled since
   2026-05-15.)
4. **Change `admin@feefreeordering.com` password** away from
   `FeeFree2026!` — it's been visible to me in chat. Change it from
   the admin profile UI.

---

## Constraints / non-goals

- **No native customer payment flow on iOS/Android (Phase G)** — Apple/Google
  take 30% from in-app purchases. Marketplace orders MUST be processed
  via web view + Stripe (which Apple allows for "physical goods like food")
  to avoid the 30% commission, which would defeat the entire value prop.
- **No multi-language UI for the marketplace itself in M1-M3** — the
  restaurant order pages have i18n; the marketplace landing page is
  English-only until Phase I.
- **No customer accounts in M1-M3** — order history is per-restaurant
  (looked up by email at checkout), not a unified marketplace identity.

---

## What I'd do next, if it were me

1. Merge Phase A PRs (M2, fix, this doc)
2. Phase B (setup wizard) — highest-leverage strategic piece. Every
   new restaurant we get hits this first.
3. Phase D (ShipDay) — biggest practical unlock for restaurants who
   don't have their own drivers, AKA most of them.
4. Phase E (publishing widget) — gets us GloriaFood feature parity
   for restaurants who want to keep their existing website.
5. Phase C (M2.5 billing reconciliation) — bookkeeping cleanup; can
   wait until you actually have a paying marketplace customer.

But that's just my read. Tell me what hurts most and we'll work on that.
