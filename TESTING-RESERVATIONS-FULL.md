# Reservation System — Full End-to-End Test Plan

Everything we built for table reservations + reserve-then-order, start to finish.
Work top → bottom. Tell me any step where **Actual ≠ Expected**.

**Legend:** 🛎️ admin back-end · 📱 customer ordering site · 🧑‍🍳 kitchen display · 📧 email inbox · 🖨️ receipt printer

**Test restaurant:** Luigi's Lasagna (`info@luigislasagna.com` / luigispizzapastawings.com)

> ⏳ **Before you start:** wait for the latest Vercel deploy to finish, then hard-refresh the kitchen display and the ordering page once so they pull the newest code.

---

## SECTION 0 — Baseline setup (do this once)

| # | Where | Do | Expected |
|---|-------|-----|----------|
| 0.1 | 🛎️ | Profile → confirm **time format = 12-hour** (so we can check AM/PM everywhere) | Saved |
| 0.2 | 🛎️ | Profile → note the **currency** (USD here) | Shown as `$` later |
| 0.3 | 🛎️ | Reservations settings → **Auto-confirm = OFF** (manual accept) | Saved |
| 0.4 | 🛎️ | Reservations settings → **"Allow guests to pre-order food when booking a table" = ON** | Saved |
| 0.5 | 🛎️ | Reservations settings → note the **hold time** (e.g. 15 min) | Used in the hold note |
| 0.6 | 🛎️ | Payments → make sure **Dine-In** accepts at least **Cash** + one card method | Used in pre-order checkout |

---

## SECTION A — Admin reservation settings behave

- [ ] **A1 — Auto-confirm OFF gates acceptance.** With 0.3 OFF, a new booking must arrive **pending** and wait for staff. (Verified in E/F.)
- [ ] **A2 — Auto-confirm ON (optional).** Flip it ON, make a booking → it arrives **already confirmed** (no manual accept needed), customer gets the confirmed email immediately. **Flip back OFF** for the rest of the tests.
- [ ] **A3 — Pre-order toggle OFF hides food option.** Temporarily turn 0.4 OFF → on the customer **Book a Table** flow there is **no** "Add Food" path, only book-the-table. **Turn it back ON.**

---

## SECTION B — Customer: book a table ONLY (no food)

- [ ] **B1** 📱 Open the site → **Book a Table**.
- [ ] **B2** The two buttons read **"Add Food To Your Booking"** and **"Just Book The Table"** (Title Case), with a hold note like **"We hold your table for 15 min after your reservation time…"**
- [ ] **B3** Pick a date, **time (e.g. 7:00 PM)**, party size → **Just Book The Table** → fill name/phone/email → submit.
- [ ] **B4** Confirmation screen shows the booking + a confirmation code.
- [ ] **B5** 📧 Customer gets a **"request received"** email (not yet "confirmed", because auto-confirm is OFF). Sender = **Luigi's Lasagna**.

---

## SECTION C — Customer: reserve a table **+ pre-order food** (the main feature)

- [ ] **C1** 📱 **Book a Table** → pick **time = 8:00 PM**, party of 2 → **Add Food To Your Booking**.
- [ ] **C2** You land on the menu in "ordering for your reservation" mode (a banner/notice up top referencing the reservation).
- [ ] **C3** Add an item (e.g. Ravioli Rose) → go to **Checkout**.
- [ ] **C4 — Reservation banner.** Checkout shows **"Confirming your table reservation — {date} at 8:00 PM · party of 2"**.
- [ ] **C5 — Order-type LOCKED.** The **Ordering Method** is **Dine-In only** — there is **NO** Pickup / Delivery / Take-Out switcher.
- [ ] **C6 — Time sync.** There is **no separate time picker**; the order is locked to the **8:00 PM** booking time.
- [ ] **C7 — Payment.** Choose **Cash** (in-person). Totals look right (subtotal + tax + tip).
- [ ] **C8** **Place order.**
- [ ] **C9** Confirmation screen shows it as one combined reservation + order.

---

## SECTION D — Customer edge cases

- [ ] **D1 — Drop-off before checkout = nothing booked.** 📱 Book → **Add Food** → land on the menu → **close the tab / hit Cancel on the banner** before placing the order. → 🧑‍🍳 No booking and no order appears in the kitchen. 🛎️ No reservation row created.
- [ ] **D2 — Card pre-order, before paying.** (Only if you accept online card.) Start a card pre-order, but **stop before completing payment** → 🧑‍🍳 it's **NOT** in the kitchen yet.
- [ ] **D3 — Card pre-order, after paying.** Complete the card payment → the **one** order tile (with booking) appears in the kitchen.
- [ ] **D4 — Abandon card pre-order.** Start a card pre-order, abandon before paying → **no table booked**, nothing in kitchen.
- [ ] **D5 — Order time always equals booking time.** Repeat C with a different time (e.g. 9:30 PM) → the order's scheduled time matches **9:30 PM** exactly (kitchen detail + email + receipt all say 9:30 PM).

