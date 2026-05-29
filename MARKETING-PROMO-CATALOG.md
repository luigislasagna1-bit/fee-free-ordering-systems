# Promotions Catalog — GloriaFood Parity

Working document. Fills in as Luigi sends screenshots. Build starts only AFTER all 13 types + restrictions are catalogued.

---

## Universal patterns (apply to all 13 promo types)

Every promo flows through a **3-step wizard** with a Next button at top-right:

### Step 1 — Basic info (UNIVERSAL across all 13 types)
- **Headline** (text, max 35 chars) — e.g. "5% off total"
- **Description** (text, max 100 chars) — optional; placeholder hints "Ideally left empty since your title says it all"
- **Picture** (image upload, default supplied by template) — preview shown on left with text overlay "Learn more (Deal applied automatically)"
- Buttons: `← Back` `Next →`

### Step 2 — Type-specific config
This is the **only step that varies per promo type**. The discount/item/bundle config lives here. Details captured per-type below.

### Step 3 — Targeting + Save (UNIVERSAL across all 13 types)

**Basic settings (default view):**
- **Client type** (dropdown): Any client, new or returning | New only | Returning only
- **Order type** (radio):
  - Any type
  - Custom selection (multi-select chips): Pick-up, Delivery, Dine-in, Catering, Takeout
- **Only for selected delivery zones** (checkbox → opens zone picker)
- **Only for selected payment methods** (checkbox → opens payment picker)
- **Only once per client** (checkbox)
- **Mark promo as** (dropdown) — see exclusivity tiers below
- **Display Time** (dropdown): Always show to eligible clients | (other options TBD)
- **Use custom coupon code** (checkbox → opens code input — promo no longer auto-applies)
- Link: `Show advanced settings →`

**Advanced settings (revealed when toggled):**
- **Limited stock** (checkbox + count)
- **Order time** (dropdown): Any time | Weekdays | Weekends | Custom hours
- **Fulfillment time** (dropdown): Any time | Weekdays | Weekends | Custom hours
- **Highlight promo** (radio):
  - No highlight
  - Custom selection: `Cart value exceeds: [N] CAD` — banner highlight kicks in only when customer's cart crosses the threshold
- Link: `Show basic settings ←`

### Exclusivity tiers (3 states for "Mark promo as")
1. **Not exclusive** — Client can use other promos on the same order
2. **Exclusive** — No other promos on the same item are possible
3. **Master promo deal** — Can be redeemed alongside other promos, even those marked Exclusive

---

## Promo Type 1: % discount on cart  ✅ CAPTURED

> Apply a % off the customer's total cart, optionally only when cart meets a minimum amount.

### Step 1 — Basic info
Universal (headline, description, picture).
Picture default: pizza + drink image with "5% off total" overlay.

### Step 2 — Discount + Minimum order
- **Discount** (number 1-100, suffix `%`) — e.g. `5`
- **Minimum order amount** (group):
  - **Set a minimum order value (recommended)** (checkbox, default ON)
  - Number input + currency suffix (CAD) — e.g. `100`

### Step 3
Universal targeting + advanced settings.

### Schema → Promotion row
| GloriaFood field | FFOS Promotion field |
|---|---|
| Headline | `name` |
| Description | `description` |
| Picture | (NEW: `imageUrl` field — TODO add to schema) |
| Discount % | `ruleConfig.discountPercent` |
| Min order | `minimumOrder` (existing) |
| Client type | `customerType` (existing) |
| Order type (multi) | `orderType` (CHANGE: currently single string, need array) |
| Selected delivery zones | `restrictions[] = { kind: "delivery_area", zoneIds: [...] }` |
| Selected payment methods | `restrictions[] = { kind: "payment", methods: [...] }` |
| Only once per client | `restrictions[] = { kind: "frequency", perClient: 1 }` |
| Mark promo as | `stackingRule` (EXTEND: add "master" value) |
| Display Time | (NEW: `displayMode` enum — TODO) |
| Use custom coupon code | `autoApply` + `couponCode` (existing) |
| Limited stock | `usageLimit` + `usedCount` (existing) |
| Order time | `restrictions[] = { kind: "happy_hour" }` for placement window |
| Fulfillment time | (NEW: separate from order time — TODO clarify) |
| Highlight promo (cart threshold) | `showOnBanner` + (NEW: `highlightThreshold` field) |

