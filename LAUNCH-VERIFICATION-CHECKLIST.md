# Launch Verification Checklist

**Built:** 2026-06-02
**Scope:** every change shipped in the last ~7 days (since 2026-05-26) that we have NOT yet smoke-tested live.

Work through one domain at a time. Each item has:

- **Where** — the URL / surface to test on
- **Do** — the steps
- **Pass** — what success looks like

When something fails or surprises you, mark it ❌ and note the actual behaviour. Don't move on — those are the bugs that ship.

---

## 🛒 1. Customer order flow

### 1.1 Marketing-consent checkbox (Luigi 2026-06-02)
- **Where:** `/order/<slug>` checkout
- **Do:** Add an item → Checkout. Type your email.
- **Pass:**
  - Checkbox appears **pre-ticked**.
  - You can untick it.
  - Place an order with it ticked → check `/admin/customers` (or DB) — customer's `marketingConsent` = true, `marketingConsentAt` is set.
  - Repeat untick → customer record stays `marketingConsent = true` (sticky — checkout doesn't downgrade; profile page is the canonical opt-out).

### 1.2 Marketing-consent in profile
- **Where:** `/order/<slug>/account`
- **Do:** Log in as a customer who opted in at checkout.
- **Pass:**
  - Profile editor shows the marketing toggle reflecting their actual DB state.
  - Untick → save → DB `marketingConsent` flips to false + `marketingConsentAt` cleared.

### 1.3 Customer menu search — toggle ON (default)
- **Where:** `/order/<slug>` (any restaurant that hasn't touched the toggle)
- **Pass:** Magnifying-glass search bar shows above category pills. Typing filters items live.

### 1.4 Customer menu search — toggle OFF
- **Where:** `/admin/service-fees` → toggle "Customer menu search" OFF → save → open `/order/<slug>` in incognito.
- **Pass:** Search bar is gone. Category pills still work. Toggle back ON → bar returns.

### 1.5 Split First / Last name + email label fix
- **Where:** `/order/<slug>` checkout contact section
- **Pass:**
  - Two side-by-side fields: First, Last (no single "Full Name").
  - Required-field asterisks render once, not twice.
  - Email field labeled "Email" (or correct translation), not duplicated.

### 1.6 Category scroll arrows on desktop
- **Where:** `/order/<slug>` with enough categories to overflow the pill row, on a wide screen.
- **Pass:** Left/right chevron arrows appear when the row overflows; clicking nudges the scroll smoothly. Hidden on mobile.

### 1.7 Schedule picker honours midnight-wrap hours
- **Where:** A restaurant with hours like 11 AM → 12 AM (or 11 AM → 2 AM). `/order/<slug>` checkout → switch to "Schedule for later".
- **Pass:** TODAY shows slots up to closing time, not "Closed this day".

### 1.8 Earliest schedule slot honours prep time
- **Where:** Restaurant with `estimatedPickup: 20` min. Open the schedule picker.
- **Pass:** Earliest selectable slot is at least `now + 20 min`, not "now".

### 1.9 Catering 24h gate (tz-aware)
- **Where:** Restaurant with a category or item flagged `isCatering` and `cateringNoticeHours = 24`.
- **Do:** Add the catering item → checkout → try scheduling within 24 hours.
- **Pass:** Earliest slot is `now + 24h` in **restaurant's local time**, not UTC. Submit-time validation also blocks anything sooner.

### 1.10 Tips toggle OFF
- **Where:** `/admin/service-fees` → turn Customer tips OFF → place an order on `/order/<slug>`.
- **Pass:** No tip selector at all; total has no tip line; even a tampered client value gets clamped to 0 server-side.

### 1.11 Per-restaurant currency
- **Where:** `/admin/service-fees` → change currency to EUR / CAD / GBP → reload `/order/<slug>`.
- **Pass:** Every price renders with the right symbol (€ / $ / £). Stripe / PayPal charge in that currency. Receipt + email totals match.

---

## 🍕 2. Pizza Builder

### 2.1 Per-group Half/Half flag
- **Where:** `/admin/menu` → edit a pizza item's modifier group → flip "Supports Half/Half" → save → open the pizza on `/order/<slug>`.
- **Pass:** Only the groups with the flag show Whole/Left/Right tabs. Groups without it stay single-mode.

### 2.2 Left/Right tab actually records halves
- **Where:** Pizza Builder → pick a topping under the "Left Half" tab.
- **Pass:** Cart line shows it as "Left half pepperoni" (or similar), not "pepperoni" with no half. Same for Right.

### 2.3 Included-topping credit covers both halves at 1/2 each
- **Where:** Pizza with 2 included toppings. Pick L=pepperoni + R=mushroom.
- **Pass:** Both halves come out free (each consumes half a credit). No phantom L+R duplicate charge.

### 2.4 Same modifier option multiple times when `maxPerOption > 1`
- **Where:** Pizza with a topping group where the option has `maxPerOption = 2` or more.
- **Pass:** You can pick "Extra Pepperoni" twice; cart shows ×2.

### 2.5 Stale Pizza Builder role IDs drop cleanly
- **Where:** Edit a pizza item that was created when the menu had different mod groups. Open the section-order editor.
- **Pass:** No ghost rows for groups that no longer exist; order persists across save.

### 2.6 Item-level + category-level modifier dedup
- **Where:** Item with a modifier group also attached to its parent category. Open the item on the customer page.
- **Pass:** Group appears once, not twice.

---

## 🧑‍🍳 3. Kitchen Display (`/kitchen`)

### 3.1 Settings button (renamed from "Status") — top bar
- **Where:** `/kitchen` header
- **Pass:** Button reads **"Settings"** (not "Status"). When any service is paused it reads "⏸ Paused".

### 3.2 Item availability / pricing tab
- **Where:** Settings → Item availability / pricing tab
- **Pass:** Tab heading reads "Item availability / pricing" (not "Out of stock"). Each row has a price input LEFT of the Mark out / Restock button.

### 3.3 Inline price edit propagates everywhere
- **Where:** Same tab. Pick an item, change `$12.99 → $13.49`, blur (or Enter).
- **Pass:**
  - Toast: "Price updated to $13.49".
  - Refresh `/admin/menu` — new price shows there.
  - Refresh `/order/<slug>` — new price shows on the customer page.
  - Place an order — receipt + email use the new price.

### 3.4 Mark out / Restock from kitchen
- **Where:** Same tab.
- **Pass:** Toggle to "Mark out" → customer page greys the item out and blocks add-to-cart. Toggle to "Restock" → returns to normal.

### 3.5 Pause services
- **Where:** Settings → Pause services. Pick a service → Pause 30 min.
- **Pass:** Service-specific pause banner shows on `/order/<slug>`; orders for that service are blocked. After the time passes (or you tap Resume) the service auto-resumes.

### 3.6 GloriaFood-parity tabs
- **Where:** `/kitchen` main view.
- **Pass:**
  - **All** tab: orders + reservations interleaved chronologically. Countdown chip hides at `00:00`.
  - **In Progress** tab: TODAY group above, LATER group below. All today's accepted orders stay visible until end-of-day (including ones already past their ETA).
  - **Complete** tab: shows orders moved to complete. Countdown chip hidden.

### 3.7 Live countdown on order card
- **Where:** Accept a pending order → watch the card.
- **Pass:** Card shows live `MM:SS` countdown ticking down. Card itself doesn't reposition every second (countdown lives in a stable corner).

### 3.8 Single-active-session enforcement
- **Where:** Log into `/kitchen/login` on Device A. Then log in on Device B with the same creds.
- **Pass:** Device A's next heartbeat returns 401 → it's auto-logged-out with a "session superseded" message. Device B keeps working.

### 3.9 Server-side cleared-orders
- **Where:** Tablet A clears a completed order. Tablet B (same kitchen, signed in fresh after the single-session fix above) refreshes.
- **Pass:** That order is also cleared on Tablet B.

### 3.10 Auto-accept + auto-print
- **Where:** Restaurant with auto-accept on for pickup. Customer places a pickup order.
- **Pass:**
  - Order arrives in **In Progress** (skips Pending), single chime fires once.
  - Receipt prints automatically to the LAN / PrintNode printer.
  - `estimatedReady` = `now + estimatedPickup` for ASAP, OR = `scheduledFor` for a scheduled order.

### 3.11 Scheduled orders skip prep-time prompt
- **Where:** A customer schedules an order for 8 PM. Manual-accept restaurant.
- **Pass:** Kitchen sees the order. Accepting it does NOT pop the "How long?" prep prompt — confirms straight for the chosen slot.

### 3.12 Reservation chime + 4 s poll
- **Where:** Customer makes a reservation on `/order/<slug>/reservation`. Watch the kitchen tab in another window.
- **Pass:** Reservation appears within ~4 seconds (not 30). Chime fires once.

### 3.13 End-of-day report
- **Where:** `/kitchen` header → End-of-day button → modal opens.
- **Pass:**
  - Stats render: sales today vs same-time yesterday, order count, AOV, reservations.
  - Print button → receipt printer emits a properly formatted 80mm slip with the same numbers.
  - Same data shows at `/admin/reports/end-of-day`.

### 3.14 Custom kitchen ring upload
- **Where:** `/admin/profile` → upload a custom alarm sound.
- **Pass:** KDS Sound Settings modal lists it as a third option alongside GloriaFood Ding + Classic Bell. Selecting it and triggering a test → custom track plays.

---

## 👤 4. Customer accounts (`/order/<slug>/account`)

### 4.1 Forgot + reset password
- **Where:** `/order/<slug>/account/login` → "Forgot password?".
- **Pass:** Email arrives with the reset link. Link lands on reset page. New password works on login.

### 4.2 Forgot-password robust for guest-created customers
- **Where:** Customer who has ordered as guest (no password set) hits "Forgot password".
- **Pass:** Email arrives anyway (no silent skip). Friendly "set your password" UX walks them through.

### 4.3 Robust to duplicate Customer rows
- **Where:** Customer with multiple Customer rows for the same email (multi-location chain or import).
- **Pass:** Login + forgot-password both work; the right row is selected (most recent / has password).

### 4.4 Per-restaurant customer dashboard
- **Where:** `/order/<slug>/account` after login.
- **Pass:**
  - Profile editor (name, phone, email — email is immutable here).
  - Personal coupons rail.
  - Order Again rail (top 3 successful past baskets).
  - Recent orders list.
  - Sign out works.

### 4.5 Order Again one-click reorder
- **Where:** Click "Order again" on a past basket.
- **Pass:** Lands on `/order/<slug>?reorder=<id>` → cart is pre-loaded with those items; modifier choices preserved.

### 4.6 Saved delivery addresses
- **Where:** `/order/<slug>/account` → address book section.
- **Pass:** Add address → it persists. Selecting it on a future checkout auto-fills the address fields.

### 4.7 Marketing-consent toggle in profile (see 1.2 above)

### 4.8 Marketplace account features parity
- **Where:** `/account` (marketplace-wide, not per-restaurant) after login.
- **Pass:** Same features ported: profile editor, order history, marketing toggle reflects state.

---

## 📅 5. Reservations

### 5.1 Reservation page exists standalone
- **Where:** `/order/<slug>/reservation` directly (not via `/order/<slug>` first).
- **Pass:** Page renders. Day picker + time slots show.

### 5.2 Book a Table CTA goes straight there
- **Where:** Any "Book a Table" button on `/order/<slug>`.
- **Pass:** Goes to `/reservation` directly (no detour).

### 5.3 Time slots render — closed-day soft warning
- **Where:** Pick a day the restaurant is closed.
- **Pass:** Slots still appear (permissive fallback) with a soft warning, or auto-jumps to the next open day if admin marked it strict-closed.

### 5.4 Hides past + sub-minNotice slots when picker is today
- **Where:** Pick today on the reservation date picker.
- **Pass:** Past times are hidden. If `reservationMinNoticeHours` is 1, slots within the next hour are also hidden.

### 5.5 Validator is timezone-aware
- **Where:** Restaurant in EST, server in UTC. Pick a slot that's valid local time but borderline UTC.
- **Pass:** Server accepts it (no "must be in the future" error when local time says it IS).

### 5.6 12h vs 24h format honoured
- **Where:** `/admin/profile` → hoursFormat = 12h → reservation picker.
- **Pass:** Slot labels render as "6:30 PM", not "18:30". Switch to 24h → reverse.

### 5.7 Owner-pickable interval
- **Where:** `/admin/reservations` settings → set interval to 30 min → reservation picker.
- **Pass:** Slots appear every 30 min, not every 15.

### 5.8 Manual/auto acceptance toggle
- **Where:** `/admin/reservations` settings → flip manual ↔ auto.
- **Pass:**
  - **Manual:** new reservations land Pending in kitchen, owner accepts/rejects, customer email fires on accept.
  - **Auto:** reservation auto-confirms instantly, kitchen chime fires once, receipt auto-prints.

### 5.9 Reservation auto-print receipt (PrintNode + LAN)
- **Where:** Auto-acceptance ON. Customer reserves a table.
- **Pass:** A reservation slip prints automatically — same format as orders, with "RESERVATION" header + table info.

---

## ⏰ 6. Hours (the silent killers)

### 6.1 Midnight-wrap detection
- **Where:** Restaurant with `openTime: "11:00"`, `closeTime: "00:00"` or `"02:00"`.
- **Pass:** `/order/<slug>` shows "Open" at 11 PM (not "Closed"). Customer schedule picker shows post-midnight slots correctly attributed.

### 6.2 Pick default row over service-scoped row
- **Where:** Restaurant has BOTH a default day row AND a service-scoped row (delivery-only) for the same day.
- **Pass:** "Open now" check uses the default row, not falsely reporting closed because the service-scoped row is narrower.

### 6.3 Per-service hours overrides (UI)
- **Where:** `/admin/hours` tab.
- **Pass:** Owner can set separate hours for pickup / delivery / reservations. Saving persists. Customer-page service-availability respects it.

### 6.4 "We're closed" false-positive fix
- **Where:** Restaurant with a service-scoped row but no default. Try ordering during normal hours.
- **Pass:** Page does NOT show "We're closed"; falls back to the OPEN service row.

---

## 🎟️ 7. Promos & marketing

### 7.1 Banner promos on `/order/<slug>` top
- **Where:** Active promo with `showOnBanner = true`.
- **Pass:** Tile appears at top of the customer page. Click → modal opens with description.

### 7.2 Promo tile image rendering
- **Where:** Promo with an uploaded image AND a promo with the stock food-promo fallback.
- **Pass:** Both render with the GloriaFood split layout (image left, text right). NO black boxes on mobile or on custom-domain restaurants. Test on Luigi's custom domain specifically.

### 7.3 Day + time USABLE constraints (tz-aware)
- **Where:** Promo configured Happy Hour 12:00–15:00, day = Tue/Thu only.
- **Pass:**
  - Banner shows all day (tile visibility ≠ usability).
  - Try applying at 11 AM Tuesday → engine refuses ("Not in happy hour").
  - Try Wednesday at 1 PM → engine refuses ("Not the right day").
  - Apply Tuesday at 1 PM → works. Engine evaluates in **restaurant** tz, not UTC.

### 7.4 13 promo types — engine + wizard
- **Where:** `/admin/promotions` → create each of the 13 types via the 3-step wizard.
- **Pass:** Each saves. Customer-facing walkthrough (modal) renders correctly per type. Eligible items / bundle slots / freebie pool show up where appropriate.

### 7.5 8 restriction rules
- **Where:** Happy Hour / Delivery Area / Cart Value / Payment / Expiration / Client Type / Frequency / Exclusivity.
- **Pass:** Each restriction enforces on `/api/orders` POST. Try violating each and confirm rejection or non-application.

### 7.6 First-Buy promo (Kickstarter)
- **Where:** New customer (never ordered) places first order on a restaurant with First-Buy enabled.
- **Pass:** Discount applies automatically. Second order from same customer → no discount.

### 7.7 Invite Prospects (CSV blast)
- **Where:** `/admin/marketing/kickstarter` → upload a CSV → send.
- **Pass:** Email lands. Tracking link records who clicked.

### 7.8 Autopilot (re-engage)
- **Where:** Customer who hasn't ordered in 60% of avg interval / 6 months.
- **Pass:** Re-engagement email fires per the schedule. Confirm in Resend dashboard.

### 7.9 Cart abandonment
- **Where:** Add items on `/order/<slug>` → don't check out → wait 1–2 h.
- **Pass:** CartSession was tracked. Abandonment email fires once at the trigger window. Doesn't re-fire endlessly.

### 7.10 Promo applied to receipts + confirmations
- **Where:** Place an order with a promo applied.
- **Pass:** Customer email / order status page / kitchen receipt / admin order detail all show the promo line + discount.

---

## 📧 8. Email notifications

### 8.1 Per-restaurant From header
- **Where:** Place an order from "Luigi's Pizza" → check the order-confirmation email.
- **Pass:** From line reads "Luigi's Pizza <orders@feefreeordering.com>" (or your domain), not just the generic "Fee Free Ordering Systems".

### 8.2 Refund language differs per payment method
- **Where:** Reject an order paid by Stripe (auth-only, not captured) vs paid by cash.
- **Pass:**
  - Stripe (uncaptured): "Your card was NOT charged."
  - Stripe (captured) or PayPal: "A refund will be processed within X days."
  - Cash: no payment language.

### 8.3 Phone number prominent in negative-status emails
- **Where:** Order delayed or rejected.
- **Pass:** Restaurant phone number renders as a tap-to-call line near the top, not buried in the footer.

### 8.4 Order confirmation does NOT fire on rejected orders
- **Where:** Reject an order in kitchen.
- **Pass:** Customer gets only the rejection email, not also the original confirmation. Check Resend log.

### 8.5 Marketing emails respect consent
- **Where:** Customer with `marketingConsent = false`.
- **Pass:** Cart-abandonment + re-engage emails do NOT fire to them. Transactional (order confirm) still fires regardless of consent — that's required.

---

## 🖨️ 9. Printing

> The ESC/POS bytes pipeline is GOLDEN per CLAUDE.md. Don't modify it — verify it still works.

### 9.1 Auto-print on auto-accept (orders)
- **Where:** Auto-accept restaurant. Place an order.
- **Pass:** Receipt prints within a few seconds. Same content as manual-print.

### 9.2 Auto-print bypasses per-printer autoprint toggle on auto-accept
- **Where:** Printer's autoprint flag is OFF, but order auto-accepts.
- **Pass:** Print still fires (autoprint on the auto-accept path overrides the per-printer toggle).

### 9.3 Reservation receipts auto-print
- **Where:** Auto-confirmed reservation.
- **Pass:** Slip prints. Header reads "RESERVATION" (not "ORDER"). Includes party size, time, name.

### 9.4 Direct LAN printing for reservations
- **Where:** LAN printer (Star TSP143IIIW) is set as the kitchen's printer.
- **Pass:** Reservation slip prints over LAN (not via PrintNode cloud).

### 9.5 Single chime on auto-accepted orders + reservations
- **Where:** Auto-accept everything. New order or new reservation arrives.
- **Pass:** Exactly one chime per event (not none, not three).

---

## 📱 10. Mobile + responsive

### 10.1 Admin report tables — no horizontal overflow
- **Where:** `/admin/reports/*` on a mobile width.
- **Pass:** Tables fit within viewport; scroll horizontally inside the card if needed but don't blow out the page.

### 10.2 Promo wizard picker not cut off
- **Where:** `/admin/promotions/new` step pickers on mobile.
- **Pass:** Bottom of the picker is reachable; no cut-off below the modal.

### 10.3 Order page header doesn't overflow mobile
- **Where:** `/order/<slug>` on a 360 px viewport.
- **Pass:** Header logo + name + nav fit in one row or wrap cleanly.

### 10.4 Promo tile correct size + image rendering on mobile
- **Where:** `/order/<slug>` with promo tiles on mobile.
- **Pass:** Tile is ~previous size (not bloated). Background image renders (no black box). Text is legible against the gradient curtain.

### 10.5 Reservation button sizing
- **Where:** `/order/<slug>` mobile.
- **Pass:** "Reserve a table" / "Book a Table" button is sized larger than secondary buttons and clearly labeled.

---

## 🏢 11. Multi-location & reseller

### 11.1 Multi-location child inherits brand menu, local hours
- **Where:** Brand parent + 2 child locations. Customer visits child URL.
- **Pass:** Menu = brand menu (parent's items). Hours / delivery fee / tax / Connect destination = local to the child. Order persists at the child.

### 11.2 Brand-scope promos surface on children
- **Where:** Parent has a `scope: "brand"` promo. Visit a child location.
- **Pass:** Promo tile shows on child's customer page too.

### 11.3 Reseller branded domain
- **Where:** Reseller's custom-domain login.
- **Pass:** Login is strictly scoped to that reseller (can't accidentally log in as a different reseller's user). Generic + custom domain paths both work.

### 11.4 Reseller dashboard performance
- **Where:** Reseller with 20+ restaurants under management.
- **Pass:** Dashboard loads under ~1 s (N+1 fix + ResellerProfile.status index). No timeouts.

### 11.5 Superadmin restaurants table pagination
- **Where:** `/superadmin/restaurants` with 100+ rows.
- **Pass:** Paginates. Each page loads quickly.

### 11.6 Reseller commissions + payouts
- **Where:** Place real (or test) order at a reseller-managed restaurant. Check commission calc.
- **Pass:** Correct 0% / 5% / 10% / 15% tier applied. Settlement at month-end produces an invoice in the reseller's Holding tab.

---

## 💳 12. Payments

### 12.1 PayPal end-to-end (live)
- **Where:** Real test payment via PayPal on `/order/<slug>`.
- **Pass:** Authorization holds; capture fires on Accept; rejection releases the auth without charging. PayPal allow-list works on prod URL.

### 12.2 3DS / SCA card flow
- **Where:** Use a 3DS-required test card.
- **Pass:** 3DS challenge pops up, customer completes, order proceeds. Status reflects `requires_action` → `succeeded` cleanly.

### 12.3 Surface `requires_action` / `processing` statuses in admin
- **Where:** `/admin/orders/<id>` for an order stuck in 3DS or processing.
- **Pass:** Admin sees the real status, not a misleading "Pending payment".

### 12.4 Coupon usedCount in a transaction
- **Where:** Apply a coupon with `maxUses = 1` from two browsers at the same instant.
- **Pass:** Only one order goes through with the discount; the other gets "Coupon limit reached".

### 12.5 PayPal capture staleness check
- **Where:** Authorize a PayPal order → wait 4 days → accept it.
- **Pass:** Pre-capture check confirms the auth is still valid; if expired, gives a clean error instead of double-charging.

### 12.6 Marketplace settlement edge cases
- **Where:** Run a month-end settlement on the 1st with orders that straddle the boundary.
- **Pass:** No double-counting. Invoice idempotency key prevents duplicates on retry.

### 12.7 ❗ Stripe TEST → LIVE switch (LAUNCH BLOCKER)
- **Where:** `.env` and `/superadmin/settings/stripe`.
- **Pass:** Live keys in place. A real $1 charge clears. Connect destination routes correctly. Refund a $1 → reverses. **Do not launch without this passing.**

---

## 🔧 13. Admin UX polish

### 13.1 Admin menu search
- **Where:** `/admin/menu` → search field at the top.
- **Pass:** Filters categories + items by name/description. Categories whose name matches keep all their items.

### 13.2 Admin modifier-group search (Luigi 2026-06-02)
- **Where:** `/admin/menu` → right-side library panel → new search field.
- **Pass:** Filters mod groups by group name OR by any option name inside the group. Searching "pepperoni" surfaces a "Toppings" group with a Pepperoni option.

### 13.3 Bulk select + delete for categories and modifier groups
- **Where:** `/admin/menu` → Select mode on left side AND right side.
- **Pass:** Multi-select via checkboxes; delete with confirmation.

### 13.4 Drag-and-drop reorder modifier groups
- **Where:** Edit an item → drag mod groups to reorder.
- **Pass:** Order persists. Customer sees new order on `/order/<slug>`.

### 13.5 Hover sync — item chip → library row
- **Where:** Hover a mod-group chip on an item.
- **Pass:** Matching row in the right-side library highlights and scrolls into view.

### 13.6 GloriaFood / FoodBooking menu import
- **Where:** `/admin/menu/import-gloriafood` → paste credentials → run.
- **Pass:** Categories + items + images come across. No N+1 hang on big menus.

### 13.7 CSV export (customers)
- **Where:** `/admin/customers` → Export CSV.
- **Pass:** CSV downloads. Columns include `marketingConsent` (NEW — verify when CSV gets wired to the new column).

### 13.8 Required-fields toggle
- **Where:** `/admin/service-fees` → toggle Require email / Require phone.
- **Pass:** Customer checkout form respects the flags (asterisks appear/disappear, server validation matches).

### 13.9 Tawk.to support chat widget
- **Where:** Marketing pages, `/admin/*`, `/reseller/*`.
- **Pass:** Widget loads. Sending a test message reaches Tawk inbox.

### 13.10 Facebook "Start Order" install section
- **Where:** `/admin/publishing` → Facebook section.
- **Pass:** Install instructions are clear; copy + paste link works on a test FB page.

### 13.11 Real active add-ons in Account card
- **Where:** `/admin/settings`.
- **Pass:** Shows only the add-ons actually active (no zombie / legacy badges).

### 13.12 Driver Pool cancellation notice on PAYG switch
- **Where:** `/admin/billing` → switch Monthly → PAYG.
- **Pass:** Banner warns that Driver Pool will be cancelled. Confirmation required.

---

## 🏗️ 14. Proxy + static-assets

### 14.1 Custom domain serves static assets
- **Where:** A custom-domain restaurant (e.g. luigispizzapastawings.com). Check `/promo-defaults/*.svg`, `/uploads/*`, `/promo-stock/*`.
- **Pass:** All return 200, no 404. Promo tile images render on the customer page.

### 14.2 Branded subdomain `/` lands on `/site/<slug>`
- **Where:** `luigis.feefreeordering.com/`.
- **Pass:** Proxy rewrites to `/site/<slug>`; back-link on `/order` returns to `/`.

### 14.3 No redirect-cache poisoning
- **Where:** Visit a custom domain logged-out, then logged-in.
- **Pass:** Browser doesn't cache the wrong redirect. Headers include `Cache-Control: no-store, no-cache, must-revalidate`.

---

## 📊 15. Reports

### 15.1 End-of-day report (admin + kitchen)
- See 3.13 above.

### 15.2 Digest emails actually send
- **Where:** Restaurant with weekly digest enabled. Wait for the scheduled cron.
- **Pass:** Email arrives with the digest stats. (Was a `console.log` no-op pre-fix.)

### 15.3 Menu insights views
- **Where:** Visit several items on `/order/<slug>` (open the item modal).
- **Pass:** `/admin/reports/menu-insights` shows incrementing view counts.

---

## 🧪 16. Misc fixes worth verifying

### 16.1 Auto-complete simple-mode orders at the ready time
- **Where:** Simple-mode kitchen workflow. Accept an order with `estimatedReady = now + 20 min`.
- **Pass:** 15 min past `estimatedReady`, status auto-flips to `completed` without staff intervention.

### 16.2 Auto-reject pending orders at 3-min countdown
- **Where:** Pending order, no kitchen action.
- **Pass:** At 3:00 elapsed, server auto-rejects. Customer gets the rejection email.

### 16.3 Live ETA countdown on order status page
- **Where:** `/order/<slug>/status/<id>` after order is accepted.
- **Pass:** Page shows live `MM:SS` countdown ticking toward `estimatedReady`.

### 16.4 Timestamps on status timeline
- **Where:** Same status page.
- **Pass:** Each step (Placed / Accepted / Preparing / Ready) shows the actual timestamp.

### 16.5 Post-order rating
- **Where:** After delivery / pickup, customer gets the rating prompt (email or in-app).
- **Pass:** Submitting persists; rating shows up on `/admin/feedback`.

### 16.6 Customer cancel order (pre-accept only)
- **Where:** Customer has a pending (not yet accepted) order.
- **Pass:** Cancel button on status page works. After Accept, button disappears.

### 16.7 SMS notifications on status change
- **Where:** Customer with phone number. Order accepted / ready.
- **Pass:** SMS arrives with the status line.

### 16.8 Guest shareable order status link
- **Where:** Guest places order → status page URL.
- **Pass:** Sharing the URL works without login (status page is signed-link-accessible).

### 16.9 Soft ETA estimate during pending
- **Where:** Order is Pending (not yet accepted).
- **Pass:** Status page shows a soft "Expected by ~XX:XX" estimate while we wait.

### 16.10 Test orders strictly scoped to one restaurant
- **Where:** `npx tsx scripts/seed-test-orders.ts --email <…> --restaurant <slug>`.
- **Pass:** Orders only at the named restaurant. Items come from that restaurant's own menu.

---

## 🚀 17. Pre-launch blockers (separate watchlist)

These are NOT bug-checks — they're things that must be DONE before public launch:

- [ ] **Stripe TEST → LIVE** keys (`.env` + `/superadmin/settings/stripe`). See 12.7.
- [ ] Autopilot end-to-end test (#30).
- [ ] Catering flow end-to-end (#71).
- [ ] Closed-restaurant deferred kitchen alert (#72).
- [ ] CSV export wires the new `marketingConsent` column (Fabrizio tracker #36).

---

## How to use this checklist

1. Work top-to-bottom OR pick a domain Luigi cares about most today.
2. Mark each item ✅ / ❌ / ⚠️ as you go. Note the actual behaviour next to ❌.
3. When you find a real bug, file it in `FeeFree-Bug-Tracker-v3.xlsx` or call it out so we ship a fix before launch.
4. Don't skip anything because "we already fixed it" — verification is the only proof that the fix actually works in prod.