---

## SECTION E — Kitchen: incoming booking, alarm, labels, icons

Use the **walk-up booking from B** and the **pre-order from C**.

- [ ] **E1 — Pre-order = ONE tile.** The C pre-order shows as **a single order tile**, NOT a separate order + booking.
- [ ] **E2 — Pre-order flag.** That tile reads **"🪑 TABLE RESERVATION + PRE-ORDER · party of 2"**.
- [ ] **E3 — Pre-order icon.** Its type icon is the **fuchsia calendar-clock**.
- [ ] **E4 — Walk-up label.** The B walk-up booking shows a **purple "TABLE RESERVATION"** label.
- [ ] **E5 — Walk-up icon.** Its icon is the **indigo calendar**.
- [ ] **E6 — Other order-type icons (sanity).** Place a quick normal order of each kind and confirm: Pickup = green bag · Delivery = blue truck · Take-Out = orange box · Dine-In = violet utensils.
- [ ] **E7 — Continuous alarm.** A new pending booking/order **rings AND flashes yellow continuously** until you accept / decline / it auto-rejects. Tapping the tile (without confirming) does **NOT** stop the ring.
- [ ] **E8 — Acknowledge.** The silence/acknowledge control stops the bell but keeps the "new" indicator.

---

## SECTION F — Kitchen: accept / reject / seated / no-show / undo