### Platform additions needed for Type 1 (apply to all 13 types since universal sections)
- **`Promotion.imageUrl`** field (String?, defaults to type-template image)
- **`orderType` migration** from single-string to array (or comma-separated for back-compat)
- **`stackingRule`** extend to support `master` value (currently `standard | exclusive`)
- **`displayMode` enum** (always_visible | hidden_until_first_cart | …)
- **`highlightThreshold` field** (Float?) for conditional banner highlight
- **Order time vs Fulfillment time** clarification — are these different? Need to ask Luigi on a later screenshot.

### Open questions for Promo 1
1. Display Time dropdown — what are the OTHER options besides "Always show to eligible clients"? Need to see expanded.
2. Fulfillment time vs Order time — when fulfillment is "weekends only" but order time is "anytime," does it mean customers can ORDER any day but the promo only applies to weekend deliveries?
3. Cart value threshold for Highlight — is the banner HIDDEN below threshold or just visually less prominent?

---

## Promo Type 2: % discount on selected items  ✅ CAPTURED

> Apply a % off specific items chosen by the restaurant (e.g. 30% off any dessert or drink)

### Step 1 — Basic info
Universal (headline, description, picture).
Picture default: same pizza image with "30% off" overlay + "Get it now" CTA.

### Step 2 — Eligible items + Discount + Charges
This is the type's signature config:

- **Eligible items** picker (info tooltip: *"Select one or more items. When clients add an item from your selection to the cart, the discount set below will be applied automatically."*)
  - Labeled **Items Group 1:** with `[N selected]` summary + edit pencil
  - Opens a MODAL with:
    - Tree view: categories expandable, each containing items
    - Category-level checkbox (selects all items in category — partial state shows count, e.g. `SPECIALS (1)`)
    - Item-level checkbox
    - Cancel / Apply buttons
  - The "Items Group 1" naming pattern means **multi-group is supported** — for Meal Bundle (Type 8) we'll have Group 1, 2, 3, etc.

- **Discount:** Items Group 1: `[N]` `%` — % off applied to the selected items only

- **No extra charges** (dropdown with info tooltip):
  - **No extra charges** (default) — discount applies to base item price only
  - **Charge extra for "Choices / Addons"** — discount on base item, modifiers/addons still charge full price
  - **Charge extra for "Choices / Addons" & "Sizes"** — discount on base item, modifiers + size upgrades still charge full price

  Powerful upsell knob — owner can offer a discount but keep modifier revenue.

### Step 3 — Universal targeting (IMPORTANT new finding)
Same as Type 1, **plus** Display Time has a SECOND option revealed by Screenshot 5 tooltip:

- **Display Time**:
  - **Always show to eligible clients** (default)
  - **Hide from menu** — promo NOT visible in the menu; only redeemable when the matching coupon code is typed at checkout

  Tooltip: *"You may consider marking this promo as 'Hide from menu'. This way only clients who know the coupon code can unlock this promo."* Pairs with `Use custom coupon code` for flyer-printed campaigns.

- **Use custom coupon code** validation: **4-20 characters** when checked

### Schema additions (incremental on top of Type 1's scope)
| GloriaFood field | FFOS storage |
|---|---|
| Eligible items (multi-group ready) | `ruleConfig.itemGroups = [{ id: 1, categoryIds: [], menuItemIds: [], discountPercent: 30 }]` |
| Extra charges policy | `ruleConfig.extraChargesPolicy = "none" \| "addons" \| "addons_sizes"` |
| Display Time = Hide from menu | `displayMode = "always" \| "hidden_until_coupon_entered"` |
| Coupon code length validation | server-side 4-20 char enforcement |

