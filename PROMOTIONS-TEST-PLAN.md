# Marketing Suite — Live Test Plan

End-to-end test sheet for the Marketing Suite that shipped over commits
`3693f42` → `d5dba85` on `main` (now live on `feefreeordering.com`).

**How to use this:** work top-down through the tiers. Each test has a
checkbox and "Expected" + "Actual" rows. Tick the box when it passes;
write what you saw if it fails. Pause + ping Luigi after each tier so
he can fix anything broken before you move on.

**Test restaurant:** Luigi's Lasagna & Pizzeria (`luigis-lasagna-pizzeria`)
on the prod (dawn-tree) Neon branch. Has Advanced Promo Marketing
unlocked so types 6-13 are accessible.

**Test customer (member):** `iclixadmin1@gmail.com` (used in the earlier
checkout screenshots).

---

## Tier 1 — Critical path (~30 min)

These are the paths most real customers will hit. Get this tier solid
before moving to Tier 2/3.

### T1.1 — Type 1 (% off cart, whole cart)
- [ ] **Admin**: `/admin/promotions/new` → pick **#1 % discount on cart**
- [ ] Step 2 → set Name = "10% off everything", Discount % = 10. Pick **Whole cart** radio (default).
- [ ] Step 3 → leave restrictions default. Pick the **Save Big** stock image.
- [ ] Click **Save promo** → land back on list with the new promo visible.
- [ ] **Edit** the promo (click pencil) → wizard re-opens at Step 2 with values prefilled → change discount to 15% → save.
- [ ] **Duplicate** from the list → new "(Copy)" appears with isActive=false.
- [ ] **Customer**: open `/order/luigis-lasagna-pizzeria` → green promo card with the SAVE BIG image shows at top.
- [ ] Click the promo card → modal opens showing "Whole cart" info.
- [ ] Add ~$15 of items → reach checkout → celebration banner shows "🎉 You unlocked … − $2.24" (15% of subtotal).
- [ ] Sub-total / Tax math correct.
- [ ] Place test order → kitchen receipt shows the discount line.
- [ ] **Delete** the duplicate from /admin/promotions.

### T1.2 — Type 1 with item targeting
- [ ] Create another Type 1 promo, this time Step 2 → pick **Specific items / categories only** → pick the Beverages category.
- [ ] Save.
- [ ] **Customer**: add a Pop Can ($2.49) + a Pasta dish ($X) → only the Pop Can should be discounted in the celebration banner.

### T1.3 — Type 5 (Fixed $ off cart)
- [ ] Wizard → pick **#5 Fixed discount on cart** → Discount Amount = $5, Minimum Order = $20.
- [ ] Step 3 leave defaults.
- [ ] **Customer**: add ~$15 → banner does NOT trigger (under min).
- [ ] Add another item to push above $20 → banner appears, $5 discount.

### T1.4 — Type 4 (BOGO)
- [ ] Wizard → pick **#4 Buy one, get one free** → Paid Group = [Pizzas], Free Group = [Pasta]. Discount strategy = cheapest 100%.
- [ ] **Customer**: add 1 pizza + 1 pasta → cheapest item should be free (full discount in banner).

### T1.5 — Coupon code (before vs after items)
- [ ] Create any Type 1 promo with Coupon Code = `TEST10`, autoApply = false.
- [ ] **Customer flow A**: enter coupon `TEST10` in the checkout modal BEFORE adding items → message says "added" but no discount yet (cart empty).
- [ ] Add items → discount applies (universal auto-apply principle).
- [ ] **Customer flow B**: clear cart. Add items first, then open checkout → enter coupon → discount applies immediately.

### T1.6 — Stacking
- [ ] Create 3 promos: A = Standard 5% off, B = Exclusive 10% off, C = Master $2 off.
- [ ] **Customer**: add items → ONLY B (best exclusive) + C (master) should fire. A is blocked.
- [ ] Verify banner shows both B and C with correct savings.

### T1.7 — Locked type paywall (re-verify)
- [ ] Sign out as Luigi's restaurant (or use the demo).
- [ ] Without the Advanced Promo add-on, open the wizard → click any of #6-#13 → upgrade modal appears.

**After Tier 1: ping Luigi with results. Move to Tier 2 once green.**

---

## Tier 2 — Restrictions (~60 min)

For each: create ONE promo with only that restriction set, test gating.

### T2.1 — Happy Hour
- [ ] Set daysOfWeek = today + usableHourStart/End = next 5 min from now.
- [ ] **Customer**: cart eligible → banner appears.
- [ ] Wait until past the window → banner disappears / promo doesn't fire at checkout.

### T2.2 — Cart Value
- [ ] minimumOrder = $50.
- [ ] $40 cart → no fire. $51 cart → fires.

### T2.3 — Delivery Area
- [ ] Pick 1 zone from the multi-select.
- [ ] **Customer**: address inside that zone → promo fires. Address outside → no fire.
- [ ] Pickup order with same cart → does NOT fire (zone-restricted).

### T2.4 — Payment Method
- [ ] paymentMethodSlugs = `["cash"]`.
- [ ] Customer selects Cash on delivery → promo fires.
- [ ] Customer selects Pay Online (Card) → does NOT fire.

### T2.5 — Expiration
- [ ] startsAt = tomorrow → promo does NOT fire today.
- [ ] endsAt = yesterday → promo does NOT fire today.

### T2.6 — Client Type: new
- [ ] customerType = "new".
- [ ] Sign in as a customer with prior order history → no fire.
- [ ] Sign in as a brand-new customer → fires.

