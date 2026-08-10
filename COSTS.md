# COSTS.md — Fee Free Ordering: every dollar going OUT, tracked monthly

**Scope (Luigi, 2026-08-01): PLATFORM ONLY** — everything it takes to operate Fee Free Ordering
Systems completely (web app, backend, native apps, email, phone, AI, stores, domains + their
mailboxes). Restaurant-side costs (Skool, M365 info@luigislasagna.com, restaurant GoDaddy domains,
ShipDay, GloriaFood) are **out of scope and never counted** — §5 reminder list only.

**How this file works (Claude maintains it):**
- Updated the **1st of every month** (scheduled task) + whenever Luigi sends invoices. Monthly
  report = what changed, what's due, running total, **cost-saving ideas** (standing rule: always
  look for savings that don't reduce customer-facing quality).
- `✓ actual` = confirmed from a real invoice/screenshot. `est.` = published pricing. `❓` = Luigi
  to answer (§8).
- Amounts **USD unless marked CAD**. Most vendors bill USD on the Visa ••••6979 (CAD card → ~2–3.5%
  FX spread).

**Last updated: 2026-08-01 (v5 — ALL major costs now actual; cut-costs plan complete + PARKED, see §6 status). Next update due: 2026-09-01.**

---

## 0. Payment health — ✅ RESOLVED 2026-08-01

Neon $42.65 (July) and Google Cloud ≈CA$44.04 — both **settled by Luigi 2026-08-01** after the
Visa ••••6979 declined at both vendors ("insufficient funds"). Watch: the same card also backs
Sentry (bill Aug 7) and Resend (renews Aug 23). Standing advice: keep a ~$250/mo buffer behind
this card, or move platform autopays to a dedicated card — a decline can suspend the prod DB.

## 1. Monthly recurring — platform

