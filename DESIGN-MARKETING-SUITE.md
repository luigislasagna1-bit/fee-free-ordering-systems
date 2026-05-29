# Marketing Suite Rebuild — Design Doc

**Status:** Design phase. Awaiting Luigi review before code.
**Branch:** `feature/marketing-suite-rebuild`
**Started:** 2026-05-29
**Estimated:** 3–4 weeks of focused work
**Soft launch:** delayed until this ships + vigorous testing passes

---

## 1 · What we're building (1-paragraph version)

Three-pillar marketing-tools suite mirroring GloriaFood:
1. **Kickstarter** — acquire first orders (First Buy Promo + Invite Prospects)
2. **Autopilot** — retain + reactivate (3 campaigns + smart segmentation + master toggle)
3. **Promotions** — the 13-type promo catalog with 8 restriction rules (free vs. paid tier)

All three share the **Pre-made Promo system**: campaigns auto-generate restaurant-specific coupon codes that get listed under Promotions → Pre-made tab. Each campaign owns its coupons, and the campaign's enable/disable cascades to its coupons.

---

## 2 · The three pillars

```
Marketing Tools
├── Kickstarter      (FREE — acquire first orders)
│   ├── Overview
│   ├── First Buy Promo       — 10% off first order for new customers
│   └── Invite Prospects      — CSV import + email blast
│
├── Autopilot        (FREE — retain + reactivate)
│   ├── Overview      — onboarding walkthrough
│   ├── Master toggle — "Activate Autopilot Selling? Yes/No"
│   └── 3 campaigns:
│       ├── Encourage second order   (NEW CLIENTS)         — 7d after 1st order, no 2nd
│       ├── Re-engage clients        (SLIPPING AWAY)        — bottom 60%/6mo cohort, WIN1→WIN5 escalating
│       └── Cart abandonment         (ALL CLIENTS)          — 1-2h after abandonment
│
└── Promotions       (mixed FREE + PAID)
    ├── Overview              — visual walkthrough (like screenshot 2)
    ├── Self-made promos      — restaurant-created (current "Promotions" list)
    └── Pre-made promos       — campaign-generated (Kickstarter/Autopilot artifacts)
```

---

## 3 · Promo Types (13 total)

### FREE tier (no add-on needed)
| # | Type | Description |
|---|---|---|
| 1 | % discount on cart | % off total cart, optional min order |
| 2 | % discount on selected items | e.g. 30% off any dessert |
| 3 | Free delivery | Free/discounted delivery over $X |
| 4 | Buy one, get one free | Buy main dish, second main free |
| 5 | Fixed discount amount on cart | $X off, optional min order |

### LOCKED behind Advanced Promo Marketing $19.99/mo
| # | Type | Description |
|---|---|---|
| 6 | Payment method reward | % off if paid with specific method (e.g. card online) |
| 7 | Get a FREE item | Free drink on $30+ order |
| 8 | Meal bundle | Any 2 appetizers + 2 mains + 2 desserts = $55 |
| 9 | Buy N, get one free | Generalized BOGO (buy 2 → 1 free, buy 3 → 1 free, etc.) |
| 10 | Free dish as part of a meal | Free dessert if starter + main purchased |
| 11 | Fixed discount on combo deal | $5 off main + dessert combo |
| 12 | % discount on combo deal | 10% off main + dessert combo |
| 13 | Meal bundle with speciality | Bundle with optional upcharge items |

---

## 4 · Restrictions (8 total — all FREE for any promo the restaurant has access to)

Apply ANY restriction to ANY promo the restaurant has unlocked.

