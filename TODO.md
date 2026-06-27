# TODO — Luigi's running to-do list

Every note Luigi flags — "add this to the to-do list", "still left", "note —", an idea in passing — lands
here and gets done at some point. **Newest at the top of Open.** When it ships, move it to **Done** with the
date + commit hash. This file is committed so the backlog never gets lost.

> Standing rule (Luigi, 2026-06-24): _"Anything I put in as this kind of note needs to be added to our
> to-do list and get done at some point."_ → Always capture it here first.

## Open

- [ ] **Code-unlocked "secret" bundles (Luigi 2026-06-27).** Today a Meal Bundle must be Visible (built from a "Build your deal" card); a coupon code can't open the composer, so Hidden + code is inert (we now hide those controls for bundle types). If Luigi wants a code-gated bundle (e.g. enter SANDWICH3 → reveal a "3 sandwiches for $30" composer), build it: entering the code surfaces/opens the bundle composer for an otherwise-hidden bundle. Until then bundles are visible-only. Also: the bundle highlight should use the item-based trigger from the nudge-rework note (eligible item added → highlight).

- [ ] **Marketing website "Special Offers" tiles redesign (Luigi 2026-06-27).** The special-offer tiles on the hosted marketing site (`src/app/site/[slug]/page.tsx` ~718-760) look plain/bad — replace them with the same styled promo tiles used on the ordering page (image card + headline + CTA), or a close match that suits the website. UI/design task.

- [ ] **Deal modal: true step-by-step walkthrough (Luigi 2026-06-27).** The BOGO / multi-item "Build your deal" modal should guide the customer ONE item at a time — "Select item 1" → pick → "Select item 2" → pick → "Deal applied" — like GloriaFood (screenshots), instead of showing all groups on one scrollable page. Applies to BOGO / buy-N-get-free / combo / bundle pickers. UX enhancement.

- [ ] **Promotions — nudge/highlight rework (Luigi 2026-06-27).** Three linked asks: (1) **Match GloriaFood's exact Standard/Exclusive/Master wording/ideology** in our stacking explainer + tooltips. ⚠️ Decide a real semantic difference: GloriaFood "Exclusive = no other promos on the same **ITEM**"; ours is per-**ORDER** (an exclusive blocks all other standards on the whole order). Either reword to match our per-order behavior clearly, or change the engine to per-item exclusivity (bigger). (2) **Hide the nudge/"Start nudging at" + highlight option entirely when a promo is Hidden** (coupon-only) — a hidden promo should have no highlight/nudge controls. (3) **Item-based nudge:** for promos defined by ITEMS not a $ threshold (BOGO, combos, bundles, free_item), the highlight should fire when an **eligible item is added to the cart**, and let the owner **choose which item group triggers it** (GloriaFood "Highlight promo → Custom selection → item group 1 / item group 2", screenshot). Current nudge is $-threshold-only (highlightThreshold) — this is the deferred audit dead#10 done properly.

- [x] **🎉 PROGRAM 1 — Promotions overhaul SHIPPED 2026-06-26 (merged d8a13479, deployed).** Coupons fully retired → promotions (UI removed, "Promotions & Coupons"→"Promotions", migration ran on prod: 2 personal coupons → 2 hidden promos + grants, 1 popup→visible, 8 hidden rows coerced). Visible/Hidden model replaces the 3-mode Display Mode; dead "popup" mode + Limited Showtime removed. Assign-a-promotion-to-a-customer (by email, account or not) + always-send email. **F-92452C bug fixed + verified on prod** (code+email match → applies, wrong email → "registered to a different email"). Cart shows which dishes a % promo discounted; promo category picker groups by menu (multi-menu). 21 engine tests, 38-locale parity. Plan: `~/.claude/plans/save-thse-tests-for-calm-jellyfish.md`.
  - **Fast-follow i18n polish (low priority):** admin.assignCoupon / customerDetailPage / customer.accountPage.yourCoupons copy still says "coupon" in places — reword to "offer/promotion" across 38.
  - **Verify on prod once deployed:** see the Program-1 test checklist (assign→email→redeem by email match; wrong-email rejection; Visible/Hidden editor; cart which-dishes; multi-menu picker).

- [ ] **PROGRAM 2 — Store credit (wallet) + loyalty points (PLANNED, not started).** Per-restaurant opt-in wallet ("LuigiBucks"/"$ Credit") usable as a payment method + loyalty points → credit; funding = manual grant / promo-reward / refund-to-credit / signup bonus (+ top-up deferred). Full phased design (P2.0–P2.5) in the plan file. Mirrors the coupon-ledger pattern (append-only ledger + atomic balance). Build after Program 1 is verified.

