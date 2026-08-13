# Apple App Review — Fee Free Order App, the business-model thread

**App:** Fee Free Order App (Kitchen) · Apple ID `6794053932` · version **1.0 (30)**
**Submission ID:** `5b432e16-6f7d-4610-8a35-04f0ef4eaea2`
**Status:** waiting on our reply to Apple's 2026-08-12 message.

---

## 1. The whole thread, and what each round was really about

| When | Who | What |
|---|---|---|
| 2026-08-04 1:46 PM | Apple | **Guideline 3.2 Business** — *"the app is intended to be used by a specific business or organization … but you've selected public distribution."* Recommended Apple Business Manager / unlisted distribution instead. Rejection reason logged: **3.2.0 Business: Other Business Model Issues.** 5 questions asked. |
| 2026-08-04 8:44 PM | Us (Sameem) | Answered all 5. Core argument: it's a commercial product any restaurant can subscribe to, same model as Square / Toast / Shopify; not built for one company. Gave the demo account. |
| 2026-08-12 10:09 PM | Apple | **Guideline 2.1(b) Information Needed** — *"it appears the app may access or include paid digital content or services, and we want to understand your business model."* One question: **"Are the enterprise services in your app sold to single users, consumers, or for family use?"** |

**What actually triggered round 2:** answer #5 on August 4 said *"A restaurant may optionally pay for a separate platform subscription."* A reviewer reading "pay … subscription" must decide which side of **Guideline 3.1.3(c)** it falls on:

> **3.1.3(c) Enterprise Services:** If your app is only sold directly by you to organizations or groups for
> their employees or students … you may allow enterprise users to access previously-purchased content or
> subscriptions. **Consumer, single user, or family sales must use in-app purchase.**

So: **business buyer → no in-app purchase required. Consumer/single-user/family buyer → in-app purchase required.** That is the entire question.

**⚠️ The needle to thread.** The two rounds pull in opposite directions and the reply must satisfy both at once:
- Lean too hard on *"we're enterprise/B2B only"* → Apple reverts to **3.2** and says use private distribution.
- Lean too hard on *"we're for the general public"* → Apple says consumer sales need **IAP**.

The reconciliation is factual, not rhetorical: the app is **publicly available to any restaurant business without invitation or pre-approval** (answers 3.2) **and** the paid service is bought **by businesses as an operating expense, never by consumers or families** (answers 3.1.3(c)) — and, strongest of all, **nothing is purchasable inside the app at all.**

---

## 2. Verified before writing (don't re-litigate these)

| Claim made to Apple | Verification |
|---|---|
| Remote-URL shell of `https://feefreeordering.com/kitchen` | [capacitor.config.ts:45](../capacitor.config.ts) |
| **Complete** in-app reachable surface = kitchen screen, its login, password reset, `tel:`/`mailto:` | Swept `src/app/kitchen/**` for every `<Link>` / `<a href>` / `window.open` / `location.assign` — no other destinations exist |
| No sign-up, pricing, billing, add-on or upgrade surface in-app | [KitchenLoginForm.tsx](../src/app/kitchen/login/KitchenLoginForm.tsx) is login + forgot-password only; no entitlement/paywall/upsell component renders under `src/app/kitchen/` |
| Free tier = 100 orders/month, 0% commission | `FREE_PLAN_MONTHLY_CAP = 100` — [order-cap.ts](../src/lib/order-cap.ts) |
| Add-on prices quoted in the reply | Live at `https://www.feefreeordering.com/pricing` — payments $39.99, unlimited orders $14.99, website $19.99, domain $9.99, multi-location $9.99 |
| Demo ordering page works | Fetched 2026-08-13: loads as "Fee Free Demo Restaurant", Toronto, menu visible, **pickup only** — so "place a pickup order with cash" is the correct instruction |
| Zero IAP items **and** zero subscription groups in App Store Connect | Luigi confirmed both pages empty, 2026-08-12 |

**No code change and no new build are required.** 2.1(b) here wants prose, not a binary.

---

## 3. PASTE THIS into the App Store Connect message thread

