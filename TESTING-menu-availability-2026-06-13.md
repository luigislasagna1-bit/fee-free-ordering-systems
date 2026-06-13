# Manual test plan — Menu Visibility & Fulfilment Time (2026-06-13)

Covers the rebuilt menu **Visibility** + **Availability / Fulfilment Time** system
(GloriaFood-style), plus the **time-of-day menus** it sits next to. Run top to
bottom. For each step, **Expected** is what should happen — tell me which ones
don't match and I'll fix.

**Key idea to keep straight (this trips people up):**
- **Visibility** = *whether the item even SHOWS on the menu.* (Items **and** categories.)
- **Fulfilment Time** = *when a shown item can actually be ORDERED FOR.* (Items only.)
  The item still shows every day; outside the window the customer is asked to
  **schedule** their order for a valid time — exactly like a catering item.

Legend: 🛎️ = do it in **Admin → Menu**, 📱 = **customer** ordering site
(`/order/your-slug`, or use the **Preview & test ordering** button in Admin → Menu
so test orders don't hit real reports).

> Tip: do these on your **test/preview** ordering link. Any order you place there
> is marked **TEST-** — it rings the kitchen and prints, but never counts in
> reports or revenue.

---

## A. Fulfilment Time — set a "Tuesday-only" special  🛎️

1. Admin → **Menu**. Open (edit) any menu **item** — pick one customers can
   normally order any day.
2. Click the **Availability** tab.
   - **Expected:** you see a **Fulfilment time** heading with a small **ⓘ** help
     icon, an intro line, and two buttons: **Available anytime** (selected by
     default) and **Only certain days / times**.
3. Hover (or tap) the **ⓘ** help icon.
   - **Expected:** a short tooltip explains the feature in plain language
     ("…still appears on the menu every day, but outside the window customers are
     asked to schedule…"). It should not clutter the page.
4. Click **Only certain days / times**.
   - **Expected:** an indigo panel opens with a **day picker** (Sun–Sat + "Any
     day"), a **from / until** time pair, and a blue **preview** line at the
     bottom describing what customers will see.
5. In the day picker, select **only Tue**. Leave the times empty. **Save**.
   - **Expected:** it saves with no error and the editor closes.
6. Re-open the same item → **Availability** tab.
   - **Expected:** it still shows **Only certain days / times** selected, with
     **Tue** highlighted and the time fields empty (your setting persisted).

---

## B. Fulfilment Time — what the customer sees  📱

> Do this on a day that is **NOT** Tuesday (so the window is "closed" right now).

1. Open the customer ordering page and find the item from section A.
   - **Expected:** the item **still appears** on the menu (it is **not** hidden),
     showing a small indigo badge like **"Order ahead · Tue"** under its name.
2. Click the item.
   - **Expected:** the item opens normally (it is **not** greyed-out/blocked) with
     a working **Add to Cart** button.
3. Add it to the cart and go to **Checkout**.
4. Look at the **time** section of checkout.
   - **Expected:** **ASAP is not offered**; the order is forced into **Schedule**
     mode, and the time has been **auto-set to the next Tuesday**. Expanding the
     time section shows a 📅 note: *"One or more items in your cart can only be
     ordered for certain days or times…"*.
5. Try to move the scheduled date to a **non-Tuesday**, then place the order.
   - **Expected:** you can't end up with an invalid order — if a non-Tuesday
     slips through, the server **rejects** it with a message naming the item
     ("…can only be ordered for certain days/times…"). The order is **not** created.
6. Set the schedule to an actual **Tuesday** and place the (TEST) order.
   - **Expected:** the order **goes through** and rings the kitchen as a scheduled
     order for that Tuesday.

---

## C. Fulfilment Time — lunch-only (time window)  🛎️ 📱

1. 🛎️ Edit a different item → **Availability** → **Only certain days / times**.
2. Leave days on **Any day**; set **from 11:00**, **until 15:00**. **Save**.
   - **Expected:** the preview line and save both work; "Any day" means every day,
     limited only by the time.
3. 📱 On the customer page, **before 11:00 or after 15:00**:
   - **Expected:** the item shows with an **"Order ahead · 11:00 – 15:00"** badge
     and forces scheduling at checkout (auto-set to the next 11:00 slot).
   - (Times should display in your restaurant's **12h/24h** format.)
4. 📱 **Between 11:00 and 15:00** (during the window):
   - **Expected:** the item can be ordered **ASAP** normally — no forced
     scheduling, because it's orderable right now.

---

## D. Fulfilment Time — combined day + time, and turning it off  🛎️ 📱

1. 🛎️ Edit an item → select **Tue** **and** set **17:00 – 20:00**. Save.
   - **Expected (📱):** badge reads **"Order ahead · Tue · 17:00 – 20:00"**;
     checkout forces the schedule to the next **Tuesday at 17:00**.
2. 🛎️ Edit that item again → click **Available anytime** → Save.
   - **Expected (📱):** the badge is **gone**; the item is a normal ASAP item
     again on every day. (Switching to "anytime" fully clears the restriction.)

---

## E. Fulfilment vs Visibility — they are independent  🛎️ 📱

1. 🛎️ On one item, set **Visibility** = *Hide from menu* (Visibility tab) **and**
   a **Fulfilment** Tuesday window (Availability tab).
   - **Expected (📱):** Visibility wins for *showing* — the item is **hidden**
     (you don't see it at all), regardless of the fulfilment window.
2. 🛎️ Set **Visibility** back to *Always show*; keep the Tuesday fulfilment.
   - **Expected (📱):** item is back, with the "Order ahead · Tue" badge.
3. 🛎️ On a **category**, open its editor.
   - **Expected:** a category has a **Visibility** tab but **no** Availability/
     Fulfilment tab (fulfilment is per-item only).

---

## F. Visibility tab recap (categories + items)  🛎️ 📱

1. 🛎️ Item or category → **Visibility** tab → choose **Hide from menu**. Save.
   - **Expected (📱):** it disappears from the customer menu entirely.
2. 🛎️ Choose **Show only during** a date range or recurring days/times. Save.
   - **Expected (📱):** it appears only inside that window and is absent outside it
     (this is the "hide outside the window" behaviour — different from Fulfilment,
     which keeps it visible and schedulable).

---

## G. Time-of-day menus (daily windows) recap  🛎️ 📱

1. 🛎️ Admin → Menu → the **menu switcher** (top). Give a menu a daily window,
   e.g. a "Lunch" menu **10:00 – 16:00** and a "Dinner" menu **16:00 – 22:00**.
   - **Expected:** there's a **ⓘ** "how menus work" note; the editor warns if your
     windows leave a gap in open hours.
2. 📱 Load the customer page at different times of day.
   - **Expected:** the **live menu auto-switches** by the current time — lunch
     items midday, dinner items in the evening — without you flipping anything.

---

## What to report back

For any step where **Expected** didn't match, tell me:
- the section + step number,
- what you saw instead (a screenshot helps),
- the time of day / day of week (these features are time-sensitive).

I'll fix and we move on to the reseller report list.
