# Fee Free Ordering Systems — Monday Work Plan

> Synthesized from the TODO file, master plan, memory store, git history (213 commits, 2026-06-20→28), and the last 4 session transcripts. **Important reconciliation:** Reward Dollars (wallet) + the VIP recurring scheduler were BUILT and (per the most recent memory, 2026-06-28) DEPLOYED to prod — but Luigi never finished on-device testing. Treat "shipped/deployed" as *built*, not *verified*. The single biggest gap this week is end-to-end testing of the money/credit flow. Test store slug: `luigis-lasagna-pizzeria`; reward name in that store is currently "Pizza Bucks".

---

# 1. Plan — what's incomplete, unfinished, or not started

## Promotions / VIP (largest open area)

- **Joint 1-by-1 test of every promotion type** [NOT STARTED] — Luigi insists several complex types (BOGO, buy_n_get_free, combo, meal_bundle_speciality, payment_reward, free_dish_meal) were never tested and may be misconfigured. Engine correctness bugs were fixed/tested, but the joint end-to-end pass is still owed. Standing rule: do not auto-verify promos. `src/lib/promo-engine.ts`
- **Meal Bundle full order-time eligibility** [NOT STARTED] — Bundles bypass the engine; only start/end window + `isActive` are enforced. Missing: min-order, customer-type, usage-cap, time-of-day gates.
- **B5 — atomic usage-cap claim on the payment path** [NOT STARTED] — A "max N uses" promo can over-redeem under concurrent load; needs an atomic claim mirroring the Coupon claim-at-create pattern. Real scale risk; deliberately deferred as risky checkout surgery. (B11 give-a-use-back already shipped.)
- **Coupon ↔ promotion unify / retire standalone "New coupon code"** [IN PROGRESS] — Program 1 retired standalone coupons (codes = hidden promos, Coupon table read-only). Remaining: add an explicit "require a code" wizard option, fold the personalized customer-coupon path (`Coupon.customerId`, report cmqa6lls1) into promos, then remove the "Coupon Codes" tab. Do in the joint pass. `apply-coupon` flow, promo wizard Restrictions & Display.
- **Nudge / highlight rework (3 linked asks)** [NOT STARTED] — (1) Match GloriaFood Standard/Exclusive/Master wording and decide per-ORDER vs per-ITEM exclusivity; (2) hide nudge/"Start nudging at"/highlight entirely when a promo is Hidden; (3) item-based nudge — fire highlight when an eligible item is added, owner picks which item group triggers it (currently $-threshold only via `highlightThreshold`). The "You unlocked X" toast already shipped.
- **Deal modal — true step-by-step walkthrough** [NOT STARTED] — BOGO/buy-N/combo/bundle "Build your deal" picker should guide one item at a time (Select item 1 → … → Deal applied) like GloriaFood, not one scrollable page.
- **Code-unlocked "secret" bundles** [NOT STARTED] — Bundles must be Visible today; a code can't open the composer so Hidden+code is inert. Build code-gated reveal (enter SANDWICH3 → bundle composer opens).
- **Per-type display/labeling polish (items 3,5,6,7,8,9,10,11)** [IN PROGRESS] — All money/correctness fixed. Remaining display-only: meal_bundle "What you get" omits per-item upcharge; payment_reward optimistic-preview vs defaulted cash; percentage_off specific-items multi-group → single selector; overlapping-group breakdown lines don't sum to headline; buy_n_get_free modal doesn't mark which group is FREE; free_delivery on non-delivery channel warning; save-time guards (0% bogo/buyN, untargeted combo/bundle groups). All need i18n.
- **VIP/promo polish audit remaining (a–e)** [IN PROGRESS] — (a) CheckoutModal hardcoded English (guest sign-in CTA, PayPal not-connected/redirect notices, coupon box Apply/applied, tip "Suggested" badge) → keys + 38 locales; (b) VIP UX: `confirm()` before remove-member/detach-special/remove-target, replace bare "…" busy text and `prompt()/confirm()` rename/delete with inline edit, initial-fetch loading state on VIP Specials; (c) rename "Your coupons" heading → "Your offers"; (d) per-item "You saved" over-attributes to first matching line when same dish is on multiple lines (needs per-LINE engine breakdown); (e) Individuals API GET omits phone-only targets.
- **VIP Groups cleanup — remove dead assign-promotion route + keys** [NOT STARTED] — `POST /api/admin/customer-groups/[id]/assign-promotion` + `admin.customerGroups.assign*` i18n keys (~30) are unused after Phase 1. Remove or repurpose for recurring grants, then re-run parity audit.
- **VIP Phase 2 per-link cadence on CustomerGroupPromotion** [DEFERRED] — Original scope (schedule fields on the group↔promo link) is likely superseded by the shipped "Automations" scheduler. Confirm with Luigi whether still wanted.
- **Program 1 fast-follow: reword "coupon" → "offer/promotion"** [NOT STARTED] — `admin.assignCoupon` / `customerDetailPage` / `customer.accountPage.yourCoupons` still say "coupon"; reword across 38 locales.

