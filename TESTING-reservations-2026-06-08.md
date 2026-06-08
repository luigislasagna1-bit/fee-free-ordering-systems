# Manual test plan — Reservations & Reserve-then-order (2026-06-08)

Covers everything shipped this session. Run top to bottom. For each step, the
**Expected** is what should happen — tell me which ones don't match and I'll fix.

Legend: 🧑‍🍳 = do it on the **kitchen display**, 🛎️ = **admin settings**, 📱 = **customer** ordering site.

---

## A. Kitchen — Reject a pending reservation  (commit 071dacf)

**Setup** 🛎️ Admin → Reservations settings → turn **Auto-confirm OFF** (manual acceptance).

1. 📱 Make a test reservation (Book a Table → fill details → *Just book the table* / Reserve).
2. 🧑‍🍳 Open the kitchen display.
   - **Expected:** the booking appears as **PENDING** (it rings the new-order alarm; it shows in the **All** tab and the **Reservations** tab).
3. 🧑‍🍳 Click the booking tile → the **detail panel** opens.
   - **Expected:** the tile itself has **no** Confirm/Reject buttons on it (just a chevron); the buttons are in the detail panel.
4. In the detail panel for the pending booking:
   - **Expected:** you see **Accept** + **Reject** (and **Print**).
5. Tap **Reject**.
   - **Expected:** the booking leaves the kitchen within a few seconds; the customer receives a **declined** email (sender = your restaurant name).
6. Repeat 1–4, but tap **Accept**.
   - **Expected:** the booking flips to **CONFIRMED**; the customer gets the **confirmed** email. The detail now shows **Seated** + **No-show**.
7. With Auto-confirm **OFF**, confirm a new pending booking does **not** send a "confirmed" email until you tap Accept (it should send only a "request received" note on booking).

---

## B. Kitchen — a pending ORDER can only be Rejected, not Cancelled  (commit 67b9ed0)

1. 📱 Place a normal food order (pickup or delivery).
2. 🧑‍🍳 Click the new (ringing) order → detail panel opens with **Accept / Reject** at the top.
3. Look at **Manage order** (Cancel + Refund).
   - **Expected:** while the order is **pending (not accepted)**, the **Manage order** section is **hidden** — there is **no Cancel**. Only Accept / Reject.
4. Tap **Accept**.
   - **Expected:** now **Manage order** appears → **Cancel** (and Refund where applicable) are available.
5. Sanity: open an already-**completed** order.
   - **Expected:** Manage order is still available (Cancel + Refund stay reachable on finished orders).
6. Sanity: Reject a different pending order, then open it.
   - **Expected:** because it's now "rejected" (no longer pending), Manage order/Refund is reachable again — nothing is stranded.

---

## C. Kitchen — reservation actions live in the detail panel  (commit a535e20)

1. 🧑‍🍳 In the **All** tab, find a reservation among the orders.
   - **Expected:** it's a clean tile (name, status badge, time, party, chevron) with **no inline action buttons** — same idea as an order tile.
2. Click it → detail opens on the right (full screen on mobile).
   - **Expected:** Accept/Reject (pending) or Seated/No-show (confirmed), plus Print + a Close (X).
3. Open the dedicated **Reservations** tab and click a booking there too.
   - **Expected:** same split list + detail behaviour; buttons in the detail, not the tile.
4. Click an **order** while a reservation detail is open (and vice-versa).
   - **Expected:** the panel switches cleanly — only one detail (order OR reservation) shows at a time.

---

## D. Reserve-then-order — the main feature  (commit 7eff448)

### D0. Enable it
🛎️ Admin → Reservations settings → turn **"Let customers order food with their reservation"** (allowPreOrder) **ON**. Save.

### D1. Happy path — book + order + pay (one submission)
1. 📱 Tap **Book a Table** → fill the booking (date/time/party, name, phone, email).
   - **Expected:** two buttons now — **Add food to your booking** (primary) and **Just book the table** (secondary).
2. Tap **Add food to your booking**.
   - **Expected:** you land on the **menu**, order type is **dine-in**, and a sticky banner reads **"🪑 Ordering for your table reservation — {date} at {time} · party of {n}"** with a **Cancel** link.
3. Add a couple of items → go to **Checkout**.
   - **Expected:** a banner at the top of checkout: **"Confirming your table reservation"** + the date/time/party line.
4. Pay (use whatever method your restaurant accepts — cash, pay-in-person, or card).
5. **Expected after placing:** one order is created. On the kitchen:
   - the **order** appears in the order feed (the food), AND
   - the **reservation** appears with a **PRE-ORDER** badge; its detail shows the **Pre-order total** (in your currency).
6. The customer gets **one** confirmation (the order confirmation) — not a separate reservation email.

### D2. Card payment timing (only if you accept online card)
1. Repeat D1 but pay by **card**, and **before** completing the Stripe payment, check the kitchen.
   - **Expected:** the booking is **NOT** visible in the kitchen yet (hidden until paid), exactly like the order itself.
2. Complete the card payment.
   - **Expected:** both the order and the booking now appear together.
3. (Optional) Start a card pre-order and **abandon** the payment.
   - **Expected:** no table is booked and the kitchen never sees it.

### D3. Drop-off = no booking
1. 📱 Book → **Add food** → land on the menu → **close the tab** (or tap **Cancel** on the banner) without checking out.
   - **Expected:** no reservation was created (nothing in the kitchen). Cancel returns you to a normal order.

### D4. Bare table still works
1. 📱 Book → **Just book the table** (don't add food).
   - **Expected:** books exactly like before — no order, no pre-order badge in the kitchen.

### D5. Booking rules still enforced on a pre-order
1. 📱 Try **Add food** for a time outside the allowed notice window or a fully-booked slot.
   - **Expected:** it's blocked with the same message a normal booking would show (a pre-order can't bypass the rules).

### D6. Currency
1. 📱 On a non-USD restaurant (e.g. EUR), do a pre-order.
   - **Expected:** the kitchen pre-order total shows the right symbol (€ not $).

### D7. Language (i18n)
1. 📱 Switch the customer language (e.g. Italian, Spanish, German).
   - **Expected:** "Add food to your booking", "Just book the table", the menu banner, and the checkout banner all render translated (not English).

---

## Notes / results
- A: ______
- B: ______
- C: ______
- D1–D7: ______
