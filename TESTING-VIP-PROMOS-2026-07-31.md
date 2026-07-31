# VIP promo stack — test plan (Luigi's Lasagna, 2026-07-31)

The setup under test, all on **Luigi's VIP Pizza Club**:

| Promo | % | Stacking | Applies to |
|---|---|---|---|
| 20% OFF Menu Wide - VIP MEMBERS | 20 | standard | all categories EXCEPT `PIZZAS` and `SKOOL VIP Pizza Club Specials` |
| TOONIE TUESDAY | 60 | standard | `SKOOL VIP Pizza Club Specials` only |
| JULY VIP SPECIAL | 50 | standard | `PIZZAS` (+3 items) |
| First-time customer special | 10 | **master** | WHOLE CART, `customerType=new` ⚠️ |
| FREE DELIVERY | — | master | whole cart, min $30 |

The design rule: **no two promos may target the same item.** Scoping is what
enforces it — the engine itself sums every standard promo that qualifies.

## How to test without spending money

Build the cart → open **Checkout** → read the green "You unlocked promos!" panel
and the per-line "You saved" chips → **close the modal**. Nothing is charged
until "Place order". Do the whole matrix this way, then place ONE small real
order at the end (test 7).

## The standard test cart

| Item | Price |
|---|---|
| Build Your Own Pizza (Small) | $9.99 |
| Toonie Tuesday Slice | $5.00 |
| Carbonated Spring Water | $2.49 |
| **Subtotal** | **$17.48** |

---

## Test 1 — Member, signed in ✅ ALREADY PASSED 2026-07-31

Expect: JULY −$5.00 · TOONIE −$3.00 · 20% −$0.50 → **$8.98 pre-tax**.
Slice lands at exactly **$2.00**. Pizza gets 50% and NOT the extra 20%.

## Test 2 — NON-member ⭐ HIGHEST RISK

Private/incognito window → same 3 items → checkout with an email that is **not**
in the VIP group, not signed in.

**PASS:** no promo panel, no "You saved" chips, subtotal stays **$17.48**.
**FAIL:** any discount appears → members-only pricing is leaking to the public.

## Test 3 — Member NOT signed in (email match)

Members are matched by email at checkout as well as by login. Private window,
same 3 items, type a **member's** email in Contact.

**PASS:** identical to Test 1 (−$8.50).
This is how most members will actually order — do not skip it.

## Test 4 — First-time customer who IS a member ⚠️ KNOWN ISSUE

Use a member email that has **never ordered**.

**EXPECT (today):** the three VIP discounts **plus** roughly **−$1.75** from the
10% first-timer master → about $7.23. The slice effectively falls **below $2**.

This is not a mis-configuration of the VIP promos — it is the `First-time
customer special` being a **master**, which by design stacks with everything and
can never be blocked. Decide: leave it (acquisition cost), make it standard, or
scope it. The "one discount per item" feature removes the problem entirely.

## Test 5 — 20% covers the right categories

Cart one item from `SANDWICHES`, one from `SALADS`, one from `BEVERAGES / DIPS`.
**PASS:** each shows 20% off, nothing else.
Then add a `PIZZAS` item: it must show **50%**, never 50+20.

## Test 6 — Exclusions hold

- **Gift card** → no discount at all (globally `promoExcluded`).
- **A promo-excluded item** (Veggie Lasagna, Beef Lasagna, the Spaghettis,
  Breaded Veal/Chicken, Salad Tray, the Pennes) → **no 20%**. Confirm that is
  intended for those 11 items; several look like catering trays.

## Test 7 — One real order, end to end

Place a small real member order (e.g. just the slice → $2.00 + tax).
Verify: the **kitchen ticket / printed receipt** shows the same discounted
prices as checkout did, the confirmation email totals match, and the order in
Admin → Orders shows the same figures. (Preview-vs-charge parity was a launch
blocker once; re-verify after any promo change.)

## Test 8 — Toonie slice timing

Members should be able to order the slice **any day** for Tuesday pickup
(Fulfilment Time). Confirmed working 2026-07-31 — a pre-order scheduled for
Tue Aug 4 priced correctly.

---

## Known observation, not a bug

The tip is calculated on the **pre-discount** subtotal. On the test cart, 15%
was $2.62 (15% of $17.48) rather than $1.35 (15% of $8.98). Defensible — the
staff did the same work — but a VIP choosing "15%" is really tipping ~29% of
what they pay. Confirm this is intended.

## After ANY promo change, re-run

Tests 1, 2 and 5 are the regression core: member gets the right stack,
non-member gets nothing, and no item is ever discounted twice.