- [ ] **F1 — Reject a pending booking.** Open the B walk-up booking → **Reject**. → 📧 Customer gets a **declined** email (sender = Luigi's Lasagna). The booking moves out of pending.
- [ ] **F2 — Accept a pending booking.** Make a fresh booking → open it → **Accept**. → 📧 Customer gets a **confirmed** email. 🖨️ A booking receipt **prints on accept**.
- [ ] **F3 — Accept the pre-order (one acceptance).** Open the C pre-order → **Accept once** → it queues the food **and** confirms the table (no second accept anywhere). 🖨️ Kitchen ticket prints.
- [ ] **F4 — Seated.** On an accepted/confirmed booking, tap **Seated** → status updates to seated.
- [ ] **F5 — No-show.** On another booking, tap **No-show** → status updates.
- [ ] **F6 — Undo / backtrack.** After Seated (or No-show), the status switcher lets you go **back** to Confirmed (undo a mistake) — and undoing does **NOT** re-send the confirmed email.
- [ ] **F7 — Accept-prompt time format.** When accepting, any time shown in the prompt is **12-hour (e.g. 8:00 PM)**, not 20:00.

---

## SECTION G — Kitchen: full-screen layout

- [ ] **G1** Each tab (All / In Progress / Complete / Reservations) fills the **full width** of the screen.
- [ ] **G2** Tapping any order or booking opens a **full-screen** detail with a **← back button** top-left.
- [ ] **G3** Back returns you to the same tab.
- [ ] **G4** A new-order alarm + the Accept prompt still work while a detail is open.
- [ ] **G5 — Reservations tab opens the food.** In the **Reservations** tab, tap the **C pre-order** booking → it opens the **full order detail** (dishes + reservation info above), like the All tab. A **walk-up** booking opens the simpler booking view.

---

## SECTION H — Tabs, persistence & per-tab clearing (the big one)

> Rule: **nothing is ever removed from a tab except** (a) the **red trash** clear on that tab, or (b) the end-of-day In-Progress→Complete roll. Bookings behave exactly like orders.

### H1 — Reservations tab is a full ledger
- [ ] **H1a** The **Reservations** tab lists **ALL** bookings — walk-up **and** pre-order — soonest first.
- [ ] **H1b** Mark a booking **Completed** → it **stays** in the Reservations tab (does not vanish).
- [ ] **H1c** A booking whose **time has passed** is **still listed** (not auto-removed).

### H2 — Bookings appear in All + Complete like orders
- [ ] **H2a** **All Orders** tab: walk-up bookings show **alongside** orders. The pre-order shows as its **order tile** (not a duplicate booking row).
- [ ] **H2b** **Complete** tab: a **finished** walk-up booking (completed / no-show / cancelled / rejected) shows alongside completed orders.

### H3 — Per-tab clear (trash button) works on bookings too
- [ ] **H3a** On **All Orders**, the **red trash** icon is visible (top-right of the tab bar) whenever the tab has anything — **even if it's only bookings**.
- [ ] **H3b** Tap the trash on **All Orders** → confirm → **orders AND walk-up bookings clear** from All together. A **pending** booking is kept (needs accept/decline first), just like a pending order.
- [ ] **H3c** Switch to **Reservations** → the bookings you just cleared from All are **STILL there** (independent per-tab clear). ✅ key check
- [ ] **H3d** On **Complete**, tap the trash → finished orders **and** finished bookings clear from Complete only; they remain in Reservations.
- [ ] **H3e** On **Reservations**, tap the trash → clears bookings from the Reservations tab only; cleared ones still appear in All/Complete if not cleared there.

### H4 — Orders don't auto-complete on the timer
- [ ] **H4a** Accept a normal order with a prep time → **before** its ready time, open it from **In Progress** → there is **NO** Mark Complete button (still cooking).
- [ ] **H4b** After the ready time passes, the order **still says accepted/in-progress** (it did **NOT** auto-complete) and now a **Mark Complete** button appears.
- [ ] **H4c** Tap **Mark Complete** → it moves to the **Complete** tab **immediately**.
- [ ] **H4d** Leave another past-ready order alone → it stays in **In Progress** until the day rolls over, then appears in **Complete** (not before).

---

## SECTION I — Emails (customer + store)

- [ ] **I1 — Combined pre-order email.** For the C pre-order, **both** the customer email and the store/kitchen email say it's a **table reservation + pre-order**, with **"🪑 Table reserved for 2 — {date} 8:00 PM"** and the food list. **One** email each, not two separate ones.
- [ ] **I2 — Walk-up booking emails.** Request-received (on booking) and confirmed/declined (on accept/reject) all arrive, sender = **Luigi's Lasagna**.
- [ ] **I3 — Email time format.** All times in every reservation email are **12-hour (8:00 PM)**, matching the restaurant setting — not 20:00.
- [ ] **I4 — Email currency.** The pre-order total in the email shows **$** (the restaurant currency).

---

## SECTION J — Printed receipts (🖨️ on the Star printer)

- [ ] **J1 — Print on accept.** Accepting a new booking prints a receipt automatically.
- [ ] **J2 — Pre-order ticket is flagged.** The C pre-order's printed **kitchen ticket** shows, under the order type:
  ```
  ** TABLE RESERVATION + PRE-ORDER **
  Party of 2
  ** BOOKING **
  {date} 8:00 PM
  ```
  …and the food list — **not** a plain order ticket.
- [ ] **J3 — Customer copy too.** If you print the customer copy, it carries the same **TABLE RESERVATION + PRE-ORDER** + party + booking time.
- [ ] **J4 — Receipt time format.** The booking time on the receipt is **12-hour (8:00 PM)**.
- [ ] **J5 — Money on receipt.** Totals print in **$**.

---

## SECTION K — Time format & currency are consistent everywhere

- [ ] **K1 — Switch to 24-hour.** 🛎️ Profile → set time format **24-hour**, save. Re-run a booking + pre-order and confirm **every** surface now shows **20:00** style: customer reservation banner, checkout, kitchen tile + detail + accept prompt, email, receipt, status page. **Then set it back to 12-hour.**
- [ ] **K2 — Currency (optional, needs a EUR test restaurant).** On a EUR restaurant, the pre-order total shows **€** in the kitchen, email, and receipt — not `$`.

---

## SECTION L — Language / i18n

- [ ] **L1** 📱 Switch the ordering site language (e.g. **Italian**) → the **Book a Table** buttons, the reservation banner, and the hold note all render **translated** (placeholders like the time/party still correct).
- [ ] **L2** Confirm no raw key text (e.g. `reservation.holdNote`) appears anywhere — everything is real translated text.

---

## RESULTS

```
Section 0 (setup):   ____
A (settings):        A1 __  A2 __  A3 __
B (book only):       B1 __  B2 __  B3 __  B4 __  B5 __
C (pre-order):       C1 __  C2 __  C3 __  C4 __  C5 __  C6 __  C7 __  C8 __  C9 __
D (edge cases):      D1 __  D2 __  D3 __  D4 __  D5 __
E (kitchen incoming):E1 __  E2 __  E3 __  E4 __  E5 __  E6 __  E7 __  E8 __
F (accept/reject):   F1 __  F2 __  F3 __  F4 __  F5 __  F6 __  F7 __
G (full-screen):     G1 __  G2 __  G3 __  G4 __  G5 __
H (tabs/persistence):H1a-c __  H2a-b __  H3a-e __  H4a-d __
I (emails):          I1 __  I2 __  I3 __  I4 __
J (receipts):        J1 __  J2 __  J3 __  J4 __  J5 __
K (time/currency):   K1 __  K2 __
L (i18n):            L1 __  L2 __
```

**Anything marked ✗ — tell me the section number and what you saw, and I'll fix it.**
