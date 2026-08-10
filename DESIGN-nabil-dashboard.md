# Nabil AI Dashboard — build plan + handoff (2026-08-10)

Luigi's directive: *"build ours more superior [to Loman] … every single thing needs to be built out."*
Decisions given 2026-08-10: **(1) Dashboard first**, self-serve wizard as the immediate next pass;
**(2) Record real call audio** with in-dashboard playback (consent line auto-added to greeting);
**(3) Build from the recovered Loman notes**, ask/re-extract screenshots only if needed.

Access status (verified on prod 2026-08-10): `info@luigislasagna.com` = active admin on
Luigi's Lasagna & Pizzeria; `phone_ordering` add-on ACTIVE (comped, no Stripe sub);
VoiceAgentConfig.enabled; number +1 365 658 1458 active; the live panel (not the teaser) renders.

## Loman screenshots — recovery recipe (they are NOT lost)

The 13 screenshots of Luigi's live Loman account are base64-embedded in the old session
transcript `C:\Users\luigi\.claude\projects\C--FeeFreeOrderingSystems\6fb5d466-5376-4f3b-bfd7-bb1bdebb728f.jsonl`
at **lines 1893 (shots 1–5), 1904 (6–10), 1918 (11–13)**. Re-extract: read those 3 lines,
JSON.parse each, walk for `{type:"image", source:{media_type,data}}` blocks, write the base64
out as .webp files. (A working extractor existed at the 2026-08-10 session's scratchpad
`extract-loman-shots.js` — trivial to rewrite from this description.)

## Loman IA (from the screenshots) — what to match, then beat

- **Sidebar**: Overview · Calls & Orders · Menu · Reports · Earnings · Settings · Support,
  plus a persistent **“Active — Handling calls ⏸”** pause control and account chip.
- **Overview**: “Good night, Info” + **“You've made $1,333 this month”** headline;
  cards **Staff Hours Reclaimed (3.3 h)**, **Extra Calls Captured (23)**, **Upsell Revenue**
  (w/ “Set Featured Upsell” CTA); **Recent Activity** feed (type icon, customer, action,
  value, status chip); **Popular Times Today**; a “Payments Now Available!” banner.
