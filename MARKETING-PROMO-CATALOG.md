# Promotions Catalog — GloriaFood Parity

Working document. Fills in as Luigi sends screenshots. Build starts only AFTER all 13 types + restrictions are catalogued.

---

## 🎯 UNIVERSAL ENGINE PRINCIPLE (Luigi 2026-05-29, applies to ALL 13 types)

> **Promos must auto-apply whenever the cart matches eligibility — regardless of whether the customer used the walkthrough or added items manually. The walkthrough is a discovery UX, not a requirement.**

### Concrete rules

**For auto-apply promos (no coupon code required):**
- Customer adds items that satisfy the promo's group/quantity criteria → promo applies AUTOMATICALLY at the next cart re-evaluation
- Customer doesn't need to click the banner, doesn't need to use any walkthrough
- Walkthrough/banner is purely a DISCOVERY affordance — "hey, here's a deal you could go after"

**For coupon-code-gated promos:**
- Customer types the code at checkout → system evaluates if cart items also satisfy the criteria
- If yes → applied. If no → "this code is for [X], add a pizza to use it"
- Code can be entered BEFORE adding items OR AFTER — outcome is identical
- Customer can also click the banner → walkthrough builds matching cart → code auto-applied

**For "Hide from menu" promos:**
- Coupon code is REQUIRED to unlock visibility AND apply
- Otherwise behaves identically to coupon-gated above

### Engine architecture implication

The promo engine runs on EVERY cart change (add item, remove item, modify quantity, apply coupon, change order type):
```
for each ActivePromo in restaurant.activePromos:
  if promo.isHiddenFromMenu and not coupon entered: skip
  if promo.couponCode and not coupon entered or wrong code: skip
  if not promo.restrictions.allSatisfy(cart, customer, time): skip
  if not promo.ruleConfig.cartQualifies(cart): skip
  apply discount/freebie/bundle-conversion to cart
```

The walkthrough modals (FreebiePromptModal, BundleComposerModal) just help customers BUILD a qualifying cart faster. They don't gate eligibility.

### Why this matters
- Owner-built promo: "Buy a pizza + pasta, get free sandwich"
  - Customer A clicks banner → walkthrough → picks 1 pizza, 1 pasta, 1 sandwich → discount applied
  - Customer B adds 1 pizza + 1 pasta + 1 sandwich naturally (browsing menu) → discount applied
  - Both paths result in the same final cart, same discount, same total
- For coupon-gated:
  - Customer adds qualifying items → enters code → discount applied
  - Customer enters code first → adds qualifying items → discount applied
  - Customer enters code but cart isn't qualifying yet → "this code requires [X] in your cart"

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

## Promo Type 6: Payment method reward 🔒 LOCKED  ✅ CAPTURED

> % off cart when customer pays via a specific payment method (e.g. online card)

### Structural insight
Promo 6 is **architecturally identical to Promo 1** (% discount on cart). The only difference:
- **Default title**: "Online payment discount" (vs "5% off total")
- **Default restriction**: `Only for selected payment methods` pre-checked with the restaurant's `Online payments` method auto-selected
- Step 2: just `Discount: [N] %` + optional min order (same as Type 1)

So this isn't a new RULE — it's a **preset template** of Type 1 with restrictions pre-populated. Internally we can use:
```
ruleConfig: { kind: "discount_percent_cart", discountPercent: 5 }
restrictions: [{ kind: "payment", methods: ["online_card"] }]
```

Per Luigi: *"depending on the restaurants enabled payment options, you will see more options available here to pick from"* — payment method picker dynamically pulls from `Restaurant.paymentMethods` (the JSON list configured in /admin/payments). E.g. Cash, Card in person, Online card, PayPal all show as checkboxes when enabled.

### Why it's a separate template at all
**Marketing/discoverability** — when an owner thinks "I want to incentivize customers to pay online (saves the staff from handling cash, faster checkout)", they can find a purpose-built template called "Payment method reward" rather than having to know that's just "% off cart" with a payment restriction.

### Universal NEW reveals from Promo 6's screenshots — Limited showtime sub-config

When `Display Time = "Limited showtime"`, two sub-config groups appear:

**1. Days & time of the week** (checkbox to enable, can have MULTIPLE entries):
- 7 day-of-week checkboxes (Mon, Tue, Wed, Thu, Fri, Sat, Sun — multi-select)
- Time range: `[HH:MM AM/PM]` — `[HH:MM AM/PM]`
- Save / Cancel buttons
- After save, displays as e.g. "Tuesday-Wednesday, Friday-Saturday: 10:00 AM - 08:00 PM" with X (delete) + edit pencil
- **Add** button creates another window → owner can configure multiple schedules
  - E.g. "Mon-Fri 12:00-15:00 (lunch) + Sat-Sun 18:00-22:00 (dinner)"

