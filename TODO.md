# TODO — Luigi's running to-do list

Every note Luigi flags — "add this to the to-do list", "still left", "note —", an idea in passing — lands
here and gets done at some point. **Newest at the top of Open.** When it ships, move it to **Done** with the
date + commit hash. This file is committed so the backlog never gets lost.

> Standing rule (Luigi, 2026-06-24): _"Anything I put in as this kind of note needs to be added to our
> to-do list and get done at some point."_ → Always capture it here first.

## Open

- [ ] **Split hours — only "Reservations" left.** v1 shipped general + per-service split hours; since then the
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
