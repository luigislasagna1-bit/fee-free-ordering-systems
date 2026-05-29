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

## Promo Type 2: % discount on selected items   ⏳ AWAITING SCREENSHOTS

> Apply a % off specific items (e.g. 30% off any dessert or drink)

What I need to see:
- Step 1: basic info (likely identical to Type 1 — just send the screenshot to confirm)
- Step 2: **the item picker** — categories vs items? Multi-select? Search?
- Step 3: targeting + advanced (will be identical to Type 1, just confirm)
- (Optional) Tooltip on the picker explaining what's selectable

---

## Promo Type 3: Free delivery   ⏳ AWAITING SCREENSHOTS

> Free or discounted delivery for orders over a cart value

What I need:
- Step 1 + Step 3 (universal — quick screenshots)
- Step 2: **what does free delivery config look like?** Toggle "free" vs "discounted X%"? Per-zone configurable? Min cart input?

---

## Promo Type 4: Buy one, get one free   ⏳ AWAITING SCREENSHOTS

What I need:
- Step 1 + Step 3 (universal)
- Step 2: **how does the buy-X get-Y picker work?**
  - Pick "buy" item(s) — single item, category, any?
  - Pick "get free" item(s)
  - Are they always the same item?
  - Does it work on the cheapest of N?

---

## Promo Type 5: Fixed discount amount on cart   ⏳ AWAITING SCREENSHOTS

> $X off the cart value with optional minimum order

What I need:
- Step 1 + Step 3 (universal)
- Step 2: **fixed $ amount input + min order toggle** (likely mirror of Type 1 but $ instead of %)

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
