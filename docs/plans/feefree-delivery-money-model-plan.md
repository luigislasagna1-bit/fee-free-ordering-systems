# FeeFreeDelivery — Driver Pay & Tip Pass-Through (money model) — execution plan

**Status:** design APPROVED-PENDING-LUIGI. Schema build is GATED on (a) Luigi's "do the delivery
schema" go and (b) six decisions in §8. Verified against source 2026-07-24 by a 7-agent map →
synth → adversarial-critique workflow. Critique verdict: **GO-WITH-FIXES** (fixes folded in below).

**Already shipped (this session):**
- Auto-billing **PAUSED** — `DELIVERY_BILLING_ENABLED = false` (`src/lib/delivery-billing-switch.ts`),
  checked in `settleDeliveryWeek()` and the cron. No delivery invoice can be created. (commit `d7a7230e`)
- **B1** — Sat→Fri **America/Toronto** billing week, DST-aware (`deliveryWeekStart` /
  `previousDeliveryWeekStart` / `deliveryWeekEnd` / `DELIVERY_WEEK_TZ` in `src/lib/feefree-delivery.ts`),
  + fixed the ops 14-day-window bug; cron moved to Sat 06:10 UTC. (commit `a300bcec`)

**Money flow (authoritative):** customer → restaurant's own Stripe (food + delivery fee + tip, 100%);
restaurant → Fee Free weekly (per-delivery fee **+** driver tips collected on the driver's behalf);
Fee Free → drivers **manually**, **hourly** (`Driver.hourlyRateCents`) + 100% of their tips. Cash tips
ignored. Milton-only (100 km gate) → single tz, all CAD.

---

## 1. Prisma DDL (all additive; nullable/`@default` adds are metadata-only on PG11+ → no table rewrite)

### B2 — freeze the tip on the delivery (`DeliveryAssignment`, after schema.prisma:3601)
```prisma
  /// Driver's tip for THIS delivery, restaurant currency, minor units, frozen at
  /// the "delivered" write — mirrors platformFeeCents. Null until delivered; $0
  /// freezes 0. Never re-billed after freeze. Source of truth for B4 + B5.
  driverTipCents  Int?
  /// Currency of driverTipCents, frozen alongside (= restaurant.currency at delivery).
  tipCurrency     String?
  @@index([driverId, status, deliveredAt])   // B5 per-driver-week scan — NOT optional (10k target)
```

### B4 — split the restaurant statement (`DeliverySettlement`, after schema.prisma:3653)
```prisma
  /// Per-delivery platform fees for the week (taxable). feesCents + tipsCents ==
  /// accruedCents (accrued/invoiced stay the TOTAL so the Stripe webhook recon,
  /// metadata.type="delivery_settlement", is unchanged).
  feesCents  Int    @default(0)
  /// Driver tips collected on drivers' behalf this week (pass-through, NON-taxable — §4).
  tipsCents  Int    @default(0)
  /// Invoice denomination = the restaurant's own currency (Milton = CAD), NOT the
  /// global USD PLATFORM_CURRENCY (§4). Written explicitly from restaurant.currency.
  currency   String?
```
Also fix the stale "$7.99 per delivered assignment / Monday" doc comments at schema.prisma:3644-3653
→ Sat→Fri America/Toronto + fee-tier note. **(N2 fix: no baked-in "cad" default — write explicitly.)**

### B0 — `DriverShift`
```prisma
model DriverShift {
  id           String      @id @default(cuid())
  driverId     String
  driver       Driver      @relation(fields: [driverId], references: [id], onDelete: Cascade)
  restaurantId String?
  restaurant   Restaurant? @relation("DriverShiftStore", fields: [restaurantId], references: [id], onDelete: SetNull)
  clockInAt    DateTime    @default(now())
  clockOutAt   DateTime?
  autoClosedAt DateTime?   // set by the max-shift auto-close cron (threshold = owner setting, N1)
  source       String?     // "app" | "manual"
  note         String?
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
  @@index([driverId, clockInAt])   // history + weekly hours SUM
  @@index([driverId, clockOutAt])  // cheap "find the one OPEN shift" (clockOutAt IS NULL)
}
```
Single-open-shift-per-driver enforced in the write path (Prisma can't express partial-unique — same as DriverFeedback).

### B5 — `DriverPayout`
```prisma
model DriverPayout {
  id              String    @id @default(cuid())
  driverId        String
  driver          Driver    @relation(fields: [driverId], references: [id], onDelete: Restrict) // preserve pay audit trail
  weekStart       DateTime  // Sat 00:00 America/Toronto, from deliveryWeekStart()
  deliveries      Int       @default(0)
  workedSeconds   Int       @default(0)
  hourlyRateCents Int       @default(0)  // snapshot of Driver.hourlyRateCents at build
  hourlyPayCents  Int       @default(0)
  tipsCents       Int       @default(0)  // Σ frozen driverTipCents (cash excluded by construction)
  adjustmentCents Int       @default(0)  // carry-in for post-paid clawback (Q6) — N4 fix
  totalCents      Int       @default(0)  // hourlyPay + tips + adjustment
  currency        String?
  status          String    @default("pending") // pending | paid
  paidAt          DateTime?
  paidBy          String?
  payoutReference String?
  notes           String?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  @@unique([driverId, weekStart])  // idempotency key
  @@index([status])
  @@index([weekStart])
}
```

### Back-relations (no columns, no migration cost)
`Driver`: `shifts DriverShift[]`, `payouts DriverPayout[]`. `Restaurant`: `driverShifts DriverShift[] @relation("DriverShiftStore")`.

### Push (mandatory, both branches)
```bash
npx tsx scripts/push-schema-to-both.ts   # loops every DATABASE_URL in .env.local (dev + prod)
npx prisma generate
npm run preflight                         # read BOTTOM-UP
```
All additive → no `--accept-data-loss`. **Pre-push read-only check (Blocker B3):** confirm zero
non-void `DeliverySettlement` rows exist on either branch before treating the CAD currency switch as
migration-free (`SELECT status, count(*) FROM "DeliverySettlement" GROUP BY status`). If any
`invoiced`/`paid` USD rows exist, the currency switch needs a migration decision.

---

## 2. Code — B2 tip freeze (`src/app/api/driver/assignments/[id]/status/route.ts`)
- Add `driverTipCents: true` to the top-level assignment select (:41).
- Add `tip: true` + `restaurant: { select: { currency: true } }` to the **order** select (:43-49 — `tip`
  is currently **absent**; without it the freeze reads `undefined → NaN` and silently zeroes every tip).
- In the existing delivered block (`if (next === "delivered" && assignment.platformFeeCents == null)`, :145-151):
  ```ts
  data.driverTipCents = Math.round((o.tip ?? 0) * 100); // freeze once, mirror the fee
  data.tipCurrency    = o.restaurant.currency;
  ```
- **`== null` guard (NOT falsy):** a legitimate $0 tip freezes 0 and never re-freezes.
- **FeeFree-only = by construction:** only `assignToFeeFreeDriver` (delivery-dispatch.ts:143) creates a
  `DeliveryAssignment`; ShipDay/own create none. Reaching this route ⇒ the delivery is FeeFree. No runtime provider check.
- **Re-offer safe:** the bail path nulls `driverId` + stamps and never sets `driverTipCents` pre-delivery
  (:90-109), so a re-offered→re-delivered job freezes against the second (delivering) driver.
- **Backfill (Blocker B1 fix):** in the same schema change, backfill `driverTipCents` + `tipCurrency` for all
  existing `status='delivered'` FeeFree assignments (from `order.tip` × 100 + restaurant currency), so B3's
  switch to frozen tips doesn't zero drivers' historical earnings.

## 2b. Code — refund reversal (`src/app/api/orders/[id]/refund/route.ts`)
- Confirmed gap: refundable base includes the tip (`total − creditApplied`, :82) but the route never touches
  the assignment/`Order.tip`; reward-reversal fires **only on `isFull`** (:152-154).
- Add a **separate `after()`** that runs on **partial AND full** refunds of an order with a delivered FeeFree
  assignment. **Idempotent, cumulative-based (Blocker B2 fix):**
  `driverTipCents = clamp0(round(originalTipCents × (1 − refundedAmount / chargedTotal)))`, recomputed from the
  cumulative `refundedAmount` every time (never decrement-in-place — partials can fire twice). Also flag the
  driver's unpaid `DriverPayout` for rebuild; if already paid, apply Q6's `adjustmentCents` carry-in.

## 3. Code — B4 statement split (`src/lib/delivery-settlement.ts` + `feefree-delivery-ops.ts`)
- In the assignment `findMany` (:106-113) also select `driverTipCents`; sum `feesCents` and `tipsCents` per
  restaurant; store both + `currency = restaurant.currency` (keep `accruedCents`/`invoicedCents` = fee+tip total).
- Emit a **second** `stripe.invoiceItems.create` for tips (idempotencyKey `…-tips-item`, same customer→same
  invoice, **no `tax_rates`**). Set **both** items' `currency` to `restaurant.currency` (§4), not `PLATFORM_CURRENCY`.
- Guard: skip/flag any restaurant whose fee-currency ≠ tip-currency.
- `feefree-delivery-ops.ts` "owed this week" aggregate (:89-92): fold `SUM(driverTipCents)` into the **existing
  single aggregate** (N5 — no second query on the 10s poll) so the paused-state preview matches the future invoice.

## 4. Currency + tax decisions (see §8 Q1/Q2)
- **Currency:** bill delivery settlements in the **restaurant's currency (CAD)**, not USD `PLATFORM_CURRENCY`
  (marketplace.ts:42). `Order.tip` + fee tiers are already restaurant-currency; billing CAD as USD 1:1 is a real
  defect. No migration (billing paused, subject to the Blocker-B3 check). Marketplace settlements keep USD — delivery-only change.
- **Tax on tips:** **non-taxable** (customer tip is post-tax, money-breakdown.ts:182-183; Fee Free is a conduit).
  Omit `tax_rates` on the tips line. **CRA/accountant sign-off logged in OWNER-ACTIONS before go-live.**

## 5. Code — B0 shift + B3 driver app (i18n ×38)
- `src/app/api/driver/shift/route.ts` (new): `POST {action:"start"|"end"}` + `GET` open shift; `getDriverSession()`
  + `checkDriverSessionFresh()` 401 pattern. Clock-in rejects if an open shift exists; clock-out is **atomic**
  `updateMany({ where:{ driverId, clockOutAt:null }, data:{ clockOutAt: now } })` (double-tap safe).
- `src/app/api/cron/driver-shift-autoclose/route.ts` (new): auto-close shifts over the owner-set max (N1 — setting, not a constant).
- `src/app/driver/DriverApp.tsx`: server-authoritative shift state (`GET` on mount + focus); Start/End Shift +
  live "On shift {duration}" in the **ShellHeader `right` slot** (:160-194) — always mounted, every tab, independent of GPS. Never a client-only timer.
- `src/app/api/driver/earnings/route.ts`: add a second aggregate over `DriverShift` → `workedSeconds` + `payCents`
  (× `hourlyRateCents`). Switch day-bucketing + window (:128-175) to `AT TIME ZONE 'America/Toronto'`. Read tips as
  `COALESCE(a.driverTipCents::float8/100, o.tip)` (Blocker B1 — don't zero pre-backfill history). Keep per-currency grouping.
- `src/app/driver/DriverEarnings.tsx`: replace `rangeFor()` device-local Monday math (:64-78) with
  `deliveryWeekStart`/`deliveryWeekEnd`/`previousDeliveryWeekStart`. Add Hours + Pay tiles (reuse
  `feefreeShared.hoursMinutes`/`minutesOnly`); keep tips per-currency, separate from platform-currency pay. Update the "active time" HelpTip.
- **New driver i18n keys (×38 same change, then `i18n-parity-all.ts` = 0/0/0/0):** `driver.startShift`, `endShift`,
  `onShift`, `shiftStartedAt`, `notOnShift`, `clockInFailed`, `clockOutFailed`, `endShiftConfirmTitle/Body/Yes/No`,
  `earnHours`, `earnPay`, `earnHoursHelp`, `earnTotalPay`, `earnPayFootnote`.

## 6. Code — B5 payout engine + superadmin surface (English-only, all new)
- `src/lib/driver-payout.ts`: `buildDriverPayoutsForWeek({ weekStart })`, mirror of delivery-settlement.ts. Per
  driver: `deliveries` + `Σ driverTipCents` (delivered, in-week); `workedSeconds` from closed `DriverShift`;
  `hourlyPayCents = round(workedSeconds/3600 × driver.hourlyRateCents)`; `total = pay + tips + adjustment`.
  **Read-then-conditional-write (F2 — NOT upsert):** `findUnique((driverId,weekStart))` → if `paid`, skip; else
  create-or-update the pending row. Snapshot `hourlyRateCents`. Assert one currency per driver-week; on violation
  don't build — surface to the superadmin (N6).
- `src/app/api/superadmin/driver-payouts/build/route.ts`: `CRON_SECRET`-or-`requireSuperadmin`; optional `weekStart`.
- `src/app/api/superadmin/driver-payouts/[id]/mark-paid/route.ts`: `requireSuperadmin()`→403; re-fetch→404; atomic
  `updateMany({ where:{ id, status:"pending" }, data:{ status:"paid", paidAt, paidBy, payoutReference } })`, `count===0`⇒409.
- `src/app/superadmin/driver-payouts/page.tsx` + `DriverPayoutsClient.tsx` + `BuildWeekButton.tsx`: RSC `requireSuperadmin()`
  → `redirect("/superadmin")` on null (superadmins are `restaurantId:null`); per-week rollup cards; pending/paid buckets;
  per-row "Mark paid" (prompt `payoutReference`). Mirror reseller `PayoutsClient` + marketplace-settlements page.
- `src/app/superadmin/SuperadminNav.tsx`: add `{ href:"/superadmin/driver-payouts", label:"Driver Payouts", adminOnly:true }`.

## 7. Build sequence (reordered per critique F3) with gates
0. **Resolve §8 Q1–Q4** (currency, tax, idle-hour policy, tip-float) — Q4 gates B0's shape; don't build an
   hourly UI on an unapproved pay basis.
1. **Schema** (§1) + backfill (§2) → push-both → generate → preflight. *Gate: both branches show new tables/columns; Blocker-B3 row check clean.*
2. **B2 freeze** (§2). *Gate: unit — delivered freezes `round(tip*100)`+currency; $0→0 not null; re-fire never re-freezes; re-offer credits 2nd driver.*
3. **Refund reversal** (§2b). *Gate: E2E — full zeroes tip; partial reduces proportionally & idempotently on double-partial; non-FeeFree untouched.*
4. **B4 statement split** (§3) — billing STAYS paused. *Gate: preview shows two items, CAD, tips untaxed, feesCents+tipsCents==accruedCents; currency-mismatch guard fires.*
5. **B0 shift** (§5) — per the Q4 answer. *Gate: double clock-in rejected; double clock-out closes once; GET survives remount; auto-close caps.*
6. **B3 earnings** (§5) — Sat→Fri + Hours/Pay tiles + ×38. *Gate: preflight; parity 0/0/0/0; browser-verify one locale; historical tips NOT zeroed.*
7. **B5 payout** (§6). *Gate: rebuild → no dup rows; mark-paid twice → 409; multi-store week: Σ payout tips == Σ statement tips.*
8. **Flip the switch** — only after Luigi previews the first real invoice + tax sign-off recorded: `DELIVERY_BILLING_ENABLED = true` (one line).

Run `npm run preflight` before **every** schema/route/lib push.

---

## 8. Open questions for Luigi (parked — answer when ready; each has a default)
1. **Delivery invoice currency** → bill in the restaurant's **CAD** (not USD `PLATFORM_CURRENCY`)? **Rec: YES** (no FX, matches your dollar-quoted tiers, no migration). Biggest money decision.
2. **Tax on driver tips** → leave the tips line **non-taxable**? **Rec: YES**, pending accountant sign-off in OWNER-ACTIONS before go-live.
3. **Tip float / credit risk** → pay drivers **on schedule** and chase non-paying restaurants, or hold payout until the restaurant statement is collected? **Rec: pay on schedule**, surface a collected-vs-paid figure.
4. **Idle-hour policy** → hourly pay for **all** clocked time, or only while an assignment is active? (Idle = pure Fee Free cost.) **Rec: all clocked time** + max-shift auto-close + a per-shift cost-vs-fee number in superadmin. *(Gates B0.)*
5. **Partial-refund → tip** → reduce the frozen tip **proportionally**, or only on an explicit "refund the tip" choice? **Rec: proportional.**
6. **Clawback after paid** → tip refunded after the driver was paid: **Fee Free eats it**, or **negative adjustment next week** (`adjustmentCents`)? **Rec: negative adjustment.**

**Blocking dependency:** B5 totals need B2 (tips) + B0 (hours). B5 schema + ledger UI + mark-paid can be built
against deliveries-only first, then lit up.