| Service | What it does here | Monthly now | Status |
|---|---|---|---|
| **Neon Postgres** | The database (dev + prod) | **✓ $42.65** (Jul) | Paid Launch plan since ~Jun. 95% = compute (402 CU-hr @ $0.106) — top savings target. Instant-restore history ≈ 0 GB → PITR "undo" effectively OFF; enabling 7–14d costs pennies. |
| **Sentry** | Error monitoring | **✓ $35.72** next bill Aug 7 ($29 Team plan + $2.61 PAYG + $4.11 HST) | ⚠️ **Using 501 of 50,000 included errors (1%)** — the free Developer tier includes 5,000. **Prime downgrade candidate → $0** (§6.1). |
| **Google Cloud — a Compute Engine VM, NOT Maps!** | ⚠️ SKU report 2026-08-01: the ENTIRE ≈CA$44/mo is an **E2 VM (~e2-medium, 4GB) running 24/7 in Toronto** in project "LUIGI'S" (ID deft-axon-275618) — running since ~mid-May (Apr–Jul invoice total US$113.44: cores $62.24 + RAM $33.36 + disk $3.88 + snapshots). **FeeFree does NOT use any Google VM** (we run on Vercel+Neon) → likely an orphan = §6.4 biggest easy cut. Google's own FinOps panel says "save up to $37.97" — an idle-VM signal. | **✓ ≈CA$44/mo** (Jul CA$44.68; Aug forecast CA$41.45) ≈ US$32 | ❓ IDENTIFY the VM before touching anything (§6.4). Billing acct "My Billing Account 2" accessed via **iclixadmin1@gmail.com** (Sameem Nabil, authuser 2); "fee-free-ordering" project under luigislasagna1@gmail.com = empty shell, no billing. |
| Google Maps Platform | Places autocomplete, delivery zones, ETAs — platform key | **✓ ~$0** — within Google's free per-SKU caps (no Maps line in "largest charges") | The original assumption was right after all; no Maps optimization needed. Watch as traffic grows. |
| **Vercel Pro** | Hosting, 22 crons, serverless, DNS | **✓ $27.13 infra** last cycle (Jun 18–Jul 18) + ❓ whether the $20/seat is billed on top | ⚠️ Biggest single line: **Observability Events 10.52M = $12.62** — likely redundant with Sentry (§6.2). Fluid CPU $6.35 + invocations $3.16 (kitchen 4s poll + crons). |
| **Resend** | Every email, all restaurants, ×38 locales | **✓ $20.00** (Transactional Pro 50k, renews Aug 23; Marketing $0; billing → luigislasagna1@gmail.com) | Keep — free tier's 100/day cap would drop order emails on busy days (§6.5). ❓ actual monthly send volume. |
| **Twilio** | Missed-order robocalls, SMS, 3 numbers (added +1 365 658 1458 = Nabil AI pilot line, 2026-08-09) | **✓ ~$4/mo base + $1.15/mo Nabil number + per-minute ConversationRelay usage (STT/TTS billed through Twilio; watch first full month)** | Pay-as-you-go off a prepaid balance, auto-recharge ON — the "bill" is balance top-ups, not invoices |
| Twilio — **call recording** (Nabil AI, 2026-08-10) | Records Nabil calls when the owner enables `recordCalls` (consent line auto-added to the greeting); powers the dashboard audio player | ~$0.0025/min recording + ~$0.0005/min-month storage — pilot volume ≈ negligible (<$1/mo) | Platform-paid on the same prepaid balance. Recordings are DELETED at Twilio on data-erasure requests (src/lib/data-erasure.ts), which also keeps stored-minute costs from compounding |
| **Fly.io** | Nabil AI voice service (`nabil-voice`, 1× shared-cpu-1x 512MB always-on in iad; deployed 2026-08-09, scaled from 2→1 machines same night) | ~US$5–7/mo est. + egress | Card on file (Luigi, 2026-08-09). ❓ confirm first invoice; scale-to-zero NOT possible (live calls hold a WebSocket) |
| **Anthropic API** | AI menu import, report AI, **+ Nabil AI phone agent (2026-08-09, per-call LLM tokens — est. $0.02–0.10/call)** | ~$2–10/mo est. today; watch first full Nabil month | **✓ $20.37 credit balance, auto-reload ON (Visa •6979), 2026-08-09.** Aug spend so far $0.03. Nabil economics: token cost per call is cents vs $99/mo per store — margin is fine, but re-estimate here once real call volume exists. Dedicated key `nabil-voice` (Fly secret), separate from the app's key. |
| **Claude — Max 20x plan** | Builds + operates the platform (counted as platform cost per Luigi) | **✓ CA$316.40/mo** (Jul 16 invoice; US$200 plan + FX + HST; renews Aug 16, pays via Stripe Link) | **THE single biggest cost** — bigger than Neon+Google+Sentry combined. History shows tier climbing with the project: May CA$28+121, Jun CA$140→184.81 (5x→20x upgrade), Jul CA$316.40. Savings check = §6.7: Usage page headroom vs the $100 5x tier. |
| **GoDaddy email** (mailboxes on the 3 platform domains) | Receiving support@/admin@ etc. | **❓** | Luigi confirmed GoDaddy email exists for the platform domains — ❓ which plan + how many mailboxes |
| GitHub | Code hosting | **✓ $0** (GitHub Free + Copilot Free, $0 metered) | confirmed free |
| Tawk.to + Calendly | Support chat / demo booking | **✓ $0 both** (Tawk: no add-ons purchased; Calendly: Free plan) | confirmed from dashboards 2026-08-01 |
| Upstash / Codemagic / FCM+APNs | rate-limit / iOS builds / push | **$0** | free tiers (Codemagic: ❓ confirm personal account) |
| SerpAPI | Rank tracking | **$0** — key never set | 💤 would start ~$75/mo; decide deliberately |
| BMO business account | Banking | **❓ ~$0–25 CAD** | ❓ |

**Platform monthly with actuals: ≈ US$385–415/mo (≈CA$530–570)**
= Claude CA$316 (≈US$229) + Neon $42.65 + Sentry $35.72 + Google VM ≈$32 + Vercel $27–47
+ Resend $20 + Twilio ~$4 + Anthropic API ~$5 (+ GoDaddy email ❓).
**Claude is over HALF the bill.** Every attached service is now confirmed with a real number.
**§6 plan target: ≈ US$150–230/mo** depending on the Claude-tier and VM outcomes.
**After the §6 savings plan: realistic target ≈ $70–100/mo — roughly half — with zero
customer-facing quality loss.**

## 2. Annual — platform

| Item | Cost | Next due | Status |
|---|---|---|---|
| **Apple Developer — OLD team** | **✓ C$119/yr** (billed CAD, not US$99) | ✅ VERIFIED renewed to **2027-08-03** (checked 2026-08-01) | Auto-renew OFF = intentional: lapse at Aug 2027 AFTER Kitchen migrates to the org (–C$119/yr); calendar the migration first |
| **Apple Developer — ORG** | $99/yr | ~2027-07 | lapse the OLD team ~Aug 2027 AFTER Kitchen migrates (–$99/yr) |
| Google Play Console | $25 one-time | — | ✅ done forever |
| Accounting: corporate T2 | ~CA$500–1,500/yr | ❓ | ❓ |
| EU VAT OSS agent (once A31 lands) | €0–1,500/yr | Q3 return due Oct 31 | resubmission in progress |