### Open questions for Promo 2
1. For restaurants with hundreds of items — does the picker have a search box? Pagination?
2. Does selecting a CATEGORY include items added later (dynamic) or only items present at save time (snapshot)?
3. What does "Items Group 1:" suggest about adding Group 2, 3, etc.? Is there an "Add Group" button on screens for more complex promo types?

---

## Promo Type 3: Free delivery  ✅ CAPTURED

> Free (or discounted) delivery, applied to the DELIVERY FEE not the cart, with optional minimum order

### Step 2 — Discount + Minimum order
- **Discount** `[N]` `%` — % off the delivery fee. **100% = totally free**, anything less = partial discount (e.g. 50% off delivery)
- **Minimum order amount**:
  - **Set a minimum order value (recommended)** (checkbox, default ON)
  - `[N]` `CAD`

### Step 3 — Universal targeting (with one type-specific lock)
- **Order type** is **locked to Delivery** (no Pick-up option — this promo only makes sense for delivery orders). The "Custom selection" chip shows `Delivery` as the only entry.
- **Only for selected delivery zones** checkbox (when checked) — expands to show ALL zones from the restaurant's existing delivery-zone configuration (`Zone 1`, `Zone 2`, ..., `Zone N`). Each zone is individually checkboxable.
  - This means we need to pull zone names dynamically from `DeliveryZone` rows for the picker UI.

### Highlight tooltip (universal across most promos — captured here)
> *"Some clients may not notice the promo deal section when they start ordering or they see it and decide to look into this later. Therefore sales may be lost due to people forgetting or not noticing how to chase available promo deals. Use this setting to 'step-forward' and upgrade your clients ordering experience with a nice, contextual up-selling prompt."*

So **Highlight promo** is about **active attention** — when cart value exceeds the threshold, the promo banner gets an "almost there!" upselling treatment rather than passive display.

### Schema additions
| GloriaFood field | FFOS storage |
|---|---|
| Delivery fee discount % | `ruleConfig.deliveryFeeDiscountPercent = 100` (or less) |
| Order type lock | Implicit — promotionType "free_delivery" forces `orderType = "delivery"` server-side |
| Selected delivery zones | `restrictions[] = { kind: "delivery_area", zoneIds: ["zone_abc", "zone_def"] }` |

### What changes for the customer
- Cart subtotal: unchanged
- Delivery fee line: `[fee] × (1 - discountPercent/100)` — shows original + strikethrough or "Free Delivery" badge

### Open questions for Promo 3
1. When the customer has zones-restricted promo + chose a non-eligible zone → does the promo just not apply (silent), or does it show "available in zones X, Y, Z"?
2. Free delivery on a $0 delivery zone — does it still show "Free delivery!" or hide because there was nothing to discount?

---

---

## Promo Type 4: Buy one, get one free  ✅ CAPTURED

> Buy a "qualifying" item, get a second item from a (potentially identical) set free or discounted

### Step 2 — TWO item groups + dual discount
This is the first type with **multiple item groups**, and the pattern carries forward to all combo/bundle types (8, 10, 11, 12, 13).

Tooltip: *"Example: Buy 1 Pizza and get the 2nd Pizza free would require to select all Pizzas for 'Items Group 1' and the same for 'Items Group 2'. By default this template is set to discount the cheaper item by 100%."*

- **Eligible items**:
  - **Items Group 1:** `[N selected]` (edit pencil) — the "buy" items
  - **Items Group 2:** `[N selected]` (edit pencil) — the "get free" items
  - Each opens the same tree-view modal as Type 2
  - Groups can be IDENTICAL (same 32 pizzas in both) — classic BOGO on same item
  - Or DIFFERENT (Group 1 = mains, Group 2 = drinks) — "buy a main, get a free drink"

- **Discount:** dropdown — default "Automatically set discounts" (other options TBD — likely "Manually set per-item" or similar)

- **Discount for cheapest item:** `[N]` `%` (default 100 — i.e. the cheaper of the two items is free)
- **Discount for most expensive item:** `[N]` `%` (default 0 — i.e. the pricier item is paid in full)
  - Owners can flip this for "buy expensive, get cheap at 50% off" type promos