| # | Restriction | Effect |
|---|---|---|
| 1 | Happy Hour | Day-of-week + hour-of-day usability window (we partly have this from today's Fabrizio work) |
| 2 | Delivery Area | Limit to specific delivery zone(s) or pickup-only |
| 3 | Cart Value | Min cart value to redeem (different from min order) |
| 4 | Payment | Limit to specific payment method (orthogonal to type #6) |
| 5 | Expiration | Hard expiry date (different from `endsAt`) |
| 6 | Client Type | New / Returning / Specific list |
| 7 | Frequency | Once per client / N per client / unlimited |
| 8 | Exclusivity | Stacks with other promos? Or stand-alone only? |

---

## 5 · Pre-made Promo system (the glue)

### Concept

A "Pre-made Promo" is a `Promotion` row that:
- Is owned by a specific campaign (`autopilot_2nd_order`, `autopilot_reengage_win1`, `kickstarter_first_buy`, etc.)
- Has a uniquely-generated coupon code (e.g. `2NDOFF`, `WIN1`, `WKLRTQNNJVA8Y`)
- Is activated/deactivated by the OWNING CAMPAIGN's toggle — NOT independently
- CAN be edited by the owner (name, discount %, etc.) — but the rule structure is template-defined

### Data flow

```
Owner clicks "Activate Autopilot Selling" master toggle = ON
  ↓
Owner enables individual campaign toggle (e.g. Re-engage clients = ON)
  ↓
Backend creates 5 Promotion rows tied to that campaign:
  - WIN1, WIN2, WIN3, WIN4, WIN5 with progressive discount %
  - Each has campaignRef = "autopilot_reengage_win1..5"
  - Each has isActive = true
  ↓
Pre-made Promos tab lists all 5, owner can edit values
  ↓
Cron job runs nightly, segments customers, sends WINn emails
  ↓
Owner disables campaign → 5 Promotion rows flip isActive=false
  (but rows kept; re-enabling restores them with prior edits)
```

### Why this matters

- **One source of truth** for promo discounts: the `Promotion` table
- **Owner can edit** without touching the campaign config
- **Self-made vs. pre-made distinction is just `campaignRef IS NULL`** vs. set
- **Coupon redemption code path is unchanged** — pre-made coupons go through the same promo engine

---

## 6 · Schema changes

### Promotion model — additions

```prisma
model Promotion {
  // existing fields...

  // NEW: campaign ownership (null = self-made)
  campaignRef       String?   // e.g. "autopilot_reengage_win1", "kickstarter_first_buy"
  campaignSequence  Int?      // 1-5 for re-engage progressive ladder

  // NEW: restriction polymorphism
  restrictions      Json      // serialized RestrictionConfig array
  ruleConfig        Json      // type-specific config (combo, bundle, etc.)

  // NEW: who locked this type
  requiredAddOnSlug String?   // "advanced_promo_marketing" for types 6-13

  @@index([campaignRef])
}
```

### NEW model — AutopilotState

```prisma
model AutopilotState {
  id                String   @id @default(cuid())
  restaurantId      String   @unique
  restaurant        Restaurant @relation(fields: [restaurantId], references: [id])

  // Master gate — "Activate Autopilot Selling? Yes/No"
  masterEnabled     Boolean  @default(false)

  // Individual campaign toggles (only matter if masterEnabled)
  secondOrderEnabled  Boolean @default(false)
  reEngageEnabled     Boolean @default(false)
  cartAbandonmentEnabled Boolean @default(false)

  // Last-run timestamps (for cron dedup)
  lastSecondOrderRun  DateTime?
  lastReEngageRun     DateTime?
  lastCartAbandonRun  DateTime?

  updatedAt         DateTime @updatedAt
}
```

### NEW model — KickstarterState

```prisma
model KickstarterState {
  id                  String   @id @default(cuid())
  restaurantId        String   @unique
  restaurant          Restaurant @relation(fields: [restaurantId], references: [id])

  firstBuyPromoEnabled    Boolean @default(false)
  inviteProspectsEnabled  Boolean @default(false)

  updatedAt           DateTime @updatedAt
}
```

### NEW model — CartSession (for cart abandonment)

```prisma
model CartSession {
  id              String   @id @default(cuid())
  restaurantId    String
  restaurant      Restaurant @relation(fields: [restaurantId], references: [id])

  // Identity
  customerEmail   String?    // null until they reach checkout
  customerPhone   String?
  customerId      String?    // FK to Customer if matched
  sessionToken    String     @unique // anonymous identifier from browser

  // Cart state
  itemCount       Int        @default(0)
  cartTotal       Float      @default(0)
  cartJson        Json       // last known cart snapshot

  // Lifecycle
  lastTouchedAt   DateTime   @default(now())  // heartbeat from /order/[slug]
  reachedCheckout Boolean    @default(false)  // entered email/phone
  abandonedAt     DateTime?  // set when 2h passed without activity
  recoveredAt     DateTime?  // set when an order placed by same email

  createdAt       DateTime   @default(now())

  @@index([restaurantId, abandonedAt])
  @@index([customerEmail])
}
```

### NEW model — ProspectImport (for Invite Prospects)

```prisma
model ProspectImport {
  id              String   @id @default(cuid())
  restaurantId    String
  restaurant      Restaurant @relation(fields: [restaurantId], references: [id])

  // CSV upload metadata
  filename        String
  totalRows       Int
  successRows     Int
  errorRows       Int
  uploadedAt      DateTime @default(now())

  // Send state
  emailsSent      Int      @default(0)
  emailsLastSent  DateTime?
  isComplete      Boolean  @default(false)

  prospects       Prospect[]
}

model Prospect {
  id              String   @id @default(cuid())
  importId        String
  import          ProspectImport @relation(fields: [importId], references: [id])

  name            String?
  email           String
  phone           String?

  emailSentAt     DateTime?
  emailBouncedAt  DateTime?
  unsubscribedAt  DateTime?

  // If they ever ordered after the invite
  convertedToCustomerId String?

  @@index([importId])
  @@index([email])
}
```

---

## 7 · Re-engage segmentation algorithm

```ts
async function buildReEngageCohort(restaurantId: string): Promise<Map<CustomerId, 1|2|3|4|5>> {
  const sixMonthsAgo = subMonths(new Date(), 6);

  // 1. All customers who ordered in last 6 months
  const customers = await prisma.customer.findMany({
    where: {
      restaurantId,
      lastOrderedAt: { gte: sixMonthsAgo },
    },
    select: { id: true, lastOrderedAt: true },
    orderBy: { lastOrderedAt: "asc" }, // oldest first
  });

  // 2. Take bottom 60% (most stale)
  const cohortSize = Math.floor(customers.length * 0.6);
  const cohort = customers.slice(0, cohortSize);

  // 3. Split into 5 evenly-sized buckets
  const bucketSize = Math.ceil(cohort.length / 5);
  const assignments = new Map<string, 1|2|3|4|5>();
  for (let i = 0; i < cohort.length; i++) {
    const tier = Math.min(5, Math.floor(i / bucketSize) + 1) as 1|2|3|4|5;
    assignments.set(cohort[i].id, tier);
  }

  return assignments;
}
```

**Escalating send rule (Luigi confirmed):** customer who responds gets dropped from cohort. If they don't, next cycle they may bucket UP (more stale → higher %). Cooldown between sends: 14 days (configurable).

---

## 8 · Cart abandonment suppression (Luigi confirmed Q6)

```
Cart abandoned at T=0
  ↓
At T+2h, query for any Order from same customerEmail with createdAt > T
  ↓
If found → set CartSession.recoveredAt, suppress email
If not → send recovery email with pre-made coupon (CART_RECOVER)
```

---

## 9 · Migration plan for existing Promotion rows

Current `Promotion` rows have no `campaignRef`. We treat them all as **Self-made**:
1. Schema add: new columns nullable + default `restrictions: '[]'`, `ruleConfig: '{}'`
2. Backfill: none needed; nulls and empty JSON are correct defaults for existing rows
3. UI: existing rows show under "Self-made promos" tab automatically (since `campaignRef IS NULL`)

---

## 10 · API surface (new endpoints)

```
POST   /api/admin/autopilot/master                    — toggle master gate
PATCH  /api/admin/autopilot/campaigns/:slug           — enable/disable individual campaign
GET    /api/admin/autopilot/preview/:slug             — see who would get next send

POST   /api/admin/kickstarter/first-buy/enable        — turn on First Buy Promo
POST   /api/admin/kickstarter/first-buy/disable
POST   /api/admin/kickstarter/invite-prospects/upload — CSV upload
POST   /api/admin/kickstarter/invite-prospects/send   — fire batch

POST   /api/restaurants/promotions                    — extended for restrictions + ruleConfig
PATCH  /api/restaurants/promotions/:id
GET    /api/restaurants/promotions?tab=premade        — filter by campaignRef IS NOT NULL

POST   /api/cron/autopilot                            — extended for 3 campaigns
POST   /api/track/cart-heartbeat                      — customer-facing, updates CartSession
```

---

## 11 · Phased build order

### Phase 1 — Foundation (Week 1)
- [ ] Schema migrations (Promotion extensions + new models)
- [ ] Migration safety check (ensure existing promos still work)
- [ ] PreMadePromoRegistry (the central campaign-template definition)
- [ ] Skeleton: `/admin/promotions` 3-tab nav, currently empty Pre-made tab

### Phase 2 — Promotion types + restrictions (Week 1-2)
- [ ] Implement type 1-5 evaluators (extend current promo-engine)
- [ ] Implement 8 restriction evaluators
- [ ] Admin config screens per type (13 distinct config UIs)
- [ ] Restriction picker (universal across all types)
- [ ] Advanced Promo Marketing add-on paywall gate on types 6-13

### Phase 3 — Autopilot rebuild (Week 2-3)
- [ ] Master toggle UI + onboarding walkthrough
- [ ] AutopilotState model + endpoint
- [ ] Re-engage cohort algorithm + cron
- [ ] Encourage 2nd order (extend existing)
- [ ] Cart abandonment (CartSession heartbeat + cron + suppression)
- [ ] Pre-made promo auto-generation on campaign enable

### Phase 4 — Kickstarter (Week 3)
- [ ] First Buy Promo (server-side "first order" detection)
- [ ] Invite Prospects (CSV upload, batch email, throttling)
- [ ] KickstarterState model
- [ ] Pre-made promo for both

### Phase 5 — Testing (Week 3-4)
- [ ] Unit tests per evaluator
- [ ] E2E test: create promo, verify customer-facing display, place order, verify discount
- [ ] E2E test: enable autopilot campaign, verify pre-made promos appear + cron fires
- [ ] E2E test: cart abandonment full lifecycle
- [ ] E2E test: First Buy Promo (new customer detection)
- [ ] Load test: re-engage cohort computation at 10k customers per restaurant
- [ ] Security audit: paywall bypass attempts, restriction tampering

---

## 12 · Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Existing promo orders break during migration | Low | High | Backfill defaults nullable; full preflight tests before merge |
| Resend rate limits hit by Invite Prospects | Medium | Medium | Throttle 10/sec, chunk batches, surface failure to owner |
| Re-engage cohort computation slow at scale | Low | Medium | Index on `lastOrderedAt`; precompute nightly, cache in AutopilotState |
| Cart abandonment false positives (customer browsing 2 tabs) | Medium | Low | Suppression key is email+phone; require checkout-reached before treating as "real" abandonment |
| Add-on bypass: owner forges API request for type 8 | Low | Medium | Server-side entitlement check on every POST/PATCH |
| Pre-made promo accidentally edited to 100% discount | Medium | High | Hard cap at restaurant-config-time (max 50%) with override flag |

---

## 13 · Out of scope for this rebuild

- Branded Mobile App tie-in (push notifications for re-engage instead of email)
- AI-suggested optimal discount % per cohort
- A/B testing per campaign
- Affiliate / referral commissions inside autopilot

These are Phase 6+ post-launch.

---

## 14 · Open items still needing answers

1. Re-engage cooldown between sends: 14 days OK, or different?
2. Cart abandonment send window: 1h or 2h after abandonment?
3. First Buy Promo expiry: how long is the coupon valid after signup? 30 days? 90 days? Never?
4. Invite Prospects max CSV size: 1000 rows? 10000?
5. Promotions Overview tab content: full visual walkthrough like GloriaFood or short text?

Will flag these as I hit them during build. Defaults will be sensible until you override.

---

## 15 · Sign-off needed

Before I start writing schema code:

- [ ] Luigi reviewed this design doc end-to-end
- [ ] Architecture (3 pillars + pre-made promo glue) approved
- [ ] Schema additions approved (or call out objections)
- [ ] Phase order approved
- [ ] Open items 1-5 above answered (or "use your judgment")

Reply with a 👍 or list of changes. Once approved, schema PR is the first commit.