**2. Available between:** (checkbox to enable):
- Single date-range picker (2-month calendar, Cancel/Apply)
- E.g. "10 Jun 2026 - 21 Jun 2026"
- Functions as the OVERALL campaign window — combines with day/time schedule

**Both can be combined:** "Available June 10-21, but only on Tue-Wed-Fri-Sat from 10am-8pm" → both must pass for the promo to be visible.

### Schema implication for Display Time
```json
"displayMode": "limited_showtime",
"showtimeConfig": {
  "schedules": [
    { "daysOfWeek": [1, 2, 4, 5], "startMinute": 600, "endMinute": 1200 },
    { "daysOfWeek": [6, 0], "startMinute": 1080, "endMinute": 1320 }
  ],
  "availableBetween": { "startDate": "2026-06-10", "endDate": "2026-06-21" }
}
```

Multiple `schedules` entries means we need an array; `availableBetween` is optional.

### Open questions for Promo 6
1. Should we expose Promo 6 as a separate "type" in the picker, or just have Promo 1 with a "preset: payment-method-reward" auto-populated config? Marketing argument says SEPARATE TYPE (easier to discover).
2. If the restaurant has multiple online payment options (Stripe + PayPal) — does the promo apply to BOTH, or owner picks one?

---

---

## Promo Type 7: Get a FREE item 🔒 LOCKED  ✅ CAPTURED

> Free (or steeply discounted) bonus item that the CUSTOMER chooses from a curated list, triggered by a qualifying cart (e.g. $30+ → pick a free drink)

### Critical UX difference from Promo 2
Promo 2 discounts items that are **already** in the cart. Promo 7 **prompts the customer to ADD** a free item once their cart qualifies — a new customer-facing modal.

Tooltip: *"In case you select more than one item your client can choose only one."*
- Owner can list multiple items as eligible "freebies" (e.g. Coke, Sprite, Bottled Water, Iced Tea)
- Customer picks ONE when prompted at qualification
- Customer can't take 2 freebies even if multiple eligible items are listed

### Step 2 — Eligible items + Discount + Min order
- **Eligible items** picker (same tree-view modal as Type 2) — *Items Group 1* — list of "candidate freebies"
- **Discount**: Items Group 1: `[100]` `%` (default 100 = totally free; 50 = half off etc.)
- **No extra charges** dropdown (same 3 options — but only relevant if discount < 100%)
- **Minimum order amount** (checkbox, CHECKED by default — required logically because there has to be a qualifying threshold)
  - Default value: 30 CAD

### Customer-facing flow we need to build
1. Customer adds items to cart
2. Cart subtotal crosses the minimum order threshold
3. **Modal appears**: "🎁 You qualify for a free [drink]! Pick one:"
4. Shows the eligible items as buttons (with their images)
5. Customer taps one → item added to cart at $0 (or discounted price)
6. If customer modifies cart and drops below threshold → freebie auto-removed

This is the **first customer-facing modal we have to add** for any promo type. Worth a dedicated component (`<FreebiePromptModal />`).

### Schema additions
```json
"ruleConfig": {
  "kind": "free_item_choice",
  "eligibleGroup": { "categoryIds": [...], "menuItemIds": [...] },
  "discountPercent": 100,
  "extraChargesPolicy": "none"
}
// minimumOrder (existing field) gates eligibility
```

### Open questions for Promo 7
1. If the customer has ONE eligible item available and crosses threshold — does it auto-add, or still prompt?
2. If multiple "Get a FREE item" promos are active (e.g. one for $30+ → drink, one for $50+ → dessert) — both prompt, or only the highest-tier one?
3. Does the prompt re-fire if the customer dismisses it once? (probably no — would be annoying)
4. What if the customer adds the freebie at full price (because they like it) and THEN crosses threshold? Should the existing line auto-discount, or is a SEPARATE bonus line added?

---

---

## Promo Type 8: Meal bundle 🔒 LOCKED  ✅ CAPTURED

> N items at a flat price, where the customer picks ONE item from each of N curated groups (e.g. 1 appetizer + 1 main + 1 dessert = $25)

### Architectural insight
This is the most complex type. It introduces a **bundle line item** in the cart — not a simple "$N off" computed on existing items. Instead, the customer is guided through a modal that builds the bundle one slot at a time. The cart line item carries the sub-items but charges only the flat price.

### Step 2 — Multi-group composer + flat price
- **Eligible items** — supports **N item groups** (no upper bound seen — Luigi configured 5 in test)
  - Each group = ONE slot in the bundle
  - To do "Any 2 appetizers + 2 mains + 2 desserts," owner creates 6 groups (2 of each), since each group = 1 slot
  - **`Add` link** at the bottom appends a new group
  - **`X` button** next to each group removes it
