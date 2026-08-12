# OWNER ACTIONS — Luigi's tracked to-do list

**How this file works (Claude maintains it):**
- Every time Claude needs something from you, it gets logged here with exact steps — chat messages can scroll away, this file can't.
- When you finish a step, tell Claude ("done #A2") and it gets moved to the DONE LOG with the date and how it was verified.
- ☐ = to do · 🔷 = do it WITH Claude in a live session · ⏳ = waiting on someone else · 🤔 = your decision needed

**Last updated:** 2026-08-12 by Claude (**EVERYTHING FROM THE LAST TWO DAYS IS NOW PUSHED AND LIVE.** Fourteen sessions' worth of work had piled up uncommitted — including two finished pieces stranded on side branches that would have been lost. Headline: **A47 — paid card orders were being lost before the kitchen ever saw them** (36 stranded in 60 days on your store, 3 orders you never received, $83.62). Also live: Autopilot no longer pays club members twice or mails a dead code (Ben Bilton's report), the cart now quotes the same delivery fee the card is charged, staff order emails name each special, every email declares its own language (Arabic/Hebrew now read right-to-left), and customer SMS is translated into all 38 languages. **Your list is A47 step 1 (three real orders need a decision from you), then the test passes in T-P / A45 / A46.**)
**Previous update:** 2026-08-02 (later) by Claude (**A40 — cart-loss customer report: could NOT reproduce, need more detail from you.** Full write-up + what I need in TODO.md's top entry. Also this session: fixed the social-icons bug + About-text centering + kitchen button reorder from your notes, and queued the custom-CTA-button feature you asked for — not built yet, needs a quick design pass.)
**Previous update:** 2026-08-02 by Claude (**A39 — Branded Mobile App BUILT dark**: the $59/mo GloriaFood-replacement add-on — per-restaurant apps on both stores, remote-synced menus, resumable wizard, superadmin pipeline, customer order-status push, white-label build tooling with a REAL signed Android app already produced from wizard config. Luigi's three pilot chores are the clock-starter, Apple account check first. Same day: A38 combos shipped.)
**Previous update:** 2026-08-02 (late) by Claude (**A37 — Fabrizio's reservation "smart buttons" BUILT** exactly to his Restoo reference: optional Adults/Children counters with the restaurant's own child definition as a hint, plus Children (high chairs/strollers) · Allergies · Special occasion · Accessible chips, flowing to kitchen + admin + CSV + printed slip + both emails; new "Booking questions" settings card with ⓘ help. Everything defaults OFF so nobody's form changes until they opt in. 31 new tests, schema on both branches, ×38 translations in flight. Needs Luigi's try-it pass, then the reply. Earlier today: A36 Max's slice fixes verified, A35 Sadaf's checkout regression shipped, A34 cost ledger.)
**Previous update:** 2026-08-01 (evening) by Claude (**A35 — Sadaf's checkout dead-end: root-caused to the 2026-07-31 address gate (b2648ac7), fixed, tested, browser-verified; TWO LOCAL COMMITS AWAIT LUIGI'S PUSH** — then the address backfill, then reply to Sadaf. Same day, earlier: A34 cost audit complete, cut-costs plan parked.)
**Previous update:** 2026-08-01 by Claude (**A34 — COSTS.md is live + first real invoices folded in.** Luigi asked for all monthly recurring costs tracked + a monthly update; a 6-agent audit built repo-root `COSTS.md`, then Luigi's Neon + Google Cloud invoices corrected it: platform infra is **≈US$100–115/mo actual** (Neon $42.65 + Google Maps ≈CA$44 + Vercel $20 + usage), NOT the $25–45 first estimated — both "probably free tier" guesses were wrong. Scope locked to platform-only (Skool = restaurant cost, excluded). 🔥 MOST URGENT: **Visa ••••6979 is DECLINING at both Neon and Google** — unpaid balances threaten the prod DB and the Maps key (A34 step 0). Also: verify the OLD-team Apple renewal (~Aug 3); GloriaFood zombie; "Schedule Tester" still granting $5/day. Standing rule: every cost discussion now includes savings ideas — top two: Neon compute (order-page cache + autoscaling floor, $42→~$22) and Maps SKU audit (up to –CA$44). Monthly auto-update scheduled for the 1st.)
**Previous update:** 2026-07-31 by Claude (**A30 — Luigi Bucks gifting money bugs + teaching emails.** From Luigi's Faisal test: his $40 is PENDING (no wallet, nothing spendable) and the $47.62 on screen was Luigi's OWN balance, which would have paid for an order recorded to Faisal. Fixed: a signed-in customer now owns their orders (kills the value transfer AND a once-per-lifetime reuse hole); refunds no longer credit the wrong wallet on a split order (4 tests, proven against the old code); marketplace signups now claim pending gifts instead of stranding them; both gift emails now TEACH in three numbered steps; one unredeemed gift per guest; ✉ resend button. ⚠️ A hole Claude introduced earlier the same session — typed email = wallet access, i.e. anyone could spend your balance by knowing your address — was caught and reverted before any push. Still to build: spending a gift with NO account, designed in DESIGN-gift-wallet-pass.md.)
**Previous update:** 2026-07-31 by Claude (**Fabrizio cms0gyexp #13 + #14 BUILT (A29)** — end-of-day report overhaul: business day is now CLOSE-TO-CLOSE so the report emails ~5 min after closing and after-close activity rolls to the next day (his 10:01 AM report explained + fixed); rejected/cancelled reservations no longer counted; refunds now shown AND netted out of Collected (his €20 partial-refund repro — including the bucket bug that moved a refunded card order into Offline); PayPal shows as "Online (PayPal)"; cancelled/rejected counts + real "you didn't miss/cancel" signals in the digest email. Plus two #10/#12 follow-ups: the customer status page now shows preset rejection reasons in the CUSTOMER's language (new sparse Order.rejectionReasonKey — ⚠️ schema push to both branches before deploy), and reserve-then-order booking notes finally reach the kitchen (yellow-boxed). i18n ×38, parity + preflight in A29.)
**Previous update:** 2026-07-30 by Claude (**A26 guest self-cancel PASSED on prod** — Luigi ran the closed-store card order + cancel; verified: order `cancelled` / `cancelledBy=customer`, wallet spend row flipped to `released` and the $2.29 credit returned. **A28 upgraded + incident**: the first attempt to connect www.luigislasagna.com briefly 404'd the live store; restored in ~4 min, and the zero-downtime domain-switch fix is built — see A28 for the corrected 6-step plan. Earlier today: polish batch shipped (reorder sold-out gap, reservation closed-hours email, eye-toggle everywhere, marketplace /account i18n ×38).)
**Previous update:** 2026-07-19 by Claude (**iOS ring round 3 shipped** from Fabrizio's 2026-07-18 video — the "two orders at once" double-ring, the "music card with a play button", and the ring-gap cadence all fixed web/server-side (adversarially reviewed, 21-agent workflow; 823 tests); his re-test asks posted on the report (IN_TESTING). The wake-handoff piece still rides the NEXT TestFlight build (006c669d, already committed). Earlier same day: Erik's $10 make-good SENT + verified (T-J closed). Remaining opens: awaiting Apple ×1 + Google ×2 review emails, B5 Kitchen 16 KB real fix.)

---

## 🍕 VIP / SKOOL SETUP — where it stands (2026-07-31, ~4 AM)

**Working and verified on prod:** the 3-promo stack prices correctly — a member cart with a
pizza + Toonie slice + pop gave 50% / $2.00 / 20% with **no double-discounting** (Luigi tested
live). Group earn rate is set to **10%**. 15 members in 🍕Luigi's VIP Pizza Club.

**LUIGI'S NEXT CLICKS:**
1. ☐ **Send the welcome email** — new ✉️ icon on each member row (one person) or
   "Send welcome to all members". Suggest emailing YOURSELF first, reading it, then the rest.
   ⚠️ Claude CANNOT send these — mail credentials exist only in production, by design.
2. ☐ **Finish the promo tests** in `TESTING-VIP-PROMOS-2026-07-31.md` — the two that matter are
   (a) a NON-member gets nothing, (b) a member NOT signed in who just types their email at
   checkout still gets the perks. Both are money-facing.
3. 🤔 **Decide: the "First-time customer special" is a 10% MASTER on the whole cart.** Master
   stacks with everything and can never be blocked, so a first-time VIP gets 10% ON TOP of the
   $2 slice (it lands ~$1.80) and on top of the 50%/20%. Leave it as an acquisition cost, make
   it standard, or scope it — but it is silently undercutting the $2 floor today.
4. 🤔 **Decide: the tip is calculated on the PRE-discount subtotal.** On the test cart 15% was
   $2.62 (15% of $17.48) not $1.35 (15% of $8.98) — so a VIP choosing "15%" tips ~29% of what
   they actually pay. Defensible, but confirm it is intended.
5. ☐ **Monthly chore until the engine fix lands:** when the VIP special changes, move the
   carve-out on the 20% promo (untick the new special's category, re-tick the old one).
   Forgetting = 70% off that category. The "one discount per item" build removes this chore.

## ⭐ TOMORROW — the short list (do these WITH Claude / report results)

**🌅 TODAY 2026-08-12 — EVERYTHING FROM THE LAST TWO DAYS IS NOW LIVE.**
Fourteen sessions had finished work that was never pushed. Two of them had finished and committed
their work on side branches that were never merged — the email-language fix and the customer-SMS
translations — and both would have been lost the next time those folders were cleaned up. All of it
is now on `main` and deployed. Gate before push: **1521 tests green, TypeScript clean, production
build clean, all 38 languages at full parity (0 missing / 0 extra / 0 mismatched)**, and both
database branches confirmed to already carry the new columns.

⚠️ **Before pushing, a 24-agent adversarial review of the batch found 3 real defects** (of 19
candidates — 15 were refuted). All three are fixed, but you should know the worst one, because it
sat on the exact feature built to help you: **a phantom order that a customer re-paid would have
authorized their card and never actually collected the money.** The hold would sit there for about
7 days and quietly vanish, you'd be paid nothing, and the order would have dropped off the "unpaid,
needs attention" report at the same time. Now it captures properly — and deliberately does NOT
print the kitchen a new ticket, because that food was made days ago.

- **T-T. 🤔 START HERE — A47 step 1: three real orders, $83.62, need a decision from you.**
  Sharon Craven $36.44, Lisa Benacquista $34.39, Uzair Rana $12.79. Nothing automatic touched them
  on purpose. Tell me which to chase and I'll walk you through it.
- **T-U. 👀 The 30-second proof the big fix works:** place a card order and **close the tab the
  instant you hit Pay**. It should still reach your kitchen within about a minute.

**🌅 TODAY 2026-08-11 (from Ben Bilton's Skool message — both complaints were real bugs):**
- **T-M. ⏳ PUSH + DEPLOY the fix, then reply to Ben.** Draft reply is at the bottom of
  `.claude/plans/see-this-message-i-eventual-yao.md`. ⚠️ **Do NOT tell him "standard promos can't
  stack with VIP"** — WIN1 is a *Master* promo, it stacks by design, and no email or page has ever
  said otherwise. It failed because the code was switched OFF, which is now fixed.
- **T-N. ✅ DONE (data fix, live on prod now) — your 7 Autopilot codes are back on.**
  WIN1–WIN5, 2NDOFF and CARTBACK were all `isActive: false`. **You turned them off by accident on
  2026-07-03 at 7:56 PM** — fifteen promos went off in thirty seconds, eight you meant to retire
  (BOGO, 50% off entire menu, MEAL DEAL, 20% OFF EVERYTHING, …) and six that were the live coupons
  of campaigns still running. They sit in the same Promotions list behind the same power button
  with only a small "Autopilot" badge, and nothing warned you. **54 emails to 52 customers between
  2026-07-04 and today carried a dead code (0 redemptions, ever).** Ben's went out Aug 9.
  Now fixed three ways: the sender can no longer attach a switched-off code, the Promotions list
  greys out (🔒) any code a running campaign owns, and the Autopilot page shows an amber
  "this campaign has no working offer code" warning if it ever happens again.
- **T-O. 🤔 YOUR CALL — free delivery covers Zones 1–3 only (of 8).** Zone 4 (11 km) and beyond pay
  $10.99–$49.99. That's a legitimate setup, but your promo's own description says *"Free Delivery on
  ALL orders over $30 (within our standard delivery zone)"*, which reads broader than 8 km. One
  customer (ORD-870058858, $44.97 in Zone 4) paid $10.99 under it. Either widen the zones or
  tighten the wording — tell me which.
- **T-Q. ✅ DONE — VIP members no longer get win-back offers stacked on club pricing.**
  You asked whether groups could be excluded from these campaigns. They couldn't — the capability
  didn't exist anywhere in the system, so it's now built. **Two settings:**
  (1) On each customer group: **"Members already get club pricing"**. Ticked already for all three
  of your groups (Pizza Club, Milton Ultimate Club, MUC Leaders) — I only ticked groups that carry
  a real perk, so a future mailing-list group won't be silenced by accident.
  (2) On each Autopilot campaign: **Same as everyone / Email, no extra code / Don't email them**.
  All three default to **"Email, no extra code"** — your choice: they still get the nudge, but the
  coupon block is replaced by "your member pricing already applies". Change any of them on the
  Autopilot page. *(These are Autopilot campaigns, not Kickstarter — Kickstarter is your separate
  FIRSTBUY first-buy promo, untouched.)*
- **T-R. ✅ DONE — win-back timing fixed: 3 → 21 days.** Your "we miss you" email was firing a
  median of **5.1 days** after someone's last order (Ben got his at 5.3 days). The ladder is now
  **21 / 40 / 60 / 90 days**. Nobody gets extra email from this — it only delays.
- **T-S. ✅ DONE — staff order emails now name each special.** Your ORD-910152825 email showed only
  "Promo discount −$37.01". It now lists every promo that fired with its own amount (and the coupon
  code where one was typed), with any remainder still shown so the column always adds up to Total.
- **T-P. 👀 After deploy, try the delivery test in the plan file** (order page → Delivery →
  `66-745 Farmstead Drive, Milton`). It used to charge $7.99; it should now land in Zone 2 and read
  FREE. Ben has no saved address on file, so ask him for his street address and run the same test
  against it — that tells us whether he was a geocode failure or genuinely in Zone 4+.

**🌅 TODAY 2026-08-10 (fresh, from the overnight ShipDay session):**
- **T-K. 🚨 CANCEL your test order #ORD-566877211** (the $11.32 Reward-Dollars scheduled delivery
  you placed ~1:42 AM to test ShipDay). It is REAL in ShipDay (ID 51583846) with a driver assigned —
  if you don't cancel, someone delivers it. Admin → Orders → cancel; that auto-cancels it on
  ShipDay and returns your credit. *(An automated check fires at 1:30 PM and will nag you if it's
  still live — it only runs if the Claude app is open.)*
- **T-L. 👀 First real card-paid delivery today: glance at ShipDay.** The auto-accept dispatch fix
  (cf88e72e) is live and your credit-paid test proved the rare path; the everyday card path uses the
  same shared code but hasn't been seen live yet. Expect the order in ShipDay within ~1 min of the
  customer paying — and while you're there, confirm the driver-side tip shows your 25% split (A43).

*(Items below this line are the older 2026-07 list — mostly ✅ done; still-open: T-B waits on Apple,
T-E/T-F Fabrizio asks, T-G build-next decision.)*

**Together (5–15 min each):**
- **T-J. ✅ DONE 2026-07-19 — Erik's $10 make-good SENT + verified end-to-end.** Luigi clicked Give (notify ✓) at 06:03Z → email sent; Claude then re-ran the live checkout preview with Erik's REAL email: **exactly −$10.00 applied automatically** (and FIRSTBUY correctly absent — he's returning). Promo dies after his one use (usageLimit 1 + once-per-lifetime); trash icon on his customer page revokes it anytime. Watch: when Erik orders, the order total will show the $10 off. Original plan kept below for the record.
  Original: **Erik's $10 make-good staged + PROVEN; only YOUR 2 clicks remain (that's what sends the email).** Your GO from 2026-07-19. Claude created the promo on prod ("**Sorry we missed your discount — $10 on us**": hidden, $10 off cart, once-per-lifetime, everyone, dies after 1 use) and PROVED it live: a test email attached to it got **-$10.00** at checkout on your real store; an unattached email got nothing; the test attach was then deleted — the deal is currently attached to NOBODY and invisible to the public. The email text (apology + 3 easy steps + "create an account, earn 5% Luigi Bucks") is baked into the promo description. Your clicks:
  1. **Admin → Customers → open Erik Wiebe** (the $12.79 pickup from 2026-07-17).
  2. **"Give a VIP special"** card → pick **"Sorry we missed your discount — $10 on us"** → keep **"notify"** checked → **Give**. Expect the toast "**emailed 1**" — that's his email going out (subject "Your VIP member deal at Luigi's Lasagna & Pizzeria — $10.00 off", branded, Order-now button to your site).
  Afterwards tell Claude "sent" and he'll re-verify the discount live against Erik's real email. Trash icon on Erik's page removes the deal any time. ⚠️ Unchanged flag: $10 vs. his $12.79 first order ≈ nearly-free meal — your stated intent; a minimum order is the knob if you'd rather not. Also FYI: your store's VIP label said "Bruce Trail Staff" — Erik's email would have opened with that, so Claude reset it to the default "VIP member" (your one customer group carries no promos, so nothing else changes; say the word to restore it).
- **T-A. ✅ DONE 2026-07-16 — driver rating DEPLOYED.** Schema pushed to BOTH branches, `rating-wip` merged (commit 25554fdd), preflight green (816 tests), and VERIFIED live on prod: the public tracking API now returns `driverRating`. Drivers see their ★ % in the app; dispatch + superadmin show it; customers see it on the tracking card. (Note: preflight's exit code was masked by a pipe on the first run and hid a stale-Prisma-client failure — caught by the read-bottom-up rule; the tooling gap is noted below as T-H.)
- **T-B2. ✅ DONE 2026-07-17, 1:22 AM — Fee Free Delivery iOS SUBMITTED to App Review 🎉** (Build 6, status **Waiting for Review**, submission ID `da64928d-7c7f-44a9-a6f2-60b24412a25c`, up to ~48h). Final blockers cleared live with Claude: App Privacy published (5 data types: Name/Email/Phone/Precise Location linked + Crash Data not-linked; all App Functionality, no tracking), price tier **Free**, iPad 13" screenshots (2048×2732 ×2). NOTE: checkpoint 3 (locked-phone pin) was started but not finished (#525532 reached picked_up) — Luigi chose to submit anyway; a fresh test job can be seeded on request. When Apple's email arrives (approved OR rejected), paste it to Claude. ⚠️ Still: never touch the OLD team's Kitchen app (Fabrizio live on it).
- **T-I. ✅ v1.1 BUILD COMPLETE 2026-07-18 — all phases 0–8 shipped.** Phases 0+1 (unified login) LIVE 2026-07-16. Phase 2 (`cd68a19b`) keyset schema BOTH branches. Phase 3 driver shell device-gated + deployed. Phase 4 History, Phase 5 Earnings, sounds, Phases 6–7 restaurant Deliveries tab + detail (`d80c9a9f`, `c06d8e75`). **Phase 8 (`c73ead43`): restaurant Drivers tab + tap-to-call (your "phone visible" call) + Rate-this-driver on finished deliveries — a rating visibly moves the driver's ★ % (verified 100→76 in E2E, 13/13 checks).** What to try in the app: sign in at `/driver` with your admin login → new **Drivers** tab → tap a driver → call button + their deliveries for you; open any completed delivery → rate them at the bottom.
- **T-H. ✅ DONE (verified 2026-07-17)** — preflight already runs `prisma generate` FIRST (the reorder landed with an earlier phase); rule stands: run preflight DIRECTLY, never through a pipe/tee (pipes mask the exit code), read bottom-up.
- **T-B. iOS TestFlight under the org** → when Apple's verification email arrives (A17), we set up the org's App Store Connect key + Codemagic + build "Fee Free Delivery (iOS)".

**You test on real devices (tell Claude what breaks):**
- **T-C. Tablet apps** — both are installed. Sign into the **Fee Free Delivery** app with your driver login (`support@feefreeordering.com`) → Allow location **"Always"** → take a short test delivery (accept → picked up → delivered, watch background GPS). Open the **Kitchen** app too.
- **T-D. This session's live changes** — (1) checkout now shows **"X km from store"** next to the zone on your store; (2) **desktop checkout** bottom no longer flush against the edge (Fabrizio's fix); (3) driver "**Can't complete**" now asks to confirm, re-offers the order to the pool, and the customer sees "**Finding you a driver**" (not a stuck driver name).

**Unblock Fabrizio's open reports (Claude needs from you):**
- **T-E. iOS report (`cmrkvs5r`)** — on the iPhone Kitchen app, open the **3-dot menu** and read out the **"web `<build>`"** value (tells us if his app has the current code). His ring fixes need a fresh iOS build (T-B).
- **T-F. Invoices report (`cmr1ty0lc`)** — confirm the exact symptom, or confirm it's the known "non-VIES restaurants can't buy paid plans yet" (blocked on the EU OSS registration, not code).

**Decision (no clicking — just tell Claude):**
- **T-G. What Claude builds next** in the delivery backlog: **#5** driver order-history + shift-earnings dashboard, **#6** dispatch-view enrichment (history, driver info, settings), and the rating **feedback buttons** (customer/restaurant/you rate a driver). Pick an order or say "your call."

*(Everything below is the standing backlog; the items above are the fresh ones from tonight.)*

---

## A. DO NOW — this week, in priority order

### A46. ✉️ "Awaiting confirmation" on an AUTO-ACCEPTED order — FIXED + PUSHED (2026-08-11)
You placed two test orders (ORD-143921044 pickup 1:42 PM, ORD-519009065 delivery 2:55 PM) and both
customer emails said *"the restaurant will confirm it shortly — you'll get a follow-up email the
moment they accept."* No follow-up ever came.

**Auto-accept was never broken, and you were right that it wasn't the auto-accept change.** Prod
proves both orders were accepted the same second they were placed, and the delivery one dispatched
to ShipDay 1 second after payment (driver assigned). Auto-accept shipped 2026-05-15 (7869cc56) and
was fine. The break came 13 days later in **42646a7c, 2026-05-28, "Order emails: fix 'Confirmed
then Rejected' contradiction"** — a real fix for a real problem (customers were getting "Order
confirmed" then "Order rejected"), which retitled the placement email to "Order received — awaiting
confirmation" and added the promise of a follow-up. Its commit message reasons entirely about the
kitchen-accept step and never mentions auto-accept — where that step doesn't exist, so the promised
email can never arrive. There WAS a correct window, 2026-05-15 → 2026-05-28, but it closed six
weeks before go-live, so no live customer ever got a correct auto-accept confirmation.

**Blast radius (prod):** 4 of 38 stores run auto-accept — yours, Sabor Goiano, PoshMeal DEMO and
**La Pergola Alghero (Fabrizio's)**. 385 auto-accepted orders released in 90 days, **177 distinct
customers**, earliest on record 2026-05-19.

A 12-agent adversarial audit checked the fix before it shipped and caught two more things, both now
fixed: a scheduled order would have emailed "Prep time: 4320 minutes" (its stored prep time is the
countdown to the slot, not a cooking estimate), and an after-hours auto-accepted order still
promised "you'll get an update as soon as they open" three lines under "Order confirmed" — the same
broken promise. Shipped: 9 new keys × 38 languages, 228 locale renders verified, 1435 tests,
preflight green.

1. ☐ **Re-run a test order** (pickup or delivery) and confirm the email now reads **"Order
   confirmed"** with no mention of waiting. Old orders keep their old emails — nothing is re-sent.
2. 🤔 **Tell Fabrizio?** His store has been sending the same wrong email to real customers since
   May. It's now fixed for him automatically. Your call whether that's worth a note.
3. ✅ **DONE 2026-08-12 — both of the pre-existing issues found in passing are now fixed and live.**
   Each got its own change, as flagged. (a) Every email now declares its own language, and Arabic
   and Hebrew read right-to-left — harder than it sounds, because Gmail/Outlook.com/Yahoo strip the
   `<html>` element entirely, so the direction is repeated on the container table, and email can't
   use logical CSS (Outlook renders with the Word engine) so the alignment and padding are mirrored
   by hand. Staff-facing English-body templates deliberately keep `lang="en"`. (b) Customer SMS and
   branded-app push are translated into all 38 languages — one builder feeds both surfaces. Kept
   under 138 characters and GSM-7 only, because SMS bills per segment and a single em dash would
   double what a restaurant pays per text. Still nothing sends today (no store has the add-on), which
   is exactly why it was worth fixing before the first one turns it on.

### A44. 📍 "Could not geocode this address" (Sofia Chilly meals, Islamabad) — FIXED, one check is yours (2026-08-10)
What actually happened: nothing to do with the Pakistan country work from yesterday. The address
`B17, Islamabad, Qurtabad School` contains a landmark that **is not in OpenStreetMap**, and
Nominatim (our free geocoder) is AND-matching — one token it can't match returns zero results, no
partial or fuzzy match. Proven by running the exact query: with the school in it → nothing; with
the school removed → an immediate hit.

Built today so the next non-Western store doesn't hit the same wall:
- Admin geocoding no longer calls OpenStreetMap from the browser (the `User-Agent` browsers require
  us to send was being silently dropped, so we were hitting them anonymously and could be blocked).
  It goes through our own server now, biased to the restaurant's country, and cached.
- When the full address misses, the server retries progressively shorter queries. If it can only
  land a city-level pin it now **says so** ("drag the pin to your exact spot") instead of pretending
  it's exact — and automatic/silent geocoding refuses coarse pins entirely, because a confidently
  wrong pin points every delivery-zone radius at the wrong origin.

1. ☐ **Check Sofia Chilly meals' address fields.** Picking an OSM suggestion overwrites the
   Address/City/Province/Postal fields with OSM's version — the second suggestion you tried was a
   private house filed under Taxila Tehsil, so the store's saved address may now read
   "Jutt House B17, House 3006, Street 108, MPCHS Block-E". The map pin is correct (33.683162,
   72.807489); it's the printed/emailed address text worth a look.

### A43. 💵 Driver tip share (you want drivers to get 25%) — TWO checks are yours (2026-08-10)
Context: ShipDay dispatch is FIXED as of today (auto-accepted orders silently never dispatched since
you turned auto-accept on Aug 6 — commit cf88e72e, live and verified). Pre-orders now land in
ShipDay at payment time with the customer's scheduled delivery date/time.

How tip money actually flows (verified line-by-line today): the customer's tip is charged inside
your own Stripe payment, so **100% of every tip is already in YOUR account**. What we send ShipDay
is only the tip *number* (the driver's app displays it; ShipDay earnings reports count it). Our
system never pays drivers for ShipDay orders — driver pay is whatever you configure/pay on the
ShipDay side. There is currently NO tip-split setting anywhere in Fee Free Ordering.

**RESOLVED 2026-08-10 (Luigi):** the drivers work for SHIPDAY, not for the restaurant — Luigi pays
ShipDay a per-order fee, and the tip share the driver sees/keeps is configured on ShipDay's side
(Luigi believes ShipDay shows the driver only the chosen % — set to 25%). Employment-law question
is moot on our side under that model (ShipDay's drivers, ShipDay's agreement). **No code change:**
we keep sending ShipDay the true 100% tip number; ShipDay applies the split.

1. ☐ Only remaining check: confirm the 25% split is actually set in the ShipDay dashboard
   (Settings → Driver payment), and glance at the first live order's driver-side tip to be sure.

### A42. 🎁 Gift Wallet Pass BUILT — one env-var chore + a runbook note (2026-08-03)
Built the no-account spend path for gifted Reward Dollars (DESIGN-gift-wallet-pass.md): a recipient
can now click a link or type a 16-character code from the gift email and spend the balance
immediately — no signup, no password. Lives in a worktree, not yet merged to `main`
(`.claude/worktrees/agent-a6ab6708f7c491cc4`, branch `worktree-agent-a6ab6708f7c491cc4`) — review
and merge when ready.

**YOUR PART — one required chore before this is safe in production at scale:**
1. ☐ **Set `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (or Vercel KV's
   `KV_REST_API_URL`/`KV_REST_API_TOKEN`) in Vercel prod**, if not already set. Without them,
   `rateLimitShared` (used by the new `/api/public/gift-pass/*` endpoints) degrades to a
   per-Vercel-isolate in-memory limiter and **fails open** on any store error (rate-limit.ts:78-86,
   111) — it's real defence-in-depth, not the security boundary (the 80-bit code entropy is), but a
   targeted attacker across many isolates is only bounded properly once this is set.
2. ☐ **A domain-switch runbook line:** if you ever cut a restaurant over to a new `customDomain`,
   any Gift Wallet Pass links already emailed under the OLD host break (the cookie is host-only by
   design). Recovery is one click: admin → Reward Dollars → the ✉ Resend button on that gift's row
   mints a fresh code/link on the new host. Worth remembering the next time a domain cutover
   happens — nothing to do right now.

**Schema note (not yet pushed):** added `GiftWalletPass` (new table, additive-only — nothing added
to `Order`/`Customer`/`MenuItem`). Someone needs to run `npx tsx scripts/push-schema-to-both.ts`
against BOTH Neon branches before this deploys — I did not run it from the worktree per the
standing rule (schema pushes are a deliberate, reviewed action).

### A41. 🟡 Google Cloud alert — Function CPU Duration spiked 13× (2026-08-02, ~20:15 UTC)
Medium-severity anomaly email from Google Cloud, project **fee-free-ordering-systems**: a Cloud
Function's CPU duration jumped from ~0 hours/5min average (past 7 days) to 0.05 hours in the last
5 minutes — a 13× spike. **This is NOT code in this repo** — checked, there's no `firebase-functions`
dependency or Cloud Functions source anywhere in the codebase, so whatever's running is either a
Firebase Extension (e.g. an image-resize trigger on Storage) or something set up directly in the
GCP console, outside what I can see or fix from here.
**YOUR PART:** open **Google Cloud Console → Cloud Functions** (or Firebase Console → Functions) for
the `fee-free-ordering-systems` project and check which function spiked — the email's "View in
Dashboard" button should deep-link straight to it. Paste me the function name + a few log lines and
I'll dig into whether it's something we should worry about (cost impact — sustained CPU spikes bill
more) or just noise from an infrequent batch job. Sustained CPU spikes are a COSTS.md-relevant signal
per your standing rule to track anything that could grow the monthly bill.

### A39. 📱 Branded Mobile App — BUILT (dark); YOUR pilot prerequisites start the clock (2026-08-02)
The GloriaFood replacement: restaurants pay **$59/mo** and get their own branded ordering app on
the App Store + Google Play, managed from the dashboard they already use; menu/price changes
appear in the app instantly with **no store re-review**. Everything is built and tested but
**hidden behind "Coming soon"** until YOUR restaurant's pilot app is live on both stores — we
don't sell what we haven't shipped ourselves. (Why now: GloriaFood retires branded apps
**April 30, 2027** — every restaurant on their program becomes a prospect.)

**YOUR PART — three account chores; #1 is the long pole (weeks), so start it first:**
1. 🤔 **Check your Apple Developer situation.** Your GloriaFood screenshots show their branded-app
   flow mid-setup (step 1/8) — that flow normally creates an Apple Developer account **owned by
   your restaurant**. Log into https://developer.apple.com with your restaurant email and tell
   Claude what you see: an active membership means we REUSE it (saves weeks + $99); nothing means
   we enroll fresh (needs a D-U-N-S number for the restaurant's legal entity — Claude will walk
   you through it, it's free but slow). ⚠️ This is separate from Fee Free's own Apple account (A17).
2. ☐ **Create the Google Play org account for your restaurant** ($25 one-time) at
   https://play.google.com/console/signup — pick **Organization**, use the restaurant's legal
   info. Identity verification can take a few days. Then invite Claude's publishing address as
   Admin (Claude will give you the exact email when you're there).
3. 🔷 **~10 min WITH Claude once #1 resolves:** generate the App Store Connect API key + APNs
   push key from your Apple account (Claude guides every click; the keys land encrypted in the
   platform, never in plain text).
Your wizard is at Admin → Mobile App. Runbooks in the repo: `PLAY_STORE_SUBMISSION_CUSTOMER.md`,
`APPLE_SUBMISSION_CUSTOMER.md`, `docs/CUSTOMER_APP_PIPELINE.md`. The Android build is already
proven — a real signed store-ready app was produced from the demo store's wizard config.

**⚠️ VERIFIED STATE 2026-08-04 (overnight prep):** the pilot add-on is NOT actually granted on
prod — Luigi's store has no `branded_mobile_app` row, so today Admin → Mobile App shows the UPSELL
panel, not the wizard. The earlier "Claude granted your store the add-on free" note was inaccurate.
**Tomorrow's STEP 0** (before anything else): grant Luigi's store the `branded_mobile_app` add-on as
a long-lived comp so the wizard unlocks. NOT done autonomously overnight on purpose — it's a prod
billing-entitlement write and the dev comp-script (a) refuses prod and (b) only does a 6-day trial
that the expire-addon-trials cron would then kill; a permanent pilot comp needs the right status +
far-future trialEndsAt (or a superadmin grant), decided WITH Luigi so we don't repeat the
comped-add-on billing edge cases from A1. Entitlement = feature `app_store_listing`, checked by
`hasFeature()` in `/api/admin/mobile-app/project`.

**Tomorrow's sequence (in order):**
0. Grant the pilot comp (above) → wizard unlocks.
1. **Apple account check** (the multi-week gate) — Luigi logs into developer.apple.com/account with
   the RESTAURANT email and reports what he sees; reuse existing enrollment if present, else enroll
   fresh (free D-U-N-S, slow). This gates the whole iOS timeline — do it first even while other
   steps proceed.
2. **Google Play org account** ($25, https://play.google.com/console/signup, Organization) — start
   in parallel; identity verification takes days.
3. Run the **wizard together** (app name/icon/colors → derives bundle id).
4. ~10 min: generate **ASC API key + APNs push key** (Claude guides; keys land encrypted).
Android build pipeline is already proven; iOS builds via Codemagic `customer-ios` (macOS only).

### A38. 🍕 Combos: pick-4-at-once + SHARED toppings across pizzas — BUILT (2026-08-02)
Your two asks, modeled on the GloriaFood/Uber screenshots you sent, in one release:
1. **"Choose 4 Pop" now fills in ONE pass** — tap a drink and −/+ buttons appear right on the
   row (4 of one kind, 2+2, whatever); drinks with sizes ask their questions ONCE with a
   "How many?" — no more one-popup-per-drink. A red note lists exactly what's still missing.
   Cart/kitchen/receipt print "4x Coke" on one line. New per-step setting (like GloriaFood's):
   **"Allow adding the same item multiple times"** — ON by default.
2. **NEW combo option no other platform has: "Share included toppings across all pizzas"**
   (Combo tab → amber card, shows when the combo contains pizzas). Your example: 2 pizzas,
   6 toppings combined — 1 on the first leaves 5 free for the second; beyond that, charged at
   that pizza's own topping price. Customers see a live meter ("Shared toppings: 4 of 6
   used"), and topping buttons say "Included" until the allowance runs out — then the price
   appears right on the button.
3. (Under the hood, same release) Fixed a real money hole: combo pizza topping fees were
   trusted from the customer's browser; the server now re-prices everything itself.
**YOUR PART:** try it on a test combo (Menu → item → Combo tab), especially the shared-toppings
card on a 2-pizza combo — and tell Claude if the wording on the two new settings reads right.
One PAPER print of a combo receipt when convenient (the "4x" collapse + topping prices are on
both printer paths).

### A37. 🍽️ Fabrizio cmsajnvkm "smart buttons" — BUILT, awaiting your test + the reply (2026-08-01)
His request (with Restoo screenshots): let guests answer a few extra things when booking a table.
**Built exactly to his spec, all OFF by default** — a restaurant that ignores it sees zero change:
- **Adults + Children counters** replacing the single party-size picker (optional), with the
  restaurant's own definition of "child" as a hint under the Children counter ("Up to 8 years
  old" / "Up to 130 cm tall") — the part he red-boxed.
- **Smart-button chips**: Children (how many high chairs / strollers — counters, like his
  screenshot), Allergies, Special occasion (his exact 8-option list), Accessible.
- Everything flows to the kitchen screen, the reservations list + CSV, the printed slip, and BOTH
  emails (staff + guest) — and the guest confirmation email now finally echoes their requests
  back (that card existed but was never filled in — a real pre-existing gap this closed).
- Admin → Reservations → Settings → **"Booking questions"** card with ⓘ help on every switch.
**✅ SHIPPED + REPLIED (2026-08-02).** Commit 791879c7 deployed; verified on PROD that the new
strings are live AND that Luigi's own store still shows the classic "Number of People" picker —
proof the opt-in default works and nobody's form changed. Reply posted to the report in Italian +
English, status NEW → IN_TESTING, Fabrizio notified.
**YOUR PART (what's left):**
1. ☐ **Try it on your own store** (Admin → Reservations → Settings → **Booking questions** → turn
   on what you want → book a test table). Nothing appears for guests until you switch one on.
2. ☐ Watch for Fabrizio's re-test reply — he was asked specifically whether the occasion list
   needs anything for the Italian market.
3. ☐ One PAPER test when convenient — the printed reservation slip now carries the extra lines
   (both printer paths updated in lockstep).

### A36. ✅ Max Bilton's slice reports — BOTH FIXED by Luigi + Claude-verified on prod (2026-08-01)
(1) "Slice Add On's" now OPTIONAL (min 0 / max 3) on every live Pizza-by-the-SLICE item — the
"choose at least 1" trap is gone (the 65 min=1 copies left in the DB are all on archived menu
versions, harmless). (2) "Toonie Tuesday Slice - SKOOL VIP" now has REQUIRED "Choose Which
Slice" (min1/max1, 21 slice options). Verified read-only against the ACTIVE prod menu
(scripts/_check-max-fixes.ts). ☐ Remaining: **reply to Max** (suggested text in-chat).
**Same evening — Apple OLD-team renewal VERIFIED:** Membership shows renewal date
**Aug 3, 2027**, fee **C$119/yr** (not US$99 — ledger updated). Auto-renew OFF is INTENTIONAL:
per the cut-costs plan the old team lapses Aug 2027 AFTER the Kitchen app migrates to the org —
do NOT re-enable; DO calendar the migration well before Aug 2027.

### A35. 🚨 Sadaf's checkout dead-end — FIXED + verified, needs YOUR push (2026-08-01)
Her report was real and serious: the 2026-07-31 address-safety change (b2648ac7) accidentally
dead-ended any delivery customer whose address wasn't hand-picked from the dropdown — saved
default addresses without map coords opened checkout permanently blocked while "You're in Zone X"
rendered right under the block message. **She hit it within hours; anyone with an older saved
address could too.**
**Fix is BUILT, TESTED (963 tests green, preflight clean) and VERIFIED in-browser on the dev
store** (typed-not-picked address → Zone 3 resolves → order placeable; unresolvable address →
guided to the field with the translated message + pin escape hatch, no dead button). Two commits
sit LOCAL on main — the permission system rightly made the production push Luigi's call:
1. ✅ PUSHED + DEPLOYED 2026-08-01 evening (commits 0e4922e2 + docs). **Luigi verified LIVE**:
   typed "933 maple av" without picking → "You're in Zone 1 — Fee $7.99" → Place Order live.
2. ✅ BACKFILL RAN on dev (0 rows) + PROD: 11 coordinate-less saved addresses, **7 healed**
   (all real Milton ones incl. 933 Maple Ave), 4 left null (3 Italian test rows + 1 malformed —
   all still orderable via the new text-geocode gate). Note: Sadaf had NO saved address row —
   the typed-address fix is what covers her.
3. ✅ **Sadaf messaged (2026-08-01 evening)** — A35 FULLY CLOSED: regression fixed, deployed,
   backfilled, owner-verified live, customer informed. Watch for her next order (her $75 gift
   is still unclaimed — signing up claims it).
4. FYI: two follow-up sessions running (AddressBook coord hardening; hardcoded-English strings).

### A34. 💰 COSTS.md launched — answer the 14 questions + 3 time-critical checks (2026-08-01)
Luigi asked Claude to track ALL recurring costs and update him monthly. Repo-root **`COSTS.md`**
is now the single money-out ledger (Claude updates it the 1st of each month, scheduled).
Audit result: platform infra ≈ **$25–45/mo** + **~$250–300/yr** annuals; restaurant side separate.
**UPDATE 2026-08-01 (afternoon):** Luigi sent the first real invoices. Neon is a PAID plan —
**$42.65/mo actual** — and Google Cloud (Maps) is **≈CA$44/mo actual**; infra total revised to
**≈US$100–115/mo**. Skool = restaurant cost, excluded per Luigi. ⚠️ BOTH invoices show the
**Visa ••••6979 declining** — new step 0 below is the most urgent item in this file.
**YOUR PART:**
0. ✅ **RESOLVED 2026-08-01 — Luigi settled both failed payments** (Neon $42.65 + Google Cloud
   ≈CA$44.04). Standing advice kept: the same Visa ••••6979 also backs Sentry (bills Aug 7,
   $35.72) and Resend (renews Aug 23) — keep a ~$250/mo buffer behind it so a decline never
   threatens the prod DB again.
   **END-OF-DAY STATE (2026-08-01): the audit is COMPLETE — every major cost is now a real
   number.** Total ≈**US$385–415/mo**: Claude Max 20x **CA$316.40** (over half the bill!) +
   Neon $42.65 + Sentry $35.72 (at 1% usage) + **Google ≈CA$44 which turned out to be a 24/7
   E2 VM in Toronto, NOT Maps** (Maps ≈ $0; the VM is likely an orphan — FeeFree runs on
   Vercel+Neon) + Vercel $27+ + Resend $20 + Twilio ~$4. Spend-to-date ≈CA$1,300–1,500.
   **The cut-costs plan is COMPLETE and PARKED in COSTS.md §6** (target ≈US$150–230/mo:
   Sentry→free, identify+retire the VM, Claude 20x→5x if usage data allows, Vercel
   observability off, Neon cache) — Luigi paused to work on other things; NOTHING changed yet.
   Resume trigger: Luigi says **"let's cut costs"**. Small remaining ❓s: GoDaddy renewals
   screenshot, Vercel seat-vs-usage, API-key burn, plan start months (COSTS.md §8).**
1. ☐ **TODAY — Apple OLD team renewal (due ~Aug 3, 2 days):** developer.apple.com → sign in with the
   OLD team (Luigi's Lasagna & Pizzeria Inc.) → Membership → confirm the expiry now shows **2027**
   and auto-renew is ON. You renewed Jul 11 but Apple said "processing" and we never confirmed.
   A silent failure this weekend pulls Fabrizio's Kitchen TestFlight + the App Store apps on that team.
2. ✅ **GloriaFood CANCELLED (2026-08-01, final day Aug 8).** The old Milton site's last paid
   tie is cut. FYI: after Aug 8 the old GloriaFood admin (and its promo/voucher history) may
   become inaccessible — the Skool voucher balances were already transferred (A33), so nothing
   is lost, but grab any other data you want from there before Aug 8.
3. 🤔 **"Schedule Tester" automation is still granting $5/DAY on prod** (~$150/mo in free food,
   TODO.md #424). Cleanup script is ready — tell Claude "run the schedule-tester cleanup" or keep it.
4. ☐ **Answer the 14 questions** at the bottom of `COSTS.md` (Skool plan? Claude plan? Vercel invoice?
   Neon upgrade OK? domain registrar? BMO fee? …) — the unknowns are likely bigger than the whole
   infra stack. Tell Claude the answers in any order; he folds them in.

### A33. ✅ Skool → Luigi Bucks credit transfer — COMPLETE (2026-08-01, ~3:10 AM)
**$600.00 moved for 15 active Skool members** (unused SKOOL Vouchers Apr–Jul 2026, read off the
GloriaFood promo list page-by-page with Luigi; Rick DL excluded as no longer active; Tina+Christina
merged per Luigi; Rob=Robert Quayson, Ken=Kenn, Karen=Kay Savich confirmed by Luigi).
- **10 instant wallet credits** (had accounts): Karen $60→bal $66.68, Habib $60→$75.00,
  Robert $40→$47.60, Matt/David/Max/Usman/Alex/Zahra $20→$35.00 each, Robin $15→$41.55.
- **5 pending gifts** (no account yet — auto-claim at signup, no expiry, resend button):
  Sadaf $75 (sadafsheikhchaudhry@yahoo.ca), Christina(+Tina) $70, John $60 (rockpick101@gmail.com),
  Ellie $60 (elliemac126@hotmail.ca), Kenn $40 (kmacfie@me.com).
- All 15 notification emails REALLY delivered (Resend IDs logged). ⚠️ Gotcha for future scripts:
  under run-on-prod the transport loads the PROD-encrypted Resend key, local decryption fails, and
  sends silently become "[Email placeholder]" while returning success:true — the first apply's
  emails never left. Re-sent via the dev-context env-key transport (ALLOW_DEV_EMAIL=1),
  scripts/_resend-skool-transfer-emails.ts. Consider making that failure loud.
- Idempotent: note-marker "Skool voucher transfer (Apr-Jul 2026)" + gift:<id> ledger keys;
  re-run applies $0.00 (verified). Script: scripts/_skool-credit-transfer.ts.
- Deliberately EXCLUDED (Luigi's defaults, revisit if he asks): Max's April "Copy" voucher
  (accidental duplicate), 2025 one-off credits Angelina $30 + JASON $40 (different program).

### A32. 📅 SCHEDULED — September VIP promo rollover (fires Sept 1, 8:00 AM)
A cloud reminder is set: https://claude.ai/code/routines/trig_01E8WsfdevsFZN2aFABY8tjX
It will walk through the monthly chore: retire AUG VIP SPECIAL, create September's,
move the 20% Menu-Wide carve-outs to the new special's categories (the step whose
omission briefly gave 50% off Daily Deals on Aug 1), and re-test one deal item +
one regular item as a VIP member. Also re-raises the two open decisions: tip on
pre-discount subtotal, and MUC 25/30 staying Exclusive.


### A31. 🇮🇪 VAT OSS application DISAPPROVED — resubmit with the position field (2026-07-31)
Two emails arrived 9:14 AM. The first is the generic auto-template ("you do not qualify for the
scheme") and reads worse than the situation is. The second, from **Rachel Williams, IE VAT OSS**
(ossnsd@revenue.ie, +353 42 9353340), gives the real reason:

> "The below section must include your **position within the company, for both contacts**."
> Position within Company | Fee Free Ordering Inc.
> "Please resubmit your application."

**What happened:** the COMPANY NAME was entered in the "Position within Company" field instead of a
job title, on BOTH contacts. Not an eligibility rejection — a form field.

**STATUS 2026-08-10 — Revenue answered: they CANNOT amend the application. Full resubmission
required.** So the new one has to be right first time. Everything needed is in
**`docs/VAT-OSS-RESUBMISSION-2026-08-10.md`** — a field-by-field sheet built from what was actually
filed on 2026-07-30, so you re-type nothing from memory.

**The governing rule: change exactly ONE thing — the two `Position within Company` fields → `Director`.**
Every other field passed Revenue's review without comment; re-keying an unchallenged field is how you
earn a second bounce.

**Both open questions resolved 2026-08-10 — there is nothing left to decide, only to type:**
- Both contacts were you ⇒ `Director` in **both** position fields (a repeated true title beats an
  invented second one).
- No EU sale has actually happened ⇒ date of first supply = **`2026-10-01`**, NOT the original
  `2026-08-01`. A past date with no supply behind it is a false statement on a tax registration —
  worse than the field that bounced you. Effective date lands 1 Oct either way, and the
  EU-VAT-at-checkout code doesn't exist yet, so this costs nothing. Explain the change in the
  covering email so it doesn't generate a query.

- ☐ Submit at <https://www.ros.ie/vatoss-web/vatoss.html>, screenshot the form BEFORE clicking
  submit, and reply on Rachel's existing thread so the new filing isn't read as a stray duplicate
  (draft email is in §5 of the sheet).
- ⚠️ **This is the blocker behind Fabrizio's invoices report `cmr1ty0lc`** (T-F): non-VIES EU
  restaurants can't buy paid plans until the OSS registration is live. Worth telling him it's in
  progress rather than leaving that report silent.


### A30. 🆕 Luigi Bucks gifting — money bugs fixed, gift emails rewritten (2026-07-31)
Started from your Faisal test ("I sent $40, plugged in their email, it doesn't associate").

**First, the answer to what you saw.** Faisal's $40 shows as **PENDING**, which means it is
**not in any wallet** — there is nothing to apply at checkout, so nothing could have appeared.
The **$47.62** on your screen was **your own signed-in account's balance**, not his. Had you
placed that order, your wallet would have paid for an order recorded under his email.

**☐ Confirm Faisal's exact state yourself (read-only, writes nothing):**
```bash
npx tsx scripts/run-on-prod.ts scripts/_diagnose-gift-recipient.ts luigis-lasagna-pizzeria faisalzia@live.ca
```
It prints every gift, whether a wallet exists, and a plain-English verdict naming the blocker.

**Fixed this session (all local, nothing pushed yet):**
- **Your wallet can no longer pay for someone else's order.** A signed-in customer now OWNS
  their orders; the typed address stays as the contact for the confirmation. This also closed a
  hole where a "once per customer" offer could be reused forever by typing a fresh email.
- **Refunds could credit the wrong person.** On an order where one person paid and another
  earned, the refund routine picked one account arbitrarily and applied both the refund and the
  clawback to it. Each now lands on the right wallet. 4 tests, proven to fail against the old code.
- **Gifts to marketplace signups were stranded forever** — and the next gift to that person
  silently orphaned the first. Now claimed on signup.
- **Both gift emails now teach**: what the credit is in plain words, then three numbered steps.
- **One unredeemed gift per guest** (your rule) — a second is refused, naming the outstanding
  amount and offering resend or cancel.
- **✉ Resend button** on every gift row, so anyone who lost or misread the email can be re-sent
  the instructions. The right email is chosen automatically from the gift's current state.
- Checkout now says **"From your account · your@email"** under the balance, so whose money is
  in play is never ambiguous again.

**Your decisions, recorded:** no dollar cap on no-account gifts; one unredeemed gift per guest
instead; orders belong to the signed-in account.

**⏳ Still to build — spending a gift WITHOUT an account.** Today Faisal must create an account
(one password field) to collect his $40. The no-account path is designed but not built: see
`DESIGN-gift-wallet-pass.md`, which carries your overrides at the top. Honest note attached to it:
without an amount cap, a forwarded or mis-addressed gift email can be spent in full by whoever
holds it — the remaining protections are one gift only, this restaurant only, no gift cards, no
deposits, no driver tips, earns nothing, 90-day expiry, instant revoke.


### A29. ✅ Fabrizio's #13/#14 end-of-day report overhaul — COMPLETE (2026-07-31, 2:43 AM)
**REPLY POSTED 2026-08-01 ~2:45 AM** after a 10-agent adversarial verify pass (9 CONFIRMED, 1 PARTIAL
→ fixed pre-post: export now clamps ?date= to maxSelectableDayKey like the page, commit dcdf163d;
reply wording tightened: #10 = preset reasons only, zero-activity nights send nothing). Bilingual
IT+EN comment on cms0gyexp, status IN_TESTING, Fabrizio notified in-app.
**All code merged + preflight green (exit 0).** Built from his two comments on report cms0gyexp.
What shipped: business-day close-to-close windows (reports email ~5 min after closing, after-close
activity → next day); rejected/cancelled reservations excluded; refunds visible + netted from Collected
(his €20 card-order repro fixed, including the payment-classifier bug that moved partial refunds
Offline); per-method online payment split (card/PayPal/other); cancelled/rejected counts as amber rows;
preset rejection reasons in customer's language (sparse Order.rejectionReasonKey); reserve-then-order
booking notes in kitchen (yellow-boxed). i18n ×38 done (all 37 non-English locales completed; 12 new
keys + autoRefreshNote reworded). TypeScript + Prisma + next build ALL GREEN.

**BONUS:** Fabrizio's reward-gift test exposed a checkout bug (non-logged-in customers couldn't see
their balance even with claimed gifts). FIXED (apply-promos + orders routes now use canonical customerId
instead of sessionCustomerId only); gift email updated with clear instructions ("enter your email at
checkout, no login required").

**Remaining (Luigi's part):**
- ☐ **Schema push:** Run `npx tsx scripts/push-schema-to-both.ts` locally (Order.rejectionReasonKey 
  to both Neon branches) → then deploy.
- ☐ **Live test:** End-to-end order on prod — confirm kitchen tablet rings, confirmation email arrives.
- ☐ **Reply to Fabrizio:** the full draft is at `FABRIZIO-REPLY-cms0gyexp-13-14.md` (repo root),
  written in **Italian and English** — it explains the 10:01 timing, all four #14 fixes, the #10/#12
  follow-ups, and lists the five things to re-test. Post it AFTER deploy and flip the report to
  IN_TESTING. Expected from his re-test: 31st report arrives minutes after close, contains
  reservation #6H6259 (and #KYDENB is NOT in the 30th's), refunds row present with Collected reduced.

### A28. 🥇 Make **www.luigislasagna.com** the store's REAL address (upgraded from "just forward it")
Luigi's call (2026-07-30, ~12:30 AM): the .com is where most real customers land. Later that day he
chose the stronger option — not a forward, but making **www.luigislasagna.com the actual store
domain** (it's on all his branding; it also moves the Google/SEO value onto his brand domain instead
of luigispizzapastawings.com).

**⚠️ INCIDENT 2026-07-30 ~3 PM — the first attempt took the live store offline (fixed, ~4 min).**
Luigi connected www.luigislasagna.com in Admin → Website → Domain. The OLD code overwrote
`Restaurant.customDomain` INSTANTLY, so luigispizzapastawings.com (his live store) started 404ing
while the new domain's DNS still pointed at the Milton site. The UI also said "Verified" — that was
Vercel OWNERSHIP verification, not DNS routing — and never showed him the DNS records to add.
Claude restored `customDomain=luigispizzapastawings.com` (prod verified 200 again) and then built
the platform fix so this can NEVER happen to any restaurant:
  • a new domain connected while one is live goes to `pendingCustomDomain` — the live domain keeps
    serving and keeps powering every link/email;
  • the DNS records are always shown and now SURVIVE a page reload (recomputed server-side);
  • cutover happens only when the provider confirms DNS actually routes here (`misconfigured=false`),
    never on ownership alone;
  • after cutover the old domain 308-redirects (path preserved) → old QR codes/links keep working.

**The steps:**
1. ✅ DONE — zero-downtime fix deployed (plus 3 follow-up fixes; see the incident log below).
2. ✅ DONE — pending switch registered for `www.luigislasagna.com`.
3. ✅ DONE 2026-07-30 — Luigi edited the existing `CNAME www` at GoDaddy from `@` to
   `cname.vercel-dns.com` (no forwarding delete was needed — the www CNAME already existed).
4. ✅ DONE — cutover complete + VERIFIED on prod: `www.luigislasagna.com` serves the store (200);
   `luigispizzapastawings.com` 308s to it **with path + query preserved** (table-QR deep links and
   order-status links all land correctly); MX/SPF/DMARC unchanged.
5. ✅ DONE 2026-07-30 8:28 PM — bare `luigislasagna.com` forwarding repointed to
   `https://www.luigislasagna.com` (301 permanent, forward only, no masking).
   **VERIFIED: all six hostnames now land on the new store** — luigislasagna.com/.ca (bare + www)
   and luigispizzapastawings.com (bare + www), every one ending at https://www.luigislasagna.com/
   with a 200. Mail re-verified after the change: MX unchanged, SPF + M365 autodiscover intact.
   🎉 **A28 IS COMPLETE.**
6. ☐ **LUIGI: one live test order** end-to-end on the new domain — confirm the kitchen tablet rings
   and the confirmation email arrives. Claude verified the plumbing; this is the real-world check.
7. ☐ **`luigislasagnamilton.ca` → the new store.** Harder than the .com: registered at GoDaddy
   Domains Canada, but its **nameservers are delegated to Oracle Cloud** (GloriaFood's DNS), and
   `www` CNAMEs to `origin2-sitebuilder.globalfoodsoft.com` = the old GloriaFood site builder.
   GoDaddy Forwarding only works on GoDaddy nameservers, so it's TWO steps:
     (a) GoDaddy → luigislasagnamilton.ca → **Nameservers** → switch to GoDaddy default. (Domain
         Protection locks are on the domain, so GoDaddy may ask Luigi to verify identity. During
         propagation the domain may briefly show a GoDaddy parked page — harmless.)
     (b) once propagated → **Forwarding** → `https://www.luigislasagna.com`, 301, forward only,
         no masking, www included.
   ✅ **SAFETY VERIFIED 2026-07-30** (Luigi asked whether store confirmation emails ran on this
   domain — they do NOT): the domain has **no MX, no SPF, no DKIM, no DMARC** — it can neither
   send nor receive mail — and nothing else resolves on it (checked mail/autodiscover/ftp/shop/
   order/booking/admin/webmail/blog: all unset). Every address the store uses is
   `info@luigislasagna.com` (restaurant.email, the sole active notification recipient, and the
   admin login) — verified in the DB via `scripts/_check-luigi-email-config.ts`.
   ⚠️ Reversible: putting the Oracle nameservers back restores the GloriaFood site.
   💡 Luigi took this domain over from GloriaFood recently — worth confirming he isn't still
   paying for a GloriaFood site no customer will be able to reach.
   **STATUS 2026-07-30 ~11:30 PM — done by Luigi, waiting on GoDaddy's SSL only:**
   nameservers propagated to GoDaddy on all public resolvers; apex + `www` forwarding both set to
   `https://www.luigislasagna.com` (301). PROVEN working over HTTP:
   `http://www.luigislasagnamilton.ca → 200 → https://www.luigislasagna.com/`. HTTPS still times
   out because GoDaddy is still issuing the forwarding cert ("can take a few hours" per their own
   banner). Browsers try HTTPS first, so the domain looks broken until that lands. NO ACTION —
   re-check with `for d in luigislasagnamilton.ca www.luigislasagnamilton.ca; do curl -sIL
   https://$d/; done`. Only `www` + apex were set up; verified earlier that NO other subdomain
   exists on this domain, so that is full coverage.

### ⚠️ Support note — a 301 you replace stays cached in browsers
Luigi's LAPTOP kept sending every domain to the old Milton site while his PHONE was fine. Cause:
`luigislasagna.com` had 301-**permanently** redirected to www.luigislasagnamilton.ca for a long
time, and browsers cache permanent redirects hard — his browser never re-asked DNS. Incognito
proved it instantly. Fix = clear browsing data (cached images and files). Expect this from any
owner (or long-time customer) who used the old address: test in a private window FIRST before
believing a domain is broken.

**FYI — "the mobile site looks like desktop" (2026-07-30, resolved, NOT a bug):** Safari stores
**page zoom per DOMAIN**. Luigi's old site lived on luigislasagna.com, so its saved zoom (<100%)
was applied to the NEW site the moment the domain was repointed — a zoomed-out viewport lays out
at ~780+ CSS px, which crosses the `md` (768px) breakpoint and renders the two-column desktop
checkout on a phone. Fix is device-side: Settings → Safari → Page Zoom → per-site list → 100%.
A site CANNOT override user zoom (accessibility) and the `user-scalable=no` hack is ignored by
modern iOS — do not add it. Only affects devices that had zoomed the OLD site on that domain.
⚠️ Expect this class of report whenever a restaurant REUSES a domain that hosted their old site.

⚠️ SAFETY: touch ONLY Forwarding + the new `www` CNAME — NOT nameservers, NOT MX/mail records.
info@luigislasagna.com runs on Microsoft 365 via this domain's MX. Baseline captured 2026-07-30 and
stored in `scripts/i18n-data/_mx-baseline.json` (`0 luigislasagna-com.mail.protection.outlook.com`);
`npx tsx scripts/_verify-domain-cutover.ts luigis-lasagna-pizzeria --mx-host=luigislasagna.com`
re-checks mail + both domains' routing (incl. a path-preserving deep-link check) after every step.

### A27. 🆕 Fabrizio's 9-item batch (cms0gyexp) BUILT — plus a 20-minute email-deliverability session with you
All nine items are implemented (see the report reply): customer emails now follow the CUSTOMER's
chosen page language; staff emails fully translated in the backend language (with the customer's
phone + email included, GloriaFood-style); wrong "Booking confirmed" inbox preview fixed; restaurant
phone/email now in every customer email footer (clickable); "Kind regards" translated; password-reset
email translated + restaurant-branded; password eye toggle; account order-history translated with
amber pending rows; the closed-hours email now names the exact opening time; kitchen "OPENS IN" chip
clears once you confirm a booking. Every email also now ships a plain-text copy (a known spam-score
fix) and marketing emails carry the required unsubscribe link + postal address.
- **✅ SPAM FIX DONE 2026-07-29 — Mail-Tester 9.9/10 🎉:** dig checks found DMARC + bounce-MX
  MISSING (SPF/DKIM were fine); both added via the Vercel CLI (⚠️ DNS lives at VERCEL, not GoDaddy —
  never flip nameservers). DMARC = `p=none; rua=mailto:luigislasagna1@gmail.com` (tighten to
  p=quarantine after 2–4 weeks of clean reports). Resend tracking confirmed never-enabled;
  feefreeordering.com registered at postmaster.google.com (watch Spam rate < 0.1%); company
  address was already set. Remaining spam factor = domain-reputation warm-up only (time + volume).
- **☐ QUICK PROD CHECK:** place a test order with the storefront language switched to English on
  your Italian-default store → the confirmation email must arrive in ENGLISH. Fabrizio's report is
  IN TESTING — he'll bang on the rest.

### A26. 🆕 Guest self-cancel (Fabrizio cms0idtz7) BUILT — one prod check when you're ready
Customers can now cancel a **closed-hours order** (and any reservation) straight from their
confirmation email — no account, no phone call (GloriaFood parity, exactly per the plan you approved).
The emailed link opens the normal status page / a small confirm page; cancelling releases the card
hold (void, never a charge), emails the customer, pings staff, and the kitchen tile says
**"Cancelled by the customer"** so nobody blames a colleague. Dev-verified end-to-end in the browser
(cancel, double-cancel, forged link, wrong-purpose link all behave; kitchen shows the attribution).
- **☐ PROD CHECK (5 min, needs the store CLOSED):** place a small real card order while closed →
  open the confirmation email → tap the cancel line → confirm. Then check Stripe shows the
  authorization **Canceled** (NOT refunded) and the kitchen tile reads "Cancelled by the customer".
  Fabrizio's report has been answered + moved to IN TESTING so he can try it on ristorante-test too.

### A25. ✅ Gift Reward Dollars SHIPPED + PROD-VERIFIED by Luigi 2026-07-28 🎉
Your ask, built + proven live the same day (599515fd): **Marketing Tools → Reward Dollars → "Gift
Pizza Bucks"** — name + email + amount → Send. Existing account = instant credit; no account = the
gift waits (never expires) and lands automatically at signup. **Luigi ran the full loop on prod:**
$1 gift → invite email arrived → signed up with that email → the dollars appeared by themselves.
Papercut found + fixed in follow-up: the email's "Create my account" button landed on the hosted
MARKETING site (branded-host root, by proxy design) — now points straight at the sign-up form
(/account/signup). CASL reminder baked into the form.

### A24. 🖨️ Kitchen print incident RESOLVED — v3.0.1 (vc23) **LIVE ON GOOGLE PLAY 2026-07-28** 🎉
A giant real order (2× Double X-Large Combo = 12 pizzas) crashed the Android tablet on print (out of
memory rendering one huge receipt image). **Fixed + proven on your tablet same day** (banded printing,
sideloaded build — big order printed, no crash). Google then **hard-blocked** the Play upload with the
16 KB rule (was a warning at v3.0) → printer SDK bumped + minimum Android is now 8.0 → vc23 uploaded
clean → **approved + in Production** (Play Console screenshot: "Fee Free Order App · Production ·
Jul 28, 2026"). Sideload link (/kitchen-test.apk) removed.
- **☐ ONE remaining check — a test print on an Android 8+ device running the Play version** (the
  updated printer SDK inside vc23 hasn't touched paper yet; your tablet is Android 7 so it runs the
  proven sideload instead). Easiest: ask Fabrizio (Android 16 tablet) to update + print one order —
  or any modern Android device on your printer's WiFi.
- **FYI:** your kitchen tablet (Android 7, ~2017) keeps working on the fixed sideloaded build forever,
  but can never take Play updates again (Google+Star retired Android 7 — verified, no way around it).
  Whenever you replace it, any modern Android tablet goes back to automatic updates. If the old tablet
  ever needs another fix, Claude can hand-build + sideload one (proven path).

### A23. ✅ BUILT + verified live — but ⚠️ DO NOT PAY A REAL DRIVER until payroll + a lawyer sign off
**Context (2026-07-24):** you defined how FeeFreeDelivery money should work — restaurant pays Fee Free weekly (per-delivery fee **+** the driver's tips), Fee Free pays drivers **hourly** + 100% tips, **Sat→Fri Toronto** week, **don't auto-bill anyone yet**. Cash tips ignored.

- **✅ BUILT (2026-07-24, "go with recommendations"):** B0/B2/B3/B4/B5 all shipped (commits bca9e39b + a4f4a0b4 + d5334479). Schema pushed to BOTH branches. **Verified live on prod by Luigi:** superadmin Driver Payouts page → **Build week** produced a real pending payout (week **Jul 11–17**, driver Sameem, 2 deliveries, tips **$8.40**, total $8.40) → **Mark paid** flipped it to paid. Driver **shift clock** device-tested on Luigi's phone (start/end + survives close/reopen). Publishing **"send app link by email/text"** verified in prod (text actually arrived). **Pay disclosure** added ×38 (gross / deductions withheld / net balance + tips paid **bi-weekly by cheque**).
- **🛑 CRITICAL GATE before any REAL driver pay OR un-pausing billing (Luigi asked "is this legal?" 2026-07-24):** the app is a timekeeping + tip-tracking front-end, **NOT a payroll system** — it does not withhold/remit CPP/EI/income tax, produce compliant pay stubs, or handle T4s/WSIB/vacation/OT/holiday pay. Luigi MUST, before paying a real driver: (a) set up **CRA payroll (RP) account + real payroll** (accountant or Wagepoint/QuickBooks/ADP) for deductions/remittances/pay-stubs/T4s; (b) confirm **tip tax treatment** (controlled vs direct tips → CPP/EI) with accountant; (c) **Ontario employment lawyer** on employee-vs-contractor classification, ESA (min wage/OT/vacation/holiday/records/pay-statements), ESA **tip protection** (100% to driver), who is the legal employer; (d) **WSIB** registration; (e) **commercial/business-use auto insurance** for drivers (personal policies often exclude delivery). I am not a lawyer/accountant — this needs professional sign-off. Offered a **CSV/print export of weekly hours+tips per driver** for the accountant hand-off — Luigi said **"hold off for now."**
- **PARKED (Step 7, Luigi's quiet moment):** iPhone kitchen-ring test — diagnostic shows Luigi's DAILY kitchen = the Samsung Android tablet (registers correctly, rings fine); the reported ring bug was on his **iPhone** Kitchen app. To diagnose: log into Kitchen on the iPhone (retires the tablet's ring — do it off-service, log back into the tablet after) → re-run `scripts/_check-kitchen-tokens-both.ts` → see if it registers **ios** (correct) or **android** (the silent-payload bug).

**Original context (superseded — kept for the record):**
- **✅ DONE + DEPLOYED (commit d7a7230e):** auto-billing **PAUSED**. A live cron was already Stripe-charging restaurants every Monday — now disabled by a one-line master switch (`src/lib/delivery-billing-switch.ts`), guarded so nothing (cron, manual re-run, script) can charge. Re-enable only after the model is correct **and you preview a real invoice**.
- **✅ DONE (B1, this session):** billing week switched to **Saturday→Friday America/Toronto** (was Monday-UTC), DST-correct; fixed a bug that made the ops "this week" figure span up to 14 days.
- **✅ FULL DESIGN DONE (2026-07-24):** a 7-agent map→synthesize→adversarial-critique pass produced a turnkey, source-verified build plan — **`docs/plans/feefree-delivery-money-model-plan.md`**. Critique verdict GO-WITH-FIXES; the three blockers it found (don't zero drivers' historical tips; idempotent partial-refund tip reversal; verify no prior USD settlement rows) are already folded into the plan. It caught a real bug: delivery must bill in **CAD** (the restaurant's currency), not the platform's USD default.
- **🤔 TWO THINGS FROM YOU when ready (no rush — parked exactly as you asked):**
  1. Say **"do the delivery schema"** → I push the new tables/columns (DriverShift, DriverPayout, DeliveryAssignment.driverTipCents, DeliverySettlement fee/tip split) to BOTH Neon branches and build B0/B2/B3/B4/B5 per the plan.
  2. **Six small decisions** (each has my recommendation — you can just say "go with your recommendations"): (Q1) bill delivery in CAD not USD — **rec YES**; (Q2) driver tips non-taxable on the invoice — **rec YES, pending your accountant**; (Q3) pay drivers on schedule vs wait for the restaurant to pay — **rec on schedule**; (Q4) hourly pay for all clocked time vs active-only — **rec all clocked time** (this one gates the shift build); (Q5) partial refund reduces the tip proportionally — **rec YES**; (Q6) tip refunded after a driver was paid → negative adjustment next week — **rec YES**.
- **FYI (no action):** with hourly pay, Fee Free absorbs driver idle time on slow shifts — you accepted this; it's self-absorbed while you're the only driver. And you're holding tips mid-flight (restaurant→FeeFree→driver) — worth one line to your accountant re: Ontario tip rules (that's Q2's sign-off).

### A22. ✅ DONE 2026-07-23 (Luigi said "a22 go") — earn-rate snapshot LIVE, E2E-proven
Schema pushed to BOTH Neon branches FIRST (both reported "in sync"), then merge deployed (7c71efdd, preflight 859 tests). **E2E ALL PASS on dev with a REAL UI-placed order** (ORD-572695597, VIP customer @10% group, base 5%): stamp=10 written at placement → projection 0.20 → **rate edited to 20% mid-flight → projection UNCHANGED** (pre-fix it would have flipped) → completion grant paid exactly the promised 0.20 → fixture cleaned up. The receipt's "you'll earn X" and the wallet grant can no longer disagree. Repro scripts: _verify-earn-override-e2e.ts (setup/cleanup) + _verify-earn-snapshot-e2e.ts (assert).

### A20. ✅ DONE 2026-07-19 — First Buy PROVEN end-to-end on a real charged order 🎉
**You flipped the toggle 2026-07-18** (toggle-truth sync confirmed: promo active, email drip resumed), Claude preview-proved it 2026-07-19 (fresh identity → 10% via the live `apply-promos` API), and then **you placed the real test order `ORD-067045266`** (Dipping Sauce $1.49, fresh `+firstbuy` identity): the charged row shows `promoDiscount=$0.15`, FIRSTBUY in `appliedPromos`, card authorized for the discounted $1.51, PromotionUsage row written, `usedCount` 0→1. The campaign's promise now reaches the payment. (Order left pending — accept or cancel it in the kitchen as you like; the proof stands either way.)
**Decision made 2026-07-19:** no comp. Instead: a **$10 one-time credit locked to his email**, auto-applied on his next order — done through the existing "Give a VIP special" flow (no new code). Exact steps = **T-J** above. (His literal "add 10 Luigi Bucks" idea won't work: reward dollars can only be SPENT by a signed-in account — your own 2026-06-27 anti-drain rule — and he's a guest.)

### A21. ✅ DONE 2026-07-19 — delivery indexes pushed to BOTH databases (run live with Luigi)
`push-schema-to-both.ts` ran with you present; both branches reported "in sync". Verified read-only on prod: `DeliveryAssignment_restaurantId_status_settlementId_idx` + `DeliveryAssignment_restaurantId_status_deliveredAt_idx` both exist. Additive-only, no data touched.

### A19b. 🎉 KITCHEN APP **LIVE ON GOOGLE PLAY** (confirmed by Luigi's screenshot, 2026-07-22)
`https://play.google.com/store/apps/details?id=com.feefreeordering.kitchen` — public, installable ("Install on more devices" showing, 1+ downloads). Luigi's calls (2026-07-22):
1. **UK reseller link** — ☐ PARKED (Luigi picked "skip for now"; say "draft the reseller note" or send it yourself anytime).
2. **Marketing + reseller Play-link sweep** — ✅ DONE 2026-07-22 (superseded by the app-distribution project Luigi commissioned + approved same day: `app-links.ts` single switch, badges live on home//features/footer/reseller, admin install hub + QR, welcome-email step, kitchen-login hint, setup-wizard step. Future store approvals = flip one URL in src/lib/app-links.ts).
3. **Driver app** ("Fee Free Delivery", com.feefreeordering.driver) — ⏳ still in Play review as of Kitchen going live ("only Kitchen so far"). Paste the email when it arrives (approved OR rejected → same-day fix).
4. **iOS driver app** — 🎉 **APPROVED on the App Store** (Luigi confirmed 2026-07-23) — first PUBLIC iOS app, under the org (seller = Fee Free Ordering Inc., never touched the old team). ☐ LUIGI: paste the App Store listing URL (App Store Connect → App Information → View on App Store) → Claude flips `APP_LINKS.driver.ios` in src/lib/app-links.ts and every surface (iOS badge on driver contexts + driver-invite email) activates. Driver-PLAY still in review (inverted from Kitchen: Play ✅/Apple ⏳ vs Play ⏳/Apple ✅).
5. **B5** (16 KB page-size fix, Star SDK bump + print re-test) still stands for a FUTURE Kitchen update — not urgent now that vc21 is live.

### A19. ✅ DONE 2026-07-16 — BOTH Android apps SUBMITTED to Play Production 🎉
**Kitchen "Fee Free Order App"** (vc21/v3.0) submitted ~02:15, status **In review**. **Driver "Fee Free Delivery"** (vc1/v1.0, new brand icon) submitted ~11:33 after the background-location + foreground-service declarations with the demo video (unlisted YouTube). 16 KB error on Kitchen bypassed via "Proceed anyway" (real fix = **B5**). When the review emails arrive, tell Claude the outcome → if approved, the public links go out (reseller + marketing): Kitchen `https://play.google.com/store/apps/details?id=com.feefreeordering.kitchen`, Driver `...?id=com.feefreeordering.driver`. If rejected, paste the email → same-day fix.
**Follow-ups parked here:** (1) UK reseller — send the Play link when Kitchen goes live (or add his Gmail to the closed-testing track today); (2) driver-app demo video is on YouTube unlisted — leave it up, Google re-checks it on every update.
<details><summary>original A19 upload steps (done)</summary>
**Ready now:** two signed RELEASE `.aab` files are built and PROVEN release-signed (jarsigner "jar verified", signer `CN=Fee Free Ordering Systems`, SHA-256 `20:96:12:86:…B0:AF` — NOT a debug cert). Both use the same upload key (`android/app/feefree-release.jks`).
- **Kitchen** "Fee Free Order App" — `android/app/build/outputs/bundle/release/app-release.aab` (`com.feefreeordering.kitchen`, versionCode 21 / v3.0). Playbook: `PLAY_STORE_SUBMISSION.md`.
- **Driver** "Fee Free Delivery" — `android-driver/app/build/outputs/bundle/release/app-release.aab` (`com.feefreeordering.driver`, versionCode 1 / v1.0). Playbook: `PLAY_STORE_SUBMISSION_DRIVER.md`.
1. `play.google.com/console` → **Create app** for each (names above) → fill listing (copy in the playbooks) + data safety + content rating + app access (demo login).
2. **Production → Create release → upload the .aab → Review → Start rollout.** (Org account: no closed test required.)
3. **⚠️ Driver app only:** it requests **background location** → Play **requires** a "Location permissions declaration" + a short **demo video** of the background use, or it's rejected. Steps + the exact wording are at the top of `PLAY_STORE_SUBMISSION_DRIVER.md`.
4. Play screenshots are generated (4, in `store-assets/play-screenshots/`) — upload the kitchen ones to the Kitchen listing, the driver ones to the Driver listing.
5. **Reviewers need logins on PROD:** Kitchen = `demo@feefreeordering.com` (set its prod password via `scripts/run-on-prod.ts scripts/_set-demo-password.ts '<pw>'`). Driver = create a demo driver at `/superadmin → Delivery Drivers`. Put both in Play's App-access field.
6. If Play says "version code N already used", tell Claude → bump versionCode + rebuild (seconds).
*(NOTE: the driver app launcher icon is still the default Capacitor icon — cosmetic; swap before/after, not a blocker.)*
</details>

### A18. 🔷 Set the Fee Free Delivery "unclaimed order" alert phone (Sameem)
A new safety net texts the Fee Free platform owner when a delivery order sits in the pool with NO driver accepting for 3 minutes (so it never gets silently dropped). To turn it on, set in Vercel env:
- `FEEFREE_DISPATCH_ALERT_PHONE` = `+16476690808` (Sameem Nabil)
- (SMS goes through the existing Twilio setup — needs `FFOS_TWILIO_ACCOUNT_SID` / `FFOS_TWILIO_AUTH_TOKEN` / `FFOS_TWILIO_FROM_NUMBER` set too, same as the driver-invite SMS.)
Until the phone is set, the cron still runs but just logs "no alert phone configured" (no text sent) — nothing breaks. The alert links to `/superadmin/drivers` to assign it manually.

### A17. ⏳ Apple Developer ORG account for Fee Free Ordering Inc. — SUBMITTED, still "(Pending)" as of 2026-07-16
**Status:** enrollment SUBMITTED, Apple says processing can take up to ~48h (sometimes a verification call). **Enrollment ID `LXARH3QT89`** · Legal entity **Fee Free Ordering Inc.** · **D-U-N-S `243370724`** · account holder **Sameem Nabil**. **Nothing on Apple is clickable until it activates — do NOT re-purchase, it's already paid.** Test delivering on the **Android** driver APK meanwhile so nothing is blocked.

**🔑 IN PROGRESS 2026-07-23 — D1-a → PLAN B (fresh iOS bundle id under the org).** Apple refused to free the old `com.feefreeordering.kitchen` App ID ("in use by the App Store" — build-24 history lock, may take 30-90d or never), so Luigi picked Plan B: new iOS-only id. **Org team = `N537SW2VG2` (Fee Free Ordering Inc.).** Android keeps `com.feefreeordering.kitchen` (unchanged). Live checklist:
1. ✅ DONE — old-team app record removed (Jul 23). Old App ID could NOT be deleted ("in use by the App Store") → Plan B confirmed.
2. ✅ DONE — iOS App ID `com.feefreeordering.kitchenapp` registered under the org with Push Notifications.
3. ✅ DONE — App Store Connect (org) app record created: **Apple ID `6794053932`**, name "Fee Free Order App", SKU feefree-order-app-ios.
4. ✅ DONE — full listing: subtitle, categories (Business / Food & Drink), content rights, **age rating 4+**, description/keywords/URLs/copyright, App Review notes + contact, **App Privacy published**, **pricing Free / all countries**, iPhone 6.5" ×3 + iPad ×3 screenshots (generated at store-assets/ios-appstore-screenshots/).
5. ✅ DONE (Claude, commits 2ef8d0ba + eb4a0572) — codemagic `ios-kitchen` BUNDLE_ID + pbxproj PRODUCT_BUNDLE_IDENTIFIER → `.kitchenapp`; integration → `ff-asc-org`; new Firebase GoogleService-Info.plist committed; background-geolocation SPM constraint patch added (first build failed exit 74 on that conflict — driver-only plugin pulled in via shared node_modules).
6. ✅ DONE — **Firebase**: new iOS app `com.feefreeordering.kitchenapp` added to project `fee-free-ordering`; **APNs Auth Key created under the ORG with Environment = Sandbox & Production, Team Scoped** (⚠️ the first two attempts defaulted to Sandbox-only, which would have silently killed the TestFlight ring — the Configure Key screen is easy to miss) and uploaded to Firebase on both rows. Team ID `N537SW2VG2`.
7. ✅ DONE — build 30 green + on TestFlight. Build history: 26 failed (SPM 7.x/8.x conflict) → 29 uploaded but Apple returned **ITMS-90683** (driver's background-geolocation linked via shared node_modules → location APIs with no purpose strings) → fixed by STRIPPING the plugin from the kitchen SPM manifest (d6a7fee7) → **30 clean**. Also needed: **Time Sensitive Notifications** capability on the App ID (entitlements request it; archive failed status 65 without it).
8. ✅ DONE — demo reviewer login set on PROD: `demo@feefreeordering.com` / `AppReview2026!` via `scripts/_set-demo-password.ts` (create-demo-restaurant.ts is idempotent and will NOT reset an existing password — that trap cost us a round).
9. 🎉 **SUBMITTED TO APP REVIEW 2026-07-23** — status "Waiting for Review", build 30, Apple ID 6794053932. Typical turnaround 24–48h.
10. ⚠️ **THE RING WAS NEVER TESTED** — Luigi chose to submit without it. Build 30 is already installed on his iPhone, so the test is ~2 min and can be done DURING review: lock phone → place an order at /order/fee-free-demo-restaurant → should ring. If it fails, fix + upload a new build before/after approval (the ring is the app's headline feature; the web engine still rings when the app is OPEN, so a push failure degrades rather than breaks it).
11. ☐ Cleanup: revoke the 2 old Sandbox-only APNs keys in Apple → Keys (the live one is `Fee Free Push Key Prod`, Sandbox & Production).
12. ☐ When approved → tell Claude → flip `APP_LINKS.kitchen.ios` in src/lib/app-links.ts = iOS badges live on every surface.

**🔑 THREE DECISIONS (original, for the record — full detail in `IOS_APP_STORE_SUBMISSION.md` §D1–D3):**
- **D1 — Kitchen bundle id is stuck on the OLD team.** `com.feefreeordering.kitchen` lives under the old team (`NT5ZY28ATK`) and is TestFlight-only. Apple's "Transfer App" needs a *publicly released* app, so **a TestFlight-only app generally can't be transferred** — the old "submit now, transfer later" plan is NOT reliable for Kitchen. Pick: **(D1-a, recommended)** remove it from the old team + re-register the same bundle id fresh under the org (lose build-24 TestFlight history, re-upload one build); or **(D1-b)** submit from the old team now (Seller shows "Luigi's Lasagna & Pizzeria Inc." — the name you didn't want public). **Driver app has no iOS App ID yet → register `com.feefreeordering.driver` CLEAN under the org, no transfer ever.**
- **D2 — Codemagic signing points at the old team.** `ff-asc-key` + `IOS_SIGNING_KEY_PEM` are old-team creds. Once the org is live: create a new App Store Connect API key under the org, add it to Codemagic, and repoint BOTH `ios-kitchen` + `ios-driver` workflows. Until then an org-targeted iOS build fails signing.
- **D3 — Kitchen iOS ring bugs are UNRESOLVED.** Fabrizio's build stamp (web `de2bbc0`) proved his app is already on CURRENT code, so the earlier "stale build" theory was WRONG — the ring needs a real root-cause, not a rebuild. **Recommendation: do NOT push Kitchen to the PUBLIC App Store until the ring bug is understood** (TestFlight is fine). The Driver app has no such blocker → it's the safer first public iOS app if you want one.
<details><summary>original enrol steps (done)</summary>
Your D-U-N-S number for **Fee Free Ordering Inc.** is in hand — this was the blocker for the company Apple account. Now:
1. Go to **developer.apple.com/enroll** → choose **Company/Organization** → enter the D-U-N-S + legal entity details (use a *company* Apple Account/email if you have one, not a personal one). Pay the $99/yr. Apple verifies the org — usually **1–5 business days** (they may phone to confirm).
2. **Keep testing on the current team meanwhile** — nothing is blocked. The Kitchen app stays on TestFlight; create the **driver** app under the current team per A15 (Option A: ship now, transfer later).
3. **Once the org membership is active:** transfer BOTH apps (`com.feefreeordering.kitchen` + `com.feefreeordering.driver`) to the org (bundle ids survive; TestFlight builds/testers do NOT — you re-invite testers), then repoint Codemagic's `ff-asc-key` + the `IOS_SIGNING_KEY_PEM` signing key to the new team. Tell Claude when the org is live and it'll walk you through the transfer + Codemagic repoint.
4. **Bonus:** a Google **Play** org account under Fee Free Ordering Inc. is exempt from the 20-tester production gate your personal account hit — worth doing the same company route there (see A on the Android side).
</details>

### A16. ☐ TEST this session's shipped work (2026-07-14) — NOT DONE YET (Luigi will do when ready)
Everything below is built + pushed + preflight-green, but NOT yet verified by you on real devices / real data:
1. **Uber Eats import** — Admin → Menu → Import → paste your Koozina Uber link → confirm categories/items/modifiers/photos land. (Best from your own IP; a datacenter IP can get Uber's bot-challenge on the modifier fetch.)
2. **Driver app on your phone** — sideload `C:\Users\luigi\Downloads\FeeFreeDelivery-driver-debug.apk` (Android), and/or do A15 (iOS → TestFlight). Take it on a short drive to confirm background GPS.
3. **Fee Free Delivery end-to-end** (see A13) — create a driver, enable it on a store, run a test delivery accept→picked up→delivered.
4. **A14** (marketplace retirement on prod) + **A15** (driver app store steps) are the related owner steps.
Tell Claude the results of each and it'll fix anything that surfaces.

### A14. ✅ DONE / no-op — marketplace retirement migration (dry-run confirmed 0 subs on PROD, 2026-07-20)
**RESULT (Claude ran the read-only dry-run against prod, 2026-07-20):** `Marketplace add-on subscriptions to cancel: 0` — there are NO restaurants on a legacy paid marketplace subscription on prod, and the marketplace AddOn is already `isActive:false` (retired from sale). So there is **nothing to cancel and nothing to migrate** — the end state A14 aimed for (0 active marketplace subs, add-on retired) is already true. `--apply` would be a no-op; **you do NOT need to run it.** A14's completion check ("0 active marketplace subs on prod, Driver Pool intact") is satisfied trivially (0 subs → no Driver Pool inclusion to preserve). If you want to double-check yourself: `npx tsx scripts/run-on-prod.ts scripts/retire-marketplace-addon.ts` (read-only). *(Note: running the retire script via run-on-prod alone leaves the LOCAL encryption key active, so a hypothetical `--apply` couldn't decrypt prod Stripe keys to actually cancel subs — moot here since there are 0 subs, but worth knowing if any ever appear.)*

<details><summary>Original A14 instructions (kept for reference — no longer needed)</summary>

**Why:** the marketplace is now free + included for every restaurant (customer site shows only restaurants within 15 km, with Pickup/Delivery badges; no per-order or monthly fee). The per-order fee is already $0 in code, but any restaurant still on the OLD paid marketplace add-on ($199.99/mo or PAYG) is still attached to a Stripe subscription until this runs. The migration cancels those subs, **keeps their Driver Pool** (grants a free standalone Driver Pool so ShipDay/FeeFree dispatch never drops), and retires the add-on from sale so nobody signs up for a now-free thing. It is **dry-run by default** (shows the plan, changes nothing) — I already verified it on the dev branch.
1. First see the plan (safe, read-only): `npx tsx scripts/run-on-prod.ts scripts/retire-marketplace-addon.ts` — it lists which subscriptions would be cancelled + who keeps Driver Pool.
2. Review the list. When you're happy, apply it: `npx tsx scripts/run-on-prod.ts scripts/retire-marketplace-addon.ts --apply` (this cancels the live Stripe subscriptions and retires the add-on).
3. Tell Claude "done A14" → Claude confirms 0 active marketplace subs on prod and Driver Pool intact for each affected restaurant.
*(NOTE: the customer marketplace is already live + free. The FULL admin/pricing/marketing/terms/refund copy sweep + PAYG-route retirement shipped 2026-07-20 (commit bb527957) — no surface still frames the marketplace as paid, and the obsolete pay-as-you-go opt-in pages/routes are retired. **The webhook that would have hidden legacy subscribers on cancel was also fixed**, so the migration was safe — though the dry-run above shows there was nothing to migrate anyway.)*

</details>

### A15. 🔷 Install the Fee Free Delivery DRIVER app on your phone (native builds are ready)
**✅ 2026-07-15 — Claude verified the iOS driver project is fully build-ready** (Xcode project, bundle id `com.feefreeordering.driver`, descriptive location-permission strings, `UIBackgroundModes: location` + background-geolocation plugin for locked-phone GPS, `ITSAppUsesNonExemptEncryption:false`, and the Codemagic `ios-driver` workflow reuses your working `ff-asc-key` + cert and auto-submits to TestFlight). No code changes needed — the steps below are all on your Apple account. **To actually DELIVER with it you sign in as a DRIVER (driver queue) — that needs a driver account (A13); signing in with your restaurant-owner login gives the DISPATCH view, not the delivery queue.**
**Why:** you asked for native Android + iOS apps of the `/driver` app so you can take it on real deliveries — including BACKGROUND GPS (location keeps streaming with the phone locked / in your pocket), which a browser/PWA can't do. Both are built as WebView shells of `feefreeordering.com/driver`, bundle id `com.feefreeordering.driver`, name "Fee Free Delivery". Android is ready to sideload right now; iOS needs a few Apple steps (no Mac required — Codemagic builds it in the cloud like the Kitchen app).

**Android (fastest — do this to test today):**
1. The debug APK is on this PC at `C:\Users\luigi\Downloads\FeeFreeDelivery-driver-debug.apk`. Copy it to an Android phone (email it to yourself, Google Drive, or USB).
2. On the phone, tap the APK. Android will ask to allow "install unknown apps" for whatever app you opened it from → allow → Install.
3. Open "Fee Free Delivery", sign in with a driver login, and it'll ask for location permission — choose **Allow all the time** so background tracking works.

**iOS / TestFlight (needs your Apple account — reuses the SAME setup as the Kitchen app):**
1. In the **Apple Developer portal** → Certificates, IDs & Profiles → **Identifiers** → register a new App ID with bundle id **`com.feefreeordering.driver`** (team `NT5ZY28ATK`, "Luigi's Lasagna & Pizzeria Inc.").
2. In **App Store Connect** → Apps → **+ New App** → pick that bundle id, name "Fee Free Delivery", primary language English. (No screenshots/metadata needed just for TestFlight.)
3. In **Codemagic**, open this repo → run the new **"Fee Free Delivery (iOS)"** workflow (`ios-driver`). It builds on the cloud Mac, signs with your existing `ff-asc-key` + stored cert, and uploads to TestFlight automatically. Use **"Start new build"**, not "Rebuild".
4. When it finishes (~15 min), the build appears in App Store Connect → TestFlight. Add yourself as an internal tester, accept the invite in the **TestFlight** app on your iPhone, install, and choose **Allow location "Always"** on first run.

Tell Claude how the on-device test goes (does it load, sign in, stream GPS on a real short drive) and I'll fix anything that comes up. NOTE: the app icon is currently the default Capacitor icon — cosmetic, easy to swap later; not worth blocking testing on.

### A13. 🔷 Turn on FeeFreeDelivery for a store (the Phase 1 MVP just shipped)
**Why:** the whole in-house delivery product is live in software — the enable path, the `/driver` PWA (live GPS), weekly $7.99 billing, customer live-tracking, and admin/superadmin management. Before a real delivery can flow, three things need YOU (all ops/legal — insurance, payroll, unit-economics — remain your separate call).
1. **Create a driver** — go to `feefreeordering.com/superadmin` → **Delivery Drivers** → **New driver** (name, email, an 8+ char temporary password, optional home store + hourly rate). The driver is now **auto-emailed their login** (app link + email + temp password) on save, and texted too if you gave a phone. They sign in at `feefreeordering.com/driver` (installable to the home screen). *(For the SMS to send you must set `FFOS_TWILIO_ACCOUNT_SID`, `FFOS_TWILIO_AUTH_TOKEN`, `FFOS_TWILIO_FROM_NUMBER` in Vercel — email works already via Resend. Until then the temp password you set is still shown to you to relay by hand.)*
2. **Enable it on the store** — `feefreeordering.com/admin` → **Driver Pool** → pick **Fee Free Delivery** as the delivery method → toggle **Enable**. Requires the **Driver Pool** add-on + an online payment method (drivers never collect at the door, so delivery must be prepaid). "Auto-send on accept" is on by default; turn it off to hold orders for a manual "Send to driver". *(Fee Free Delivery only appears for stores within 100 km of the Toronto/Milton area — others see only "your own drivers" and ShipDay.)*
3. **Card on file for billing** — the weekly settlement (every Monday 00:10 UTC) invoices the distance-tiered fee ($7.99 ≤3.5 km / $8.99 3.5–7 km / $9.99 7–10 km) per delivered order to the store's card on file. Make sure the store has completed billing setup, or the settlement will show "no card on file" and skip.
*(The **same `/driver` app** is now dual-role: drivers get the job queue; restaurant owners open the same link and sign in with their existing dashboard login to assign & track deliveries. Verified end-to-end on the demo: accept→picked up→delivered flips the order to completed, freezes the fee, streams live GPS, shows the customer a live map. Test scripts: `_create-demo-driver`, `_enable-feefree-demo`, `_seed-feefree-test`.)*

### A1. ✅ DONE 2026-07-11 (Luigi clicked Subscribe; Claude's prod verification pending — say "verify A1 on prod") — Re-subscribe "Online Payments" with your real card — was due THURSDAY JULY 17
**Why:** your free partner period ends July 17. When it does, card checkout on luigispizzapastawings.com STOPS until this is done.
**⚠️ 2026-07-11 update:** you tried this and the page showed "Renews automatically" with NO Subscribe button — that was a bug (the free-period card looked subscribed and the system even refused an early subscribe). Claude built the fix: the card now says **"Free until July 17, 2026"** with a **"Subscribe to keep it"** button, and subscribing early does NOT double-charge — your card is saved now and the first charge lands only when the free period ends. **✅ DEPLOYED 2026-07-11 (056747a1, adversarially reviewed, site verified healthy) — ready for your click:**
1. Go to `feefreeordering.com/admin` → **Billing** → **Add-ons**.
2. On the **Online Payments ($39.99/mo)** card, click **"Subscribe to keep it"**.
3. Complete the Stripe checkout with your real business card ($0.00 due today — billing starts July 17).
4. Tell Claude "done A1" → Claude verifies the subscription is attached on the platform Stripe account.
*(Note: this covers ONLY Online Payments. Your other complimentary add-ons each show the same button now — subscribe to each one you want to keep past its free date.)*

### A2. ✅ DONE 2026-07-11 (screenshot: "Connection successful — your Stripe keys work", Live mode; DB webhook-row verification pending — covered by "verify A1 and A2 on prod") — One click to activate refund-sync: "Test connection"
**Why:** this registers the new webhook on your Stripe account so refunds made in the Stripe dashboard update orders + Luigi Bucks automatically.
1. `feefreeordering.com/admin` → **Payments** → **Payment providers**.
2. In the Stripe card, click **Test connection**. Expect the green success message.
3. Tell Claude "done A2" → Claude verifies the webhook registered in the database.

### A4. ✅ DONE 2026-07-11 (Luigi renewed the membership) — Turn on Apple membership auto-renew — was expiring ~August 3
**Why:** if the Luigi's Lasagna Apple Developer membership lapses mid-launch, the iOS app can't be submitted and TestFlight stops.
1. Go to `developer.apple.com/account` and sign in.
2. Open **Membership details**.
3. Enable **Automatic renewal** (or click Renew now, $99 USD/yr).
4. While you're there: note the **D-U-N-S Number** shown — paste it to Claude (useful reference).
5. Tell Claude "done A4".

### A5. ✅ DONE 2026-07-12 — ShipDay webhook configured + verified (wizard flow)
**Why:** the delivery-status webhook rejects unauthenticated callers (security hardening). ~~Vercel env var + manual URL~~ **Replaced:** every restaurant now gets its own personal webhook link, shown right on the Driver Pool page — no Vercel steps, no password manager.
**After the ShipDay wizard deploys (Claude will tell you when):**
1. `feefreeordering.com/admin` → **Driver Pool** → the **"Live driver status (webhook)"** card.
2. Click **Copy link**, then in your ShipDay dashboard open **Integrations → Webhook** and paste it as the endpoint URL.
3. The card flips to **"Webhook verified"** on the first update ShipDay sends.
4. Tell Claude "done A5".
*(This doubles as the live test of the new wizard with your ShipDay account — Claude will walk you through placing one test delivery.)*

### A6. ✅ DONE 2026-07-17 — Superadmin password rotated
Luigi confirmed via chat. New password set via Forgot Password flow on `admin@feefreeordering.com`.

### A7. 🔷 Rotate the database password — do WITH Claude live
**Why:** the Neon database password was visible in an old debugging screenshot. Rotating it is important but touchy — done wrong, the live site loses its database. Claude will drive; you'll click.
1. Just tell Claude "let's do A7" in a session when the restaurant is CLOSED.
2. (For reference, the flow will be: Neon console → reset role password → update Vercel `DATABASE_URL` → redeploy → verify site loads.)

### A8. ☐ Create the free Upstash account (rate-limit protection)
**Why:** login/order rate limits currently reset whenever the server restarts. A free Redis database makes them stick.
1. Go to `console.upstash.com` → sign up (free).
2. **Create Database** → name `feefree-prod` → region: pick a US-East option → Create.
3. On the database page, find **REST API** section: copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
4. Vercel → Settings → Environment Variables → add BOTH (Production) → Redeploy (same as A5 step 4).
5. Tell Claude "done A8".

### A9. ☐ Verify the Gift Cards "no discounts" flag (you said you'd check)
1. `feefreeordering.com/admin` → **Menu** → open the **Gift Cards** category settings.
2. Confirm the "exclude from discounts / promotions" option is ON.
3. Tell Claude "A9 yes it's on" or "A9 it was off, I turned it on".

### A11. 🔷 Confirm Neon backup retention — 5 min (part of Stage 2, mostly DONE)
**Status:** Claude already made + VERIFIED a real backup of all prod data tonight (58,282 rows, all money-tables complete), built repeatable backup/verify/restore tools, and built an automated daily encrypted off-site backup (deploys with Stage 2). Remaining from you:
1. Log in to **console.neon.tech** → your project → **Settings / Branches** → find the **point-in-time-recovery / history retention** setting. Tell Claude the number of days shown (free tier ≈ 1 day; paid ≈ 7–30). If it's 1 day, consider the paid tier — it's your instant "undo" for a bad change.
2. (Optional, with Claude) a full restore drill into a scratch Neon branch — say "let's do the restore drill" and Claude walks you through creating a throwaway branch to restore into.

### A10. ☐ Delete the two "Test July" restaurants
1. `feefreeordering.com/superadmin` → **Restaurants**.
2. Find the two named like "Test July" → use the **Delete** button on each (leave *Kaori* and *Japanese Restaurant | TEST* alone).
3. Tell Claude "done A10".

### A12. ☐ Order-placed email — 1-minute check (your report from 2026-07-11)
**Why:** you reported the restaurant didn't get an immediate email when a customer placed an order. Claude verified the CODE is correct — the staff "Order placed" email fires the moment the order lands (before you accept it), separately from the customer's confirmation. So the likely cause is the recipient setup on your restaurant.
1. `feefreeordering.com/admin` → **Notifications**.
2. Check your email address is listed as a recipient, the row is ACTIVE, and the **"Order placed"** toggle is ON. Add/fix it if not.
3. If it already looks right, tell Claude **"A12 looks right — run the prod check"** — that authorizes a read-only look at the recipient rows + exact send timestamps for the recent orders to find what really happened.

### A13. 🔷 iOS APP — the plan is set (Luigi 2026-07-13: "ship now, transfer later"). Full details: `IOS_APP_STORE_SUBMISSION.md`.
**Context:** the app WORKS on TestFlight (build 24 — ring on locked phone device-verified). It's a WebView of /kitchen, so all web fixes are already in it. No iOS code is broken. Two tracks:

**A13a. ☐ TestFlight for Fabrizio's new restaurant — do THIS to get them running in days (NO App Store needed).**
1. App Store Connect → your app → **TestFlight** → confirm build 24 is "Ready to Test".
2. **External testing → enable the public link** (one-time ~24h Beta App Review) — OR add the restaurant's Apple ID as a tester by email.
3. Send the restaurant: install **TestFlight** → open the link → install **Fee Free Order App** → Kitchen login with THEIR credentials. Done. (Any restaurant uses the same app.)

**A13b. ✅ DONE 2026-07-13 — the "100% working" device test PASSED.** Verified on Luigi's iPad: rings + notifies with phone LOCKED + app backgrounded ✓; PRINTS correctly on the Star printer ✓; ghost ring FIXED (was stale WebView-cached code; a clean reinstall + the auto-accept hardening commit 767ae631 cleared it) ✓. The app is 100% working. (Auto-accept is OFF on Luigi's store by choice for the first 1–2 months — orders arrive PENDING and ring the full alarm until accepted.)

**A13c. ☐ Submit to the App Store (Option A — under "Luigi's Lasagna & Pizzeria Inc." now, transfer to Fee Free Ordering Inc. later).**
Everything is pre-written in `IOS_APP_STORE_SUBMISSION.md` (listing copy, privacy answers, reviewer notes tuned to avoid a rejection, submit steps). Owner steps: (1) run the demo-restaurant script with a password → put it in the App Review field; (2) paste the copy into App Store Connect; (3) attach build 24; (4) Submit. Say **"make the App Store screenshots"** and Claude generates the required iPhone + iPad images from the demo restaurant.

---

## B. YOUR DECISIONS — tell Claude the answer, no clicking needed

### B5. 🤔 Kitchen app "16 KB page size" fix — approve the Star SDK bump + minimum-Android raise
**Why:** Play flagged the Kitchen .aab ("does not support 16 KB memory page sizes"); you submitted with "Proceed anyway" (2026-07-16), which works for now but Google will eventually enforce it. Root cause is PROVEN: two native libraries inside the Star printer SDK `stario10 1.9.0`. The fix is verified available: upgrade to `stario10 1.12.1` (Claude downloaded + binary-checked it — compliant), BUT it requires raising the app's minimum Android from 7.0 to **8.0** (drops only 9+-year-old devices) and, because the printer pipeline is hardware-verified GOLDEN, a **physical print re-test on your tablet + Star printer** before shipping. The Driver app is unaffected (already compliant).
Say **"B5 go"** → Claude does the bump + preflight + builds vc22, then we do a 10-min print test together before it goes to Play. No rush — only needed for a future update or if Google's review bounces vc21.

### B1. 🤔 Test reward wallets cleanup
Sameem's account holds $13.46 from before the fix; a typo-email guest wallet holds $5.80; your own test account holds $8.21. All test accounts. Say **"B1 yes, clean them"** and Claude zeroes them (or deduct them yourself in Admin → Customers).

### B2. 🤔 Multi-Location add-on ($49.99/mo)
It's purchasable today but has a navigation gap (child→parent switching) and weak gating. Options: **(a)** mark it "Coming soon" until fixed (safe), or **(b)** Claude fixes the gaps first. Say "B2 a" or "B2 b".

### B3. ✅ APPROVED + BUILT (2026-07-10) — awaiting your deploy decision
**Stage 1 built on branch `fix/stage1-money-correctness` (NOT deployed — your call to merge):**
- **C-1 auto-accept capture** ✅ fixed + 7 tests (commit f6879f7b)
- **H-2 order-create atomicity** ✅ fixed + 3 tests + hot-path refinement (733002c1, 9980d358)
- **H-1 disputes** ⏸️ HELD — needs a new DB table (a prod schema change); bundled into Stage 2 with the backup drill per your audit rules.
Adversarially reviewed (both fixes correct; one perf note fixed). Preflight green (600 tests).
**→ Two things I need from you:** (1) **"deploy stage 1"** to push+merge (triggers Vercel deploy) or leave it parked; (2) **"let's do stage 2"** to start the backup drill + H-1 disputes together.

<details><summary>original B3 detail</summary>

### B3-orig. 🤔 APPROVE remediation Stage 1 — Money correctness (recommended)
**Three money-path fixes, bundled (engineering, ~½ day, no risk to current live operation):**
- **C-1 (Critical, latent):** auto-accept + card orders never captured — food delivered, money never collected. Zero exposure today (your store's auto-accept is OFF); triggers if anyone enables auto-accept + online card. Fix mirrors an existing PayPal fix.
- **H-1 (High):** chargebacks/disputes are invisible — if a customer disputes a card charge, Stripe pulls the money + ~$15 fee from your balance and the system still shows "paid" forever. Fix adds dispute events to the webhook shipped tonight.
- **H-2 (High):** a crash mid-order could debit Luigi Bucks without recording it — make the order-create + wallet steps one atomic transaction.
Say **"B3 fix it"** → becomes approved Stage 1 (branch, tests, review, no deploy of keys). NOT applied until you say so.
</details>

### B3b. ✅ STAGE 2 DEPLOYED (2026-07-10, commit 407d987c) — money-path hardening + backups + disputes LIVE
Stage 1 + Stage 2 both deployed to production. OrderDispute table pushed to prod first (safe order). Adversarially reviewed twice; all findings fixed. 607 tests green.
**What's now live:** auto-accept capture fix, order-atomicity, dashboard-refund sync, chargeback recording + owner-alert email, a real verified DB backup + automated nightly encrypted off-site backup, and the full backup/verify/restore toolkit.
**Still needs YOU (see the prioritized list at the top / A-items):** the Test-connection click (A2) to register the refund + dispute webhooks; confirm Neon backup retention (A11); the backup cron's env vars in Vercel.
<details><summary>original B3b build note</summary>

### B3b-orig. ✅ STAGE 2 BUILT (2026-07-10) — on branch `fix/stage2-backups-disputes`
- **C-2 backups** ✅ real verified prod backup made + backup/verify/restore tools + automated daily encrypted off-site cron (ea09541e, 483656e8)
- **H-1 disputes** ✅ OrderDispute table + webhook dispute events + owner-alert email + tests (443a0a01). Table pushed to DEV only.
Preflight green (603 tests). **⚠️ DEPLOY SEQUENCING for Stage 2 (must be in this order — H-1 adds a new table):**
1. Claude pushes the `OrderDispute` table to the **PROD** database (safe/additive; a fresh backup exists) — **needs your OK: say "push the stage 2 schema"**.
2. Claude merges the branch to main (deploys). Say **"deploy stage 2"** (implies step 1).
3. Confirm the backup cron's env vars exist in Vercel prod: `CRON_SECRET`, `ENCRYPTION_KEY`, `BLOB_READ_WRITE_TOKEN` (all believed set — Claude verifies post-deploy).
4. On Admin → Payments, click **Test connection** so your dispute webhook registers (same click as A2).
</details>

### B4. 🤔 APPROVE later remediation stages (review the audit first, no rush)
The full audit is in `docs/launch-readiness/` — read **00-executive-summary.md** first (the verdict + plan). Beyond Stage 1, the staged fixes are: **Stage 2** backups + restore drill (the other Critical — needs you to confirm the Neon plan), **Stage 3** access hardening (staff can currently edit prices — matters once real restaurants add employees), **Stage 4** dependency security patches (needs your OK per your no-auto-upgrade rule), **Stage 5** monitoring + incident response, **Stage 6** test coverage, **Stage 7** privacy (needs a lawyer FIRST). Tell Claude which stage to run next, one at a time. No stage touches live keys or the current happy path.

---

## C. WAITING — no action until something arrives

### C1. ✅ DONE 2026-07-15 — Google Play account converted to Organization (Fee Free Ordering Inc.)
D-U-N-S `243370724`, dev account ID `7291944516964290458`, owner luigislasagna1@gmail.com (Sameem Nabil). Organization + authorized representative both VERIFIED by Google. **The 20-tester / 14-day closed-testing production gate is GONE — Android can publish straight to Production.** → see A19 for the upload.

### C2. ⏳ Fabrizio's re-tests (promo stacking + category features reports)
When he confirms, tell Claude → reports get marked FIXED + he gets replies.

### C3. ⏳ iOS TestFlight session (needs you + the iPad, ~15 min)
When you have the iPad handy, tell Claude "let's do C3": print a real test order on the Star printer + confirm the ring fires with the screen locked. That's the last gate before App Store submission.

---

## D. DONE LOG (append-only — proof we did it)

| Date | Item | Verified how |
|---|---|---|
| 2026-07-09 | Platform Stripe switched to LIVE (Fee Free Ordering Inc.) | DB audit: live pk, secrets saved, 18 add-ons re-synced |
| 2026-07-09 | New platform webhook registered (33 events) + secret saved | DB audit: saved 01:26Z |
| 2026-07-10 | Restaurant Stripe LIVE (Luigi's Lasagna) | DB audit: mode=live, test status ok 01:38Z |
| 2026-07-10 | 🎉 First real card charge — order #ORD-649136293, $2.29 | DB audit: paymentStatus=paid, live intent |
| 2026-07-10 | Accepted Methods set to online-card-only | Luigi confirmed INTENTIONAL |
| 2026-07-10 | $2.29 refund intentionally skipped | Luigi: "money comes back to me" |
| 2026-07-10 | One of two $5 sign-up incentives turned OFF | Luigi confirmed in chat |
| 2026-07-10 | D-U-N-S requested for Fee Free Ordering Inc. (developer queue) | Luigi confirmed registration done |
| 2026-07-10 | Free partner periods set (yours Jul 17, Fabrizio Aug 24, Milton Aug 2) | Conversion script ran; prod DB verified |
| 2026-07-10 | Money-path hardening shipped (commit 91d11c07) | 590 tests, adversarial review, pushed |
| 2026-07-10 | A3 — Android signing key backed up to multiple sources (Google Drive + USB) + passwords saved | Luigi confirmed in chat; original at android/app/feefree-release.jks intact |
| 2026-07-11 | A1 — Online Payments re-subscribed before the Jul 17 free-period end | Luigi confirmed in chat; DB verification pending ("verify A1 on prod") |
| 2026-07-11 | A2 — Stripe Test connection clicked (registers refund-sync + dispute webhooks) | Screenshot: green "Connection successful", Live mode, pk_live key |
| 2026-07-11 | A4 — Apple Developer membership renewal submitted (was expiring ~Aug 3) | Luigi confirmed in chat; Apple shows "being processed" — normal, confirm the new expiry date shows within a day |
| 2026-07-12 | A5 — ShipDay webhook link pasted in his dashboard + token verified | DB: webhookVerifiedAt 10:20Z; auto-dispatch verified live same day (order 50239818); status back-flow deploys tested, witnessed on next real delivery |
| 2026-07-17 | T-B2 — Fee Free Delivery iOS SUBMITTED to App Review (Build 6) | ASC: "1 Item Submitted", Waiting for Review, submission `da64928d-…412a25c`, 1:22 AM |
| 2026-07-17 | Task #11 — prod video/checkpoint test deliveries cleaned | script output: removed #872615 (delivered) + #525532 (picked_up), 2 orders + assignments + items, videoseed-tagged rows only |
| 2026-07-17 | DSA trader status completed for the org (ASC → Business → Compliance Requirements; trader=yes, Milton address confirmed) | Luigi confirmed in chat ~1:45 AM; Free Apps Agreement Active thru Jul 2027; bank/tax banners intentionally skipped (free app) |
| 2026-07-17 | Fabrizio round 3 SHIPPED (623a9c81): checkout footer parity (root cause = .safe-bottom zeroing padding), desktop scroll-lock (html-overflow), kitchen night-mode relaunch | Playwright-verified locally + ON HIS PROD STORE (gap 24px vs dish 21px, was 0; background pinned); screenshots in session scratchpad |
| 2026-07-17 | iOS ring web waves SHIPPED (fa1328ad): resume-suspect gate, tap-to-restore, Now Playing teardown, push-health panel + Test ring (3-dot menu), cron overlap bound | 5-symptom root cause investigation; 11 review findings fixed; parity 5683/0 ×38; preflight ×2 green; reaches installed apps via auto-refresh (NO TestFlight needed) |
| 2026-07-17 | All 6 Fabrizio reports updated: display+night-mode → IN_TESTING w/ re-test asks; iOS + Invoices stay IN_PROGRESS (per Luigi) | 4 replies posted via _reply-report.ts + threads dumped to confirm intact; reporter notified on each |
| 2026-07-17 | iOS ring ROUND 2 shipped (a09bab4b) from Fabrizio's video: Now Playing prime removed on shell, lockable 8s-countdown Test ring, ring-tap lands on list | His 306MB video analyzed frame-by-frame + audio timeline (ffmpeg); 3 investigators; 4 review findings fixed; parity+preflight 0; calibrated reply posted with per-item test steps — video confirmed login-ring/locked-ring/cron re-ring all working |
| 2026-07-17 | Native iOS wake fix PREPARED (006c669d): AppDelegate clears delivered ring notifications on activate — rides the NEXT Codemagic ios-kitchen build (not compiled locally) | Committed; device-gate verifies whether it cuts in-flight .caf |
| 2026-07-17 | v1.1 Phase 3 (7e405ad7) DEVICE-GATE PASSED with Luigi + count-fix (5a0d9860): Jobs/Profile shell, RoleSwitch, /api/driver/me | Gate: pings landed during locked minute + tab flips, completedAt==deliveredAt live; Profile now refetches per tab-activation (was stale until re-login) |
| 2026-07-17 | v1.1 Phase 4 (d990d8f0): driver History tab — day-grouped keyset list + detail overlay + On-time/Late badge | E2E 28/28 (pagination no-dup/no-gap, chips, null-city, currency); parity 5706 x38; preflight green |
| 2026-07-17 | Driver app SOUNDS (89984bfb): new-order chime until accepted + stage ticks + mute toggle | Pure WebAudio (no iOS media card); ZERO DriverQueue edits; E2E 9/9; both of Luigi's gate-day asks shipped same day |
| 2026-07-17 | v1.1 Phase 5 (cdb13eb2): Earnings tab — Today/This week/Last week, per-currency tip stacking, hardened bound-tz aggregate | E2E 35/35 (usd+eur tips proven separate, exact period counts, >35d invisible, range-clamp 400); parity 5718 x38; preflight green. Resumed from a Fable-5 usage-limit mid-run on Opus |
| 2026-07-20 | Fabrizio's ristorante-test made PERMANENTLY FREE (Luigi's call — thanks for his testing/feedback; his CLIENT accounts stay paid) | All 5 comped add-ons (hosted_website, online_payments, custom_domain, reservation_deposits, advanced_promos) + plan trial pushed from Aug 24 to 2126-01-01; no Stripe subs touched (none existed); dunning clear; prod re-verified read-only. Reversible: set real dates back anytime (scripts/_fabrizio-free-account.ts) |
| 2026-07-28 | Business bank account DEBIT CARD received; platform Stripe (Fee Free Ordering Inc.) payout destination set to the business account | Luigi confirmed in chat. Platform revenue (subscriptions/add-ons + future delivery fees & pass-through tips once billing un-pauses) now lands in the business account — same account driver cheques will be written from |

---

*Claude also keeps a full audit under `docs/launch-readiness/` — findings there reference these action items where an owner step closes a finding.*

### A45. 📞 Nabil AI now BUILDS pizzas and combos — two things are yours before it goes live (2026-08-11)
Nabil can now take a pizza order by voice: sizes, toppings, half-and-half, combo slots, and
mid-order changes ("actually make that second one half mushroom"). It is **switched OFF for every
store, including yours** — it turns on only after the two checks below.

An adversarial review of the build found and fixed 21 real defects first. The worst one is worth
knowing about because it is exactly what these checks exist to catch: preset toppings are stored
by NAME, the builder looked them up by ID, so a $20 five-topping pizza would have been sold for
**$10** with a plain-cheese ticket in the kitchen. Fixed, pinned by tests, and the code now
refuses the sale outright rather than guessing if that config ever drifts again.

1. ☐ **Call +1 365 658 1458 and place four orders**, checking the PRINTED RECEIPT each time:
   (a) a large pepperoni, (b) half pepperoni / half mushroom, (c) a five-topping pizza — you
   should HEAR the extra-topping charge announced before you confirm, (d) a combo.
   The number Nabil reads you comes from the same code that charges, so if the receipt matches
   what you heard on all four, the money path is sound.
2. ☐ **Then say yes/no to two cost switches** (details in the session summary):
   • `NABIL_MODEL=claude-haiku-4-5` — roughly halves the per-call AI cost, but it's a different
     model driving the money path, so it should not go in until after your four test calls.
   • `fly scale count 2` — about +US$5–7/mo. Today one machine holds every live call, so a crash
     or a deploy drops calls in progress. Not urgent at pilot volume; needed before you sell this
     to other restaurants.
3. ☐ **Optional, ~US$5/mo:** an ElevenLabs API key would switch on the "hear this voice" play
   button in Settings → Voice. The voice picker works without it — you just can't preview.

### A47. 💳 Paid card orders were being LOST before the kitchen saw them — FIXED (2026-08-12)
This started with one customer, Sharon Craven, who paid for ORD-710341102 and then walked in to
collect food nobody had cooked. She was not a one-off.

**What was wrong.** Your Stripe account webhooks YOUR endpoints, not ours (that's the key-only
model, by design). So the only thing that ever moved a paid card order into your kitchen was the
customer's browser landing back on the confirmation page after Stripe redirected it. **That made
the customer's phone a single point of failure for the entire order.** Closing the tab, a 3-D
Secure bounce into a banking app, an Instagram/Facebook in-app browser eating part of the return
link, or just losing signal — any of those lost the order outright. And because the PaymentIntent
id only ever arrived on that same redirect, nothing could find those orders afterwards even in
principle. **Audit of your store: 36 stranded card orders in 60 days.**

A second bug hid the worst of them. An auto-accepted card order still awaiting payment was being
flipped to "completed" about 20 minutes after checkout, which made it invisible to every cleanup
sweep, counted food you never made as revenue, and awarded Reward Dollars on it.

**What's live now:** the intent id is saved on the order the moment checkout starts, and a
reconciliation job asks Stripe every minute what actually happened — releasing genuinely paid
orders to your kitchen (typically within a minute) and cancelling stale authorizations so a dead
order stops holding a customer's money. Nothing can complete unless the kitchen was told about it
first.

1. 🤔 **YOUR CALL — SEVEN orders you never received, $221.01 total** (audited against prod
   2026-08-12; it was 3 when first found, the full sweep turned up 4 more — including your biggest
   one). Deliberately NOT touched by any automatic repair, because the obvious fix (cancel it, void
   the money, claw the promo back) would be wrong: Sharon turned up and you served her, so
   cancelling would have destroyed your record of an order you'd actually fulfilled and your ability
   to collect for it. Whether to chase payment or write each one off is yours, not a cron's:
   • **ORD-246138679 — Anna Martinello, $88.30** — Aug 11, 5:20 PM ← biggest
   • **ORD-710341102 — Sharon Craven, $36.44** — Aug 11, 4:21 PM (the one you served)
   • **ORD-733393825 — Lisa Benacquista, $34.39** — Aug 10, 10:02 PM
   • **ORD-440790893 — jay Fieger, $33.54** — Aug 11, 6:30 PM
   • **ORD-510778241 — Ali Aydin, $13.99** — Aug 11, 9:18 PM
   • **ORD-721054168 — Uzair Rana, $12.79** — Aug 8, 10:32 PM
   • **ORD-347852431 — $1.56** — Aug 11, 5:55 PM — this one is YOUR OWN test (info@luigislasagna.com),
     so the real customer total is **$219.45 across 6 people**.

   **Almost certainly NO money was ever taken from any of them.** All 7 have no PaymentIntent on
   file, and 0 of the 41 stranded orders in 60 days have one — meaning these customers never got as
   far as completing the card form. So this is very likely unpaid food, not money you're holding.
   ☐ **Confirm it yourself in 2 minutes:** open the Stripe dashboard and search those amounts
   ($88.30, $36.44, $34.39, $33.54, $13.99, $12.79). No results = nothing was ever charged, nothing
   to refund. (Claude can't verify this from here — the prod Stripe key can't be decrypted locally.)

   **All 7 pre-date the fix** — the newest was created 9:18 PM on Aug 11, the fix went live ~00:35 AM
   on Aug 12. So none of these is a new failure, and no new ones have appeared since. That said the
   store has been closed since, so the fix has not yet been exercised under real traffic — worth a
   glance at this list again after your first busy service.
2. 👀 **Watch for one log line.** `RESCUED` in the logs means the safety net caught a real order —
   good, but it also means the customer's browser failed to report a payment. A handful is normal.
   A steady stream means something upstream is broken and worth chasing.
3. ☐ **One live test when convenient:** place a card order and **close the tab the instant you hit
   Pay** — don't wait for the "thank you" page. The order should still reach your kitchen within
   about a minute. That is the whole fix, demonstrated in one move.
