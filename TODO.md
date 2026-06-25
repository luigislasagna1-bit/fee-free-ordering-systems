# TODO — Luigi's running to-do list

Every note Luigi flags — "add this to the to-do list", "still left", "note —", an idea in passing — lands
here and gets done at some point. **Newest at the top of Open.** When it ships, move it to **Done** with the
date + commit hash. This file is committed so the backlog never gets lost.

> Standing rule (Luigi, 2026-06-24): _"Anything I put in as this kind of note needs to be added to our
> to-do list and get done at some point."_ → Always capture it here first.

## Open

- [ ] **Split hours — v2 follow-ups.** v1 shipped general + per-service split hours (multiple windows/day, e.g.
  lunch + dinner). Remaining: (a) **server-side weekly-hours enforcement** — `/api/orders` still defers slot
  validation to the client (pre-existing; a tampered client could place an order during the lunch/dinner gap);
  add a `hhmmInsideIntervals`-style check against the day's `rowIntervals` (mirror the holiday check at
  orders/route.ts:1622). (b) **Reservations split hours** — reservations still use a single window
  (`ReservationSettings.reservationHours`); fold them into the unified `OpeningHours.intervals` model. (c)
  **menu-schedule coverage gaps** — feed real intervals into `findCoverageGaps`. (d) **Exact-time picker** in
  CheckoutModal bounds to the day's envelope, so a customer in "exact time" mode could type a gap time (the slot
  DROPDOWN correctly skips gaps). _(v1 shipped 2026-06-24.)_

- [ ] **Reserve-then-order: apply the holiday closed-windows / per-service custom-hours gate to combined-checkout
  bookings.** A booking attached to a food order (reserve-then-order) is validated only by `validateBooking`
  (notice / advance / capacity) — `src/lib/reservation-validation.ts` has NO holiday check, and the order route's
  holiday block keys on the FOOD service (pickup/delivery/…), never `reservation`. So a combined-checkout booking
  whose time falls in a `reservation` closed-window / outside reservation custom-hours is NOT rejected, unlike a
  standalone `/api/public/reservations` booking (which now is). Add the same holiday gate to the reserve-then-order
  path. _(Pre-existing; surfaced by the Fabrizio-#1 verification, 2026-06-24.)_

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