- **Calls & Orders**: search “by phone number, caller name or call summary”; filters
  *Orders Only* + *Date Range*; columns icon/Phone/Name/Time/Items/Total/Type. Detail panel:
  caller name+number, ⋮ → **View Caller History / Block Caller**; Order #C4F9 card with
  items+modifiers, Subtotal/Tax, **Pickup**/**ASAP** tags; **Conversation Summary** paragraph;
  “Call started at 10:20 PM on Tuesday, August 4”; **audio player (1:29)**. Weakness to beat:
  older rows say **“See POS for Order Details”** (they don't own the order — we do).
- **Menu**: read-only mirror + **Featured Upsells (max 5)** — “AI suggests these items
  contextually during calls”, Add Upsell button.
- **Reports**: Call Analytics (Volume Trends, Duration Breakdown, Average Sentiment,
  Peak Hours, Day of Week, After-Hours Calls Served) · Orders & Revenue (Order Volume,
  Revenue Trends, Order Type Distribution, Peak Ordering Hours, Day-of-Week, After-Hours
  Orders Captured) · Upsells impact.
- **Settings tabs**: General / Voice / Ordering / FAQ / Blocked Callers.
  - *General*: Location info + **Test Call** button; Hours (Store/Pickup/Delivery);
    **Temporary Closure** (“Loman still answers calls”) + Holiday Hours; **two greetings**
    (Open ≤200 chars w/ live counter; Closed w/ “state clearly that the business is closed”);
    Call Types (**Allow anonymous calls** + “anonymous callers cannot be reached for
    follow-up”); Integrations.
  - *Voice*: voice picker w/ avatar + preview play (e.g. “Marissa · Female · American”),
    **Voice Speed** slider (Slowest→Fastest), **Ambient Noise** toggle + volume slider.
  - *Ordering*: default prep times (Pickup 25 / Delivery 45) + **custom per-day/time-range
    overrides**; Scheduled Orders toggle; **Last-minute ordering** (“until close, ignoring
    prep time”); **ETA** (“estimate based on prep time”).
  - *FAQ tab*: **Text Links** (Order online / Menu / Support, kind + URL, Add link —
    theirs point at dead GloriaFood `/api/fb/…` links; ours must be branded, never-404) +
    FAQ manager with **“Recommended — based on what callers are asking”** accept/dismiss
    banner and inline-editable FAQ list (5 organic categories: dietary/allergen, business
    info, operational logistics, deflection, escalation). Loman: “links are not supported”
    in answers.
  - *Support*: Live Chat / Ticket / Email cards.

## Current state (audited 2026-08-10, all file:line refs verified then)

- **Only VoiceCall writer**: `src/app/api/internal/voice/call-log/route.ts` (upsert on callSid
  at hangup). Fields NEVER written: `summary`, `sentiment` (deliberately deferred — no
  background pass exists), `recordingUrl` (**no recording is ever started anywhere** even
  though callers hear the consent line when `recordCalls=true`), `customerId` (resolved at
  call setup then discarded), `transferReason` (exists in handoffData only), `reservationId`,
  `voiceNumberId`, `costCents`. `VoiceCall.orderId` actually stores the **orderNumber**.
  `startedAt` ≈ `endedAt` (row created at hangup) — use `durationSeconds`.
- **Voice service gets ZERO config**: `/api/internal/voice/context` doesn't return `config`,
  so `session.ts` falls back to permissive defaults. ~20 of 30 VoiceAgentConfig fields are
  no-ops incl. capabilities toggles, `afterHoursBehavior`, `maxCallSeconds` (no cap!),
  `smsConfirmations`, payment modes, `voiceSpeed`/`ambientNoise` (research ConversationRelay
  support before promising these — likely not supported; be honest in UI).
- **Dead tables**: `VoiceFaq` (prompt never fetches FAQs), `VoiceTextLink` (send-sms hardcodes
  branded links), `BlockedCaller` (read at TwiML entry `<Reject>`, never written — no UI).
- **Auth gaps**: `requireInternalKey` is a **no-op outside production**; TwiML routes have
  **no X-Twilio-Signature validation** (acknowledged TODO in `twilio/voice/route.ts`).
- **Admin PATCH** `/api/admin/phone-ordering` checks session but NOT the entitlement.
- Sidebar `AdminSidebar.tsx` still has hardcoded `comingSoon: true` on the Nabil item —
  entitled stores see a "Soon" pill on a live product; make granted hide the pill.
- Twilio client + creds already exist Next-side (see `src/lib/voice-call.ts`, `src/lib/sms.ts`).
- UI building blocks to reuse: KPI tiles + hand-rolled SVG charts in `src/app/admin/reports/`
  (`KpiCard`, trend `ChartView`), `src/components/admin/sortable.tsx`, `DateRangePicker`,
  `ExportMenu`, `Pagination`/`buildQuery` (`table-nav.tsx`), `PollRefresh`, `HelpTip`
  (named export), tabs pattern from `ReservationsClient.tsx`, AI-review-approve pattern from
  `MenuClient.tsx` `PdfImportModal`, audio: plain `<audio controls>` (no shared component
  exists). Reports pages: `max-w-7xl` + `resolveReportScope` + `parseDateRangeInTz`.
  Anthropic call sites: `menu-extractor.ts` (forced tool, streaming) and
  `reseller-reports-ai.ts` (simple, returns null on failure) — both still on stale
  `claude-sonnet-4-5`; new voice-intelligence code should use `claude-sonnet-5`.

## The build (phases for the fresh session)

1. **Schema** (+ `scripts/push-schema-to-both.ts` BEFORE deploy): VoiceCall add
   `orderNumber String?`, `reservationCode String?`, `recordingSid String?`,
   `recordingDurationSeconds Int?`, `upsellCents Int?`; new `VoiceUpsell`
   (restaurantId, menuItemId FK cascade, note?, sortOrder, active,
   @@unique([restaurantId, menuItemId]); max 5 enforced in API). Backfill legacy
   `orderId`→`orderNumber` (+ resolve real Order.id by number scoped to restaurant).
2. **Voice service**: call-start internal event (creates VoiceCall stub w/ real startedAt,
   customerId; triggers recording); config wiring via context.config (capabilities,
   quoteEta, maxCallSeconds timer → polite wrap-up, smsConfirmations gates, FAQ + upsell
   prompt sections); outcome fidelity (failed order tool → `error`, transfer no longer
   overwrites order_placed, read-only tools never stamp faq_answered); send
   transferReason/reservationCode/orderNumber + real orderId.
3. **Recording**: call-start → `twilio.calls(sid).recordings.create({recordingStatusCallback})`
   when recordCalls; `/api/twilio/voice/recording-status` (signature-validated) stores
   URL/SID/duration; admin playback proxy `/api/admin/phone-ordering/calls/[id]/recording`
   (session + entitlement + Range passthrough, Twilio basic-auth upstream); data-erasure:
   DELETE the Twilio recording (by SID, best-effort) before nulling; COSTS.md entry
   (~$0.0025/min + $0.0005/min-mo storage, platform Twilio account).
4. **Call intelligence**: `src/lib/voice/call-intelligence.ts` — Claude `claude-sonnet-5`
   forced-tool → {summary (owner-facing, restaurant defaultLanguage), sentiment,
   upsell judgment (agent-suggested lines accepted → upsellCents from order lines)};
   computes costCents from tokensIn/Out. Fire-and-forget after call-log upsert +
   `/api/cron/voice-intelligence` catch-up (vercel.json) + backfills the 8 existing prod calls.
   Load the claude-api skill before writing this code.
5. **Admin APIs** (all `requireFeature("phone_ordering_agent")` + restaurant-scoped):
   faqs CRUD, text-links CRUD (send-sms reads the table w/ branded fallback), blocked-callers
   CRUD (+ returning-caller blocked flag honored → polite decline), upsells CRUD (cap 5).
   Harden: internal-auth requires key whenever INTERNAL_API_SECRET set (not just prod);
   X-Twilio-Signature on `/api/twilio/voice` + handoff + recording-status.
6. **Dashboard UI** `/admin/phone-ordering` (max-w-7xl, ?tab= server-rendered):
   **Overview** (“You've made $X this month” from voice orders via collectedOf join on
   orderNumber; tiles: calls, staff-hours reclaimed, after-hours calls (rowIntervals),
   orders + conversion, upsell revenue; charts: volume/day, outcomes, peak hours,
   day-of-week; recent activity; needs-attention (`error` outcomes)) ·
   **Calls** (server-paged, search phone/name/summary, outcome + date filters; detail page
   `/admin/phone-ordering/calls/[id]`: transcript bubbles, summary, sentiment, audio player,
   FULL order card w/ money (beat “See POS”), reservation card w/ code, caller history,
   Block caller, transfer reason) · **FAQ & Links** (manager + AI-recommended accept/dismiss +
   text links) · **Upsells** (picker, max 5, revenue impact) · **Settings** (existing config
   re-organized; honest labels on anything the engine can't do yet; consent-line note on
   recordCalls; Test Call = your number + tel: link). Sidebar: granted ⇒ no "Soon" pill.
7. **i18n ×38** (add-script baseline + wf-translate-keys chunks ≤10; parity 0/0/0/0) —
   ~150-250 new keys under `admin.phoneOrderingPage.*`.
8. **Tests + preflight**, then an **adversarial review workflow** (security/correctness/i18n
   lenses, refute-verify), then deploy: schema→both branches FIRST, git push, fly deploy,
   prod backfill, live verify on Luigi's store.

## Payment modes (Luigi 2026-08-10: “more options for payments … for phone orders”)

Schema + admin UI already exist (`pickupPaymentMode`/`deliveryPaymentMode`:
unpaid|paid|both, `payByLinkWindowMinutes`, `payByLinkPrepMode`: cook_now|hold_until_paid) —
but `tools.ts` always sends `paymentMethod:"cash"`. Design (build after the dashboard):
- **unpaid** (today): pay at store/driver, cash-style.
- **paid**: place order w/ pay-by-link — create a Stripe Checkout/PaymentLink on the
  RESTAURANT's Stripe for the server-priced total, SMS it via send_sms_link, order carries
  paymentStatus pending w/ `payByLinkPrepMode` deciding ring/print now vs on payment;
  auto-cancel/fallback per `payByLinkWindowMinutes`. Reuse existing direct-PaymentIntent
  helpers + webhooks; idempotent; NO new charge path.
- **both**: offer choice, default link, graceful pay-at-store fallback on timeout.
- Delivery on ShipDay stays forced-paid (`cashDeliveryBlocked` already plumbed).
- UI: the Payments section already renders when entitled; wire it for real + HelpTips ×38.

## Incident record (2026-08-10) — duplicate voice order + 16-copy print storm

Luigi's live test: **ORD-233787293** ($17.28) and **ORD-235548666** ($19.20) created 1.7 s
apart from one call (caller said “Yeah.” then “Yes.” → two overlapping model turns → two
`place_order` calls; idempotencyKey was per-attempt `voice-<sid>-0/-1` so it never deduped).
Print storm: PrintNode fallback in `KitchenDisplay.tsx` `autoPrint` had **no cross-device
claim** (only the direct path claims), so tablet(direct) + browser(PrintNode) each printed
kitchenCopies(2)+customerCopies(2) per order = 16 copies.

**Fixed same day** (this session):
- voice service: prompts serialized (no overlapping turns), basket-stable idempotency key
  `voice-<callSid>-<fnv1a(basket)>`, session-level already-placed guard returning the
  existing order, tool-description hardening. Deployed to Fly (nabil-voice), health 200.
- KitchenDisplay: PrintNode branch now claims via `/api/kitchen/claim-print` (tracking
  `holdsClaim` so a direct-path claim isn't re-claimed and dropped).

**Open residuals**:
- **Money inconsistency on ORD-233787293**: total 17.28 ≠ subtotal 16.99 + tax 1.99, and tax
  differs between the twin orders (1.99 vs 2.21 on identical items). Suspect: the first tool
  call sent a different modifier shape and `/api/orders` priced total vs stored subtotal
  inconsistently. INVESTIGATE in the orders route (money path!). Related: the dryRun priced
  preview (open item #1 from wf_a62b0536) remains the proper fix for spoken totals.
- Both twin orders are still `accepted` in the kitchen — Luigi may want to reject one.
- Reservation auto-print PrintNode path (KitchenDisplay ~line 1160-1200) still has
  per-device-only dedupe — same cross-device dup class, lower stakes. Fix with the build.
- `acceptedAt` stamps ~70 ms before `createdAt` on auto-accepted orders (cosmetic).