- [x] **🐛 FIXED (2026-06-26, pending deploy): clicking an order in Reports → List View 404'd.** The List View linked each order to `/admin/orders/{id}`, but no such route existed (only the live queue at `/admin/orders`, which expands rows in place and isn't deep-linkable). Built a read-only admin order-detail page at `src/app/admin/orders/[id]/page.tsx` — customer, items+modifiers, full price breakdown (subtotal/discount/delivery/tax/tip/total), payment, scheduled time, notes, status badge. Ownership = order.restaurantId ∈ `resolveReportScope().ids` (single store → itself; brand parent → any location), matching how the report lists them + secure against cross-tenant reads. Reuses existing i18n keys (no new strings). Affects ALL restaurants. Preflight green; route registered.

- [x] **Reports export — labeled top-right button on every report (DONE 2026-06-26, pending deploy).** The export was a tiny unlabeled download icon hidden at the bottom-right of each sub-report's table card (Luigi couldn't find it). Moved to a labeled "Export" button in the header (top-right, next to the date picker) across all 16 reports — Sales Trend/Summary, List orders/clients, Menu Insights items/categories, Promotions (relocated from bottom), + Visits/Reservations/Funnel/Clients/Google-Rank/Connectivity/Heatmap/EOD (labeled in place). Each still forwards `buildQuery(sp)` (full range + view dim + location/scope + status/search filters) so PDF/XLS/CSV downloads honor exactly what's selected. Preflight green.

- [x] **Promo Popup report (cmqp8z9ko) test polish — DONE 2026-06-26 (pending deploy).** A (popup→promo) + C (popup→URL) confirmed working by Luigi. Two changes shipped: (1) the PromoDetailModal footer is now ONE full-width, centered CTA reading "Start Adding Items" for every build-your-cart promo (was a small bottom-right "Got it"; `fixed_cart` like the "$10 Coupon" now reads correctly) — free_delivery keeps its "switch to delivery". (2) Removed the **coupon** option from the Promo Popup button (admin) — only URL or Promotion now, since coupons are being folded into promotions (one step of the [[coupon↔promo unify]]). Reused existing i18n keys (startAddingItems/switchToDelivery), no new strings. Preflight green.

- [x] **Closing-days fixes (cmqp8l948) — DONE 2026-06-26 (pending deploy + on-device).** Three issues + Luigi's rule "exceptional hours must stay within the service's normal hours; can't close a service when it isn't open":
  1. **Cross-midnight closures no longer silently dropped** — `parseHolidayRules` now keeps `open !== close` intervals (was `open < close`); `hhmmInsideIntervals` handles the wrap. (`holiday-rules.ts`)
  2. **Within-service-hours validation** — new shared `validateHolidayRulesAgainstHours` + `holidayWindowOutsideService` (uses `pickHoursForService` + `rowIntervals`): an exceptional open/closed window must fit inside the governing service's hours for that day (per-service → that service; dine_in/take_out/catering/all → general). Wired into the save API (authoritative 400 `window_outside_service_hours`) AND the admin form (clear rejection toast). A pickup 10pm–2am closure (pickup is 9am–11pm) is now REJECTED with a clear message; cross-midnight only allowed when the service's own hours cross midnight (e.g. general 10am–3am).
  3. **Start date required** — `addHoliday` now shows "Pick a start date first." instead of silently no-op'ing.
  4. **/info shows special closures** — info page now loads today+future holidays + renders an amber callout (full closure / closed windows / custom hours) + the owner's custom message, reusing the `ordering` namespace closure keys.
  Unit tests added (holiday-rules.test.ts, 18 pass; 50 hours-related total). New i18n keys `admin.hours.holidayNeedsDate` + `holidayWindowOutsideService` across all 38 locales (parity verified). Preflight green.

