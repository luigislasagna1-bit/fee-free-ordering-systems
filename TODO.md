# TODO — Luigi's running to-do list

Every note Luigi flags — "add this to the to-do list", "still left", "note —", an idea in passing — lands
here and gets done at some point. **Newest at the top of Open.** When it ships, move it to **Done** with the
date + commit hash. This file is committed so the backlog never gets lost.

> Standing rule (Luigi, 2026-06-24): _"Anything I put in as this kind of note needs to be added to our
> to-do list and get done at some point."_ → Always capture it here first.

## Open

- [ ] **Google Ranking report — the "FIX" actions don't actually do anything.** On
  `/admin/reports/online-ordering/google-rank` each SEO factor (Content optimization, Google Business listing,
  Social media + local listings, etc.) shows a "FIX N PROBLEM" badge but it's not actionable — clicking it
  doesn't take the owner anywhere to fix it. FIX: make each `SeoCheck` carry a `fixHref` (+ render the badge as
  a Link) pointing at the relevant settings page — e.g. Content optimization → `/admin/profile` (description),
  Google Business / Social → Profile → Social Links, etc. (`src/lib/seo/health-check.ts` builds the checks;
  the page renders them.) Also: PageSpeed API returns 429 (rate-limited) → cache the result / back off so it
  doesn't show "UNKNOWN" every load. _(Luigi flagged 2026-06-25.)_

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