### T2.7 — Client Type: returning
- [ ] customerType = "returning".
- [ ] New customer → no fire.
- [ ] Repeat customer → fires.

### T2.8 — Client Type: member
- [ ] customerType = "member".
- [ ] Guest checkout (no signed-in account) → no fire.
- [ ] Signed in as a member → fires.

### T2.9 — Frequency: once per lifetime
- [ ] onceLifetimePerClient = true.
- [ ] Customer places one qualifying order → discount applies.
- [ ] Customer places SECOND qualifying order → discount does NOT apply (silent suppress).

### T2.10 — Frequency: usage limit
- [ ] usageLimit = 1, autoApply = true.
- [ ] One customer's order applies → 2nd customer (any) does NOT get it.

### T2.11 — Display mode: hidden_coupon_only
- [ ] displayMode = `hidden_coupon_only`, couponCode = `SECRET20`.
- [ ] **Customer**: open ordering page → promo banner NOT visible.
- [ ] Enter `SECRET20` in checkout → discount applies.

### T2.12 — Display mode: popup
- [ ] displayMode = `popup`.
- [ ] **Customer**: open ordering page → modal pops up automatically.
- [ ] Dismiss → page renders normally.

### T2.13 — Limited Showtime
- [ ] Add ONE showtime schedule: today, current hour + 30 min.
- [ ] **Customer**: visit within window → banner visible.
- [ ] Visit outside window → banner hidden.
- [ ] (Within window, coupon code still works → use case for emailed codes.)

**After Tier 2: ping Luigi. Move to Tier 3 once green.**

---

## Tier 3 — Advanced types (~90 min)

The 8 locked types. Most complex configs → most likely to surface bugs.

### T3.1 — Type 6 Payment method reward
- [ ] Wizard → #6 → Payment Method = Cash (only enabled methods show), Discount % = 5%.
- [ ] **Customer**: select Pay Online → modal shows promo info but discount does NOT fire.
- [ ] Switch to Cash on Delivery → discount fires.

### T3.2 — Type 7 Get a FREE item
- [ ] Wizard → #7 → Trigger amount = $30, eligible group = Beverages.
- [ ] **Customer**: cart under $30 → click promo → modal shows "Add $X more to unlock".
- [ ] Cart over $30 → click promo → modal shows pickable freebies. Pick one → added to cart at $0 with note "Free with promo".
- [ ] Verify checkout total reflects the free item.
- [ ] Place order → kitchen receipt shows the free item line.

### T3.3 — Type 8 Meal bundle
- [ ] Wizard → #8 → Bundle Price = $25. Groups:
  - Group 1: minCount 1, maxCount 1, items = Pizzas
  - Group 2: minCount 2, maxCount 2, items = Sides / Beverages
  - Group 3: minCount 1, maxCount 1, items = Desserts
- [ ] Save.
- [ ] **Customer**: click banner → composer modal opens.
- [ ] Try to "Add bundle to cart" without filling all slots → button disabled.
- [ ] Pick 1 pizza, 2 sides, 1 dessert → button enables.
- [ ] Click Add → cart shows ONE line "Meal bundle — $25.00" with the 4 child items indented underneath.
- [ ] Cart total = $25 (not sum of individual items).
- [ ] Place order → kitchen receipt shows parent + indented children, no per-child price.

### T3.4 — Type 9 Buy N get one free
- [ ] Wizard → #9 → Paid Group = Pizzas (min 2). Free group = Pizzas. Strategy = cheapest 100%.
- [ ] **Customer**: 1 pizza in cart → no fire.
- [ ] 3 pizzas → cheapest discounted to $0.

### T3.5 — Type 10 Free dish as part of meal
- [ ] Wizard → #10 → Trigger groups = Pizzas + Pasta (both required). Free group = Desserts.
- [ ] **Customer**: just a pizza → no fire.
- [ ] Pizza + pasta + dessert → dessert discounted to $0 (or % per ruleConfig).

### T3.6 — Type 11 Fixed discount on combo
- [ ] Wizard → #11 → 2 groups (Pizzas + Beverages), Discount Amount = $5.
- [ ] **Customer**: only pizzas in cart → no fire.
- [ ] Pizza + beverage → $5 off.

### T3.7 — Type 12 % discount on combo
- [ ] Same as T3.6 but with Discount % = 10%.
- [ ] Verify math: 10% of eligible item subtotal.

### T3.8 — Type 13 Meal bundle with speciality
- [ ] Wizard → #13 → Bundle base = $20. 3 groups, the "premium" one has speciality fee = $5 per item.
- [ ] **Customer**: composer shows "+$5" badge on premium items.
- [ ] Pick a premium item → cart shows bundle = $20 + speciality fee, total = $25.

---

## Edge cases worth poking at

- [ ] Cart with both a normal item AND a bundle → bundle skips the engine, normal item still gets eligible promos.
- [ ] Cart with TWO bundles (same promo) → behavior reasonable?
- [ ] Switch order type pickup ↔ delivery with an active promo → re-evaluates correctly.
- [ ] Refresh checkout page mid-flow → applied promos persist (localStorage cart restored, /api/public/apply-promos re-runs).
- [ ] Change delivery address to OUTSIDE-zone with a zone-restricted promo → promo drops out, banner disappears.
- [ ] Use a coupon code that's been used to its usage limit → "expired/exhausted" error.

---

## Sign-off

When Tier 1 + Tier 2 + Tier 3 + Edge cases all pass:
- [ ] **Marketing Suite verified live**
- Date:
- Verified by: Luigi