- **No extra charges** dropdown — same 3 options as Type 2

### Step 3 — Universal, plus NEW Highlight conditions
The advanced section's "Highlight promo > Custom selection" reveals an alternative trigger:

- **No highlight** (default)
- **Custom selection** (radio) — pick ONE of:
  - **Cart value exceeds: `[N]` CAD** (the threshold we saw on Type 1/3)
  - **Client adds an item to the cart that matches any item from "Item group 1"** (NEW)
  - **Client adds an item to the cart that matches any item from "Item group 2"** (NEW)
  - (Multiple highlight triggers can be set — looks like checkboxes, not radios within Custom selection — TBD)

So Highlight isn't only cart-value-based — it can fire when a qualifying ITEM enters the cart, making upsell prompts contextual to what the customer is already buying.

### List-view tooltip (revealed in Screenshot 5)
Hovering a promo in the Self-made promos list shows a popup with:
- **What the client gets**: e.g. "100% discount to the cheapest item"
- **Conditions**: e.g. "Order Type: Pickup, Delivery"

This is a quick-scan affordance for owners managing many promos — they don't have to click in to see what each one does. Worth building.

### Schema additions
| GloriaFood field | FFOS storage |
|---|---|
| Items Group 1 | `ruleConfig.itemGroups[0] = { categoryIds, menuItemIds }` |
| Items Group 2 | `ruleConfig.itemGroups[1] = { categoryIds, menuItemIds }` |
| Discount cheapest | `ruleConfig.discountCheapestPercent = 100` |
| Discount expensive | `ruleConfig.discountExpensivePercent = 0` |
| Highlight on item-in-cart | `highlightTriggers = [{ kind: "item_in_group", groupIndex: 0 }]` |

### Open questions for Promo 4
1. The "Discount:" dropdown — what are the alternative options beyond "Automatically set discounts"? Likely "Manually set per-item" for fine-grained control.
2. Can Items Group 1 and 2 OVERLAP (i.e. same item in both groups for classic same-item BOGO)? Looks like YES based on Luigi's screenshot (Group 1 = 32 selected, Group 2 = 31 selected — heavy overlap).
3. What if the customer adds 3 items from Group 1 + 1 from Group 2 — does the promo apply to the most expensive pair, the cheapest pair, or all qualifying pairs? Need to find rule.

---

---

## Promo Type 5: Fixed discount amount on cart  ✅ CAPTURED

> $X off cart total with required minimum order amount

### Step 2 — Fixed discount + Min order
- **Discount:** `[N]` `CAD` (default 5)
- **Minimum order amount:** `[N]` `CAD` (default 10)
  - No "Set a minimum order value" toggle here — min order is implicit/required for fixed-amount discounts (otherwise the math could result in free items)

### Reveals from Promo 5's Step 3 screenshots (universal, apply to ALL types)

**Client Type dropdown options (full list now confirmed)**:
- **Any client, new or returning** (default)
- **Only new clients**
- **Only returning clients**
- **NEW per Luigi 2026-05-29: Only members (signed up + have an account)** ← TO ADD

  Distinction:
  - Returning client = any customer who's placed ≥1 order before (matched by email)
  - Member = has registered an account at this restaurant (RestaurantCustomerAccount row exists)
  - A guest who's ordered twice is "returning" but not a "member"
  - A new sign-up who hasn't ordered yet is a "member" but not "returning"

**Display Time dropdown options (full list now confirmed)**:
- **Always show to eligible clients** (default)
- **Limited showtime** — time-window scheduled visibility (need to capture the sub-config: probably "show between X:XX and Y:YY on days Z")
- **Hide from menu (redeem with coupon code)** — invisible until matching coupon code typed

**"Only once per client" tooltip**: *"If this option is enabled, anonymous clients will not be eligible for the promotion."*
- Anonymous (guest) customers can't redeem once-per-client promos because we have no way to track them across sessions
- Practical consequence: enabling this restriction silently filters out guest orderers; only matched customers (by email) or members can use it
- Need a UI hint when this is checked + "Any client" type — warn the owner