- **Flat price:** `[N]` `CAD` — single price for the entire bundle
- **Extra charges policy** (same 3-option dropdown):
  - No extra charges → flat price covers EVERYTHING including modifiers
  - Charge extra for "Choices / Addons" → flat price covers base items, addons add to total
  - Charge extra for "Choices / Addons" & "Sizes" → flat covers base, modifiers + size upgrades add

### Flat price tooltip (critical detail)
*"The client will be guided through this promo deal contextually in order to complete his preferences on this meal bundle deal. He can only choose items from the items groups selected above. Any free or paid add-ons associated to any of these items will also be included in the same flat price. If you want specific extra-toppings or add-ons not to be included in this price please remove the association between items and add-ons from the menu and list them as stand-alone selectable dish items."*

So flat price normally **includes modifiers** (when policy = "No extra charges"). If owner wants modifiers excluded, they must list those items as **separate menu items** rather than addons.

### Customer-facing flow (Screenshot 5)
1. Customer triggers the bundle (clicks the promo banner, or types the coupon code, or auto-applies if cart qualifies)
2. Modal appears titled "Special offer" with N slots labeled `Item:` `[Please select...]`
3. Right side shows: "Special offer for $10 CAD (excluding addons and size)"
4. Customer clicks Item 1 → relevant category items appear BELOW the modal
5. Customer picks an item → progression advances to Item 2
6. Repeat for all N slots
7. After completing all slots → bundle added to cart as ONE line item at the flat price

The **menu category panel renders below the modal** so the customer can browse the full category for each slot. Once they pick, modal advances.

### Cart line item shape (new)
```
[Bundle: Special Offer] — $10.00
  • Item 1: Beef Lasagna (Take & Bake)
  • Item 2: Vegetable Lasagna (Take & Bake)
  • Item 3: Make Your Own Pizza Kit
  • Item 4: ...
  • Item 5: ...
```

Receipt + kitchen ticket need to render bundle nicely too.

### Schema additions
```json
"ruleConfig": {
  "kind": "meal_bundle",
  "itemGroups": [
    { "id": 1, "categoryIds": [...], "menuItemIds": [...] },
    { "id": 2, "categoryIds": [...], "menuItemIds": [...] },
    ...
  ],
  "flatPrice": 10.00,
  "extraChargesPolicy": "addons_sizes"
}
```

Cart-line schema needs a **`bundleItems` Json field** (or similar) on OrderItem to carry the bundle composition.

### Open questions for Promo 8
1. Can the customer go BACK in the modal to change Item 1 after picking Item 2? (UX expectation: yes)
2. What if one of the eligible items requires a modifier choice (e.g. pizza needs crust selection)? Does the modifier picker open during slot selection?
3. Bundle items with VARIANTS (sizes) — customer picks size during slot selection too? Yes per the "excluding size" hint in the modal.
4. Can a bundle item be added to cart multiple times? (e.g. "2x Special Offer = $20") Probably yes.
5. If a bundle item is out of stock, does the bundle become unavailable, or does the slot exclude it?
6. **Modifier price-coverage edge case**: extra charges = "No extra charges" means modifiers are FREE during bundle build, but customer expects them to behave normally outside the bundle. Need clear UX hints.

---

---

## Promo Type 9: Buy 2, 3,... get one free 🔒 LOCKED  ✅ CAPTURED

> Customer adds N matching items, gets a position-based discount on each — typically cheapest = 100% off (free)

### Key difference from Type 8 (Meal bundle)
- Type 8: flat $ price for the whole bundle (replaces all individual prices)
- Type 9: **position-based % discounts** — items are sorted by price, then % applied to each
- Type 9 doesn't introduce a "bundle line item" — it discounts the individual cart lines

### Step 2 — N item groups + dual-mode discount

**Eligible items:** N item groups (3+ — Luigi tested with 5)
- For "Buy 2, get 1 free" → 3 groups
- For "Buy 4, get 1 free" → 5 groups
- All groups typically populated with the SAME items (e.g. all pizzas) for classic same-item BOGO++
- Groups CAN differ for "complete a meal" variants (Group 1=appetizers, Group 2=mains, Group 3=desserts)

Tooltip: *"Buy 2 Pizzas and get the 3rd Pizza free would require you to select all Pizzas for 'Items Group 1', 'Items Group 2' and the same for 'Items Group 3'. By default the ordering system discounts the cheapest item by 100%."*

**Discount mode dropdown** (NEW: dropdown with 2 options):
- **Automatically set discounts** (default) — only shows 2 inputs:
  - Discount for cheapest item: 100% (locked)
  - Discount for most expensive item: 0% (locked)
  - Middle group(s) implicit 0%
