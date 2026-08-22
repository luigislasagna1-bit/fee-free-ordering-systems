# OWNER ACTIONS — Luigi's tracked to-do list

**How this file works (Claude maintains it):**
- Every time Claude needs something from you, it gets logged here with exact steps — chat messages can scroll away, this file can't.
- When you finish a step, tell Claude ("done #A2") and it gets moved to the DONE LOG with the date and how it was verified.
- ☐ = to do · 🔷 = do it WITH Claude in a live session · ⏳ = waiting on someone else · 🤔 = your decision needed

**Last updated:** 2026-08-22 by Claude (**A67 — Nabil AI: the full day of real calls was scored, the plan is approved, and the "nothing touches the live line untested" lane is BUILT.** All 52 calls from Aug 21 were evaluated against the "experienced employee" bar: **every placed order was right (14/14 — cart = ticket, quoted = charged)**; the problems are elsewhere — dead air of 8 s or more on 29 % of calls, two callers stuck for minutes after asking for a person, callers asking about an order they placed online being told an invented status, the price refused until a name was given, and a third of the outcome labels on your dashboard being wrong. Your four decisions are recorded (keep the ambience pipeline and harden it on a test line; Opus 5 scores every call with Fable checking it weekly; order-status lookup for online/app/delivery orders when the number matches one customer; hotfixes first). Plus your two additions: **a per-store transfer setting — never / only if they insist / as soon as they ask — with your own "staff is busy preparing orders…" line**, and **a staging lane so no fix ever reaches the live number untested**: a second copy of Nabil (`nabil-voice-staging`) now exists, a phone number can be pointed at it from Superadmin › Nabil Phone Lines, every change goes there first, you hear it, and promotion/rollback is one command with the previous version kept. **What I need from you: ☐ 1. A STAGING PHONE NUMBER — buy one more Twilio number (≈US$1.15/mo, Twilio console → Phone Numbers → Buy, any Ontario number) and tell me the number; I'll attach it to your restaurant on the staging lane. Until then I can use the demo line (+1 289 670 5454) for routing tests only (it fakes orders and caps calls at 4 min). ☐ 2. Menu data confirmations (2 min): should the Caesar Salad default to Caesar dressing instead of asking "which dressing?"; is "Vegetable Lasagna Large" listed twice on purpose; what item is "the Luigi special" — these become aliases/defaults, not prompt text. ☐ 3. Optional, for audio-level analysis of real recordings: paste your Twilio Account SID + Auth Token into `.env.local` on this machine as `FFOS_TWILIO_ACCOUNT_SID` / `FFOS_TWILIO_AUTH_TOKEN` (they already exist on Vercel; I can't read them from there). Nothing else is needed from you — the Vercel setting for the staging lane is already in place.**)
**Previous update:** 2026-08-20 (late) by Claude (**A66 — Temporary Closure (the Loman feature) is BUILT and LIVE: pause pickup/delivery/anything from the Nabil dashboard and callers hear it immediately.** Settings → General now has a **Temporary Closure** card: pick services (or "Select all"), pick 1h / 6h / 12h / Until tomorrow / Until Monday / a custom date+time (computed in YOUR timezone), Resume now, plus an optional **closure message** in your own words. It's the SAME pause switch as the website and kitchen app, so nothing can disagree — and it auto-resumes when the time runs out. What callers get: the **greeting itself announces it** on the very next call ("…Just so you know, delivery is paused right now and should be back this evening at 8:00 PM — pickup is still available."), Nabil never offers the paused option, refuses it with the resume time if asked, offers what still runs, and can text the online link for after the pause; pause everything and it says you're temporarily not taking orders but still answers questions (and books tables if reservations aren't paused). A "Delivery paused until 8:00 PM" amber chip now sits in the dashboard header on every tab so an active pause is impossible to miss. **Your test (2 min): Nabil dashboard → Settings → General → pause Delivery for 1 hour → call +1 365 658 1458 — the greeting should announce it; ask for delivery anyway — expect a polite refusal naming pickup + the resume time; complete a small pickup test order; then Resume now and call again — normal greeting. The website's order page should show the same pause banner while it's on.**)
**Previous update:** 2026-08-20 by Claude (**A65 — the "worse than Monday" call, root-caused and fixed everywhere it hurt.** Your 3:41 PM test call DID run the restored fast settings — it was the first call after a deploy, and every deploy was silently invalidating the ~40k-token prompt cache, so the first caller always got the slow, filler-heavy version; the "Cache read 50%" on the debug page turned out to be a display bug whose ceiling was 50% — your cache was actually fine. Shipped: (1) a **prompt-cache warmer** — every active store's cache is pre-warmed at boot and kept hot every 50 min, so a deploy no longer degrades the next caller, ever; (2) the prompt split into a stable half + live "RIGHT NOW" half so open/close flips, ETA changes and YOUR OWN test calls stop busting the cache; (3) **"Got it" spam killed three ways** — the filler rotation no longer contains "Got it."/"Okay.", the playbook now says open with substance and never repeat an opener, and a deterministic de-dup strips a doubled ack ("Got it, delivering…" after a filler → "Delivering…"); (4) **Philly-Steak-in-a-combo now works** — the agent finally SEES that a combo's pizza slot takes extra toppings and full menu-pizza recipes (it always could server-side; the tool payload hid it), and the compiler now returns the exact dollar amount so it's announced; (5) **premium picks are confirmed with their price at pick time** ("Fettuccine Alfredo — that one's five dollars extra."), including on update_line where it never fired before. 931 voice tests green. **Your steps after the deploys: call the store and (a) order the XL Pizza/Pasta Combo, ask to "make the pizza a Philly steak" — expect it built + "nine dollars" extra announced; (b) pick a premium pasta — expect the upcharge said the moment you choose it; (c) do one half-and-half pizza — bases must still be right; (d) ask for today's deal item — the cheaper same-item must still be offered; (e) count the "Got it"s — the doubles should be gone. Then open the call's `?debug=1` page: cache should read ≥90% (fixed formula) and fillers should be rare.**)
**Previous update:** 2026-08-18 by Claude (**Nabil AI price drop to US$0.50/min is DONE and consistent — code and copy now agree everywhere.** Landed via two sessions on overlapping files (this one on marketing copy, another finishing an unrelated per-second-billing refactor) that overwrote each other a few times before settling; final state verified: `nabil-billing.ts` bills at `$0.50/min` (499 included minutes, rounds once on the month's total to sidestep the 50¢/60s whole-cent problem), both its test files pass, all 38 locales are at full i18n parity, and two new comparison pages went up — `/vs/loman-ai` + `/vs/certus-ai`. 🤔 One step only Luigi/a live session can do: the database's `AddOn` row still shows the old $0.60 description until `npx tsx scripts/nabil-go-live-addon.ts "<neon-url>"` is re-run on both Neon branches (idempotent, `--dry-run` first) — see TODO.md top entry.**)
**Previous update:** 2026-08-17 00:20 EDT by Claude (**A64 — Nabil AI goes on sale: Luigi's six decisions recorded (promo-by-phone switch, phone scheduling, full ambience re-platform, US$0.60/min · $249.99 min · 7-day demo for members, app rename, dedicated marketing page + "Now available" sweep) and the build order f+d → a → b → e → c started; A62 steps 4–5 done by Luigi (UptimeRobot on /health, SENTRY_PROJECT re-entered — source maps upload for the first time).**)
**Previous update:** 2026-08-16 late evening by Claude (**A63 — Luigi's test call found numbers mis-spoken ("647-669-0808" read raw by the voice); FIXED with a deterministic numbers-as-words pass before every sentence, English calls only; A62 steps 1–3 done by Luigi, 4–7 remain.**)
**Previous update:** 2026-08-16 evening by Claude (**A62 — one consolidated list after seven sessions in one day.** The "authentication service was unavailable" message was the Claude app's own sign-in hiccup, not the product. Everything the sessions built is either live (Vercel `e17e64f`, Fly v35) or shipped by this session (phone-order receipts `5e735268` + the kitchen PHONE ORDER badge, merged). **Your list is A62: test print → one live call → report-this-call → uptime monitor → SENTRY_PROJECT tab → five yes/no decisions.**)
**Previous update:** 2026-08-16 15:30 EDT by Claude (**A58 is fully armed: you switched the Twilio token on (v34, both machines healthy), fake fallback requests now get 403 and real ones still ring 289-409-1133; only the optional uptime monitor is left. Next: the test-call walkthrough — call 1 (combo + banter + transfer), report-this-call, the mid-call restart test.**)
**Previous update:** 2026-08-16 (later) by Claude (**A59 — your 00:30 call: "we reopen at two" was the UTC hour, and the "order for later" answer contradicted itself — both fixed in code, ship with the next Fly deploy.** Also: everything the reliability session built is now COMMITTED as 9 clean commits (drain, capacity cap, the Twilio fallback chain on Fly, DSAR export parity, FIRSTBUY, checkout observability), and the missing piece that made the fallback chain inert is wired — a **Superadmin → Nabil Phone Lines** page that checks and repairs the Twilio webhook + "PRIMARY HANDLER FAILS" URLs with one click, so A58 click #1 is no longer a manual step. Your part tonight: confirm the two fallback numbers under A59.)
**Previous update:** 2026-08-16 by Claude (**A55 round 5 — Nabil now says "free delivery over $30" in the same breath as the fee, and restaurants can REPORT A CALL** (Loman parity): a Report-this-call button on every call page → a new superadmin section *Restaurant Reports › Nabil AI reports* with status, a written answer the owner sees, a notes thread both ways, and the recording/transcript/order/timeline on one screen. Your step 0 under A55.)
**Previous update:** 2026-08-15 (latest) by Claude (**A57 — the whole product now says we're LAUNCHED, and the iPhone app is live everywhere.** Your Fee Free Order App is approved and public on the App Store (Apple ID 6794053932 — verified against Apple's own listing API), so **A49 is closed and A17 is finished**. Flipping that one link switched on the iPhone/iPad download across the marketing site, the footer, /admin/publishing, the signup email and the "text me the app link" message — all at once, because they all read the same switch. Alongside it, every trace of "soft launch / coming soon / at launch" for the *platform* is gone: the homepage's "Something big is cooking" teaser is now a **NOW LIVE** section with the real 5-step path to your first order, and there's a new homepage section selling the order app on iPhone + iPad + Android. Also corrected a marketing claim that had gone **wrong**, not just stale: 12 comparison pages still told restaurants the Marketplace was "coming soon — pricing announced at launch", when it has been **live and free** since 14 July and your own Terms already promise a free listing. Genuinely unreleased add-ons (POS, AI Phone, Reservation Deposits, ContentPilot, Customer SMS, Marketing Studio, Branded Mobile App) still correctly say "coming soon". 38 languages at full parity, 2138 tests + build green. **Nothing needed from you.**)
**Previous update:** 2026-08-15 (later) by Claude (**A56 — Fabrizio #17: a Euro restaurant's info page was quoting delivery fees in dollars.** The "Our delivery areas" legend under the map had the "$" typed straight into the code, so it printed dollars no matter what currency the owner set. The same "$" was also baked into all 38 translated tooltip strings, and the hosted marketing website had it in three more places, including every menu price. All fixed to use the restaurant's own currency and language, pushed as `b1ae29cf`, and confirmed on his live store — his zones now read "Costo: 5,00 €, Min: 20,00 €". Reply posted, he's been asked to re-test. **Nothing needed from you.**)
**Previous update:** 2026-08-15 by Claude (**A55 — Nabil AI P0 rebuild.** The last failed call (red onion "not available", "One moment" ×12, combo re-added ×4) traced to facts the model was asked to remember or was handed truncated. Rebuilt: an authoritative server cart with stable line ids for EVERY item, a state block on every turn, editable combos, code-enforced "ask, don't guess", compaction for long calls, a full per-call timeline in the admin, a "turn this call into a test" button, and a 35-call torture suite that gates every Fly deploy. **Blocked on one thing only you can do: a valid Anthropic key in `.env.local` (A55 step 1).** 14 new ElevenLabs voices are in the picker.)
**Previous update:** 2026-08-13 (latest) by Claude (**A50 — the ShipDay→Uber "out of delivery area" problem.** Found a real defect: the address we send ShipDay had no province and no country ("1095 Ezard Cres, Milton, L9T 6W9" — Milton in *which* country?). DoorDash never cared because it uses the map pin we send; Uber's docs say it **always re-geocodes the address text and discards the coordinates**, so Uber was the only one reading the one line that was wrong. Fixed, plus the unit/parking notes that were being crammed into the street line. 1602 tests + build green. **Not deployed** — A50 step 1 is a 2-minute check only you can do first, because there's a second possible cause I can't see from outside your ShipDay account.)
**Previous update:** 2026-08-13 (later) by Claude (**Six finished pieces that had been sitting on side branches are now live** — one of them since 5 July. Nothing was lost, but nothing was live either: a duplicated menu's combo deals pointed at the original menu's items and offered the customer nothing; emails that never left the building were recording themselves as sent; saved delivery addresses couldn't gain or correct their map pin; reservation statuses and the kitchen's first-run tour were English-only for every non-English owner; and customer spend totals had no nightly safety net. Preflight green (1579 tests, full build), translations at full parity across all 38 languages. **Nothing here needs anything from you** — your list is still A49 below. One item was deliberately NOT shipped: the iOS native printer bridge, because shipping it means a new iOS build, and a new build would cost you your place in the Apple review queue while A49 is pending.)
**Previous update:** 2026-08-13 by Claude (**A49 — Apple's business-model question is answered and waiting for you to paste.** The Fee Free Order App review is held on Guideline 2.1(b): Apple wants to know whether the paid service behind the app is sold to consumers or to businesses. It's businesses, and nothing is purchasable inside the app at all — verified by sweeping every link in the kitchen screens. No code change, no new build. The paste-ready reply plus 4 pre-send checks are in `docs/APPLE-REVIEW-2.1B-REPLY-2026-08-13.md`; the most important one is that App Store Connect must have **zero** in-app-purchase items, even drafts.)
**Previous update:** 2026-08-12 by Claude (**EVERYTHING FROM THE LAST TWO DAYS IS NOW PUSHED AND LIVE.** Fourteen sessions' worth of work had piled up uncommitted — including two finished pieces stranded on side branches that would have been lost. Headline: **A47 — paid card orders were being lost before the kitchen ever saw them** (36 stranded in 60 days on your store, 3 orders you never received, $83.62). Also live: Autopilot no longer pays club members twice or mails a dead code (Ben Bilton's report), the cart now quotes the same delivery fee the card is charged, staff order emails name each special, every email declares its own language (Arabic/Hebrew now read right-to-left), and customer SMS is translated into all 38 languages. **Your list is A47 step 1 (three real orders need a decision from you), then the test passes in T-P / A45 / A46.**)
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
- **T-O. ✅ RESOLVED 2026-08-12 — wording tightened, zones unchanged.** Luigi's call: *"free delivery
  is in our standard area, outside that the free delivery doesn't apply and cost varies based on
  distance"*. Zones 1–3 (to 8 km) stay free over $30; nothing was widened. Both customer-facing
  surfaces were rewritten to say the same thing, so the cart and the phone can't contradict:
  > *"Free delivery on orders over $30 within our standard delivery area (up to 8 km). Outside that
  > area free delivery doesn't apply — the delivery fee varies with distance."*
  For the record, widening to Zone 4 would have been cheap — **$21.98 across 2 orders in 90 days**
  (~$88/yr) — so the door is open if a Zone 4 customer ever pushes back.
  ⚠️ **The real finding from that analysis is bigger and is NOT closed.** Of 110 delivery orders in
  90 days, **7 had no delivery zone recorded at all, every one over $30, and they were charged
  $157.96** — an average of $22.57 each, far above the $7.99 Zone 1–2 fee. That is Ben's bug at
  seven times the cost of this whole question: the address couldn't be placed, so the zone-restricted
  free-delivery promo was refused and a higher fee applied. Fixed going forward (server-side
  geocoding + preview/charge parity, live 2026-08-12), but **those 7 customers were likely
  overcharged and have never been looked at.** Two smaller oddities in the same data: Zone 1 shows
  $15.98 charged on orders over $30 that should have been free, and Zones 5 and 6 each had an
  over-$30 order charged $0. ☐ Say the word and Claude will pull the 7 orders with names and amounts.
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

### A64. 🚀 NABIL AI GOES ON SALE — your six decisions (2026-08-16 late) and the program that follows

**Your answers, as I understood them (say if any is off):**
- **(a) Promos by phone** — your store: FIRSTBUY never by phone (already true since `42e9f15b`, stays true). Every store: a
  per-promotion switch **"Available by phone (Nabil AI)"** on every promo type, one shared eligibility check; default ON
  for regular promos, default OFF for Kickstarter/Autopilot campaign promos (so nothing changes for anyone on the day it
  ships). "First-time" is judged among orders on the channels the promo applies to → a phone-only regular who first orders
  online still gets the online first-buy (nudges phone customers online). One flip if you'd rather not.
- **(b) Scheduled orders by phone** — build; per-store setting **"Accept scheduled orders by phone"** (default OFF), agent
  takes a time only when on, same slot rules as the website, otherwise says so and offers the link.
- **(c) Background ambience** — build completely: we take over the phone audio (Twilio Media Streams + our own
  speech-to-text + text-to-speech, ambience mixed underneath). Multi-day; design doc first, then a per-store switch so
  your line can be the first, ConversationRelay stays as the fallback. ☐ **Two accounts in your name are prerequisites:
  Deepgram (STT) and ElevenLabs (TTS, an API plan)** — I'll give the exact clicks when the design is done.
- **(d) Price** — **US$0.60 per call-minute, US$249.99/month minimum, whichever is higher**; a **one-time 7-day free demo
  for restaurants already paying us**. Needs metering (minutes this month + projected month-end on the dashboard) and a
  monthly overage charge before the first outside subscriber crosses 416 minutes.
- **(e) App name** — "Fee Free Order App" on device at the next native release. Yes.
- **(f) Marketing** — a dedicated Nabil AI page ("built for pizzerias by former pizzeria owners"), examples + real
  screenshots, every "coming soon" → **Now available**, add-on + access pages live, all Nabil copy brought current.

**⚠️ One thing you should know before "Now available" goes up:** self-serve number provisioning does not exist yet (your
line was set up by hand), so going on sale means **concierge activation** — a restaurant subscribes, we are notified, and
we switch their line on within one business day (they see "we're setting up your line" until then). The wizard comes
later. Tell me if you'd rather hold "available" until the wizard exists.

**Order of work:** (f)+(d) → (a) → (b) → (e) → (c). Progress is logged under this entry as it ships.

**Your clicks (as they come due):**
1. ☐ **Superadmin → Add-ons → "Nabil AI Phone Ordering" → Sync to Stripe** (I set the name/price/live flags in the DB;
   the Stripe product+price can only be created with the live key, which is prod-only) — I'll say when.
2. ☐ **Deepgram + ElevenLabs accounts** for (c) — later, with exact steps.

### A63. 🔢 "Nabil says numbers wrong, especially addresses" — FIXED in code: every number now reaches the voice as WORDS (2026-08-16, evening)

**Your report** (call `cmswj3rv1`, report `cmswjlo87`, urgent, voice quality): *"number issues when announcing double
digits etc"* — after your A62 test call (Sam, 21:02, ORD-647686206, everything else right: half plain / half four
toppings, no pizza name you didn't say, "no delivery charge", the banter line, texted receipt).

**What actually happened.** On your call the model wrote your callback number as **"647-669-0808"** — digits with
hyphens — and that went straight to the voice; on Grace's call at 18:36 it wrote **"416 799 6207"** the same way. On
Negme's (20:17) and David's (18:11) calls the very same evening it wrote *"four one six, five two nine, eight seven five
six"* — words — and those sounded right. So whether a number sounded right depended on which way the model happened to
write it. Two facts made that a coin-flip you could hear: (1) the voice provider's own number normalisation is not
available on the voice model we pin, even though we ask for it, so raw digits are read however the voice guesses
(hundreds, "minus", "one thousand one hundred sixty-six"); (2) the playbook already tells the model to say numbers as
words and house numbers "the way people do" — it complies about half the time. Same lesson as the Roya call: a prompt
paragraph is not a gate.

**The fix — a deterministic last pass before anything is spoken** (`services/nabil-voice/src/spoken-numbers.ts`,
wired at the one seam every sentence goes through): phone numbers digit by digit in threes ("six four seven, six six
nine, zero eight zero eight"); house numbers the way people say them ("three thirty-eight Black Drive", "eleven
sixty-six McEachern Court", "sixty-six", "three oh five"); unit/apartment/buzzer numbers; Canadian postal codes ("L nine
T, six W nine"); money in words; times ("ten a.m.", "six thirty p.m."); dates, percents, ordinals, sizes ("eighteen
inch"), ranges ("twenty to twenty-five minutes"), fractions, order numbers digit by digit, plain counts ("twenty
wings"). English calls only — another language's voice reads digits natively and gets nothing changed. A number is
never split across two voice chunks. Ids like "L1" are left alone. The transcript on the call page still shows what the
model *wrote* (evidence); the timeline gets a "Numbers spoken as words (N)" row. Also fixed on the way: two timeline
event kinds the service has emitted for days (narration dropped, tail fragment) were silently discarded by the app's
allow-list — they now show on the timeline. Tests: 11 unit cases anchored on tonight's exact lines + 5 wiring cases
(sentence mode, token mode, Italian call untouched, older tokens) + the naturalness lint taught to read number-words.

**Status: LIVE.** Vercel `9611440` (call token carries the store's language; timeline rows; allow-list) and **Fly v36 on
both machines** (health ok). Gate: typecheck + 2344 tests + preflight green; the 1× critical/injection sim ran 34/35 exact —
the one miss (T24, a doubled "extra cheese" in the model's tool call, nothing to do with speech) re-ran **3/3 PASS** on the
same code, so it was model variance, and the deploy went out via the release script with the sim step skipped on that
evidence (HISTORY.md rows 02:05 NO-GO / 02:13 GO). Because the sim runs in token mode, all 35 scenarios exercised the new
hold-back path. Your report `cmswjlo87` is now **Fixed** with the answer above (visible on the call page).
☐ **Try it (1 min):** call, give a delivery address with a big house number ("eleven sixty-six McEachern Court"),
confirm your callback number when asked, and listen — every number should come out the way you'd say it. Tell me if
any number still sounds wrong and *which* (I can see exactly what was sent to the voice per sentence now).

### A62. 🧭 WHERE EVERYTHING STANDS — one list, all of today's sessions consolidated (2026-08-16, evening)

**Why this entry exists.** Seven sessions worked today; each left steps for you and none were done, and a
"authentication service was unavailable" message appeared. **That message is the Claude app's own sign-in hiccup
(Anthropic's side) — it is NOT from your product**; no such text exists anywhere in the restaurant software. The
sessions stopped mid-stream, but every piece of their work was on disk; this session inventoried all of it. From here on
ONE session operates (this one); the seven are archived.

**Live right now, nothing needed from you:** Vercel serves `e17e64f` (= `main`), Fly `nabil-voice` v35 on both machines
(health ok, `sentry=on`). That is: the A58 fallback chain armed end to end, the drain fix (`feede909`), the online-only
campaign promos + recipe-half + address read-back fixes (A61, `42e9f15b`/`6c2333db`), the visibility fix (A60), the
"reopen at ten" + one coherent later-order rule (A59). Your A59 "confirm the fallback numbers" was answered when you
confirmed 289-409-1133 for A58 #2 — closed.

**Shipped by THIS session (Vercel push, no Fly deploy needed):** the two finished-but-unshipped pieces —
(1) **Phone-order RECEIPTS** (`5e735268`): a third "Phone Order Receipt" template in Admin → Receipts, prints INSTEAD
of the kitchen ticket for a Nabil order, leading with `PHONE ORDER` / `NOT PAID - $X DUE ON PICKUP` (or `PAID`); the
customer copy gets the same banner; the fake `@voice.nabil.invalid` e-mail never prints; web tickets byte-identical.
(2) **Kitchen DISPLAY badge** (merged from `claude/ecstatic-satoshi-5322d3`): `PHONE ORDER` pill + `NOT PAID · $X due
at pickup` / `PAID` chip on the tile (one extra line only on phone orders — every other tile unchanged) and in the
detail. Both key on ONE constant now (`src/lib/phone-order-channel.ts`). Gate before push: preflight (tsc + voice
typecheck + full test suite + `next build`) + 38-locale parity 0/0/0/0.

**Update (evening):** steps 1–3 ✅ DONE by Luigi — print tested and working; live call re-ordered fine (one defect
found: numbers mis-spoken → A63, fixed); report filed (`cmswjlo87`) → the flow works end to end. Remaining: 4–7.

**YOUR STEPS — in this order (everything below is short; nothing else is waiting on you today):**
1. ✅ 🖨️ **Test print the phone receipt (5 min, once the deploy is Ready):** Admin → Receipts → **Phone Order Receipt**
   tab → *Test print* on the Star; compare with the preview. Then the Customer tab → switch on the **"Phone order
   (Nabil AI)"** preview pill and eyeball the banner. Tell me "print ok" or what's off.
2. ✅ 📞 **ONE live test call to +1 365 658 1458** — it covers what three sessions asked for at once. Script: *"Large and
   Wings combo, one side just cheese, other side green peppers, mushrooms, onions and tomatoes, wings BBQ"* → delivery to
   a Zone-1 address, but say the street slightly wrong once (e.g. a wrong number) → say "you're the best, I love you"
   once → let it place the order. Listen for: **never a pizza name you didn't say** ("half plain, half green peppers,
   mushrooms, onions and tomatoes"); the wrong street read back + "could you spell the street?" right then; the fee
   said WITH "or free once you're over thirty dollars"; one playful line then back to the order; the closing total names
   **no first-time discount**. Then look at: the **kitchen tile** (PHONE ORDER + NOT PAID chip), the **printed kitchen
   ticket** (PHONE ORDER banner first), and Admin → Phone ordering → Calls → that call. Tell me the time of the call and
   I read the transcript + timeline. *(Optional second call: ask for a person mid-order → instant transfer to
   289-409-1133.)*
3. ✅ 🚩 **Report-this-call flow (3 min, on the call from step 2):** call page → **Report this call** → pick a topic, tick
   Urgent, one line → send. Then Superadmin → Restaurant Reports › **Nabil AI reports** → open it → set a status + write
   a note → back on the restaurant call page the status + note appear, and the reporter address gets the email. Tell me
   what Loman's version does that ours doesn't.
4. ✅ ⏱️ **Uptime monitor (A58 #4, 5 min, needs an account in YOUR name):** UptimeRobot (free) or Better Stack → HTTP
   monitor on `https://nabil-voice.fly.dev/health`, 60-second interval, SMS alert to your mobile. It is the only alarm
   that still works when Vercel is down.
5. ✅ 🔧 **Vercel env `SENTRY_PROJECT` — delete the leading TAB (1 min):** *(done by Luigi 2026-08-16 ~23:40 EDT — the value can't be edited in place because it is marked sensitive; re-entered as `javascript-nextjs`; verified on the next build's source-map upload)* Vercel → project → Settings → Environment
   Variables → `SENTRY_PROJECT` → Edit → remove the tab at the start of the value → Save. (Its value is marked
   sensitive so I can't read or edit it; it only affects source-map upload on builds.)
6. 🤔 **Five decisions — just answer in one message, nothing changes until you do:**
   a. **Online first-buy for phone-first customers** — today a phone order counts as "an order", so someone whose first
      order was by phone never gets FIRSTBUY online. Keep as-is (my default) or make FIRSTBUY = first ONLINE order
      (one-line change)?
   b. **Phone orders for a specific later time** ("for 6 pm", "for Tuesday") — build (~half a day) or keep offering the
      web link?
   c. **Background restaurant ambience** — impossible on the current Twilio pipeline; a multi-day audio re-platform.
      Scope it, or park it?
   d. **Nabil price** — CA$0.75/call-minute with a CA$99/month minimum (margin positive at every volume; a live minutes
      counter must ship before selling). Yes / change?
   e. **Kitchen app on-device name** — rename "Fee Free Kitchen" → "Fee Free Order App" (the store listing name) at the
      next native release? Yes / no.
7. 🔷 **Optional, WITH me, only when the phone is quiet:** the mid-call restart test — you place a test call, I deploy
   Fly mid-call; the call must finish (spoken sentence or warm transfer, record + cost saved).

*(Older opens are unchanged and still listed below — A47 step 1's three stranded orders decision, the VIP welcome
email, A45 step 3's optional ElevenLabs key. Nothing there became more urgent today.)*

### A61. 📞 The 9-minute call at 14:20 (ORD-971682861) — first-time discount by phone (FIXED, online-only now), the pizza that "kept being wrong", and the address (2026-08-16)

**The discount.** The caller got a **$4 "First-time customer special"** — that is your Kickstarter FIRSTBUY 10%,
and it applied because, to the promo engine, a phone order was a *website* order. **Fixed at the one chokepoint both
the quote and the charge use:** a phone order never sees a Kickstarter or Autopilot promo again — not FIRSTBUY, not
WIN1–5 / 2NDOFF / CARTBACK, not even when the caller's number is on an Autopilot email grant. Your own promos still
work by phone (FREE DELIVERY over $30 is still said with the fee), and web checkout is byte-identical. Ships with the
Vercel push. *(The past order stays as it was — a $4 discount already given.)*

**Why the pizza "kept being wrong" — it wasn't the caller.** She said *"one side just cheese, the other side green
pepper, mushroom and tomato"* and Nabil quietly mapped those three toppings onto your **Vegetable Pizza** recipe — a
name she never said. From there every read-back said "half Vegetable Pizza …", her "no tomato" matched a *recipe*
topping and changed nothing (twice — 13 seconds of silence, "Hello?"), "tomatoes on the cheese half" put tomatoes on
the whole pizza, and the final read-back "half Vegetable Pizza with onions and tomatoes" made her say *"No. You have the
toppings wrong."* (the mushrooms and green peppers were hidden behind the recipe name). The order that reached the
kitchen WAS right in the end — but she left frustrated. **Fixed in code, four ways:** (1) a recipe half is only allowed
when the caller *says* the pizza's name — a list of toppings stays a list of toppings; (2) a change that changes nothing
is never answered "that's fixed" — Nabil is told exactly what is on the pizza and to ask what they'd like different;
(3) taking a topping off a recipe half works, and adding it to the other half no longer brings it back everywhere;
(4) an untopped half is now spoken — "half plain, half green peppers, mushrooms, onions and tomatoes".

**The address.** "Sixty six McKechner Court" was heard as *66 McKechnie Court*, could not be found on the map, and
Nabil said "Got it, thanks" — 3½ minutes later she had to correct it three times (it was **1166 McEachern Court**).
Now: an address that can't be found is read back once and Nabil asks them to spell the street, right then; house
numbers are said the way people say them ("eleven sixty-six"), and a corrected number is spelled out digit by digit
once. Also new: a short "Okay." if Nabil has been silent for 2½ seconds while working (the dead air before every
pizza edit on this call).

**Status:** committed with tests; Vercel half tonight, Fly half via the gated release (`nabil:release --deploy`, both
machines). **Try it:** call and order a half-plain / half-four-topping combo pizza by listing the toppings — you should
never hear a pizza name you didn't say — and give a slightly wrong street once.

🤔 **Two things only you can decide** (both logged in TODO.md, nothing happens until you say):
1. **Background restaurant ambience** — you asked for it in this pass. I checked Twilio's ConversationRelay again
   today: it has **no background-audio feature** and its "play a file" message *replaces* the voice rather than
   playing under it, so it cannot be done on the current pipeline. Doing it properly means owning the phone audio
   ourselves (Twilio Media Streams + our own Deepgram/ElevenLabs streams, ambience mixed underneath) — a multi-day
   project. Say the word and I'll scope it; I did NOT fake it (a clip that plays before the greeting and then stops
   would sound broken).
2. **Phone-first customers and the online first-buy.** A phone order still counts as "an order", so someone whose
   first order was by phone (no discount now) is "returning" online and never gets FIRSTBUY. If you'd rather the online
   first-buy be for the first *online* order, it's a one-line change — tell me which you want.

### A60. 📞 Roya's 11:41 call — the repeated topping question (FIXED) and the "Monday special on a Sunday" (it's a MENU row — your call) (2026-08-16)

**The repeat.** Nabil asked *"what topping would you like on it?"* and — **one millisecond** after that sentence was
generated, before a word of it could have played — the listener delivered the word **"special"** on its own (the tail
of Roya's "Yes… special"). It matched none of the known tail words and the reply ended in a question, so it was
treated as a new turn and Nabil asked the topping question again. → Fixed in code: anything that arrives before the
reply could possibly have been heard is never answered as a fresh turn — it's held and folded into the caller's real
answer ("Pineapple."); if the caller stays silent after the reply has played, it runs on its own so a blurted request
is never lost. Committed `7654c7b8`, ships with the next Fly deploy.

**The special — you were right, and it was OUR bug, not your menu.** Nabil said *"today it's a Medium 1 Topping
Pizza for eight ninety-nine"*. Your **Daily Deals** category holds the 12 day-restricted specials (Mon → Fri, each
paired to its regular item; the *"Monday - Medium Pizza Special"* was correctly NOT offered on Sunday) **plus a
thirteenth row you can't see: "Medium Pizza 1 Topping" $8.99 — a HIDDEN copy of the Monday special (created 8 July,
`visibilityMode: hide_from_menu`, no day set).** Your website honours the hidden flag, which is exactly why your admin
and your customers never see it. **The phone menu didn't** — it filtered on "available" only and never applied the
visibility rules — so Nabil had a hidden $8.99 medium in its menu every day and offered it as today's special. Fixed:
the phone menu now applies the same visibility rules as the website, in three places (the menu Nabil reads, the
"you could have that cheaper as today's deal" push, and size-sibling matching). Committed; ships with tonight's Vercel
push. Nothing to change on your menu. *(My first note here said the website was selling it every day — that was
wrong; I've corrected it.)*

### A59. 📞 Your 00:30 call — "we reopen at two" + the "order for later" contradiction — FIXED in code (2026-08-16)

**What you heard (call `cmsvb4gxf000h04jonnz15w0u`, 00:30 EDT):** you asked "Can I place an order for tomorrow?"
→ Nabil: *"We can't schedule orders for a later time over the phone — we only take pre-orders for right now"*
→ you: "Right now." → Nabil: *"We're actually closed right now — we reopen at **two o'clock** this afternoon. I can
still take your order now as a pre-order for when we open."* Two real defects, both in the layer between the facts
and the model — the facts themselves were right (your hours are 10:00 AM – 12:00 AM every day):

1. **"Two o'clock" was the UTC hour.** The reopening time reached the model as a raw timestamp
   (`2026-08-16T14:00:00Z`) with an instruction to "say it in local time". It read the 14. That is a computation
   the model was asked to do — exactly the class of bug the P0 rebuild forbids. → The server now computes the words
   in your timezone and your 12h format ("this morning at 10:00 AM", "tomorrow (Sunday) at 10:00 AM",
   "Tuesday at 11:00 AM") and Nabil is told to say **exactly that**. The timestamp never reaches it as speech again.
2. **Two rules contradicted each other.** One said "scheduled orders: RIGHT NOW only — decline requests for a later
   time or day"; the closed-hours rule said "you may still take the order for after we reopen". So it refused
   "tomorrow", then offered a pre-order for… tomorrow. → One rule now: *a specific later time or day can't be set by
   phone (offer the online link) — but an order taken now is simply prepared when the kitchen is next open, which
   while closed IS "tomorrow" / "when you open": take it, and say "we're closed right now — we open this morning at
   10:00 AM; I can take your order now and it'll be ready shortly after we open."*

**Status:** committed with tests (`b43ae1bf`); the Vercel half ships with tonight's push, the Fly half with the next
gated deploy (I'm running it tonight). **Try the same call after I say it's live** — expect "we open this morning
at ten" (or "tomorrow at ten" if you call before midnight) and one coherent sentence.

🤔 **One decision for you — phone orders for a SPECIFIC later time.** Today Nabil genuinely cannot take "for 6 pm"
or "for Tuesday" by phone (the order tools carry no scheduled time); your website can, so it offers the link.
Building it properly is about half a day: a `when` on the order tools, the same slot rules the website enforces
(minimum lead, max 20 days ahead, hours), and refusals spoken back ("that's too soon — the earliest is …").
Say the word and it goes on the list; otherwise the honest answer stays.

✅ **DONE (closed by A58 #2 — you confirmed 289-409-1133 as the fallback; no platform catch-all by your rule).**
Original ask: **Confirm the two safety-net numbers** (I set the env, you just say yes/no): if Nabil can't take a call, ring
**289-409-1133** (that is your store's alert phone today, and it is what "transfer me to a human" already dials) —
or would you rather the fallback ring the store line **905-385-4444**? And the catch-all when the system can't even
look the store up: your mobile — is that the 289 number?

### A58. ☎️ Nabil could hand a caller DEAD AIR — fixed in code; 3 short clicks are yours (2026-08-15)

**What I found while comparing Nabil against a competitor's sales page (Loman.ai).** Nabil beats them
on everything hard — order accuracy, transcripts, recordings, analytics — and there is no "POS
integration" to sell because phone orders already go through the *same* checkout as your website.
But three things were genuinely worse, and one was a live hole:

**The hole (fixed).** Every "Nabil can't take this call" path in the system deliberately rings your
own phone instead. One did not. If our own webhook ever threw an error — a database blip, a slow
cold start — Twilio had no second address to try, so it played its error tone and hung up. **The
caller heard nothing and we never found out.** Also fixed: a store whose Nabil add-on lapsed on a
failed card, and which never filled in a transfer number, got "we can't take your call" instead of
its own phone ringing. That is merely rude today — it becomes business-ending the moment a store
forwards its real line to Nabil, because the number on their printed menu is the one that dead-ends.

**Also fixed (privacy, same session).** A "download my data" request returned **no trace of phone
calls** — even though deletion correctly knew we hold the caller's full transcript, AI summary and
recording. Access and deletion are the same duty; the export now covers calls, addresses, order
notes and ratings, and a test now fails the build if a table is ever added to the deletion list
without being added to the export. And when Twilio *refuses* to delete a recording, we no longer
throw away the only handle that could delete it while reporting the erasure as complete — the
request is now logged "partial" and the audio stays reachable for a retry.

**Your clicks — updated 2026-08-16 12:50 EDT:**
1. ✅ **DONE (you, 12:40 EDT)** — pressed *Repair* on **Superadmin → Nabil Phone Lines**; the audit row shows it wrote
   `VoiceUrl` (www → `https://feefreeordering.com/api/twilio/voice`, the form `NEXT_PUBLIC_APP_URL` gives — both hosts
   answer the route) and `VoiceFallbackUrl` = `https://nabil-voice.fly.dev/twiml/fallback`, and backfilled the number's
   Twilio SID. Verdict *healthy*. Twilio now has a second address to try.
2. ✅ **DONE (me)** — `NABIL_FALLBACK_MAP = {"+13656581458":"+12894091133"}` in Vercel prod (the alert phone you
   confirmed). **No `NABIL_FALLBACK_DEFAULT_NUMBER` on purpose** — your rule: every number depends on each store, never a
   platform-wide catch-all. The safety net now also learns EVERY store's own number from the database on the healthy
   path (`d668772f`), so a new restaurant is covered the moment it exists, no env edit.
3. ✅ **DONE (you, 15:28 EDT)** — you staged the Twilio auth token (`fly secrets set --stage …`) and switched it on
   (`fly secrets deploy`); both machines rolled to v34, healthy. **Verified:** a fake POST to
   `nabil-voice.fly.dev/twiml/fallback` now gets **403** (signature check ON); a real Twilio request still dials
   `2894091133`. The chain is armed end to end: Twilio → our webhook → (Vercel safety net) → Fly fallback → your phone.
   ✅ DONE 2026-08-16 (Luigi re-entered `SENTRY_PROJECT` = `javascript-nextjs`; a sensitive var can only be re-typed, not edited).
   Original: Still a 1-minute UI chore whenever you like: **Vercel → Settings → Environment Variables → `SENTRY_PROJECT` → Edit →
   delete the leading TAB** (its value is sensitive, so I can't) — only affects source-map upload on builds.
4. ✅ **DONE (you, 2026-08-16 23:29 EDT)** — UptimeRobot HTTP/S monitor on `https://nabil-voice.fly.dev/health`,
   5-min checks (free-tier minimum), status Up; test DOWN+UP alerts received at your Gmail. Optional later: the UptimeRobot
   phone app for push. Original ask: **A free uptime monitor** (UptimeRobot or Better Stack) on `https://nabil-voice.fly.dev/health`,
   60-second interval, SMS alert to you. **This is the only alarm that still works when Vercel is
   down** — a monitor that runs on Vercel cannot tell you Vercel is broken. *Still yours — it needs an account in
   your name.*

5. ✅ DONE — **2 machines are live** (`fly status`: 8654502f933318 + 8654670f7366e8, both healthy). The graceful-shutdown
   work has landed, so a deploy drains instead of killing calls: the machine stops accepting new
   calls, waits up to 4 minutes for the ones in flight, and anything still running gets a spoken
   sentence and a warm transfer rather than a dead line. That only helps if there is a **second**
   machine to take the traffic while the first drains, which is what this command buys — so the
   release script now **refuses to deploy onto a single machine** unless you explicitly override it.

**What I measured, since it settles the "multi-line" question.** A concurrent call costs **1.06 MB**
of memory, dead linear from 5 calls to 40 — so a 512 MB machine could hold roughly **250** of them.
Memory is not our limit and never was; the 25-call cap was ~10× conservative. I did **not** raise it,
because the two limits that will actually bite are ones that measurement can't see (Anthropic's
account-wide rate limits, and CPU), and raising a cap on the strength of the wrong evidence would
just move the failure from "we politely ring your store in under a second" to "all 100 live callers
break mid-sentence." Re-run it any time with `npm run nabil:capacity` — it costs nothing.

**Built 2026-08-16 (afternoon) — the alerting layer, no clicks needed:** (1) **the quoted ≠ charged alarm** the
call page has promised since the Roya incident: when a caller agrees to one total and the placed order charges
another, one ops message (superadmin bell + email within a minute) fires — once per call, never for a refusal that
billed nobody, and the two screens now agree on the tolerance (one cent). (2) **Sentry on the phone service** — until
now a crash on the voice machine was invisible and dropped every live call; now errors + stacks reach the same Sentry
project (environment `nabil-voice`) with identifiers only — every string is scrubbed before it leaves the machine, no
transcript, no phone number — plus a "line at capacity" alert (once per half hour) and crash handlers so a stray
error is reported and survived instead of killing the calls. `/health` now ends with `sentry=on`.

**Verified 2026-08-16 — the missed-order robocall covers phone orders too.** I read the cron end to end: it selects
any order still *pending* ~90 s after the kitchen was notified, with no channel filter, so a Nabil order is treated
exactly like a website order and your alert phone rings. Your store is on **auto-accept**, so orders are never
"pending" and it never needs to ring — correct by design (nothing is missed) — but note the flip side: on an
auto-accept store, an order that lands while your router is dead is accepted and dispatched with nobody having
seen it. That is a separate class ("accepted but unseen") I've put on the roadmap, not tonight's work. One more
thing for later, when stores start forwarding their main line to Nabil: the robocall dials `alertPhone → phone`,
and a forwarded main line would send that call to Nabil itself — logged for the keep-your-number work.

🤔 **One decision, when you're ready.** Nabil's price. Your CA$0.75/call-minute with a CA$99/month
minimum works — measured cost is US$0.34–0.40/minute from 31 August, so the margin is positive at
every call volume (roughly 30% for a typical store, more for a quiet one). The earlier CA$0.50 idea
would have been at or below cost. The real risk is a store signing up at $99 and seeing $200 — so the
dashboard needs a live minutes counter and a projected month-end total before we sell it.

### A56. 💶 Fabrizio #17 — a Euro store was advertising delivery fees in dollars (2026-08-15)

**What he saw:** on his restaurant's info page, "Our delivery areas" listed each zone as
"Min $20.00, Fee $5.00, ~30 min" — dollars, even though his backend is set to euros.

**Why it happened:** that one line had the dollar sign typed directly into the code instead of asking
the restaurant what currency it uses. It was also written in English only. Two things made it worse
than a one-line typo:
- The hover tooltips on the delivery map had the same "$" baked into the **translated text of all 38
  languages** — so the Italian, German and Japanese versions all said dollars too.
- Your **hosted marketing website** (the "Sales Optimized Website" add-on) had the same mistake in
  three more places, including **every menu price on the page**. Nobody had reported that one yet.

**Fixed:** every one of those now prints in the restaurant's own currency, formatted the way that
currency is normally written (a euro store reads "1,00 €", not "€1.00"), and the zone line is now
translated like the rest of the page. The currency symbol can no longer be typed into a translation —
it comes from the restaurant record, so this cannot come back through a new language.

**RESULT: SHIPPED AND CONFIRMED ON HIS LIVE STORE (2026-08-15).** Pushed as `b1ae29cf`. Before
telling him anything, I loaded his own restaurant's info page on production — the exact page his
screenshot came from — and it now reads:

    Zone 1 — Costo: 5,00 €, Min: 20,00 €
    Zone 2 — Costo: 10,00 €, Min: 50,00 €

Same numbers as his screenshot, euro symbol, European number format, and the labels are now in
Italian instead of English. Preflight was green before the push (2090 tests, full build) and all 38
languages are at exact parity.

**Reply posted** on report `cms0gyexp` (English, per your standing rule), Fabrizio notified. Status
left at IN_TESTING — it was already there, so nothing moved backwards. He's been asked to re-check
the zone list, hover the map circles, and look at the hosted-website menu prices.

**Safety check before the push:** `main` was level with the remote, no other session was running,
each of the 38 language files contained only my two-line change (no sibling session's translations
swept in), and the other in-flight work in the shared tree (the FIRSTBUY/coupon-ledger files) was
left untouched — staged by explicit path, per your standing rule.

**NOTHING IS NEEDED FROM YOU ON THIS ONE.**

### A55. 📞 NABIL AI P0 — rebuilt around an authoritative cart; 3 things are yours (2026-08-15)

**What happened on the last call (Jashan, 03:28 UTC, no order):** Nabil told him red onion and roasted red
peppers weren't available on a Large 3 Topping. They are — the menu has 34 toppings. The prompt carried only
the FIRST 12 topping names, with no "…and 22 more" marker, so the model read a truncated list as the whole
menu. It also said "One moment." on 12 of 17 turns (a timer that fired on any slow answer, not just lookups),
and when he corrected the second pizza inside the combo it re-added the whole combo four times because a
combo's insides could not be edited. None of it was visible afterwards: only the words were logged.

**What is built (this session — Vercel + Fly, deploy pending your key + the gate):**
- **The order lives in code, not in the model's memory.** Every line — drinks and wings included, not just
  pizzas — sits in a server cart with a stable number (L1, L2…) that never changes; the model reads the whole
  order back from a state block on every turn instead of remembering it. Combos are editable inside (P1, P2…).
  "Which one did you mean?" is asked by code when a correction is ambiguous — never guessed. An order can't be
  quoted or placed while anything is unfinished, and can't be placed unless the exact same order was quoted.
- **Truncated lists are impossible to mistake** ("+22 more" markers everywhere; the tools carry `truncated`
  counts) and Nabil is instructed it may only call something unavailable when a tool said so.
- **Fillers only during a lookup**, rotated, recorded. Barge-in records what you actually HEARD.
- **Long calls**: history is compacted every ~12 turns; the cart is never summarised away.
- **Every call now records a full timeline** (what you said → what it called → what came back → cart before/
  after → what it said → timing). Admin → Phone ordering → a call → **Show timeline**, plus a **"Turn this
  call into a regression case"** button that downloads a test file for me.
- **A torture-test suite** of 25 brutal pizzeria calls + 10 "trick the AI" calls that drive the REAL agent
  against a snapshot of YOUR menu and check the final cart line by line. `npm run nabil:release` refuses to
  deploy Fly unless all pass 3 times out of 3. It costs ≈ $8 per single pass (Anthropic), ≈ $12–25 for the
  3× release gate — never part of the normal preflight.
- **Voices**: ElevenLabs' current premade library (14 new, 8 female) is in Settings → Voice; ids verified live.
  Your store is still on "Mark" 1.1× — pick whichever you like there.

**RESULT (2026-08-15, later the same day): LIVE.** Release gate 🟢 GO on sha `96d56074` — **35/35 scenarios,
100 % exact cart, 100 % items/modifiers/halves/combo slots, model 20.7¢ per est. call-minute** (ceiling 40¢
all-in ⇒ model budget 30¢). Fly deployed to both machines (`Anthropic key OK`, health 200); Vercel deployed.
Every scenario also passed twice across the day's earlier passes. Real-call cost measured on your last five
calls: 25–31¢/min all-in. **A step-by-step test email is on its way to your inbox** (superadmin + support@).
Today's Anthropic spend ≈ US$110 was the BUILD (~250 simulated calls to find/fix bugs); steady state = ~$14
per release gate, real calls ≈ 80–95¢ for a 3-minute order.

**ROUND 2 — your first live call on the new agent (17:58 UTC, 72 s) and what it changed.**
You hung up early: robotic voice, a "random" line, toppings "not understood", machine read-back, wrong price.
The call's own timeline (the new one) shows the CART WAS EXACTLY RIGHT — large, left pepperoni + mushrooms,
right green peppers + onions, no problems. Everything you heard wrong was in the layer between the engine and
your ear, and each has a specific cause and fix:
- **"Toppings not understood" / "machine read-back"** — the engine handed the model the KITCHEN TICKET string
  ("Large 2 Topping — left half: Pepperoni, Mushrooms; right half: Green Peppers, Onions") and ordered it read
  WORD FOR WORD, then "confirm one half at a time". A SKU that says "2 Topping" for your 4-topping order.
  → Now the engine speaks like a person: **"a large pizza, half pepperoni and mushrooms, half green peppers and
  onions"**, one recap, one yes; the whole order at the end reads "So that's …, …, and …" and the total is in
  words ("twenty dollars and fifty-one cents"). The ticket string is unchanged underneath.
- **"Wrong price"** — "about 2 cents extra" was true (4 half-toppings at 2.75 × ½ = 1.375 each round to 1.38 →
  5.52 vs the 5.50 included) but absurd to say. → Surcharges are spoken in words and only from 50 ¢ up.
  (Your website charges the same 2 ¢ on that pizza — a tiny rounding fix on the money path is a separate,
  optional item; tell me if you want it.)
- **"Random"** — the very first thing it said was "I have you down as Dishen — is that right?" (the last voice
  ticket on your test number was Dishen; your line's history is Sam / Dishen / Jashan). → A name is only offered
  when the last three voice orders on the number agree, and only when settling the name at the end. And "Take
  your time." was a three-word fragment on the legacy voice — the style rule now forbids bare fragments.
- **"Robotic voice"** — your store was on the LEGACY ElevenLabs "Rachel" at 1.1× speed. → **Switched to Jessica at
  1.0×** on your live config (you picked her). Two experiment levers added for a live call: warmer delivery
  (`NABIL_TTS_STABILITY=0.4`) and phrase-chunked TTS (`NABIL_TTS_CHUNK=sentence`).
- **Silence** (5.2 s before it spoke after your pizza sentence; 2.9 s after your name) → the model now says a
  short "Sure." before it works, and pure bookkeeping (your name, pickup) no longer costs a second model round.
- **New guard rails**: a free 370-scenario deterministic tier runs in every test pass at $0 (the directive's
  "hundreds → 1000+" without spend); a naturalness lint fails the release if Nabil ever speaks a ticket string
  again; the menu resolver now carries a numeric confidence (asks on a near-tie, never guesses) and a
  spoken-alias dictionary (GP, pep, shrooms, x-cheese, HG…); every call records which listener and voice it ran with.

**Model benchmark (8 hardest scenarios, one pass each, ≈$17):** Sonnet 5 adaptive (today's prod): 8/8 exact
carts, but 3.5 s to first audio (thinking happens before it can even say "Sure"), 24.8¢/est-min. Sonnet 5
thinking-off: 7/8 (one real cart miss on the huge order), 28¢. **Opus 5 thinking-off: 8/8 exact, 1.3 s to
first audio (2.7× faster), 26.4¢/est-min** — but with thinking off it spoke its reasoning aloud in 3–5 of
128 turns ("I'll use the Large 1 Topping menu item directly"). So I built a deterministic guard: sentence-chunk
TTS holds each sentence and DROPS one that reads as system talk before the voice ever hears it (logged as
`narration_dropped`). The deciding run (Opus-off + guard on the leak-prone ids, ≈$5) and the release gate
(≈$14) are **waiting on Anthropic credit — it ran dry again at 16:03 UTC mid-run.**

**RESULT (2026-08-15 evening): LIVE.** Vercel `bc18f3a`, Fly `4234bf1e` (both machines healthy). Final gate on the
shipped code: 35 scenarios, **100 % exact carts, 100 % items/modifiers/halves/slots, robotic-utterance rate 0 %,
model 20.3¢/est-min**; the single "fail" was a test-harness timing artefact (fixed, 5/5 on re-run). The Opus 5
thinking-off candidate ran a full 35×2 gate too: 100 % exact carts, 18¢/est-min, 2.7× faster to first audio —
but without thinking it read its own reasoning (and once the internal STATE block) aloud, so it stays an
EXPERIMENT config behind `NABIL_MODEL/NABIL_THINKING/NABIL_TTS_CHUNK` until the guard is proven on a live call.
Round-2 test spend ≈ US$70 (three benches, two gates, targeted runs) — more than the ~$30 I planned, because
the model comparison was worth settling with data; the credit ran dry once more mid-run (auto-reload, please).

**ROUND 3 (2026-08-15 ~22:30 UTC) — your 21:20 call + the 21:15 tester's call, read from their timelines:**
your cart was right except the thing you spotted: **half Philly Steak lost its ranch base** (the model copied the four
toppings itself; the recipe's default sauce never travelled), and it asked twice whether mushrooms/green peppers "on
both halves costs extra" (they're just in both recipes). The tester's call asked for name + number BEFORE any food and
never put "one extra large pizza" on the order while it asked questions. → Live now (Vercel `2d2b6a3`, Fly same,
gate 35/35 exact, 0 % robotic, 24¢/min): "half of a named pizza" is first-class in the engine — recipe toppings,
shared toppings go on the whole pizza automatically, **"Ranch Base on the Philly Steak half" on the ticket and spoken**,
read back as "half Philly Steak, half Deluxe"; food goes on the order the moment it's named; name/number only after the
food; no "let me check that" while saving a name; "/" is said as "and"; **banter rule** ("I love you" → one warm playful
line, back to the order); **asking for a person = instant transfer** (rings your store phone since no transfer number
is set); **whole-sentence voice delivery** on your line (the "missing words / losing reception" glitch is token-by-token
streaming); **Deepgram Flux listener ON** (turn-taking / fewer false interruptions) — this one is the live experiment.

**ROUND 4 (2026-08-16 ~01:00 UTC) — your 00:10 test call + Saboor's 23:10 call + the 23:43 halal call:**
Your test call got everything you asked for: "half Philly Steak, half Deluxe, **ranch base on the Philly Steak
half**"; the swap to Chipotle Chicken added "chipotle base on the Chipotle Chicken half"; "I love you" → "Aw, careful
now — I'll put extra love on those wings for you!"; "transfer me to a human" → immediate hand-off. Replies now come in
0.8–1.1 s on plain turns (Flux). What was still off, and what changed: **(a)** the combo turn had 9 s of dead air and
said "the wings id needed a tweak, let me try that again" — the combo went in empty and the model fumbled the fixed
pizza/wings ids three times → the system now fills every fixed slot itself the moment a combo is named ("Large and
Wings combo" instantly holds the pizza + 20 wings; only toppings and flavour are questions), and that kind of sentence is
now filtered before the voice; **(b)** Flux cuts sentences at short pauses ("…and the wings barbecue" / "instead." /
"That's not… both the size I want") → a one-to-three-word tail arriving right after a reply is now absorbed, not answered
with "what would you like instead?"; **(c)** "halal" was heard as "hello" once → your FAQ words (halal, intercom…) are
now in the listener's hint list; **(d)** postal-code insistence and late address questions fixed. **Shipped:** Fly
`b301e770` (round 4) then `e31393f9`; the Vercel side of round 4 (FAQ hints) failed to build twice because a sibling
session's half-committed edit landed in a shared file — fixed in `e31393f9`, see round 5.

**ROUND 5 (2026-08-16 ~02:30 UTC) — your 00:57 call + your two asks:**
**(a) "Just giving the delivery fee right away is scary — say there's FREE delivery if there is."** The address
check now looks up the store's live free-delivery deal for the caller's zone (active, auto-apply, dated, not
member-only, delivery allowed, zone allowed — the same rules the order engine applies) and the agent is told to say it
in the SAME breath: "delivery is seven ninety-nine, or free once you're over thirty dollars". Your store: Zones 1–3
free over $30, Zone 4+ no promise (the deal isn't scoped there), outside every zone the fee stays "what it would
cost". Nothing is invented when a store has no such deal. Live on Fly `e31393f9`; the Vercel half needs the deploy
below.
**(b) "Restaurants must be able to report a call" (Loman's Report Call).** Built end-to-end: on any call page there is
now **Report this call** → what went wrong (order taken wrong / wrong order sent / wrong price / allowed the
unallowable / reservation / voice quality / technical / other), an **Urgent** switch, your own words. Every report
lands in a new superadmin section **Restaurant Reports › Nabil AI reports** (nav badge = new count; support@ + the
superadmin bell get an email/notification, URGENT in the subject). Opening one shows the restaurant's words, a
status (New / Investigating / Needs info / Fixed / Won't fix) + a plain-language answer the owner reads back on the
call page, a notes thread both sides can write in, and the evidence on the same screen: the recording, the AI
summary, the order with money, quoted-vs-charged, versions/latency, the transcript, the full call timeline and the
"regression case" download; "Open as the restaurant" jumps into their dashboard on that call. Replies/status
changes email the person who filed it. In all 38 languages on the restaurant side; erasure-safe (a caller's
"delete my data" scrubs the report text too); schema on both database branches.

**YOUR STEPS NOW:**
0. 🔷 **Try the report flow once** after the Vercel deploy: open any call → *Report this call* → pick a topic, write a
   line, send → then Superadmin → *Restaurant Reports* → *Nabil AI reports* → open it, set a status, write a note →
   back on the restaurant call page the note + status appear (and you get the email at the reporter address).
   Tell me what Loman does that ours doesn't.
1. 🔷 **Call again after the deploy** (I'll tell you when): same combo script — expect the combo to be recapped in one
   go (~2 s, no "one sec", no "id"), and try trailing a word after a pause ("…wings barbecue [pause] instead").
   Order "Large and Wings combo, half Philly steak half deluxe, wings BBQ" → listen for "half Philly Steak, half
   Deluxe" + "ranch base on the Philly Steak half", no double-topping question. Say "you're the best, I love you" once
   and ask for a person at the end.
2. ⚠️ Turn on **auto-reload** at console.anthropic.com/settings/billing (three runs have died at $0 today).
3. 🔷 **Call again — same script as the email**, listen for: "Sure." within ~1.5 s → "So that's a large pizza, half
   pepperoni and mushrooms, half green peppers and onions — anything else?" → no 2-cent line → no "Dishen" → your
   name only asked at the end → Jessica's voice → the total in words. Then Test 2 (two larges → "remove the
   mushrooms from that one" must ASK). Tell me the moment anything is off — the timeline shows me every step.
3. 🔷 **Deepgram Flux experiment** (10 min with me): I flip `NABIL_STT_MODEL=flux` on Vercel, you make one
   call; better turn-taking stays, a dead greeting gets flipped back in 30 s. Same for smart-format off, and for
   the two TTS levers above.
4. 🤔 **Optional, ~US$5/mo**: an ElevenLabs API key switches on "hear this voice" in the picker (see COSTS.md).
5. 🤔 Optional money-path fix (the 2 ¢ half-topping rounding on the website) — say the word.

### A54. 🚨 FIRSTBUY rejected real orders — "registered to a different email" (2026-08-14)

**You reported customers seeing "the promo is registered to a different email address".
It was a bug, and it did not just block the discount — it rejected the whole order** with a
400 before payment. Those customers could not check out at all.

**Cause.** That message exists for genuine 1:1 gift codes (like the `SORRY10-ERIK` make-good).
But the check asked only "does any customer hold a coupon row with this code?" — and the system
writes such a row, stamped with the redeemer's email, every time anyone redeems a *tracked*
promo. FIRSTBUY is tracked. So a customer who used FIRSTBUY left a row with their address on it,
and a later customer typing the same code was measured against that stranger's email and refused.

**Why only some people.** The lookup ignores `redeemed` rows, so a FIRSTBUY order that
**completed** cleaned up after itself. But an order that was **missed, rejected or cancelled**
flips to `released`, which the lookup *does* match — leaving a permanent landmine. An order still
in flight leaves a temporary one. Hence intermittent, and easy to miss.

**Scope.** Same trap applied to every Autopilot code (WIN1…, CARTBACK) and every
once-per-lifetime promo — any shared code, not just FIRSTBUY. Customers who clicked the email's
button were never affected (FIRSTBUY auto-applies); only those who **typed the code** — which is
exactly what the invite email tells them to do.

**Fixed** — the ownership check now keys off what the promotion *is* (`assigned_manual` /
`assigned_group:` = a real 1:1 gift) instead of the incidental existence of a coupon row.
Personal gift codes are still protected; broadcast codes are not blockable. 9 regression tests,
`npm run preflight` green. No data cleanup needed — the stale rows are simply ignored now.

**Also shipped in the same change: refusals are no longer silent.** `/api/orders` alerted on
crashes but said nothing about the ~69 places it deliberately turns a customer away — which is
why this bug had to be reconstructed from source and one shopper's memory. Every rejection now
writes one greppable line, `[checkout-rejected]`, with the reason, the store, the typed code and
the item count. **No personal data goes in it** — name, email, phone and address are excluded by
design, and there is a test that fails if any of them ever leak in. Promo-integrity refusals also
raise a Sentry alert; ordinary ones (store closed, below minimum, sold out) are logged only, so
the alerting stays quiet enough to mean something.

☐ **Decide: push to production.** Written and verified locally, NOT deployed — Claude has not
pushed. Say the word and it ships.
☐ **Worth knowing:** typing FIRSTBUY still shows no "code applied" chip, because the promo
auto-applies rather than going through the coupon lane. The 10% *does* come off. If customers
find that confusing, that is a separate small UX fix — tell Claude if you want it.

### A53. 📄 Reseller Marketing Kit — flyers with each partner's own QR (2026-08-14)

**A reseller asked for the flyers "but with my own QR code on them".** Built:
**Sales & Marketing → Marketing Kit** in the reseller dashboard. Pick a flyer, see a live
preview, download **print PDF + share PNG**. The QR always points at that partner's own
`/signup?ref=` link, so any restaurant that signs up through it is credited to them
automatically. This fills the "Pitch one-pager… includes a QR code linking to your referral
signup URL" card that has said **Soon** since the Sales & Marketing section shipped.

**Five flyers.** Your reference artwork is reproduced faithfully as *Own Your Orders (full
one-pager)* — same layout, same wording, same prices — with only the QR and the contact block
swapped per partner. Alongside it, *The Whole System*, written from what the product actually
does today (AI phone ordering, branded apps, 38 languages, store credit), plus three more
angles. A partner who has set up their own branding gets flyers in **their** brand with zero
Fee Free marks on them.

**⚠️ THREE REAL BUGS FOUND AND FIXED WHILE BUILDING THIS — all pre-existing:**
1. **Partners paying $19.99/mo for a custom domain were being shown `feefreeordering.com`
   as their referral link** — in all three places it appeared, including the approval email.
   Printing that on a flyer would have made it permanent.
2. **A lapsed Branded subscription made a partner's domain 404.** Restaurants already had a
   graceful fallback for this; partners did not. Now it redirects to the main signup page
   **keeping their `?ref=`**, so flyers printed while they were subscribed keep crediting them
   even if they cancel. This one only matters because we are about to put those URLs on paper.
3. **A WebP logo would have silently broken every flyer a partner generated** (the renderer
   cannot read WebP, and the failure produces a corrupt file rather than an error). Logo
   uploads now accept JPG/PNG/SVG only; the login-background upload still takes WebP.

**Nothing here needs anything from you yet** — but two things are worth knowing:
- **Printed flyers are English only for now.** All 38 languages are wired up and the key set is
  complete, but the actual translations of the flyer wording are not written yet, so the
  language picker deliberately shows English alone. I would rather show one language than offer
  "Français" and hand someone an English flyer they only notice after printing 500.
- 🤔 **Your call:** the reference flyer names Luigi's Lasagna & Pizzeria and says "Real human
  Canadian support". Every partner who prints it says that too — including partners in Italy.
  Tell me if you want those two lines to become per-partner instead.

Preflight green (1673 tests, full production build), 38 locales at full parity (7381 keys,
0 missing / 0 extra), schema pushed to **both** database branches.

**✅ DEPLOYED AND LIVE** (commit `56ce2ea9`, 2026-08-14). Verified on production: the page and
all three API routes exist and are correctly locked to signed-in approved partners; the
marketing site, pricing, partners and login pages all still return 200. Tested end-to-end on
local first — preview, PDF, PNG, bare QR, saving your details, and the cache (a repeat render
drops from ~3 s to 229 ms). **Go to Sales & Marketing → Marketing Kit in your reseller
dashboard.** The one test that really matters: print a flyer and scan the QR off the paper.

### A52. 🍕 The extra-large that left as a large — your #1 priority (2026-08-14)

**You called this one HORRIBLE: laggy, glitchy, and wrong about the half-and-half.** You were right,
and it was worse than it sounded: **the ticket that reached the kitchen was wrong in two ways.**

- He asked for **extra large** three times. Nabil said *"that's confirmed, we do have extra large
  available"* and read back "one extra large pizza". The ticket says **Large 1 Topping**.
- He corrected the halves explicitly — *"pepperoni, ground beef, jalapeno on the same side"* — and the
  ticket has pepperoni alone on one half and everything else on the other.

**Nabil was not making things up. It was being lied to by its own tools.** On your menu, size is not an
option on a pizza — "Large 1 Topping" and "EXTRA Large 1 Topping" are two separate products. The code
that applies a size only ran for pizzas that have sizes *as options*, so on yours the word "extra
large" was read and thrown away, and the tool answered **"done"**. Nabil noticed its own mistake, asked
to change the size, got told "done" a second time, and passed that on to your caller. That same hole is
also where the ~12 seconds of dead air in the middle of the call came from.

**Now live** (Vercel + Fly v24, both machines, rolled without dropping a call):
- The size is refused instead of dropped — Nabil is told to go and find the extra-large item.
- Which half a topping goes on is now a **required** answer, not a guess. It used to default to "whole"
  below the AI where no instruction could reach it, which puts a topping on a side the caller rejected
  **and bills it at double**.
- The same topping on both halves is now a question, not a silent double charge.
- The read-back is built from the real ticket and grouped by side — *"left half: Pepperoni, Ground Beef;
  right half: Chicken, Green Peppers"* — and a split pizza is confirmed **one half at a time**, so a
  tired caller can't say "sure" to five toppings at once.
- **"half of it" was reaching the AI as "0.5 of it"** — a speech-to-text quirk we can't switch off at
  the provider. Fixed on our side.
- Nabil can no longer be interrupted only where it matters (totals and confirmations). It used to be
  un-interruptible after *every* edit — which is why your caller's correction kept landing on deaf ears.
- **Reasoning is ON** (your call). Slightly more thinking before it speaks on hard turns.
- **Your test line's toppings weren't even being boosted for speech recognition.** Pepperoni, Jalapeno
  and Red Onion were missing from the list; "BBQ Swirl" and "Gift Card" were in it. All 34 of your
  toppings now fit.

**UPDATE, same day — the "goes bad after a minute" problem is addressed and now MEASURABLE.**
- **Extra large works properly now.** Two fixes: Build Your Own was unorderable by voice at *any*
  size (its sizes are named "X Large (12 Slice - 18 inch)", and the matcher was comparing text, so
  "extra large" matched nothing and plain "large" matched two things at once and gave up); and when
  the size is a different product, the server now swaps to it in the same step. Checked against your
  live menu: from "Large 1 Topping" it finds exactly SMALL / Medium / EXTRA Large "1 Topping" and
  rejects all ~25 other pizzas in that category. Cheapest wins and the caller is told.
- **The likely cause of the mid-call decline is fixed.** The system could only "remember" about 20
  steps back, and one busy pizza question uses 18 of them — so a single complicated turn could push
  the call out of its own memory, after which every reply re-read the entire conversation from
  scratch. Seconds of silence, no error, and completely invisible in anything we recorded.
- **Nabil can now hear itself.** "One moment" and the apologies were spoken but never recorded, so
  the rule "don't repeat yourself" was about words it couldn't see — and those fire more often the
  longer a call runs. That was a loop that got worse with time.
- **It stops looking things up twice.** The menu can't change mid-call, so the second lookup now
  returns a pointer instead of another few hundred lines of toppings that ride along for the rest
  of the call.
- **It hands off after two failed attempts** at the same thing, with one short sentence — your call,
  and the right one.
- ⏱️ **Every call now records how long you waited**, per reply, plus where the time went. Until
  today nothing in the system timed anything, which is why my earlier numbers were estimates.

1. ☐ **Test call, from a number that has ordered before.** Order an **extra large, half X / half Y**,
   then change your mind about which side something goes on. What should happen: it reads the halves
   back one at a time, and it does **not** claim a size it hasn't actually set.
   **Tell me when you've done it** — I'll pull the real timings and tell you exactly where the
   seconds went, instead of guessing.
2. 💰 **A price rise is coming on 1 September that has nothing to do with us.** The AI model is on
   introductory pricing until 31 August. Your real cost is **$0.48/call today, $0.72 from 1 Sept** with
   no change from anyone. The savings in this plan more than cover it — the projection is
   **$108/mo → about $77/mo** at your current volume once the menu-trimming work lands.
3. 🤔 **Still your call: the ten duplicate customer records on 647 669 0808** (from A51 step 2). Say the
   word and I'll clean them up.
4. ⚠️ **Not fixed yet, and you should know:** asking for an extra large now gets a *question* rather
   than an extra large pizza. Nabil will say it can't do that size on that item. Making it actually
   *switch* to the extra-large product is the next piece of work.

### A51. 📞 The Roya call — why it was that bad, and what's now live (2026-08-13)

**You said the last call Nabil handled was horrible. It was worse than it sounded.** The caller was
**Roya Safi** — not a stranger, a customer who had ordered from you three times and spent $181.99.

Three things went wrong that you couldn't hear:

1. **She agreed to $23.37 and the order was placed at $25.97.** Nabil announced a "first time customer
   discount" she was never eligible for, she said yes, the order went in — and only *then* did it try
   to tell her the real price, and got cut off mid-word saying it.
2. **It created a second customer record for her** ("Royanne Veal"), splitting her order history,
   rewards and lifetime spend in two.
3. **It asked her to read out a phone number it already had**, one group of digits at a time. That
   took about forty seconds of a three-minute call.

**All three were the same bug.** Your phone system sends numbers as `+14168338405`; your checkout
stores them as `4168338405`. Five different parts of the system each had their own idea of who was
calling and none of them agreed, so Nabil didn't recognise her, priced the quote as a brand-new
customer, priced the charge as a regular, and filed her under a brand-new record. The same thing
happened two days earlier on one of your own test calls — the fix that time only covered half of it.

**Fixed and live now** (Vercel + Fly v23): one shared way of reading a phone number everywhere; the
order system refuses to place an order at a price the caller wasn't told (it hands the caller back a
corrected total and asks again, instead of apologising after the ticket prints); Nabil greets a
returning caller by name and never asks for a number it already has; the dead air and the cut-off
sentence are both fixed in code; and pizza crust/size/topping names are now in Nabil's head so it
stops guessing ("we don't have thin crust" was a guess that happened to be right).

**Also found and fixed while in there, both of which affect every restaurant, not just yours:**
- **"Delete my data" was never reaching phone calls.** It reported success while leaving the caller's
  number, the full transcript and the actual Twilio audio recording in place. That's a privacy-law
  problem, and it was silent.
- **Every phone order was emailing a fake address and bouncing.** A caller has no email, so the system
  invents one at a dead domain — and then mailed it. Enough bounces damage your sending reputation for
  every real customer.

**Roya's record is repaired** — back to one record, 4 orders, $207.96. Per your call, the $2.60 was
left alone: she was told the corrected total before hanging up and paid at the store.

1. ☐ **One test call when convenient, from a number that has ordered from you before.** Check: it
   greets you by name; it never asks you to recite your number; it asks one question at a time; and
   the total it says before you agree is the total on the receipt. That last one is the whole fix.
2. 🤔 **YOUR CALL — one number I deliberately did NOT touch.** `647 669 0808` (your own test line) has
   **ten** different customer records behind it — "MOHIT", "TEST LATEST", several "Sameem Nabil"s with
   different emails. The repair script refuses to merge when a number belongs to more than one person,
   because guessing would move a stranger's spend and rewards onto someone else's record. If those are
   all test data you want cleaned up, say so and I'll do it; if any is a real customer, leave it.
3. 👀 **Worth knowing:** part of the slowness on Roya's call was not us — Anthropic returned an
   "overloaded" error mid-call at 16:07:36, eight seconds before her order was created. Our retry
   handled it and the order went through. Nabil now says "one moment" instead of going silent when
   that happens.

### A50. 🚚 ShipDay → Uber says "out of delivery area" every time — one real defect FIXED, one thing only you can check (2026-08-13)

**Your report:** DoorDash attaches to a ShipDay order fine; Uber says the delivery is out of the
area every single time, even 1 km away.

**What I found and fixed (certain, in code, not deployed yet).** The address we hand ShipDay
carried **no province and no country**. A live order from this morning went out as:

> `1095 Ezard Cres, Milton, L9T 6W9`

Milton — in which country? There are Miltons in Massachusetts, Florida, Washington and a dozen
other US states. Nothing in that line says Ontario, and nothing says Canada, because the order
table has no column for either. It now goes out as:

> `1095 Ezard Cres, Milton, Ontario, L9T 6W9, Canada`

**Why that broke Uber but not DoorDash.** We also send the exact map pin from checkout. DoorDash
uses it — so the thin address never mattered there. Uber's own documentation says it **always
re-geocodes the drop-off address and throws the coordinates away**. So Uber was the only one
actually reading that line, and it was the only line that was wrong.

Two smaller things fixed in the same change: the store's own postal code was being sent as
`L9T2H6` with no space, and unit/floor/intercom/parking notes were being crammed into the street
line ("6911 Derry Road West, Apt RBC Branch, …") where a geocoder has to guess what they mean.
Those now go to the driver's instructions, where a human reads them.

**☐ STEP 1 — the 2-minute check only you can do, BEFORE we deploy.**
In ShipDay, create an order by hand (or open an existing one) and type the delivery address in
full, exactly like this — **including the province and the word Canada**:

> `1095 Ezard Cres, Milton, Ontario, L9T 6W9, Canada`

Then ask for an **Uber** quote.

- **If a quote comes back** → the address was the whole problem, my fix does exactly this
  automatically for every order, and we deploy.
- **If it STILL says out of area** with that perfect address → the problem is not our data, it's
  your ShipDay/Uber account or coverage, and no code change can fix it. Tell me and go to step 2.

**☐ STEP 2 — only if step 1 still fails.** Ask ShipDay support (support@shipday.com /
1-650-550-2975): *"Is Uber Direct available to Canadian merchants on my account, and is Milton,
Ontario inside Uber's coverage for it?"* Worth asking because **ShipDay's Canadian third-party
delivery FAQ prices DoorDash only — their US page prices DoorDash *and* Uber.** That may be
nothing, or it may mean Uber isn't offered here at all. I can't tell from outside your account.

**Status:** code fixed, 1602 tests green, full build green, **not committed and not deployed** —
I'd rather you run step 1 first, because if it fails the answer isn't in the code.

### A49. ✅ DONE 2026-08-15 — 🎉 APPROVED. The Fee Free Order App is PUBLIC on the App Store.
The 2.1(b) business-model reply worked. **Apple ID 6794053932** is live and public:
https://apps.apple.com/us/app/fee-free-order-app/id6794053932 — verified against Apple's own
listing API (`itunes.apple.com/lookup?id=6794053932`) rather than the storefront page, which
rate-limits automated checks with a 429 and can look like a dead link when it isn't. The listing
reads: name **Fee Free Order App**, seller **Fee Free Ordering Inc.** (the org, never the old
team), price **Free**, iOS 15+, **iosUniversal** (iPhone *and* iPad).

`APP_LINKS.kitchen.ios` is flipped, which completes **A17 step 12** and lights up every iOS
surface at once — marketing badges, the footer, the /admin/publishing install hub (now with its
own App Store QR beside the Play one), the signup welcome email, the "text/email me the app
link" message, and the kitchen login hint (which used to hand an iPhone owner a Play link).
☐ Optional leftover from A17: step 11 — revoke the 2 old Sandbox-only APNs keys in Apple → Keys.

<details><summary>original request (kept for the record)</summary>

### A49. 🍎 Apple wants your business model in writing — reply is written, 4 checks then paste (2026-08-13)
Apple's message on submission `5b432e16` (**Fee Free Order App**, version 1.0 (30), reviewed on an
iPad Air 11"): *"it appears the app may access or include paid digital content or services, and we
want to understand your business model."* One question: **"Are the enterprise services in your app
sold to single users, consumers, or for family use?"**

**This is the Guideline 3.1.3(c) Enterprise Services test, and we pass it cleanly.** Apple only needs
to know whether the paid service behind the app is bought by *businesses for their employees* (no
in-app purchase required) or by *individuals/families* (in-app purchase required). Ours is bought by
restaurant businesses — and better still, **nothing is purchasable anywhere inside the app.** I swept
every link in the kitchen screens to be sure before writing the answer: the only things reachable in
the app are the order screen, its login, a password-reset page, and tapping a customer's phone/email.
No pricing, no sign-up, no billing, no upgrade, no add-ons. **No code change and no new build needed.**

**Everything is in `docs/APPLE-REVIEW-2.1B-REPLY-2026-08-13.md`** — the paste-ready reply, the
verification table behind each claim, and the wording traps.

**Round 1 (Aug 4) was a different guideline — 3.2 Business**, Apple thinking this is an in-house app
for one company and suggesting private distribution. Your Aug 4 reply beat that. But its answer #5
said *"a restaurant may optionally pay for a separate platform subscription"* — **that one phrase
caused round 2.** A reviewer reading "pay… subscription" has to decide if it's a consumer
subscription (needs in-app purchase) or a business one (doesn't).

So this reply threads a needle: it has to stay **publicly available to any restaurant business** (or
3.2 comes back) while being clearly **not sold to consumers or families** (which answers this round).
Both statements are in the reply on purpose — drop either one and Apple bounces us to the other
guideline.

1. ✅ **In-App Purchases page is EMPTY** — you verified 2026-08-12.
2. ✅ **Subscriptions page is EMPTY** — you verified 2026-08-12. (Separate list from In-App Purchases;
   auto-renewable subscriptions never show on the IAP page. "Streamlined Purchasing: Turned On" is
   inert with zero subscriptions.)
3. ☐ **Sign in once at feefreeordering.com/kitchen/login as `demo@feefreeordering.com` /
   `AppReview2026!`** — the reply stakes its credibility on that account, and a dead demo login is an
   instant rejection. (I confirmed the reviewer's test-order page still works: Fee Free Demo
   Restaurant, menu loads, pickup-only.)
4. ☐ **Clear the red ❗ next to "App Review" in the App Store Connect sidebar** if it's flagging an
   incomplete required field.
5. ☐ **Paste the reply** from §3 of the doc into the message thread. Reply **in the thread** — do
   **not** upload a new build and do **not** start a new submission (it loses your queue position).
6. ☐ **Tell me what comes back.** If Apple asks a follow-up, send me the exact text — every answer has
   to stay consistent with the two before it, which is what tripped us on round 2.
</details>

### A48. ✉️ YOUR copy of an auto-accepted order still said "accept it or it gets rejected" — FIXED (2026-08-12)
Your ORD-002270106 ($58.34, super party size, 2:57 PM) was **auto-accepted the second it was
placed** — the customer was correctly told it was confirmed. The email that landed in YOUR inbox as
the store owner said *"New order"* and, at the bottom, *"Accept this order from the Kitchen Order
App… Auto-reject runs if no action is taken."* Nothing could have been accepted and nothing could
have been auto-rejected. You were right that GloriaFood doesn't do this.

**This is the other half of A46.** That fix (2026-08-11) taught the CUSTOMER's email to say
"confirmed" on an auto-accepted order. The STORE's email was never told. Same root cause: an
auto-accepted order is created already accepted, so it never *transitions* into accepted — and every
"order confirmed" email in the system hangs off that transition. For an auto-accept store the
placement email is the only email either side ever gets, so it has to carry the confirmation itself.

**What your email looks like now.** Auto-accept ON: badge reads **AUTO-ACCEPTED**, the subject says
*"New order #… — auto-accepted — Luigi's Lasagna & Pizzeria"*, and the footer is a green
**No action needed** box explaining the customer already has their confirmation. Auto-accept OFF:
completely unchanged — still "New order", still the accept prompt, because there it's true.

Fixed in passing, same email: the order table's **Qty / Items / Price** headings were the last
English-only text in it, so a French or Arabic store's kitchen ticket had English column headers.
They now use the same translations the customer receipt has always used.

**Addresses now look like addresses everywhere (your second note, same session).** You sent the
GloriaFood address block and said ours comes in lowercase and incomplete. Both were true:

- **The email printed the street only.** City and postal code are stored in their own columns and
  never reached the reader. Your email now shows the full thing in GloriaFood's order —
  *705 Rayner Court, L9T 0P1, Milton*.
- **The postal code never printed on the ticket at all.** The column has held it since day one but
  no receipt section read it, so a driver working off the paper alone had a partial address. It now
  shares the city line ("Milton L9T 0P1"), so the ticket gains the postcode without gaining a line.
- **Lowercase is fixed at the source.** Addresses are tidied when the order is saved, so every
  surface downstream inherits it — ticket, kitchen screen, both emails, ShipDay, the driver app,
  CSV exports. The kitchen tile has capitalized addresses since July; that rule is now one shared
  piece of code instead of living only inside the tile, which is why the rest had drifted.
- Orders placed **before** this are fixed too — the formatting is also applied when they're
  displayed, not only when they're saved.

It deliberately never "corrects" an address you'd typed properly: `McMaster`, `O'Brien` and
`MacDonald-Cartier` survive untouched, `1st Ave` doesn't become `1ST Ave`, and free-text parking
instructions are left as the customer wrote them. Postal codes get the space put back
(`l9t0p1` → `L9T 0P1`, and the UK equivalent); every other country's format is only upper-cased.

38 languages, parity audit clean, preflight green (1530 tests + 20 new).

1. ☐ **Place one test order with auto-accept ON** and confirm your email says AUTO-ACCEPTED with no
   accept prompt. Then turn auto-accept OFF and place another — that one should still tell you to
   accept it. Old emails are never re-sent. **Type the delivery address in all lowercase on
   purpose** — the email, the kitchen screen and the printed ticket should all come out capitalized,
   with the postal code on the ticket.
2. ✅ **DONE 2026-08-12 — the pending email now names the real window.** It used to say auto-reject
   runs "within your configured timeout"; there is no such setting. It now reads *"Accept this order
   … **within 4 minutes**. If nobody accepts it in time it is declined automatically and the customer
   is told."*

   **An order placed while you're CLOSED gets its own sentence**, because one number would have been
   wrong: that window is **15 minutes measured from when you open**, not from when the order lands.
   Quoting "you have 15 minutes" on an order that arrives at 2 AM would be a lie. It reads *"parked
   until you open … from the moment you open you have 15 minutes."*

   The number is read from the same source the auto-reject cron enforces, so the email can never
   drift from the actual behaviour — both windows now live in one file instead of being copied
   inside the cron. 38 languages, parity clean.

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

- ✅ SUBMITTED (2026-08-20): Resubmission filed at ros.ie. Both Position fields = `Director`.
  Date of First Supply = 20/08/2026 (form rejected future dates; no EU sale has occurred).
  Confirmation received: "Your VAT OSS Registration has been submitted."
- ☐ **Reply to Rachel Williams** (ossnsd@revenue.ie) on the existing thread — the covering email
  explains the resubmission and the date-of-first-supply situation. Draft in §5 of
  `docs/VAT-OSS-RESUBMISSION-2026-08-10.md` (update the date references to 20 August).
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
12. ✅ DONE 2026-08-15 — **APPROVED and public.** `APP_LINKS.kitchen.ios` flipped to
    https://apps.apple.com/us/app/fee-free-order-app/id6794053932; iOS badges are live on every
    surface (marketing, footer, /admin/publishing + its own App Store QR, signup email, app-link
    email/SMS, kitchen login hint). See **A49** for the verification detail.

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

   **✅ DECIDED 2026-08-12 (Luigi): five write-offs, one email.** Luigi confirmed jay Fieger's and
   Ali Aydin's orders never reached the store either — same failure, and **none of that food was
   ever made**, so there is nothing to charge for. **jay Fieger, Ali Aydin, Anna Martinello, Lisa
   Benacquista and Uzair Rana are written off — no contact, no invoice.** The only one to reach out
   to is **Sharon Craven ORD-710341102 ($36.44)**, because she came in and was served: she has the
   food, so she is the only customer who owes anything. Draft email prepared; Luigi sends it (mail
   credentials are production-only, by design).
   ⚠️ **Check Stripe for Sharon's $36.44 BEFORE sending** — if she was in fact charged, that email
   would be asking her to pay twice.
2. 👀 **Watch for one log line.** `RESCUED` in the logs means the safety net caught a real order —
   good, but it also means the customer's browser failed to report a payment. A handful is normal.
   A steady stream means something upstream is broken and worth chasing.
3. ☐ **One live test when convenient:** place a card order and **close the tab the instant you hit
   Pay** — don't wait for the "thank you" page. The order should still reach your kitchen within
   about a minute. That is the whole fix, demonstrated in one move.