**"Only for selected payment methods" expanded form**:
- Shows checkbox list of payment methods the restaurant has enabled (e.g. `Online payments`)
- Customer must use the selected method(s) for the promo to apply

### Schema additions
| GloriaFood field | FFOS storage |
|---|---|
| Fixed cart discount | `ruleConfig.fixedDiscountAmount = 5` |
| Required min order | `minimumOrder = 10` (existing field) |
| Client Type = members | `customerType = "member"` (CHANGE: extend enum) |
| Display Time = Limited showtime | `displayMode = "limited_showtime"` (need sub-config) |

### Open questions for Promo 5
1. What's the **Limited showtime** sub-configuration UI? (Day-of-week + hour range like Order time, or just a single window?)
2. Should we extend `customerType` enum to `member` OR add a separate `requiresMembership` boolean? Enum is simpler.
3. When `Only once per client` + `customerType = any` is set + a guest tries to order: do we (a) silently skip the promo, (b) show "sign in to use this promo" CTA, or (c) reject the order? GloriaFood likely just silently skips.

---

---

## Promo Type 6: Payment method reward 🔒 LOCKED   ⏳ AWAITING SCREENSHOTS

> % off if paid via specific payment method (e.g. credit card online)

What I need:
- All 3 steps
- Specifically Step 2: payment-method picker

---

## Promo Type 7: Get a FREE item 🔒 LOCKED   ⏳ AWAITING SCREENSHOTS

> Free drink on any order $30+

What I need:
- All 3 steps
- Step 2: which items are eligible to be "the free one"? Single pick, category, list?

---

## Promo Type 8: Meal bundle 🔒 LOCKED   ⏳ AWAITING SCREENSHOTS

> Any 2 appetizers + 2 mains + 2 desserts for $55

What I need:
- All 3 steps  
- Step 2: **the multi-slot bundle composer** — slots for category + count + final price. This is the most complex type.

---

## Promo Type 9: Buy N, get one free 🔒 LOCKED   ⏳ AWAITING SCREENSHOTS

> Generalization of Type 4 — buy 2 → free, buy 3 → free, etc.

What I need:
- All 3 steps
- Step 2: how many of which, and which one becomes free (cheapest? specific?)

---

## Promo Type 10: Free dish as part of a meal 🔒 LOCKED   ⏳ AWAITING SCREENSHOTS

> Free dessert if starter + main purchased

What I need:
- All 3 steps
- Step 2: triggers (starter + main) → reward (free dessert) composition

---

## Promo Type 11: Fixed discount on combo deal 🔒 LOCKED   ⏳ AWAITING SCREENSHOTS

> $5 off main + dessert combo

What I need:
- All 3 steps
- Step 2: combo composer + flat $ off

---

## Promo Type 12: % discount on combo deal 🔒 LOCKED   ⏳ AWAITING SCREENSHOTS

> 10% off main + dessert combo

What I need:
- All 3 steps
- Step 2: combo composer + % off (likely identical UX to Type 11 with % instead of $)

---

## Promo Type 13: Meal bundle with speciality 🔒 LOCKED   ⏳ AWAITING SCREENSHOTS

> Meal bundle but a subset of selected items has an upcharge

What I need:
- All 3 steps
- Step 2: bundle composer with "speciality items" sub-section + upcharge fee

---

## Restrictions Modal   ⏳ AWAITING SCREENSHOTS

The 8 restriction types from Screenshot 4 of earlier set. Need detail on each:

1. **Happy Hour** — day-of-week + hour ranges
2. **Delivery Area** — zone picker (mirror of /admin/delivery zone editor?)
3. **Cart Value** — min/max thresholds
4. **Payment** — payment method picker
5. **Expiration** — date picker
6. **Client Type** — new/returning/specific
7. **Frequency** — per client / per period
8. **Exclusivity** — already captured in Step 3 above (might be same modal?)

What I need:
- Modal entry point (where do you click to open it?)
- Each restriction's individual config form (8 screenshots, one per restriction type)