- **Manually set discounts** — shows one % input per group:
  - Items Group 1: [N]%
  - Items Group 2: [N]%
  - ... per group
  - Owner can build a ladder e.g. 100/80/70/60/50% — staircase discount

**No extra charges** dropdown (same 3-option as other types)

### Evaluation algorithm
1. Cart contains items matching the N groups (at least 1 per group)
2. System sorts the qualifying items by price (cheapest → expensive)
3. Apply discount % per position:
   - In **automatic** mode: cheapest gets cheapestPercent%, expensive gets expensivePercent%, middles get 0%
   - In **manual** mode: each position gets its own configured %

### Schema additions
```json
"ruleConfig": {
  "kind": "buy_n_get_one_free",
  "itemGroups": [
    { "id": 1, "categoryIds": [...], "menuItemIds": [...] },
    { "id": 2, "categoryIds": [...], "menuItemIds": [...] },
    { "id": 3, "categoryIds": [...], "menuItemIds": [...] }
  ],
  "discountMode": "automatic",
  "discountPercentages": [100, 0, 0],     // index = position (0 = cheapest)
  "extraChargesPolicy": "none"
}
```

### Open questions for Promo 9
1. If the customer adds 6 qualifying items in cart and the promo is "buy 2 get 1 free" (3 groups) — does the discount fire ONCE (cheapest of 3) or TWICE (cheapest of each set of 3)? Toast-style usually fires multiple times; need to confirm.
2. Can the customer combine this with Promo 7 (free item choice) on the same cart? Universal exclusivity setting governs.
3. Does discount apply to the BASE item price only, or include modifiers? (extra charges dropdown handles this — same as other types)

---

---

## Promo Type 10: Free dish as part of a meal 🔒 LOCKED  ✅ CAPTURED

> Customer must include items from multiple groups; certain groups (typically the LAST) become free or discounted as the "reward" — e.g. buy pizza + pasta, get free sandwich

### Architectural insight
Promo 10 is a **generalization of Promo 9** (Buy N get one free) where:
- Promo 9 typically has identical groups (same items in each)
- Promo 10 has DIFFERENT groups (pizza vs pasta vs sandwich)
- Both use "Manually set discounts" mode where the owner explicitly says which groups are rewarded

Tooltip: *"Buy a pizza and a salad to get a free drink would require you to select all pizzas for 'Items Group 1', all salads for 'Items Group 2' and all drinks for 'Items Group 3'. Then you give a discount for 'Items Group 3' which basically discounts the drink."*

### Step 2 — N item groups + manual discount per group
- **N Item groups** (3+) representing distinct food categories
- **Discount mode**: "Manually set discounts" (default for this type)
- **Discount % per group**: owner picks which group(s) get the reward
  - Typical: [0%, 0%, 100%] — last group is free
  - Variant: [0%, 0%, 50%] — last group at half price
  - Variant: [0%, 25%, 50%] — escalating discount across the meal

### Customer-facing flow (when walkthrough used)
Same as Promo 8 (slot-by-slot guided picker) BUT items land in cart as **3 separate line items** (not a bundle line item). Only the discounted item shows the discount on the cart.

Screenshot 5 cart example:
- Build Your Own Pizza — full price
- Ravioli Rose — full price
- Philly Cheese Steak — strikethrough $15.99 → $0.00 ("You saved $15.99")

### Auto-apply path (per Universal Principle)
Customer adds 1 pizza + 1 pasta + 1 sandwich to cart manually → engine detects all 3 groups have a matching item → applies 100% discount to the group(s) configured with % > 0. **No walkthrough required.**

### Schema additions
```json
"ruleConfig": {
  "kind": "buy_combo_get_free_or_discounted",
  "itemGroups": [
    { "id": 1, "categoryIds": [...], "menuItemIds": [...] },
    { "id": 2, "categoryIds": [...], "menuItemIds": [...] },
    { "id": 3, "categoryIds": [...], "menuItemIds": [...] }
  ],
  "discountPercentages": [0, 0, 100],
  "extraChargesPolicy": "none"
}
```

### Key difference from Promo 8 (Meal bundle)
| | Promo 8 (Meal bundle) | Promo 10 (Combo with freebie) |
|---|---|---|
| Cart line items | ONE bundle line at flat price | N separate line items, only discounted ones show discount |
| Pricing model | Flat $ replaces all | Individual prices, % off configured groups |
| Receipt rendering | Single "Bundle" with sub-items | Normal line items with discount adjustments |

### Open questions for Promo 10
1. If cart has MULTIPLE matching items per group (e.g. 2 pizzas, 1 pasta, 2 sandwiches) — does the promo fire ONCE or TWICE? Same as Promo 9 question.
2. Edge case: customer adds qualifying combo, then removes pasta. Engine silently revokes the sandwich discount (per Universal Principle).

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
