# Full Test Walkthrough — Marketing Suite + Kitchen/Promo work (2026-06-09)

Everything new or changed in this session, as a step-by-step checklist. Run top
to bottom; check each ✅/❌. Known-good rollback tag: `marketing-suite-verified-2026-06-09`.

Legend: **[admin]** = your dashboard, **[menu]** = customer ordering page,
**[kitchen]** = Kitchen Display, **[MP]** = marketplace view
(`/order/<slug>?from=marketplace`).

---

## A. Kitchen — ring + Missed/Rejected

1. **Ring is continuous** — [kitchen] place a test order → it rings → **tap to open it** → it KEEPS ringing until you Accept / Reject / it times out. ❑
2. **MISSED = orange** — let an order's timer expire → tile **and** detail show **MISSED** in **orange**. ❑
3. **REJECTED = red** — manually Reject a different order → shows **REJECTED** in **red**. (Cancelled = red "Cancelled".) ❑
4. **TEST badge legible** — a `[TEST]` order shows a clearly-readable amber **TEST** chip (dark text). ❑

## B. Missed label everywhere (customer-facing)
Let an order time out (Missed), then check each surface:
5. **Email** — the status email badge says **Missed** (not "Rejected"/"Not accepted"), and there's **no** "Auto-rejected: …" reason text. ❑
6. **Status page** — open the order's tracking link → heading says **Missed**, no internal reason shown. ❑
7. **Text/SMS** (if enabled) — reads "Sorry — we couldn't get to your order in time…", no "Auto-rejected". ❑
8. **A genuine manual reject** still says **Rejected** on all of the above. ❑

## C. Coupon integrity (the ledger)
9. **Missed ≠ used** — new email **and** phone → [menu] order with the first-buy discount → let it time out (Missed) → reorder with the **same email OR phone** → first-buy **still applies**. ❑
10. **Completed = used** — fresh contact → order with first-buy → **Mark Complete** in kitchen → reorder same contact → discount is **gone** (correctly consumed). ❑

## D. First-buy hero (on your menu)
11. **Activate** — [admin] Kickstarter → First Buy Promo **ON**. ❑
12. **Looks good** — fresh/incognito [menu] → big **hero at the top** with a food-photo background (not black), compact height, "Get it now". ❑
13. **Hides for returning** — place + complete an order on that browser → revisit [menu] → **hero gone**; a new incognito → **shows again**. ❑
14. **Editable** — Kickstarter → Edit promo → change image / discount / min-order / Show-on-banner / stacking → menu reflects it. ❑

## E. First-buy in the cart (messaging)
15. **Discount shows** — fresh incognito → add items → cart shows **"🎉 First-time customer special −$X"**. ❑
16. **Self-corrects** — at checkout type a **returning** email → discount **drops** + a soft **"… New customers only"** note appears → **total shown = total charged**. ❑
17. **No note when hidden** — on the device that already ordered (hero hidden) → **no note** at all. ❑
18. **Master stacking** — with another promo active, first-buy **layers on top** (doesn't block it). ❑

## F. Marketplace channel (H1 + H2) — the big one
19. **Picker is visible** — [admin] Promotions → New/Edit promo → **Step 3 (Restrictions & display)** → at the **very top** there's a **Website / Marketplace / Both** picker. ❑
20. **Cart Value field** in that same step shows **"CA$ 100"** cleanly (prefix not overlapping the number). ❑
21. **Marketplace-only promo** — set a promo to **Marketplace** → it does **NOT** show on your normal [menu], but **DOES** on the **[MP]** view. ❑
22. **Website-only** — a "Website" promo shows on [menu] but **not** on [MP]. **Both** shows on both. ❑
23. **Preview = charge** — on each channel, the discount shown in the cart equals what's actually charged at checkout. ❑
24. **Per-channel first-buy** — a contact who has ordered on your **website** before, opening the **[MP]** view, still gets the **marketplace** first-buy (they're "new" there). On the website they do not. ❑
25. **Marketplace sign-in** — [MP] top-right shows a **Sign in** button → goes to the marketplace-wide account (`/account/login`); signed in → "Hi, {name}". Normal [menu] still shows your restaurant's own sign-in. ❑

## G. Promotions attribution (D)
26. **Tabs** — [admin] Promotions → **Self-made** tab (your own promos) and **Pre-made** tab (campaign-created). ❑
27. **Pre-made details** — each pre-made promo shows a **Kickstarter/Autopilot** "created-for" badge + a **USED** count. ❑

## H. Campaign results (E)
28. **Autopilot cards** — [admin] Autopilot → each campaign card with send history shows **Sent / Sales · 30d / Fees ($0.00)**. (No send history → row hidden; that's expected.) ❑

## I. WIN ladder promos (C1)
29. **Generate** — [admin] Autopilot → turn **Re-engage clients ON** → go to Promotions → **Pre-made** tab → **WIN1…WIN5** appear (10/15/15/20/20% off), each with the Autopilot badge. ❑
30. **2nd order** — turn **Encourage second order ON** → **2NDOFF** (15%) appears in Pre-made. ❑
31. **Editable + reversible** — edit a WIN promo's discount/copy → saved; turn the campaign **OFF** → those promos go inactive (kept for re-enable). ❑

## J. Remember-me — guest checkout pre-fill (no account)
A returning guest shouldn't retype their details. Device-saved, no account needed.
32. **Saves on order** — fresh/incognito [menu] → checkout as a **guest** (name + email/phone + address) → place the order. ❑
33. **Pre-fills next time** — revisit [menu] (same browser, still no account) → start checkout → name / email / phone / address are **already filled in**, with a small **"Not you? Clear"** line above the name. ❑
34. **Works across the platform** — open a **different** restaurant's [menu] (or the **[MP]** view) on that same browser → the same details pre-fill (it's the customer's own info, device-global). ❑
35. **"Not you? Clear" works** — tap it → contact + address fields blank out and the device memory is wiped (refresh → stays blank until the next order). ❑
36. **Account still wins** — sign in to a restaurant/marketplace account → the form uses the **account** details (no "Not you?" line); device memory never overrides a signed-in customer. ❑
37. **No card data saved** — only name/contact/address are remembered; payment card details are **never** stored (you always re-enter the card). ❑

---

## Not yet built (queued — do NOT test, they're not live)
- **C2** — the automated *tiered sending* (5 recency buckets each emailed their WINn, escalating, stops on reorder). Needs a schema migration + careful live verification.
- **C3** — the 5-message sequence editor UI.
- **G** — Marketing Studio (dynamic flyers + smart QR + scan→sale tracking).

If A–I all pass, the entire shipped marketing suite is verified end-to-end.
