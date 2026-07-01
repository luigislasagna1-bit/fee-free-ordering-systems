# Fee Free Ordering Systems — Testing Guide

> Generated 2026-07-01. Step-by-step tests for everything built-but-untested. Priority: 🔴 blocks launch / money / correctness · 🟡 important · 🟢 nice-to-have.
> Enable new features ONLY on the test store `luigis-lasagna-pizzeria` (they're OFF by default, so prod stays safe).

---

All claims are verified against the code. Confirmed facts:

- Spend requires `idCustomerId` (signed-in only, line 282); guests get no reward box.
- Caps: `maxRedeemPercent` (default 100), `minRedeemBalance` (default 0), enforced in `computeApplied`.
- Fully-covered: `fullyCovered` → `paymentMethod: "reward_credit"`, skips online charge (orders route 2166/2225).
- Lifecycle: `redeemForOrder`/`awardForOrder`/`awardEarnRulesForOrder`/`awardPromoCreditsForOrder` on complete; `releaseForOrder`/`releasePromotionUsageForOrder` on reject/cancel (both manual [id] route AND auto-reject cron).
- Concurrency: atomic `WHERE balance >= applied` (reserveCredit) + `@@unique([accountId, orderId, reason])`.
- reward_credit promo (#14): `awardPromoCreditsForOrder` grants `ruleConfig.creditAmount` at completion.
- Earn triggers: signup (dated campaign), first_order, order_over, nth_order; flat `rewardSignupBonus` = always-on.
- `showInPromos` tile confirmed.
- VIP cron: dual-auth (CRON_SECRET or superadmin), 401 else; idempotent via `sched:<id>:<period>`; per-day tz guard; once self-disables; phone-only skipped.
- B5 (commit `935ff39e`): atomic `usedCount < usageLimit` claim at placement; race-loser gets 0 rows → 4xx; `PromotionUsage` ledger written after create; give-back deletes rows + decrements per row deleted (idempotent, cap-independent).

Here is the section.

---

# Money-Path & Promotions — Step-by-Step Testing Guide

> **Test store:** `luigis-lasagna-pizzeria`. Every feature below is **OFF by default** (`rewardsEnabled=false`, promos inactive), so prod stays safe until you flip it on for this one store. Turn features ON only here. In that store the reward wallet is currently named **"Pizza Bucks"** — substitute wherever you see `{rewardName}`.
>
> **Prod DB writes are blocked for the assistant.** Any "update the data" step is written as an exact command for **Luigi** to run himself. The read-only diagnostics (`inspect-reward-wallet.ts`, `inspect-order.ts`, `vip-schedule-inspect.ts`) are how I verify server-side — send me the inputs each subsection asks for.
>
> **One-time enable (do this first):** Admin → Marketing Tools → **Reward Dollars** → turn ON → set a name → Save. Pay-with-credit auto-enables with `rewardsEnabled` (there is no separate redeem toggle — the server gates on `rewardsEnabled` alone).

---

## RD-1 · Reward Dollars — earning (auto %, ways-to-earn, manual grant)
**Priority: 🔴**

1. Admin → Reward Dollars → **"Customers earn automatically"** ON → mode **% of order** → **5** → Save.
2. **Ways to earn** → Add each of: **"When a customer signs up"** $5 with a Start/End window that covers today; **"On their first order"** $3; **"Orders over $X"** bonus; **"Every Nth order"** bonus.
3. Admin → Customers → open a test customer → **Reward Dollars** card → type **10** → Add.
4. As that customer, sign in on the ordering site → **account page**.
5. Place an order that should EARN. Accept it, then **complete** it (or let the auto-complete cron run).
6. Separately, place another order and **reject** it.

**Expected:**
- Step 3: balance shows **$10.00**, labeled "Added by the restaurant".
- Step 4: account page shows the **$10 balance card + activity list**.
- Step 5: on **completion** (not acceptance) the balance rises. Base earn = **5% of (subtotal − discounts), with any `rewardEarnExcluded` items/categories removed first** — paying with credit does NOT shrink the earn basis. Applicable ways-to-earn bonuses (first-order = $3 on the customer's 1st completed order, order-over, Nth) stack on top. Earn is **idempotent** (exactly one earn row per order per reason).
- Step 6: rejected order credits **nothing** (earn fires at completion only).

**Send Claude:** the store slug (`luigis-lasagna-pizzeria`), the **test-customer email**, and the **completed order id** (or its last 6 chars). I'll run `inspect-reward-wallet.ts <slug> <email>` and `inspect-order.ts <id>` to confirm the ledger rows, that the balance = sum of ledger, and that the earn basis excluded the right lines.

---

## RD-2 · Reward Dollars — spend at checkout (some / all / caps / skip-card)
**Priority: 🔴 (payment path)**

1. Signed in with a balance, go to checkout.
2. In a **private / signed-out** window, go to the same checkout.
3. Signed in, choose **"Use some"**, place the order.
4. With **balance ≥ order total**, choose **"Use all"**, place the order.
5. In Admin → Reward Dollars set **Max % of order = 50** and a **Min redeem balance** (e.g. $5); Save. Return to checkout.

**Expected:**
- Step 1: emerald **"Use your {rewardName}"** box appears (amount + Use all / None; default None; live "To pay today").
- Step 2: **NO box** — guests cannot spend (server gates spend on a signed-in customer id; anti-drain).
- Step 3: "To pay today = total − credit"; **tax and Order.total are unchanged** (credit is a payment, not a discount). Charged amount = total − credit.
- Step 4: card/PayPal step is **skipped**; order settles `paymentMethod = "reward_credit"`; kitchen releases it like a cash order.
- Step 5: credit applied **never exceeds 50%** of the total (e.g. $12.50 cap on a $25.01 order → To-pay $12.51); if balance is **below the min**, the box is hidden/blocked. A ⓘ tooltip explains the % cap.

**Send Claude:** slug + test-customer email + the **order id** for the "Use some" order and the **"Use all"** order. I'll confirm `creditApplied`, the spend row status (`applied`→`redeemed` on complete), and that a fully-covered order carries no card charge.

---

## RD-3 · Reward Dollars — lifecycle (reject→return, complete→redeem)
**Priority: 🔴 (payment path)**

1. Spend credit on an order, then **REJECT** it from admin.
2. Spend credit on a second order, then **COMPLETE** it.
3. (Optional, to prove the auto-reject path) Spend credit on a third order and **leave it un-accepted for ~4 min** so the auto-reject cron cancels it.

**Expected:**
- Step 1: spent credit is **returned** to the wallet (spend row `applied`→`released`, a `release` ledger row appears).
- Step 2: credit is **gone for good** (spend row `applied`→`redeemed`).
- Step 3: auto-rejected order **also returns** the credit — the same `releaseForOrder` runs in the auto-reject cron (this parity gap was the 2026-06-29 bug fix; both the stale-order `rejected` sweep and the abandoned-payment `cancelled` sweep now release).

**Send Claude:** the three order ids + test-customer email. I'll verify each spend row's final status and that the balance nets out correctly.

---

## RD-4 · Reward Dollars — concurrency (no over-spend / negative / double-grant)
**Priority: 🔴 (payment path)**

1. Ask me to run `scripts/test-reward-concurrency.ts` on prod (self-contained: it mints its own throwaway customer, funds $10, fires 5 concurrent $4 spends, then force-double-completes one order).
2. Optionally, place two real orders in two browsers that each try to drain the same wallet at nearly the same instant.

**Expected:**
- The atomic `UPDATE … WHERE balance >= applied` guarantees **total spent ≤ balance**, the balance **never goes negative**, and a race-loser simply gets **credit = 0** and pays the full amount (no 500s).
- Double-complete (manual PATCH + auto-complete cron both firing) yields **exactly ONE earn row** (`@@unique([accountId, orderId, reason])`).

**Send Claude:** just say "run the concurrency test on prod" — I'll trigger `test-reward-concurrency.ts` and report the atomic guard held, no negative balance, and a single earn row. (This already passed on prod 2026-06-29; this is the re-run confirmation.)

---

## RD-5 · Reward Dollars — grant-via-special (reward_credit promo, type #14)
**Priority: 🟡**

1. Admin → Promotions → create a **"Grant Reward Dollars"** (`reward_credit`) special; set the **credit amount** (e.g. $2) and its eligibility.
2. On `/order/luigis-lasagna-pizzeria`, build a qualifying cart → confirm the cart shows **"🎁 {name} + Earn $X"**.
3. Place the order, accept, and **complete** it.

**Expected:**
- The promo is **engine-inert** — it applies **no discount** (`calcDiscount = 0`) and is **always Master** (never blocked by other promos, and never blocks them).
- At **completion**, `awardPromoCreditsForOrder` grants `creditAmount` to the wallet (reason `promo:<id>`, idempotent — one grant per order even on double-complete).

**Send Claude:** slug + test-customer email + the order id. I'll confirm a `promo:<id>` ledger row for the right amount and no discount was taken off `Order.total`.

---

## RD-6 · Reward Dollars — sign-up bonus (always-on vs dated)
**Priority: 🟡**

1. On `/admin/rewards`, set the flat **"Sign-up bonus (always on)"** box (e.g. $2), Save.
2. In **Ways to earn**, also add a **"When a customer signs up"** rule with a **Start/End window covering today** (e.g. $5).
3. Create a brand-new customer account on the ordering site.

**Expected:**
- Both apply and **stack** on account creation: the flat bonus (reason `signup_bonus`) **plus** the dated campaign rule (reason `earn:signup:<ruleId>`). Both are idempotent per customer, so a retry/refresh doesn't double-grant.
- If the dated window does **not** cover today, only the flat always-on bonus lands.

**Send Claude:** slug + the **new customer's email**. I'll confirm exactly two positive ledger rows (`signup_bonus` + `earn:signup:<ruleId>`) and no duplicates.

---

## RD-7 · Reward Dollars — "Display in Promos" tile
**Priority: 🟡**

1. Admin → Reward Dollars → a **way-to-earn** → click the **megaphone** (or tick **"Show in the Promos section"** when creating it). Make sure the rule is **active and in its date window**.
2. Open `/order/luigis-lasagna-pizzeria` and scroll to the **Promos** strip.

**Expected:**
- An **emerald Gift tile** renders with the reward-name badge and the earn copy (e.g. "Earn $5 on your first order"). Only shows while `rewardsEnabled` is ON and the rule is active + in-window. **Confirm on PROD/device** — this was verified only in a local headless preview before (commit `bf4aae9b`).

**Send Claude:** slug + which way-to-earn you flagged. I'll confirm the promoted-rules query returns it (active + in-window) so the tile is expected to render.

---

## VIP-1 · VIP credit-grant Automations / scheduler
**Priority: 🔴**

1. Admin → **VIP Groups** → open a group → **Automations** → **+ New automation** → **"Give credit"** → amount **$5** → cadence (start with **daily**) → Create.
2. Add three members to the group: **1 registered customer**, **1 guest email** (not yet a customer), **1 phone-only** member.
3. Ask me to trigger the `vip-schedules` cron on prod (superadmin browser hits `https://feefreeordering.com/api/cron/vip-schedules` — the session cookie is the auth; **PowerShell won't work**, it lacks the cookie).
4. Trigger the cron **again in the same local day / period**.
5. Try the cron URL **without** a superadmin session (or a signed-out request).
6. Set an automation to **"once"** cadence, fire it, then **pause** and **re-enable** it. Separately, **delete the group**.
7. Read the next-run / last-run times in the Automations UI.

**Expected:**
- Step 3: each **eligible** member's balance rises **once by $5**; the **guest email** is credited (the cron find-or-creates a Customer for it); the **phone-only** member is **skipped** (no wallet identity — matching is by customerId/email, never bare phone). Grant is skipped entirely if `rewardsEnabled` is off for the store.
- Step 4: **ZERO new grants** — idempotent. Two guards: a per-day tz `lastFiredDateKey` guard AND the hard ledger guard `sched:<id>:<period>` (`@@unique`). Even force-firing the same period leaves balances unchanged.
- Step 5: **401 Unauthorized**.
- Step 6: "once" fires **exactly once** then **self-disables** (`active=false`, `nextRunAt=null`); pause/re-enable **recomputes** `nextRunAt`; deleting the group **cascade-deletes** its schedules.
- Step 7: next/last run times display in the **restaurant timezone** (Toronto for this store; DST + month-length clamp handled).

**Send Claude:** slug + group name + the three members' emails/phone. I'll run `vip-schedule-inspect.ts <slug>` (schedules + members + balances) before and after; if you want it to fire "now" without waiting, I can point Luigi to run `scripts/vip-schedule-force-due.ts <scheduleId>` (sets `nextRunAt` to epoch), then you open the cron URL in the superadmin browser.

---

## PROMO-B5 · Usage-cap claim (NEW — atomic, just shipped)
**Priority: 🔴 (NEW code, commit `935ff39e`)**

1. Admin → Promotions → create a promo (any discounting type) with **Max uses = 1** (`usageLimit = 1`).
2. As a customer, place an order that **uses** it → then **reject** that order from admin.
3. Place a **new** order using the same promo.
4. **Concurrency:** reset the promo to 1 use, then fire **two orders at nearly the same instant** that both apply it (two browsers, or ask me to run a concurrent test).

**Expected:**
- Step 2: the promo applies and the slot is claimed at **placement** (`usedCount` bumped atomically via `UPDATE … WHERE usageLimit IS NOT NULL AND usedCount < usageLimit`); a `PromotionUsage` ledger row is written just after `order.create`.
- On **reject**, the slot **RETURNS** — `releasePromotionUsageForOrder` deletes this order's `PromotionUsage` row(s) and decrements `usedCount` by exactly one per row **actually deleted** (idempotent, cap-independent, floored at 0). This runs on **manual reject/cancel** ([id] route) **and** the **auto-reject cron** (parity).
- Step 3: because the slot returned, the promo is **usable again** — the new order succeeds.
- Step 4: the LAST slot is a **column-vs-column atomic claim**, so **exactly one order wins**; the loser gets 0 rows back from the UPDATE and is rejected with **"…has just reached its usage limit. Please review your order and place it again."** (any slots/coupon it grabbed this attempt are rolled back so the next legit customer can still redeem). No cap breach, no double discount.

**Send Claude:** slug + the promo id/name + the order ids from steps 2 and 3 (and, for step 4, both concurrent order ids). I'll confirm `usedCount` returned to 0 after the reject, the `PromotionUsage` row was deleted, and that exactly one of the concurrent pair holds a usage row.

---

## PROMO-JOINT · Per-type promotion pass (MUST be done WITH Luigi — do NOT auto-verify)
**Priority: 🔴 (standing rule: promos are never auto-verified)**

> Sit with Luigi and walk this live. Do not sign anything off from `tsc`/preflight alone.

1. For **EACH type** — `percentage_off`, `fixed_cart`, `BOGO`, `buy_n_get_free`, `free_item`, `free_dish`, `free_delivery`, `combo`, `meal_bundle`, `meal_bundle_speciality`, `payment_reward`, `reward_credit` — create it and build a qualifying cart on `/order/luigis-lasagna-pizzeria`.
2. Compare the **checkout preview total** to the **charged total** on a real placed order for each type.
3. **Visible/Hidden + redemption:** for a **Hidden coded** promo, enter the code at checkout; for an **assigned** promo, try the **matching** email vs a **wrong** email.
4. **Exclusivity matrix:** set up a Standard, an Exclusive, and a Master promo; check stacking in preview **and** on the placed order.
5. For **meal_bundle** specifically, probe order-time eligibility (min order / customer type / usage cap / time-of-day).

**Expected:**
- Step 2: the discount/freebie applies AND **preview total EXACTLY equals the charged total** for every type (the once-per-lifetime preview-vs-charge mismatch is the class of bug being guarded against).
- Step 3: Hidden coded requires the code and **never** shows on the menu/banner; assigned + matching email **applies**, wrong email is **rejected** ("registered to a different email"). Visible auto-apply applies on its own.
- Step 4: **Standards stack; the best Exclusive blocks Standards; Master always stacks** — and the **final charge matches the preview** in all three cases.
- Step 5: **flag anything meal_bundle skips** — bundles currently **bypass the engine** (only start/end window + `isActive` are enforced), so min-order / customer-type / usage-cap / time-of-day gates may not apply. Note it; don't mark verified.

**Send Claude:** for any type where preview ≠ charge, send the **promo id + the order id** and I'll diff the engine's `calcDiscount` against the stored `promoDiscount`/`Order.total` server-side. Do **not** ask me to declare any type "verified" — that sign-off happens live with Luigi.

---

All verified. `printKitchen`/`printCustomer` default `true`, `kitchenCopies`/`customerCopies` default `1` — so the "exactly 1 customer + 1 kitchen" invariant is the schema default, and a stray 3-customer print would mean `customerCopies` got bumped or a duplicate print path fired. EOD digest includes `deliveryFees`. I have everything I need. Let me write the OPERATIONS section.