> Hello,
>
> Thank you. Answering your question directly, and expanding on the point in our August 4 reply that we believe prompted it.
>
> **Are the enterprise services in your app sold to single users, consumers, or for family use?**
>
> No. They are not sold to single users, to consumers, or for family use. They are sold only to restaurant businesses, as a business operating expense, for use by that business's owner and its staff. There is no consumer plan, no single-user plan and no family plan, and we do not sell to individuals for personal use.
>
> In our August 4 answer we wrote that "a restaurant may optionally pay for a separate platform subscription." To be precise about what that is:
>
> - **What it is:** Fee Free Ordering is business software for restaurants. It lets a restaurant take online food orders from its own customers through its own website, and manage those orders.
> - **Who pays:** the restaurant business, on its business account.
> - **Where:** only on our website, https://www.feefreeordering.com, before anyone installs the app. Never inside the app.
> - **What it costs:** the platform is free — a restaurant can take up to 100 orders per month at no charge, and we take 0% commission. Beyond that, optional monthly add-ons cover business services: card payment processing ($39.99/mo), unlimited orders ($14.99/mo), a hosted marketing website ($19.99/mo), a custom domain ($9.99/mo), multi-location management ($9.99/mo). They are all published at https://www.feefreeordering.com/pricing and all are billed to the business by credit card on our website.
>
> **Nothing is purchased, unlocked or upgraded inside the app.** The app is free to download and contains no paid content. It has no in-app purchases and no subscriptions configured in App Store Connect, because none apply — nothing digital is sold or consumed in the app. The complete set of screens reachable in the app is: the kitchen order screen, its sign-in screen, and a password-reset page. There is no link anywhere in the app to a purchase, pricing, plan, billing or sign-up page, and an account cannot be created in the app.
>
> **No digital goods are involved at any point.** The app handles the restaurant's real-world work: an order placed by a member of the public on the restaurant's own ordering website arrives in the app and rings the device; a staff member accepts it, prints the ticket to the restaurant's own receipt printer over the local network, and marks it ready. What the customer buys is food — physical goods the restaurant cooks and then hands over or delivers — and the customer pays for that food on the restaurant's ordering website, not in this app.
>
> This remains consistent with our August 4 answers on distribution: the app is not tied to one company, nor to a limited or pre-approved group of companies. Any restaurant business anywhere can sign up on our website without invitation, pre-approval or affiliation, and then sign in. It is the same model as Square, Toast and Shopify — publicly available, sign-in-only business apps whose service is purchased by businesses on the web.
>
> Demo account, unchanged from our last reply:
> Username: demo@feefreeordering.com
> Password: AppReview2026!
>
> The app opens on the sign-in screen. To see a live order arrive and ring the device, open https://feefreeordering.com/order/fee-free-demo-restaurant in any browser, add an item, and place a pickup order with cash — it appears in the app within a few seconds.
>
> Please let us know if any further detail about the business model would help; we will answer the same day.
>
> Thank you,
> Fee Free Ordering Inc.

---

## 4. Before sending

1. ✅ **In-App Purchases page empty** — confirmed 2026-08-12.
2. ✅ **Subscriptions page empty** (separate list from IAP — auto-renewable subs never appear on the IAP page) — confirmed 2026-08-12. "Streamlined Purchasing: Turned On" is inert with zero subscriptions.
3. ☐ **Sign in once at https://feefreeordering.com/kitchen/login as `demo@feefreeordering.com` / `AppReview2026!`** — the reply stakes its credibility on that account and a dead demo login is an instant rejection.
4. ☐ **Clear the red ❗ on "App Review" in the App Store Connect sidebar** if it's flagging an incomplete required field.
5. ☐ **Reply in the thread.** Do not upload a new build; do not start a new submission (it loses the queue position).

## 5. Wording traps — do not improvise these

- **Never write "subscription" unattached to its buyer.** That exact slip in the August 4 reply is what caused this second round. Always: *"billed to the restaurant business on our website."*
- **Never say the app "unlocks" anything.** It doesn't, and "unlock" is the IAP trigger word.
- **"Any restaurant *business* can sign up"**, never "anyone can sign up" — the second invites the consumer reading.
- **Keep the 3.2 answer alive in every future reply** (publicly available, no invitation or pre-approval, Square/Toast/Shopify model). Dropping it invites Apple back to "use private distribution."
- **Don't volunteer the reseller channel.** 3.1.3(c) says "sold **directly** by you", so raising it invites a follow-up. The answer stays true regardless — resellers also sell only to restaurant businesses. Answer honestly if asked directly.
- **Never offer to add in-app purchase to settle it.** Offering concedes the point and the requirement sticks.

## 6. Reuse

The same two guidelines will hit **Fee Free Delivery (driver)** and every **Branded Mobile App** tenant submission. Reuse this thread's framing: publicly available to any restaurant business + nothing purchasable in the app + physical goods consumed outside the app.