- [x] **🔔 FIXED (2026-06-26, pushed — pending on-device confirm): a LOGGED-OUT kitchen device kept ringing.** Luigi: opened the S23, saw "logged in on another device" (he'd logged the kitchen in on his computer earlier), yet the S23 had just rung for a new order. ROOT: push/ring lifecycle wasn't tied to the single-active-session lifecycle. The native screen-off ring is driven by `/api/kitchen/alarm-state?token=…` (TOKEN-auth, no session) → it rings as long as the device's `KitchenPushToken` row exists. Logging in on the computer (a desktop browser, which registers NO FCM token) superseded the S23's *session* (`Restaurant.kitchenSessionToken`) but left its push token → it stayed the sole ring target. Also the ~4s `/api/kitchen/orders` ring poll never checked session freshness, so a foreground stale device kept ringing via web audio until its heartbeat bounced it. FIX (3 parts, all shipped): (1) `auth-kitchen.ts` — on every kitchen login, `deleteMany` all `KitchenPushToken` for the restaurant (the new active device re-registers on launch); decisive fix — `alarm-state` then returns `ringing:false` for the old device. (2) `api/kitchen/orders` GET — enforce `checkKitchenSessionFresh()` → `session_superseded` 401 (cheap: short-circuits with no DB read for admin-session viewers). (3) `api/kitchen/register-device` POST — reject when stale so a superseded device can't reclaim ring ownership. Preflight green. ⚠️ ON-DEVICE TEST still needed: log kitchen in on device A, then log in on device B → place an order → A must NOT ring (screen-locked) and must show the superseded screen on open.

- [x] **💰 FIXED (2026-06-26, local — pending deploy + on-device confirm): once-per-lifetime promo: preview ≠ charge AND returning customers wrongly blocked.** Found while testing report #1 (order ORD-697157388 / cmqufxkyf…): "Sameem" saw checkout **$10.53** ("$10 Coupon" `fixed_cart`, `onceLifetimePerClient`, −$10) but was charged **$21.83** (`promoDiscount: 0`). TWO root causes: (1) `apply-promos/route.ts` never computed `hasUsedLifetime` → preview always optimistic; (2) `orders/route.ts` used a COARSE heuristic ("any prior promo-discounted order ⇒ block ALL lifetime promos") that over-blocked returning customers from brand-new lifetime promos. FIX (Luigi chose per-promo-via-history): new shared `usedLifetimePromoIds()` in `coupon-ledger.ts` = precise ledger (email/phone) + a per-customer `appliedPromos` order-history scan (covers pre-ledger redemptions, scoped to one customer so it scales). BOTH the order route and the preview now call it → preview == charge; a genuine first use applies, a real second use is blocked. Coarse heuristic removed. Verified on prod data: Sameem (77 orders/12 promo'd, never used THIS promo) → correctly allowed; build green (preflight exit 0).

- [ ] **⚠️ Test EVERY promotion type 1-by-1 WITH Luigi (some likely broken / not set up to work).** Luigi
  (2026-06-25): we tested a few promo types together but NOT all — especially the more complex ones — and he's
  confident several aren't working correctly, possibly not even configured to work. Go through every promotion
  type together, test each end-to-end, fix what's broken. Do NOT mark promo behaviour verified without this
  JOINT pass — it needs Luigi. (The coupon usage-LIMIT bug is separately fixed + shipped: 9c504b23 / e9a22828.)

- [ ] **Promotion editor: label/group the categories by menu (multi-menu stores).** When choosing which
  categories a promotion applies to, categories from ALL menus are merged into one flat list with no
  indication of which menu each belongs to — impossible to tell apart for a multi-menu restaurant. Group or
  label them by menu in the picker. _(Fabrizio, 2026-06-25, on the Coupon report.)_

- [ ] **Cart: summarise which items a promotion discounted (GloriaFood-style).** When a promo discounts only
  certain items (not the whole order), show a small summary in the cart of which products received the
  discount, so the customer can see what's covered. _(Fabrizio, 2026-06-25, on the Coupon report.)_

- [ ] **Move the Kitchen Alert Sound setting to the Order Handling page.** The custom kitchen-alert-sound
  uploader (`kitchenAlertSoundUrl`, saved via `/api/restaurants/kitchen-sound`, currently on the Restaurant
  Profile page) should live on `/admin/order-handling` (Taking Orders), alongside auto-accept + scheduled
  orders. ⚠️ Honor the relocation GUARD — order-handling saves ONLY via `PATCH /api/admin/order-handling`;
  don't fold the sound into another page's save payload. Worth a HelpTip noting the custom sound applies to the
  BROWSER kitchen view — the native app intentionally plays the built-in alarm (suppresses custom to avoid the
  two-engine overlap Fabrizio hit). _(Luigi note, 2026-06-25.)_

- [x] **Google Ranking report — the "FIX" actions are now actionable.** DONE 2026-06-25: each `SeoCheck`
  in `src/lib/seo/health-check.ts` now carries a `fixHref` → Content optimization → `/admin/profile`,
  Google Business + Social → `/admin/social-media`, Domain + Security → `/admin/publishing`, Structured data →
  `/admin/marketplace`; the report renders a translated "Fix this →" link on every failing factor (parity 4885).
  Misleading "Profile → Social Links" hints corrected to "the Social Media page".
  STILL PENDING: (a) PageSpeed Insights returns 429 (keyless API rate-limit) → cache the result per restaurant
  (~6h) so it doesn't re-probe + show "UNKNOWN" every load; (b) the `SeoCheck.hint` strings are still
  hardcoded English in `health-check.ts` (rendered English in all 38 locales) — move them to i18n keys
  (hint→hintKey+params) while keeping an English `hint` fallback for the English CSV/PDF export.

- [ ] **Kitchen app login banner overlaps the phone status bar (Android + iOS).** On the native kitchen app
  login screen the top floating switcher (`AuthLanguageSwitcher`, `absolute top-4 right-4`) sits in the unsafe
  area and overlaps wifi/battery. Root: `src/app/login/layout.tsx` has NO `viewport` export (so no
  `viewportFit:"cover"` like the kitchen pages do), and the switcher's `top-4` ignores `env(safe-area-inset-top)`.
  FIX (web-only, no native rebuild): add `export const viewport = { …, viewportFit:"cover" }` to
  `login/layout.tsx` + `paddingTop: max(.., env(safe-area-inset-top))` on `AuthLanguageSwitcher`. Reuse the
  kitchen pattern (`KitchenDisplay.tsx:3190`). _(Luigi note, 2026-06-25.)_

- [ ] **Windows-PC kitchen display not ringing reliably ("for later").** Desktop browsers lock audio under the
  autoplay policy until a user gesture; only iOS shows a "tap to enable sound" gate (`KitchenDisplay.tsx`
  `soundGateOpen` ~1121-1128). FIX dir: show the enable-sound gate on desktop browsers too + a persistent
  "sound is off" banner while pending orders exist. _(Luigi note, 2026-06-25.)_

- [ ] **PrintNode → opt-in admin setting that appears in the kitchen display ("for later").** Mostly built:
  `Restaurant.printNodeEnabled` + the admin toggle (`KitchenWorkflowToggle.tsx`) + KDS hydration + print-fallback
  all exist. GAP: the `PrinterSetupModal` shows the PrintNode tab regardless of the toggle — gate it on
  `printNodeEnabled` so PrintNode only shows when the owner enabled it (less-common path; most use native WiFi
  printing). _(Luigi note, 2026-06-25.)_

- [ ] **iOS Kitchen Order App — test completely + move toward launch.** On TestFlight via Codemagic; pending
  native StarXpand thermal-print bridge + ring-when-locked, then full device test + App Store submission. See
  [[project_ios_app_state]]. _(Luigi note, 2026-06-25.)_

- [x] **Reseller "Login page" explainer — SHIPPED (cea12162, 2026-06-25).** Free partners now get an explainer
  (neutral `restaurantownerlogin.com` login + `feefreeordering.com/login` fallback + upgrade-to-Branded +
  Kitchen Order App badges) instead of an empty redirect. ⚠️ App badges are "coming soon" (non-linking) until
  the apps hit the public stores — wire the real store links at App-store launch (#33). _(Luigi note, 2026-06-24.)_

- [ ] **Reseller section + multi-restaurant (brand-parent) section — full UX reboot.** When there's time, do a
  complete usability reboot of BOTH the reseller admin section AND the multi-location / multi-restaurant
  sections to improve the experience. _(Luigi note, 2026-06-24.)_

- [ ] **Split hours — DONE (reservations shipped 2026-06-24, commit 84662c6a).** v1 shipped general + per-service split hours; since then the
  deferreds A/B/C also shipped (2026-06-24): (a) server-side weekly-hours enforcement for scheduled orders
  (orders/route.ts fail-open backstop), (b) reserve-then-order holiday gate, (c) menu-schedule coverage gaps use
  real intervals. **Remaining = Reservations split hours** — reservations still resolve a single window via
  `ReservationSettings.reservationHours`; the reservation `OpeningHours` rows ALREADY store intervals from the
  admin editor, so the work is the READ path: `resolveDayHours` / `validateBooking` (`reservation-validation.ts`)
  + the `ReservationModal` slot-gen need to use `rowIntervals` instead of a single open/close, and decide the
  precedence vs the legacy `reservationHours` field. _(Owner scoped reservations out of v1; pending a go-ahead.)_
  Minor nicety: the CheckoutModal **exact-time** picker bounds to the day's envelope, so a customer could TYPE a
  gap time — the server now rejects it (A) and the slot DROPDOWN already skips gaps; only client pre-validation
  is missing.

- [ ] **Ordering page — collapsible menu categories on desktop.** On the customer ordering page
  (`/order/[slug]`), on **desktop**, give customers the option to expand/collapse the menu categories
  (collapsible category sections), so a long menu isn't one giant scroll. _(Luigi note, 2026-06-24.)_

- [ ] **VIP member groups.** Owners assign specific customers into VIP groups that unlock features/rewards
  per group (auto-rewards, special promos, etc.; multiple groups supported). The customer-accounts system +
  the Coupon / Promotion / CustomerCoupon engine already provide the building blocks — this adds the
  tier/group concept, the admin UI to manage groups + membership, and the per-group feature hooks.
  _(Luigi vision, 2026-06-24; surfaced while wiring saved delivery addresses.)_

## Done

<!-- Move items here when shipped, e.g.:
- [x] Short example — fixed in `abc1234` (2026-06-24).
-->

## Promo popup — relocate to Marketing + link to a promo/coupon (Luigi, 2026-06-25)
- MOVE the Promo Popup OUT of Admin → Profile into its OWN heading under the MARKETING section
  (not under Restaurant Basics / Profile).
- BUILD OUT: the popup must be able to link DIRECTLY to a promotion or a special coupon from the
  promo station (select/deep-link a promo or coupon), not just a free-form URL.
- THEN update Fabrizio's reseller comment on the "Popup" report (cmqp8z9ko000304kykoin8wuw):
  DELETE the old "Profile -> Promo popup" comment + post a corrected one reflecting the new
  Marketing location + the promo/coupon linking.

## Saved-address form should match the checkout delivery UX + country config (Luigi/Fabrizio, 2026-06-25)
- The customer ACCOUNT page "Saved delivery addresses" form (AddressBook, /order/[slug]/account)
  is a plain text form (Label / Street / City / Postal). It should work the SAME as the checkout
  delivery-area entry: address AUTOCOMPLETE (type -> choose the exact match) + confirm with a PIN
  ON A MAP, and reflect the restaurant's configured country/area address fields
  (resolveDeliveryAddressConfig) — not a generic Label/Street/City/Postal set.
- FIX: reuse the checkout's address-entry component (autocomplete + Leaflet/Google pin + per-country
  fields) inside the account AddressBook add/edit form so the two are identical.
- NOTE: Italy DOES use postal codes (CAP, 5 digits), so the postal field isn't wrong per se — the
  real issue is the form ignores the restaurant's address-field config + lacks autocomplete/map.
- This is feedback on the IN_TESTING "Saving multiple delivery addresses" report (cmqqt9zyl).

## Kitchen Order App — remove the "Admin login" button (Luigi, 2026-06-25)
- From the Kitchen Order App, clicking "ADMIN login" navigates the user OUT of the app (to the admin
  login). That shouldn't be possible from the kitchen display.
- REMOVE the "Admin login" button/link from the kitchen login screen / kitchen display. Web-only
  change (the app loads the remote /kitchen URL — no APK rebuild needed).

## Coupon codes vs promotions — redundancy / unify (Luigi, 2026-06-25)
- Luigi: the standalone "New coupon code" (Coupon model) largely DUPLICATES a "% discount on cart"
  or "Fixed discount on cart" promotion attached to a code. Consider REMOVING the separate
  "New coupon code" flow + letting ANY promotion optionally require a coupon code (unify under promos).
- NUANCE to preserve: the Coupon model ALSO powers PERSONALIZED coupons (assign a code to a specific
  customer + email it — the "Coupon created -> email customer" feature, report cmqa6lls1). Must be kept
  (fold into the promo flow or a lightweight personalized path) before retiring the standalone flow.
- Foundation exists: promotions already support Promotion.couponCode (apply-coupon "source: promotion").
- DECIDE + build in the PROMOTIONS 1-by-1 joint pass (reserved). Touches: promo wizard (a "require a
  code" option on Restrictions & Display), the apply-coupon flow, personalized coupons, and the admin
  Promotions/Coupons UI (remove "New coupon code" / "Coupon Codes" tab).
