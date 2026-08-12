# Nabil AI v2 — fresh-session prompt

Copy everything below the line into a new session.

---

Continue building **Nabil AI** (Fee Free's automated phone answering system). Read these first, in order — they carry the full contract and the traps:

1. `DESIGN-nabil-dashboard.md` (repo root) — pinned contracts + the v1 dashboard build
2. `C:\Users\luigi\.claude\plans\we-need-to-buil-swift-tulip.md` — the approved pizza/combo plan
3. Memory: `project_nabil_dashboard_handoff_2026_08_10.md`, `project_nabil_pilot_live_2026_08_10.md`
4. `TODO.md` — top entries are Nabil

## Current state

**LIVE in production** (commits `f484bf63`, `db088d46`): the full Nabil dashboard (Overview / Calls + call detail with transcript, AI summary, sentiment, recording playback / Featured Upsells / 6-tab Settings with FAQ manager, text links, blocked callers), AI call-intelligence with a 15-min catch-up cron, Twilio call recording, X-Twilio-Signature validation failing closed in prod, and a 95% per-call cost cut (prompt caching + stripping unsellable pizza/combo trees from the menu payload: 91,346 → 29,527 tokens/turn, $5.48 → $0.28 per 20-turn call).

**UNCOMMITTED in the working tree — commit this early, it is a lot of work at risk.** Pizza + combo ordering by voice, preflight green (1,322 tests), i18n parity 0/0/0/0 across 38:
- `src/lib/voice/order-line-compiler.ts` (+ `.test.ts`, 23 tests) — turns spoken intent into the `/api/orders` payload
- `src/lib/voice/item-loader.ts`, `src/app/api/internal/voice/item-options/route.ts`, `src/app/api/internal/voice/build-line/route.ts`
- `src/lib/pizza-config-parse.ts` — pure parser extracted from the `"use client"` PizzaBuilder (which now re-exports it)
- `services/nabil-voice/src/basket-signature.ts` (+ `src/lib/voice/basket-signature.test.ts`, 12 tests)
- `src/app/api/orders/route.ts` — internal-key `dryRun` priced preview (returns after pricing, before ANY write) + rejects a combo sent without `bundleItems`
- `services/nabil-voice/src/{tools,prompt,session,agent-config,api}.ts` — `get_item_options`, `add_pizza`, `add_combo`, `quote_order`, `ctx.basket`
- `prisma/schema.prisma` — `VoiceAgentConfig.pizzaAskGroups` (Json?) + real use of the dormant `allowPizzaCombo`. **Already pushed to BOTH Neon branches.**

**Deliberately NOT deployed.** `allowPizzaCombo` defaults false everywhere; no store has it on.

## Do all of the following

### 1. Adversarial review of the uncommitted pizza/combo diff, then fix what it confirms
A money-path review was running when the previous session ended — its results were lost, so re-run it. Pizza pricing is the most defect-prone area of this codebase: the 2026-08-02 combo release shipped **14 real defects after its tests went green**. Use several finder lenses (money / wrong kitchen ticket / live-call runtime / security-and-rollout) and make every finding survive two independent skeptics before you fix it.
⚠️ A workflow that returns `{confirmed: []}` may mean its agents **died on a usage limit** — always read `<failures>` and the run's `journal.jsonl` before believing a clean review.

### 2. Mid-order editing — the biggest functional gap (Loman parity)
Loman's headline: *"keeps a live memory of the basket. If a user changes an item mid-sentence ('actually, make that second pizza half mushroom instead of onion'), the AI updates the active order without resetting."*
Our `ctx.basket` is **append-only** — Nabil can add but cannot change or remove a line. Build it: number each basket line so the agent can say "the second pizza", store the caller's **intent** alongside the compiled line, add `revise_pizza(lineNumber, …)` that merges changes and **recompiles through the same compiler**, add `remove_line(lineNumber)`, and return the running basket in every tool result. Recompile — never patch a compiled payload.

### 3. Accent + messy-speech robustness (Luigi's explicit priority)
*"customers calling with every type of accent is important. loman understands almost everything. we need to compete with that."*
Verified against the Twilio ConversationRelay docs — all of these are supported and none are wired today:
- **`speechModel="nova-3-general"`** on `<ConversationRelay>` (`src/app/api/twilio/voice/route.ts`). Deepgram's newest model; we currently pass no model at all and get the default.
- **Multilingual auto-detect**: nest `<Language code="multi"/>` (requires Deepgram STT + ElevenLabs TTS, which is what we use). Also wire the dormant `VoiceAgentConfig.languages` field, which is currently a no-op.
- **`interruptSensitivity="low"`** — reduces false barge-ins on noisy phone audio and heavily-accented speech.
- **Expand `hints` to include TOPPING and MODIFIER names**, not just the 150 item names it sends today. Toppings are the hard words and we now build pizzas. 🚨 **Deepgram 400s and the call dies before the greeting if the hints string is malformed** — it must stay ≤500 chars, `[A-Za-z0-9 -]` only, whole-term-or-break packing. This exact bug killed every call on 2026-08-09. Give items and toppings an explicit budget split.
- **Fuzzy/phonetic matching in `resolveOption`** (`order-line-compiler.ts`) so a mis-heard "peperoni"/"pepproni" still resolves against *this* restaurant's menu, and return **"did you mean X?"** suggestions instead of a dead-end "I couldn't find that". This is our structural edge: per-restaurant lexical grounding beats generic ASR training.

### 4. Voice picker with live preview
*"we should also be able to choose different voices from inside our dashboard and as we choose we should be able to sample their voice."*
Settings → Voice currently has a raw **ElevenLabs voice-id text box** — no owner could ever fill that in. Replace with selectable named voice cards + a play button that samples the voice **speaking the store's own greeting**. Needs an internal preview endpoint; cache by voiceId+text hash so repeated clicks don't cost per play. While there: `voiceSpeed` and `ambientNoise` are still engine no-ops — either wire them or keep them honestly labelled "coming soon".

### 5. Delivery paid at the door + ShipDay opt-out
*"stores should be able to do delivery without accepting payment over the phone, same as pickup. these orders should not be sent with shipday. they should still be populated in shipday — it's the store's responsibility."*
Today the Payments tab hard-blocks it: *"Delivery is prepaid-only because you use ShipDay drivers"* (driven by `shouldDispatchToShipday()`). Add a real **pay-at-door** delivery mode (cash or card at door) that is selectable even with ShipDay connected, marks the order so `dispatchAcceptedOrderSafe()` does **not** auto-dispatch it, still creates it in ShipDay for visibility, and states the owner-responsibility clearly in the UI ×38.
⚠️ Standing rule: any new way for an order to become "accepted" must still call `dispatchAcceptedOrderSafe()`.

### 6. Pay-by-link phone payments
The Payments tab already saves pickup/delivery modes (`unpaid`/`paid`/`both`, window minutes, cook-now vs hold) and honestly says they're inactive. Make them real: Nabil texts a Stripe payment link mid-call, honouring the prep mode. 🚨 The Stripe **webhook is dormant** in this key-only model — payment wiring belongs in `verify-order-payment.ts`, NOT `events/payment-intent.ts`.

### 7. Cost + latency
Try **`flyctl secrets set NABIL_MODEL=claude-haiku-4-5 --app nabil-voice`** (config already reads `NABIL_MODEL`; no deploy needed). Projects ~$0.09/call vs $0.28 and materially lower latency — which also attacks the "slower than Loman" complaint. Judge on a real call; revert with `claude-sonnet-5`. Then measure a real cached call's `tokensIn`/`costCents` and replace the projection with the true number.
Also open: cuids are ~31% of the remaining menu payload — consider short-id mapping at the edge, translated back before `/api/orders`.

### 8. Concurrent-call capacity — verify before Luigi has a busy Friday
The voice service runs on **one Fly machine, `shared-cpu-1x`**, holding a WebSocket + a streaming Claude loop per call. Nobody has tested what happens on 3–5 simultaneous calls, and a pizzeria on a Friday night will have them. Load-test concurrent sessions, then set Fly autoscaling/`min_machines_running` appropriately. Also verify the **outage fallback**: if the service is unreachable or the JWT fails, `/api/twilio/voice` must fall through to dialing the store's real phone — never dead air. (Loman's own guide names "have a backup plan for taking orders the old-fashioned way" as table stakes.)