## Reward Dollars

- **Earn rules + wallet/ledger backend never verified** [BUILT — UNTESTED] — Earn config (auto %/per-$1; signup-window/first-order/order-over/nth-order; always-on signup box; manual grant; account balance card) shipped/deployed; Luigi stalled at "Group 4" and never sent the test-customer email needed for ledger verification. `src/lib/reward-ledger.ts`
- **Spend-at-checkout money path** [BUILT — UNTESTED] — Emerald "Use your <name>" box (signed-in only), use some/all, skip card when fully covered, max-% and min-balance caps, reject→return / complete→redeem. HIGH RISK (payment path), never tested live. `CheckoutModal`, `apply-promos` route, `orders` route.
- **"Grant Reward Dollars" (reward_credit) promo type #14** [BUILT — UNTESTED] — New promo type that grants credit via a special; never exercised on-device.
- **"Display in Promos section" tile** [BUILT — UNTESTED] — Megaphone toggle renders an emerald earn tile on the order page; verified only in local headless preview, not on prod/device. (commit `bf4aae9b`)
- **Refund-to-wallet on FULL refund** [NOT STARTED] — Refund route only caps the card refund at charged amount; should also return spent credit + claw back earned credit (clamp ≥ 0).
- **Expiry enforcement cron** [NOT STARTED] — `rewardExpiryDays` is stored but never enforced.
- **Show earned amount on receipt/confirmation + reward_credit amount in "My offers"** [NOT STARTED] — display gap.
- **ScheduleEditor on VIP-home individuals (raw-email) section** [NOT STARTED] — currently only on group page + customer profile.
- **Birthday + referral earn triggers** [DEFERRED] — need a `Customer.birthday` column + a referral link/flow.
- **Customer top-up / buy credit + chain-shared wallets** [DEFERRED] — Stripe charge → credit; deferred.
- **Optional earn-only mode toggle** [DEFERRED] — only if Luigi wants stores to earn but not spend.

## VIP recurring scheduler (Automations)

- **VIP credit-grant / discount-resend scheduler** [BUILT — UNTESTED] — `VipSchedule` + `*/5` cron + Automations UI; tz-aware `computeNextRun` (DST + month clamp, 9 tests). Critical prior gap fixed (auto-complete-orders cron now runs ledger hooks). Idempotency-per-period claimed but never verified on prod — Claude has repeatedly offered to trigger the cron to watch a grant land + confirm no double-grant. `src/lib/vip-schedules.ts`, `src/app/api/cron/vip-schedules/route.ts`

## Kitchen / printer / native apps

- **Logged-out kitchen device must NOT ring** [BUILT — UNTESTED] — Ghost-ring fix shipped (`16b77b18`); screen-off on-device confirm across two devices still pending. MOST IMPORTANT kitchen test.
- **Move Kitchen Alert Sound setting to Order Handling page** [NOT STARTED] — Move `kitchenAlertSoundUrl` uploader off Restaurant Profile to `/admin/order-handling`. Honor relocation GUARD (save only via `PATCH /api/admin/order-handling`). Add HelpTip: custom sound = browser kitchen only. Also addresses vibration-while-detail-open minor.
- **Kitchen login banner overlaps phone status bar** [NOT STARTED] — Web-only, no rebuild: add `export const viewport = {…, viewportFit:'cover'}` to `src/app/login/layout.tsx` + `paddingTop: max(.., env(safe-area-inset-top))` on AuthLanguageSwitcher (pattern at `KitchenDisplay.tsx:3190`).
- **Windows-PC kitchen display not ringing reliably** [NOT STARTED] — Show the tap-to-enable-sound gate on desktop browsers (currently iOS-only, `KitchenDisplay.tsx` ~1121) + persistent "sound is off" banner while pending orders exist.
- **Gate PrintNode tab on `printNodeEnabled`** [BUILT — UNTESTED] — Most of PrintNode opt-in built; `PrinterSetupModal` shows the PrintNode tab regardless of the toggle — gate it.
- **iOS — StarXpand thermal-print bridge** [NOT STARTED] — Native Swift bridge needed before iOS launch.
- **iOS — ring-when-locked (push)** [NOT STARTED] — pending Apple-side work before full device test.
- **iOS — tap-to-enable-sound gate** [NOT STARTED] — WKWebView blocks audio until a gesture; an order before any tap is silent. Web-only + 38-locale i18n.
- **iOS — pending native bundle (contentInset:never, bell+FF icon, printing)** [BUILT — UNTESTED] — committed, awaiting next iOS build.
- **Receipt copy-count = exactly 1 customer + 1 kitchen** [BUILT — UNTESTED] — Luigi previously saw a stray 3-customer/1-kitchen print; confirm consistency across a few orders.
- **Remove unused classic stario / starioextension Android deps** [DEFERRED] — cleanup pass; StarXpand is the working path.