### 2b. Platform domains — ALL at GoDaddy (Luigi confirmed 2026-08-01)

| Domain | Role | Cost | Status |
|---|---|---|---|
| **feefreeordering.com** | THE platform: app, APIs, apps point here, Resend sending domain, restaurant subdomains (DNS at Vercel — never flip nameservers, A27) | ❓ (~CA$22–25/yr typical GoDaddy .com renewal) | ❓ renewal date + price |
| **feefreefood.com** | Consumer marketplace | ❓ | ❓ renewal date + price |
| **restaurantownerlogin.com** | White-label reseller login | ❓ | ❓ renewal date + price |

+ **GoDaddy email plan(s) attached to these domains** (§1) — ❓ plan + mailbox count + price.
💡 One GoDaddy screenshot solves all of this: **Account → Renewals & Billing** shows every
product, price, and renewal date on one page.
Not ours: town.club (competitor). Restaurant vanity domains are restaurant-owned.

**Annual subtotal: ≈ $250–300/yr + GoDaddy renewals ❓.**

## 3. Proportional to revenue (not fixed)

Stripe ~2.9% + 30¢ (+0.5–0.8% Billing) on platform revenue · Stripe Tax ~0.5% once EU VAT enabled
· chargebacks ~$15 each · FX ~2–3.5% on USD bills · driver pay = pass-through (PAUSED, A23 gate).

## 4. Future cost cliffs ($0 today)

Driver-pay legal stack (A23: CRA payroll, payroll SaaS, lawyer, WSIB 10-day rule, commercial auto
insurance) · tech E&O/cyber insurance ~CA$1–3k/yr at scale · trademark (CIPO ~$450–700/class) ·
app-store cut only if in-app sales ever launch (get Apple Small Business 15% first).

## 5. OUT OF SCOPE — restaurant-side reminders (never counted)

Skool · M365 info@luigislasagna.com · GoDaddy restaurant domains ×4 · ShipDay usage ·
platform self-subscriptions (wash minus ~$1.50 Stripe cut) · Luigi Bucks goodwill
(✅ the feared "$5/day Schedule Tester leak" was ALREADY CLEANED — verified on prod
2026-08-01; the only live schedule is the INTENDED monthly $20/member VIP-club credit,
funded by their US$10/mo Skool subs — fired correctly Aug 1 for 8 members) ·
**GloriaFood ✅ CANCELLED by Luigi 2026-08-01 — final day Aug 8, 2026** (the old Milton site's
last vendor tie is cut; ❓ what was it billing monthly, for the record?) · tablet replacement someday.

## 6. 💡 THE SAVINGS PLAN (consolidated 2026-08-01 — Luigi: "we'll do them together")

**Luigi's rule (2026-08-01): anything we do must only IMPROVE the service — nothing may slow or
block it.** Every item below is either pure billing (zero runtime effect) or makes the product
faster/safer. Anything with even a theoretical performance edge is marked ⚡ and gated on data +
instant reversibility.

Dashboard-only, ~30 minutes together:

1. **Sentry: downgrade Team → Developer (free). Saves $35.72/mo — the single biggest cut.**
   Usage is 501 of 50,000 errors (1%); the free tier includes 5,000 (10× headroom). Free tier
   keeps error capture + email alerts (money-path alerts still fire). Trade-offs we accept:
   1 user seat, 30-day retention, 1 cron monitor. Settings → Subscription → Manage plan.
2. **Vercel: kill the $12.62/mo Observability Events line.** 10.52M events — Sentry already owns
   error monitoring, so paid Vercel observability is double coverage. Check Observability tab →
   disable Observability Plus / turn ingestion to included-only. Saves ~$8–12/mo.
3. **Neon: three console switches.** (a) confirm the DEV branch auto-suspends — zero prod impact,
   pure savings; (b) turn ON 7-day instant restore (~pennies — ADDS cents but buys the database
   "undo button" = pure safety improvement); (c) ⚡ autoscaling floor: look at the current min CU
   vs actual load first — lower it ONLY if there's clear headroom, and revert instantly if
   response times move. The big, risk-free Neon cut is #6 (the cache makes pages FASTER).
4. **The mystery VM — identify, then retire. Potential: the ENTIRE ≈CA$44/mo.** The SKU report
   proved the Google bill is a 24/7 E2 VM in Toronto (project "LUIGI'S"), NOT Maps — and FeeFree
   runs entirely on Vercel + Neon, so no FeeFree feature depends on it. Google's own advisor
   flags ~$38/mo of waste (idle-VM signal). Steps, strictly in order: (a) Menu → Compute Engine →
   VM instances → read the instance NAME + external IP (tells us what it is); (b) Claude checks
   what the IP actually serves before anything is touched; (c) if confirmed orphan: **STOP** the
   instance (reversible — data kept, billing for compute stops); (d) wait ~1 week; nothing
   breaks → delete instance + disks + snapshots + release any static IP. Never skip (a)–(b).