### 9. Phone-ordering analytics the owner actually asked for
Loman's guide markets "reports on how often people order, the average order size, and most popular items". Our Overview has calls, conversion, revenue and upsell revenue — but **not most-popular-items-by-phone**, and per-item phone demand is exactly what tells Luigi what to put in his Featured Upsells. Add it to the Overview (reuse `reportOrderWhere` / `collectedOf`; join VoiceCall→Order by `orderNumber`).
Also: Nabil can text a receipt today — add the **order-status/tracking link** to `send_sms_link` so callers can follow their order like a web customer.

### 10. Ship it
`npm run preflight` (read bottom-up), i18n parity 0/0/0/0 across 38, commit with **explicit paths only** (a sibling session shares this tree — never `git add -A`), push (Vercel), `flyctl deploy` from `services/nabil-voice`, then enable `allowPizzaCombo` for **Luigi's Lasagna only** (`luigis-lasagna-pizzeria`).

## Invariants — do not break these

- **The model never hand-writes an order payload.** It states intent; the server compiler emits it. The format's traps: half/half lives only in a modifier-name prefix `"(L.H) "` / `"(R.H) "` / `"(W) "` with a **mandatory trailing space**; double pepperoni is TWO entries not `count:2`; `toppingBaseAdjust` applies even with zero topping lines so a preset pizza sent bare **bills below list** ($20 pizza → $10); required modifier groups are NOT enforced server-side; a combo without `bundleItems` silently becomes a zero-child combo at parent price.
- **`basketSignature` must hash modifier NAMES and `bundleItems`.** Ids alone make a left-half and right-half pizza collide, and the `placedOrders` guard then silently drops the caller's second pizza.
- **`allowPizzaCombo` defaults FALSE everywhere** — schema, context route, `normalizeAgentConfig`, `toolsForConfig`. An older voice build sending no config must keep transferring.
- **Four prompt sites must always agree**: the per-item menu flags, ordering-playbook item 3, the handoff section, and the `transfer_to_human` description.
- **Preview == charge by construction.** Spoken totals come from `dryRun` on `/api/orders` — never from arithmetic. Keep the pure engines (`pizza-topping-pricing.ts`, `combo-child-pricing.ts`, `combo-topping-pool.ts`) as the single source.
- **Keep the cost win**: pizza/combo trees stay OUT of the cached system prompt; per-item detail is fetched on demand into a tool-result message.
- **Never push schema to one Neon branch** — use `scripts/push-schema-to-both.ts`.
- Every user-visible string ships in all 38 locales in the same change.

## Only Luigi can do these — ask him, don't simulate

1. **Call +1 365 658 1458** on what's already live: confirm the signature fix didn't break real Twilio calls (I could not verify — the Twilio credentials exist only in Vercel), and give a real cached-call cost figure.
2. After pizza ships and is enabled for his store: order **(a)** a large pepperoni, **(b)** half pepperoni / half mushroom, **(c)** a 5-topping pizza — he should hear the over-allowance charge announced, **(d)** a combo. **He checks the printed receipt math himself** before any other restaurant gets it.