## Menu / Pizza builder

- **Copy item settings — customer-side load check** [BUILT — UNTESTED] — Copy modal works (spot-confirmed); open a copied pizza on the *customer* ordering page and confirm the builder loads (crust/sauce/cheese/toppings + prices) since copy replaces modifiers. `CopySettingsModal`
- **Standalone "merge duplicate items within a category" pass** [NOT STARTED] — "Fix duplicates" merges duplicate CATEGORIES (shipped); an item-level merge could be added (FK is SetNull, safe). `menu-dedupe.ts`
- **Collapsible menu categories on desktop** [NOT STARTED] — On `/order/[slug]` desktop, let customers expand/collapse category sections.
- **Pizza copy-settings: variant-scoped groups + combo config** [DEFERRED] — variant-scoped groups clone as item-level; combo config not copyable. Fine for v1.
- **Pizza extra-quantity multiplier not applied server-side** [DEFERRED] — server ignores `extraQuantityMultiplier` bump (default 0); revisit if a store sets it >0.

## Customer accounts / Delivery

- **Saved-address form should match checkout UX** [NOT STARTED] — Account `AddressBook` (`/order/[slug]/account`) is a plain Label/Street/City/Postal form; reuse checkout's address component (autocomplete + map pin + per-country fields via `resolveDeliveryAddressConfig`). Report cmqqt9zyl. Luigi OK'd Claude doing this mostly solo.
- **Wire `addressNumberAfterStreet` (street-name format)** [BUILT — UNTESTED] — schema field added but not wired to UI/compose; needs Luigi's Google-autocomplete test. Report cmqsn52d2.
- **Home delivery / time slots** [NOT STARTED] — bigger feature; touches the GOLDEN kitchen countdown; needs design + device testing. Report cmqqxerxs.
- **Phone uniqueness — normalized column** [NOT STARTED] — add `Customer.phoneNormalized`, backfill, index, match at signup + guest dedup (also helps VIP/reward identity). Low priority; exact match covers the common case.
- **Reservations split-hours read path** [DEFERRED] — `resolveDayHours`/`validateBooking` (`reservation-validation.ts`) + `ReservationModal` slot-gen still use a single window; switch to `rowIntervals`, decide precedence vs legacy `reservationHours`. Pending owner go-ahead. (Note: a related client/server-divergence fix already shipped — see test #19.)
- **CheckoutModal exact-time client pre-validation** [NOT STARTED] — server already rejects typed gap times; client pre-validation missing.

## Marketing / SEO

- **Marketing site "Special Offers" tiles redesign** [NOT STARTED] — `src/app/site/[slug]/page.tsx` ~718-760 tiles look plain; replace with the styled ordering-page promo tiles (image card + headline + CTA).
- **Notification emails — verify each toggle maps to a distinct, correct email** [BUILT — UNTESTED] — distinct `orderAccepted*`/`orderPlaced` built (`193b01ad`); needs a verification pass that each toggle→event→email fires correctly.
- **PageSpeed caching + SeoCheck hint i18n** [IN PROGRESS] — "Fix this →" links done; (a) cache PageSpeed result per restaurant ~6h (keyless 429 → "UNKNOWN" every load); (b) move hardcoded English `SeoCheck.hint` strings in `src/lib/seo/health-check.ts` to i18n keys with English CSV/PDF fallback.
- **Import-to-Try flagship `/import` flow** [IN PROGRESS] — Phase 1a done (`c34e11ba`); paste-menu → try-live → claim-at-signup flagship flow next.
- **SEO indexing — Bing + backlinks + scale city/cuisine pages** [IN PROGRESS] — Console + sitemap done; indexing takes time.
- **Cookie-consent gate for FB Pixel / GA (GDPR)** [NOT STARTED] — Pixel/GA fire without consent gating.
- **Marketing homepage remaining** [IN PROGRESS] — commit the uncommitted `public/marketing/screenshots/*.png`, signup entry, `/features`, "24/7 support" only after Twilio number forwards to Luigi's cell.
- **Localize `/marketplace` static `<head>` SEO metadata** [DEFERRED] — still English-only.
- **ScheduledOrderReminder email — no cron fires it** [DEFERRED] — template built, no cron; Luigi: leave for now.
- **White-label dynamic PWA manifest + email-footer imprint** [DEFERRED] — manifest is static; footer "Powered by" on plain custom domains is a monetization decision.

## Reseller / Multi-location

- **Reseller + multi-restaurant section full UX reboot** [DEFERRED] — complete usability reboot of both, when time permits.
- **Wire real app-store links on reseller login badges** [NOT STARTED] — badges are non-linking "coming soon" until apps hit public stores (`cea12162`).

## Reports / Maps

- **Delivery Heatmap + Delivery-Zones → Google Maps** [DEFERRED] — migrate from Leaflet; BLOCKED on Luigi providing a Google Maps API key with billing.
- **Reports Export relocation completeness** [BUILT — UNTESTED] — `f42c19c9` claims "Export button on every report"; verify all sub-reports actually have it (test A2).
- **Reservation Deposits** [NOT STARTED] — flagged "Unbuilt" in the manual; reconcile vs the reserve-then-order paid add-on that memory says exists.

## Infra / other

- **Deploy/confirm all "pending Luigi OK" local commits are live** [IN PROGRESS] — confirm Reward Dollars, scheduler, Display-in-Promos (`bf4aae9b`), signup clarity (`945dbaa4`), pizza quantity/half-half, copy-settings, fix-duplicates are pushed, schema on BOTH Neon branches, `npm run preflight` read bottom-up.
- **Decide fate of loyalty POINTS system** [NOT STARTED] — original Program 2 included a points layer (`LoyaltyPointsAccount/Ledger`, points→credit, `/admin/loyalty-credit`) the Reward Dollars rebuild appears to have superseded; confirm dropped vs still planned; update ROADMAP.
- **Drop `limitedShowtimeSchedules` column (destructive)** [DEFERRED] — kept physically; drop on both Neon branches once no readers remain.
- **i18n parity sweep across all 38 locales** [IN PROGRESS] — many new keys this week (reward tile ×10, scheduler ×51, VIP labels, "You saved", `promoUnlocked`, member-label); one batch came back malformed and was redone. Run the all-38 placeholder + rich-tag audit (not the 4-locale `i18n-audit.ts`).
- **Remove dead VIP inline offer-builder keys** [NOT STARTED] — ~30 dead `admin.customerGroups.*` keys across 38 locales.
- **Memory consolidation pass** [NOT STARTED] — index near size limit.
- **Manual Build Status reconciliation** [NOT STARTED] — verify statuses in `FeeFreeOrderingSystems-Manual.docx` (esp. Reservation Deposits marked Unbuilt) and regenerate if wrong.

## Pending replies (need Luigi's wording OK)

- **Post Fabrizio reply on hours-per-service report** [NOT STARTED] — fix verified on S23; flip cmqnm3hv0000b04i8tvvxx836 to IN_TESTING after Luigi approves wording.
- **Update Fabrizio's Promo-popup comment** [NOT STARTED] — delete old "Profile → Promo popup" comment on cmqp8z9ko000304kykoin8wuw, post corrected one (new Marketing location + promo-link).

---

# 2. Test list — step-by-step

> Note: prod DB writes are blocked for the assistant — Luigi runs prod scripts himself, and "please verify" emails to Fabrizio only send from the Vercel UI button. Reward Dollars & new promo features are OFF by default, so prod is safe — enable them only on the test store `luigis-lasagna-pizzeria`.

### 1. Reward Dollars — earning (Group 4)
**Area: Reward Dollars**
1. Admin → Marketing Tools → Reward Dollars → turn ON, set a name (e.g. "Pizza Bucks"), Save.
2. Turn ON "Customers earn automatically" → % of order → 5 → Save.
3. Ways to earn → Add: "When a customer signs up" $5 with a Start/End window covering today; "On their first order" $3; an "Orders over $X" bonus; an "Every Nth order" bonus.
4. Admin → Customers → open a test customer → Reward Dollars card → type 10 → Add.
5. **Expected:** balance shows **$10.00** with "Added by the restaurant".
6. As that customer on the ordering site → account page → **Expected:** balance card ($10) + activity list appear.
7. Place an order that should EARN, complete it (or let auto-complete cron run) → **Expected:** balance rises by the right amount.
8. Reject an order → **Expected:** NO earn credited.
9. Send Claude the store slug + test-customer email so the ledger can be verified server-side.

### 2. Reward Dollars — spend at checkout (Group 5, HIGH RISK)
**Area: Reward Dollars**
1. As a signed-in customer with a balance, go to checkout → **Expected:** emerald "Use your Pizza Bucks" box appears.
2. In a private/not-signed-in window → **Expected:** NO box (guests cannot spend).
3. Choose "Use some" → **Expected:** "To pay today = total − credit", tax unchanged; place order, charged amount matches.
4. Choose "Use all" (balance ≥ total) → **Expected:** card/PayPal step is skipped, order settles as paid-by-credit, kitchen releases it like cash.
5. In admin set Max % of order = 50 and a Min redeem balance → **Expected:** checkout won't exceed 50% and can't spend below the min.
6. Lifecycle: spend credit then REJECT the order → **Expected:** balance returned. Spend then COMPLETE → **Expected:** credit gone for good.

### 3. Reward Dollars — grant-via-special + concurrency
**Area: Reward Dollars**
1. Create a "Grant Reward Dollars" (reward_credit) special, place a qualifying order, complete it → **Expected:** credit granted to the wallet at completion.
2. (With Claude) Fire two concurrent orders both draining the wallet → **Expected:** total spent ≤ balance, no negative balance, loser pays full, no 500s.
3. Force a double-complete (PATCH route + auto-complete cron) → **Expected:** only ONE earn ledger row.

### 4. Reward Dollars — sign-up bonus (always-on vs dated)
**Area: Reward Dollars**
1. Confirm the flat box on /admin/rewards ("Sign-up bonus — always on") credits new signups.
2. Add a dated "Ways to earn → When a customer signs up" campaign → **Expected:** both apply and can stack.

### 5. Reward Dollars — "Display in Promos section" tile
**Area: Reward Dollars**
1. Admin → Reward Dollars → a "way to earn" → click the megaphone (or tick "Show in the Promos section" when creating).
2. Open the ordering page → Promo section → **Expected:** an emerald Gift tile appears with the reward-name badge (e.g. "Earn $5 on your first order"). Confirm on PROD/device (only verified locally so far).

### 6. VIP credit-grant Automations / scheduler
**Area: VIP / Scheduler**
1. VIP Specials → a group → Automations → + New automation → "Give credit" → amount $5 → choose daily/weekly/monthly → Create.
2. Add 1 registered customer + 1 guest email + 1 phone-only member to the group.
3. Ask Claude to trigger the `vip-schedules` cron on prod → **Expected:** each eligible member's balance rises once; guest-by-email credited; phone-only members skipped.
4. Trigger again in the same period → **Expected:** ZERO new grants (idempotent).
5. Call the cron without auth → **Expected:** 401.
6. Set a "once" cadence → **Expected:** fires exactly once. Pause then re-enable → **Expected:** next-run recomputes. Delete the group → **Expected:** its schedules cascade-delete.
7. Confirm next/last run times display in the restaurant timezone.

### 7. Joint per-type promotion test (MUST be with Luigi)
**Area: Promotions**
1. Sit with Luigi; do NOT auto-verify.
2. For EACH type (percentage_off, fixed_cart, BOGO, buy_n_get_free, free_item, free_dish, free_delivery, combo, meal_bundle, meal_bundle_speciality, payment_reward, reward_credit): create it, add qualifying items on `/order/[slug]`.
3. **Expected each:** the discount/freebie applies AND the checkout preview total EXACTLY equals the charged total.
4. For code-required (Hidden) promos: enter the code at checkout; for assigned, try matching vs wrong email → **Expected:** match applies, wrong email rejected with "registered to a different email".
5. For meal_bundle specifically: confirm full order-time eligibility (min order / customer type / usage cap / time-of-day) — currently bypasses the engine.
6. Fix anything broken before marking that type verified.

### 8. Once-per-lifetime promo — preview equals charge
**Area: Promotions**
1. Create a fixed_cart once-per-lifetime promo (e.g. $10 off).
2. As a brand-new customer, apply it → **Expected:** previewed total = charged total (was $10.53 preview vs $21.83 charge before the fix).
3. Use it once, try again → **Expected:** blocked.
4. As a returning customer who used OTHER promos but never this one → **Expected:** still allowed.

### 9. Assign-to-customer end-to-end
**Area: Promotions**
1. Assign a promotion to a customer by email → **Expected:** email arrives with code + redemption instructions.
2. As a guest, enter code + matching email → **Expected:** applies. Enter code + wrong email → **Expected:** "registered to a different email".
3. As a logged-in customer, redeem from "Your offers".
4. **Expected:** the restaurant sees the applied promo on `/admin/orders/[id]`.

### 10. Cart "which dishes discounted" + per-item "You saved"
**Area: Promotions**
1. Apply an item-targeted promo → **Expected:** cart/checkout shows which specific dishes were discounted + green "You saved" badge under each.
2. Apply a whole-cart promo → **Expected:** NO per-dish breakdown.
3. Put the SAME dish on two cart lines under one promo → **Expected:** "You saved" is correct per line (watch for over-attribution to the first line — known gap).

### 11. Promo exclusivity matrix (preview + charge)
**Area: Promotions**
1. Set up Standard, Exclusive, and Master promos.
2. In cart preview → **Expected:** Standards stack; best Exclusive blocks Standards; Master always stacks.
3. Place the order → **Expected:** final charge matches the preview in all three cases.

### 12. Promo display-mode (Visible/Hidden)
**Area: Promotions**
1. Visible auto-apply → **Expected:** applies automatically.
2. Visible coded → **Expected:** applies via code.
3. Hidden coded → **Expected:** requires a code and NEVER shows on the menu or banner.

### 13. Multi-menu category picker grouping
**Area: Promotions**
1. On a 2-menu store, open the promo wizard category/item picker → **Expected:** categories grouped under menu sub-headers.
2. On a single-menu store → **Expected:** no menu sub-headers (unchanged).

### 14. Coupon usage-limit (single-use)
**Area: Promotions**
1. Create a Hidden coded promo with Max uses = 1.
2. Redeem once → **Expected:** works. Reuse → **Expected:** rejected with "limit reached".

### 15. Meal Bundle (Test 5)
**Area: Promotions / Pizza builder**
1. Create a Meal Bundle: Visible + banner ON, flat price, set slot cap + any speciality fee.
2. Build a matching cart on the ordering page → **Expected:** prices at the flat bundle price; slot cap + speciality fee correct.
3. Confirm Standard-vs-Exclusive stacking behaves with other active promos.

### 16. Get-it-Now promo grouping (#8, restaurant cmqtmfp2n)
**Area: Promotions / order page**
1. Promotions → set "%10 OFF ALL PIZZAS" Active.
2. Order page → "Get it now" → **Expected:** eligible items grouped by category, each with "+ Add"/"Customize"; footer "Start Adding Items" full-width centered.
3. "+ Add" a pizza → **Expected:** 10% auto-applies.

### 17. Promo Popup (Marketing page)
**Area: Promotions / Marketing**
1. Admin → Marketing → Promo Popup → enable → set button to "Open a promotion" → pick one → Save.
2. Order page → click the popup → **Expected:** opens the promo's "Get it now"; PromoDetailModal footer shows one full-width centered "Start Adding Items" CTA.

### 18. Ghost-ring kitchen safety (MOST IMPORTANT)
**Area: Kitchen**
1. Log Kitchen Order App in on device A (S23), then device B (computer/tablet).
2. Lock device A, place a test order → **Expected:** device A STAYS SILENT.
3. Open device A → **Expected:** shows "logged in on another device" / session-superseded screen.
4. Log back in on A, place another order → **Expected:** A rings again.

### 19. Reservation split-hours gating (browser confirm)
**Area: Reservations / order page**
1. Use a restaurant with SPLIT general hours (lunch 11–14 + dinner 17–21) and NO reservation-specific row.
2. Order page → Reservation modal → **Expected:** slot picker offers the WHOLE envelope (no lunch/dinner gap hidden), matching the server.
3. Repeat with a reservation row that has two intervals → **Expected:** picker gates out the gap.
4. Submit a booking at a gap time → **Expected:** client and server agree (no offer-then-reject mismatch).

### 20. Service-times toggle (#6, restaurant cmqt99i8s)
**Area: order page**
1. Order page shows times like "· 20 min / · 45 min".
2. Order Handling → toggle "Show service times" OFF → reload order page → **Expected:** times gone, names remain. Toggle ON → times return.

### 21. Closing-days fixes
**Area: Hours**
1. Opening Hours → add a special day with NO date → Add → **Expected:** "Pick a start date first."
2. Set today + close Pickup 10pm–2am when pickup is 9am–11pm → **Expected:** REJECTED ("window outside service hours").
3. Set today + close Pickup 1–3pm → **Expected:** saves; a 2pm pickup blocked, 4pm works.
4. Order page + `/info` → **Expected:** amber closure callout + owner's custom message.

### 22. Receipt copy-count
**Area: Kitchen / Printing**
1. Place an order, accept from the Kitchen Order App → **Expected:** thermal printer prints exactly ONE customer copy + ONE kitchen copy. Repeat a few orders for consistency.

### 23. Half/half pizza pricing + label
**Area: Pizza builder**
1. Build a pizza with a topping/sauce/cheese on ONE half → **Expected:** charges HALF the topping price (client preview AND server total); per-half label shows the halved price.

### 24. Pizza quantity stepper + admin toggle
**Area: Pizza builder**
1. Open a pizza → pick Pepperoni → **Expected:** no "Xtra" button; a − 1 + stepper (cap 10); "Light" resets to 1.
2. Click + → **Expected:** ×2 and price doubles; place order → kitchen ticket lists it twice, total matches.
3. Admin → Menu → pizza → Pizza tab → toggle "Allow multiple of the same topping" OFF → reload → **Expected:** stepper gone (simple on/off); turn back ON.

### 25. Copy item settings — customer-side load
**Area: Menu**
1. Copy a pizza's settings onto target items (choose sections + items/category).
2. Open one copied pizza on the CUSTOMER ordering page → **Expected:** builder loads crust/sauce/cheese/toppings + correct prices (copy REPLACES target modifiers).

### 26. Fix-duplicate-categories merge
**Area: Menu**
1. Admin → Menu → "Fix duplicates" → **Expected:** "Merged N duplicate categories"; list count drops.
2. Open 1–2 merged categories → **Expected:** all items present, no empty duplicate left.
3. Open an old order in Reports → **Expected:** its items still show (history intact).

### 27. Reports — order detail + Export + EOD email
**Area: Reports**
1. Reports → List View → Orders → click a row → **Expected:** detail page opens (customer/items/breakdown/payment/status), NO 404; Back returns to the list.
2. Reports → Sales → Summary → **Expected:** labeled "Export" top-right; set a date range, Export CSV → only that range; Export PDF → print view. Spot-check Export on List View and every sub-report.
3. Reports → End of Day → **Expected:** numbers in CAD/EUR + correct language, include delivery fees; dashboard KPIs reconcile with the daily-breakdown sum. If a send-test exists, confirm the email arrives.

### 28. Notification emails — distinct per type
**Area: Notifications**
1. Toggle each order-notification setting and trigger the matching event → **Expected:** the correct, distinct email fires for orderPlaced vs each orderAccepted* type; staff "new order" email is itemized.

### 29. Reseller IN_TESTING reports confirm
**Area: Reseller reports**
1. Pull current reports: `npx tsx scripts/run-on-prod.ts scripts/_list-reports.ts`.
2. Walk each on device: Get-it-Now, Promo Popup, ASAP/Scheduled, Closing days, Report reconcile + EOD, Homepage timeframes toggle, Coupon usage-limit.
3. For each confirmed-working report, post the "please verify" update to Fabrizio (from the Vercel UI button) and keep it IN_TESTING until he confirms.

### 30. i18n parity + preflight
**Area: Build / i18n**
1. Run the all-38-locale parity audit → **Expected:** 0 missing/extra/placeholder-arg/rich-tag mismatches (incl. reward, scheduler, member-label, "You saved", `promoUnlocked` namespaces).
2. Run orphaned-key sweep after removing `displayModePopup*` / `limitedShowtime*` / dead `admin.customerGroups.*` keys.
3. `npm run preflight` (read bottom-up) → **Expected:** EXIT_CODE=0. Run `npx vitest run` on promo-engine, reward-ledger, vip-schedules → **Expected:** all green.

### 31. Manual renders in Word
**Area: Documentation**
1. Open `C:\FeeFreeOrderingSystems\FeeFreeOrderingSystems-Manual.docx` in Microsoft Word (not the in-app viewer).
2. **Expected:** clickable TOC, clean system diagram, no awkward table/page breaks; Build Status statuses match reality (esp. Reservation Deposits).

---

# 3. TODO — everything still to get done

### 🔴 High — blocks launch / money / correctness / security
- [ ] 🔴 Confirm all "pending Luigi OK" commits are pushed + live (Reward Dollars, scheduler, Display-in-Promos `bf4aae9b`, signup clarity `945dbaa4`, pizza quantity/half-half, copy-settings, fix-duplicates); schema on BOTH Neon branches; `npm run preflight` read bottom-up
- [ ] 🔴 Test Reward Dollars **earning** end-to-end + send Claude the test-customer email for ledger verification (test #1)
- [ ] 🔴 Test Reward Dollars **spend-at-checkout** money path — some/all/caps/reject-return/complete-redeem (test #2)
- [ ] 🔴 Test Reward Dollars **concurrency** — no over-spend, no negative balance, idempotent double-complete (test #3)
- [ ] 🔴 Test VIP credit-grant **scheduler** on prod — grant lands once, re-tick = 0 new, 401 without auth (test #6)
- [ ] 🔴 Run the **joint 1-by-1 promotion test pass WITH Luigi** — do NOT auto-verify (test #7)
- [ ] 🔴 On-device confirm **logged-out kitchen device does NOT ring** (test #18)
- [ ] 🔴 Build **B5 — atomic usage-cap claim** on the payment path (prevents concurrent over-redeem)
- [ ] 🔴 Run the **all-38-locale i18n parity audit** + preflight + unit tests; fix any mismatches before any push (test #30)

### 🟡 Medium — important features / polish
- [ ] 🟡 Test "Grant Reward Dollars" promo type + sign-up bonus (always-on vs dated) (tests #3–#4)
- [ ] 🟡 Confirm "Display in Promos section" earn tile renders on PROD/device (test #5)
- [ ] 🟡 Build **refund-to-wallet on FULL refund** (return spent + claw back earned Reward Dollars)
- [ ] 🟡 Build **Reward Dollars expiry enforcement cron** (`rewardExpiryDays` is stored but ignored)
- [ ] 🟡 Build **Meal Bundle full order-time eligibility** (min-order / customer-type / usage-cap / time-of-day)
- [ ] 🟡 Build **saved-address form** to match checkout UX (autocomplete + map pin + per-country fields) — `AddressBook`, report cmqqt9zyl
- [ ] 🟡 **Coupon↔promo unify** — add "require a code" wizard option, fold in personalized coupons, plan retiring the Coupon Codes tab
- [ ] 🟡 **Move Kitchen Alert Sound setting** to `/admin/order-handling` (honor relocation GUARD + add HelpTip)
- [ ] 🟡 Fix **kitchen login banner overlapping status bar** — viewport + safe-area padding (web-only, `login/layout.tsx`)
- [ ] 🟡 Translate **CheckoutModal hardcoded English** (guest CTA, PayPal notices, coupon box, tip "Suggested") across 38 locales
- [ ] 🟡 **Notification emails** — verify each toggle fires the correct distinct email (test #28)
- [ ] 🟡 Verify **Copy item settings** loads correctly on the customer ordering page (test #25)
- [ ] 🟡 Verify **receipt copy-count** = 1 customer + 1 kitchen across several orders (test #22)
- [ ] 🟡 Confirm **Reports Export** button is on every sub-report (test #27)
- [ ] 🟡 Wire **`addressNumberAfterStreet`** to UI/compose + Luigi's Google-autocomplete test (report cmqsn52d2)
- [ ] 🟡 Build **PageSpeed result caching (~6h)** + move `SeoCheck.hint` strings to i18n keys
- [ ] 🟡 Build **desktop collapsible menu categories** on `/order/[slug]`
- [ ] 🟡 Confirm the **9 IN_TESTING reseller reports** on device + post "please verify" to Fabrizio (test #29)
- [ ] 🟡 Post Fabrizio **hours-per-service** reply + flip cmqnm3hv0000b04i8tvvxx836 to IN_TESTING (pending Luigi wording)
- [ ] 🟡 Update Fabrizio's **Promo-popup** comment on cmqp8z9ko000304kykoin8wuw (new Marketing location + promo-link)
- [ ] 🟡 **Decide fate of the loyalty POINTS system** (superseded by Reward Dollars?) and update ROADMAP
- [ ] 🟡 Address the two still-NEW reports: cmqqxerxs (home delivery time slots — touches GOLDEN countdown) + cmqsn52d2 (street name)

### 🟢 Low — nice-to-have / deferred
- [ ] 🟢 Build the **flagship `/import` flow** (paste-menu → try-live → claim-at-signup)
- [ ] 🟢 Build **nudge/highlight rework** (GloriaFood wording, hide-when-Hidden, item-based triggers)
- [ ] 🟢 Build **deal-modal step-by-step walkthrough** (one item at a time)
- [ ] 🟢 Build **code-unlocked secret bundles**
- [ ] 🟢 Per-type display polish (items 3,5,6,7,8,9,10,11) + VIP/promo polish (a–e), all with i18n
- [ ] 🟢 Reword "coupon" → "offer/promotion" across `admin.assignCoupon` / `customerDetailPage` / `yourCoupons` (38 locales)
- [ ] 🟢 Remove dead **VIP assign-promotion route + ~30 `admin.customerGroups.*` keys**; re-run parity audit
- [ ] 🟢 Build **show earned amount on receipt/confirmation** + reward_credit amount in "My offers"
- [ ] 🟢 Add **ScheduleEditor to the VIP-home individuals (raw-email) section**
- [ ] 🟢 Redesign **marketing site "Special Offers" tiles** (`src/app/site/[slug]/page.tsx`)
- [ ] 🟢 Gate **PrinterSetupModal PrintNode tab** on `printNodeEnabled`
- [ ] 🟢 Desktop kitchen **enable-sound gate + "sound off" banner**
- [ ] 🟢 Add **`Customer.phoneNormalized`** column + backfill + index + match at signup/dedup
- [ ] 🟢 Add **standalone "merge duplicate items within a category"** pass
- [ ] 🟢 Add **client pre-validation** for CheckoutModal exact-time gap times
- [ ] 🟢 Reservations **split-hours read path** (rowIntervals) — pending owner go-ahead
- [ ] 🟢 Drop **`limitedShowtimeSchedules`** column on both Neon branches (no readers)
- [ ] 🟢 iOS app: build **StarXpand print bridge**, **ring-when-locked**, **tap-to-enable-sound gate**; ship pending native bundle (contentInset/icon/printing)
- [ ] 🟢 **Commit** the uncommitted `public/marketing/screenshots/*.png` (avoid prod 404s); finish homepage signup entry + `/features`
- [ ] 🟢 Add **cookie-consent gate** for FB Pixel / GA (GDPR)
- [ ] 🟢 Switch **Delivery Heatmap + Zones to Google Maps** (blocked on Luigi's API key)
- [ ] 🟢 Wire **real app-store links** on reseller login badges at launch
- [ ] 🟢 Reseller + multi-restaurant **section UX reboot** (when time permits)
- [ ] 🟢 Add **birthday/referral earn triggers** + customer **top-up/buy credit** + optional **earn-only mode** (deferred)
- [ ] 🟢 Run **memory consolidation pass**; reconcile **manual Build Status** + regenerate if wrong (test #31)
- [ ] 🟢 Localize **`/marketplace` static `<head>`** SEO metadata
- [ ] 🟢 Reconcile **Reservation Deposits** status (manual says Unbuilt vs reserve-then-order add-on in memory)
- [ ] 🟢 Remove unused classic **stario/starioextension** Android deps (cleanup)