5. **Resend: keep the $20 plan** (deliberate non-saving): the free tier's 100-emails/DAY cap
   would silently drop order confirmations on any busy day — not worth $20. Revisit if volume
   data says otherwise (open Usage tab while we're in there).

Code changes (Claude builds, we verify together):

6. **The order-page cache (30–60s per restaurant)** — the July 30 evaluation's #1 scalability
   fix, now with a price tag: it removes ~18–25 DB queries per customer visit, directly cutting
   Neon compute ($42.61 line) AND Vercel Fluid CPU/invocations. Expected: Neon → ~$20–25/mo.
7. **Claude tier check — potential ~CA$150/mo, decided by data.** Now confirmed: Max 20x,
   CA$316.40/mo. Check claude.ai → Settings → **Usage** over a normal build week: if we rarely
   approach the 5x tier's limits → downgrade to Max 5x (≈CA$160 incl. tax, –CA$150/mo),
   instantly reversible if we ever hit the ceiling. If usage rides the limits → KEEP 20x; a
   throttled build session violates the never-slow-us rule and costs more than it saves.
   (Maps code fixes were dropped from this plan — the SKU report proved Maps ≈ $0 already.)
8. Later: **delta/ETag on the kitchen 4-second poll** — cuts function invocations + DB hits at
   the source. Do after 6–7.

Calendar / banking:

9. **Aug 2027: let the OLD Apple team lapse** after Kitchen migrates to the org (–$99/yr).
10. **USD card for USD vendors** (Neon, Vercel, Sentry-if-kept, Resend, Twilio, Anthropic) —
    kills the ~2–3.5% FX spread (~$4–6/mo now).
11. Keep a ~$250 buffer behind whatever card backs the autopays (§0 lesson).

**Total realistic effect: ≈US$385–415 → ≈US$150–230/mo, zero quality loss.**
Best case (VM orphan + Claude 5x fits + Sentry free + Vercel obs off + Neon cache):
–US$230/mo ≈ **–US$2,700/yr**. Even the no-Claude-change case saves ~US$80–90/mo.
#6/#8 double as the 10k-user scale prep.

**STATUS 2026-08-01: plan is COMPLETE and PARKED — Luigi paused here to work on other things.
Nothing has been changed yet. To resume, Luigi says "let's cut costs" and we execute §6 top to
bottom together (start: #1 Sentry, 5 min, –$35.72/mo).**

## 7. Spend to date — running ledger

| Date | Item | Amount |
|---|---|---|
| ~2026-06? | Google Play Console (one-time) | $25 ✓ |
| 2026-07-11 | Apple Developer renewal — old team | $99 ✓ |
| ~2026-07-16 | Apple Developer enrollment — ORG | $99 ✓ |
| 2026-07-01 | Google Cloud — June (manual payment after decline) | CA$44.38 ✓ |
| 2026-08-01 | Google Cloud — July (settled after decline) | ≈CA$44.04 ✓ |
| May–Jul 2026 | Google Cloud — the E2 VM, full period (May+Jun+Jul, incl. tax) | **CA$113.44 ✓** total |
| 2026-05-01→07-16 | **Claude subscriptions** — May: CA$28 + CA$121.08; Jun: CA$20+CA$20+CA$5 + CA$140 (Max 5x) + CA$184.81 (upgrade to 20x); Jul 16: CA$316.40 (Max 20x full month) | **CA$835.29 ✓** total to date; next renewal Aug 16 ≈CA$316 |
| 2026-08-01 | Neon — July OIXFFM-00002 (settled after failure) | $42.65 ✓ |
| ~2026-07 | Neon — June OIXFFM-00001 | ❓ |
| ongoing | Twilio — prepaid top-ups (balance $10.64 on 2026-08-01; ~$4/mo burn) | ✓ |
| Jun 18–Jul 18 | Vercel — infra usage (prev. cycle) | $27.13 ✓ (+seat ❓) |
| monthly since ❓ | Sentry Team $29+PAYG+HST (next: Aug 7 $35.72) | ❓ start month |
| monthly since ❓ | Resend Pro $20 (renews Aug 23) | ❓ start month |
| ongoing | Twilio, Anthropic usage | ❓ small |

**Documented spend to date (project start → 2026-08-01): ~US$223 one-time/annual (Play $25 +
Apple $99×2) + CA$835.29 Claude + CA$113.44 Google VM + $42.65+ Neon (invoice #1 ❓) + $27.13+
Vercel (earlier cycles ❓) + Sentry/Resend history ❓ ≈ roughly CA$1,300–1,500 all-in so far.**

**Monthly log:**

| Month | Platform infra (actual) | Annual items hit | Notes |
|---|---|---|---|
| 2026-08 | Claude CA$316 + Neon 42.65 + Sentry 35.72 + Google VM ≈CA$44 + Vercel 27+ + Resend 20 + Twilio ~4 + API ~5 → **≈US$385–415** | Apple old-team renewal ~Aug 3; Claude renews Aug 16 | ALL major lines now actual; payment failures settled Aug 1; §6 cut-costs plan COMPLETE + PARKED for a "do together" session |

## 8. Open questions for Luigi (small ones — the big unknowns are all resolved)

1. **GoDaddy**: screenshot of **Account → Renewals & Billing** — all 3 platform domain prices +
   renewal dates + the email plan in one shot. (Last meaningful ❓ in the monthly total.)
2. **Vercel**: is the $20 Pro seat billed on top of the $27.13 usage? (Vercel → Settings →
   Billing → Invoices — last month's invoice total.)
3. **Anthropic API key** (separate from the Claude subscription): console.anthropic.com →
   Billing — credit balance + actual monthly burn (est. $2–10).
4. **Start months** for Sentry / Resend / Neon paid plans + Neon invoice #1 amount (completes
   spend-to-date; receipts pages show it).
5. **Codemagic** — personal account (500 free min/mo) or Teams (no free minutes)?
6. **BMO** — monthly account fee? Any bookkeeping software?
7. **Incorporation** — one-time setup cost of Fee Free Ordering Inc.?

RESOLVED 2026-08-01: Claude = Max 20x CA$316.40 ✓ · Google bill = E2 VM not Maps ✓ (SKU report) ·
Maps ≈ $0 ✓ · Google billing accessed via iclixadmin1@gmail.com ✓ · Twilio ~$4 ✓ · Tawk $0 ✓ ·
Calendly $0 ✓ · GitHub $0 ✓ · Resend $20 ✓ · Sentry $35.72 ✓ · Neon $42.65 ✓.

---

## Update log
- **2026-08-01 v5** — THE TWO BIG DISCOVERIES: (1) **Claude = Max 20x, CA$316.40/mo actual** (invoice history CA$835.29 since May) — over half the whole bill; (2) **the Google ≈CA$44/mo is NOT Maps — it's a 24/7 E2 VM in Toronto** ("LUIGI'S" project, running since ~May) that no FeeFree feature uses (Maps itself ≈ $0, within free caps). Billing accessed via iclixadmin1@gmail.com. Monthly total finalized ≈**US$385–415**; spend-to-date ≈CA$1,300–1,500. §6 rewritten into the executable cut-costs plan (target ≈US$150–230) and **PARKED at Luigi's request** — nothing changed yet; resume trigger: "let's cut costs".
- **2026-08-01 v4** — Three more confirmed from Luigi's dashboards: **Twilio ✓ ~$4/mo** (pay-as-you-go, prepaid balance $10.64, auto-recharge ON — watch: its "bills" are silent balance top-ups), **Tawk.to ✓ $0** (no add-ons), **Calendly ✓ $0** (Free plan). Per Luigi: **Claude costs formally belong in this ledger** (main use = FeeFree) — plan amount is now the #1 open question. Infra ≈US$160–185/mo. Every attached service now has a confirmed row — the "things keep coming up" problem is what this file exists to end.
- **2026-08-01 v3** — Payments SETTLED (Neon + Google, §0). New actuals: **Sentry Team $35.72/mo at 1% usage** (downgrade → free = biggest cut), **Resend Pro $20 ✓ keep**, **Vercel infra $27.13** (Observability $12.62 = redundant-with-Sentry candidate), **GitHub $0 ✓**. GoDaddy = registrar for all 3 platform domains + their email (❓ amounts). Infra revised ≈$105 → **≈$165–190/mo**; consolidated §6 savings plan targets **≈$70–100/mo**. Awaiting "do together" session.
- **2026-08-01 v2** — First real invoices: Neon $42.65 actual (paid plan), Google Cloud ≈CA$44 actual (Maps, not Play Console). Both on a declining card → §0. Scope locked platform-only (Skool out). Savings standing rule added. Infra $25–45 → ≈$100–115.
- **2026-08-01 v1** — Initial build from the 6-agent audit + EVALUATION-2026-07-30 + live pricing research.
