# Go-Live Testing Log

Live, in-depth record of hardware/end-to-end testing on the road to launch.
Append every test. Mark **VERIFIED GOOD** items as regression guards — do not break them.

Conventions: ✅ pass · ❌ fail · ⚠️ issue/needs-work · 🔒 verified-good (regression guard)

---

## Session 2026-06-21 — Kitchen ring + print (Android tablet)

**Device:** Samsung tablet (Android), kitchen device, native Star printer connected via Direct LAN.
**App build:** v1.8 (`versionCode 9`) — native alarm now rings ~5s then stops (was infinite loop). Commit `b0144e20`.
**Web:** live prod (commits through `b3e808c7`: price-input flex, modifier Select-All scope, GloriaFood→fulfilDays, pizza-role tagging).

### Test 1 — New online order, screen LOCKED, app minimized, auto-accept ON
Steps: logged into kitchen, reconnected Star printer (Find my printers), minimized app, locked screen, placed an online order.

| Aspect | Expected | Actual | Status |
|---|---|---|---|
| New-order ring (backgrounded) | ring ~5s then stop | rang ONCE ~5s, stopped | ✅ 🔒 native alarm 5s fix VERIFIED |
| Auto-accept | order auto-accepts | auto-accepted, shows with correct countdown | ✅ 🔒 |
| Auto-print on auto-accept | prints kitchen+customer when it rings/accepts | did NOT print (while locked, NOR after unlock) | ❌ **OPEN** |
| App resume after unlock | quick resume | very slow load, green splash flailing; exit+reopen worked | ⚠️ **OPEN** (cold reload) |
| Manual print | both copies | opened order → "Print both" → printed both | ✅ 🔒 printer + print path GOOD |

### Open issues from Test 1
1. **Auto-print on auto-accept doesn't fire when the order arrives while the tablet is locked/backgrounded** — and it does NOT recover on resume either (the cold reload appears to treat the order as already-seen, so the web poll's auto-print is skipped). Manual print works, so the printer + bytes pipeline are fine; the gap is the auto-trigger surviving backgrounding/reload. **Root-cause + fix in progress.**
2. **Slow app resume** — on unlock the WebView appears to cold-restart (splash screen), taking a long time; exit+reopen recovers. Likely Android killing the backgrounded WebView → full remote-URL reload. Separate perf issue.

### Fixes applied (2026-06-21, after Test 1)
- **Auto-print on auto-accept (issue #1) — FIXED in web, pending re-test.** Added a PERSISTENT auto-printed record (`localStorage ffo:kitchen-autoprinted`, pruned 24h) + a "catch-up" auto-print pass in the kitchen 4s poll. Any recently-accepted (≤6h) order not yet printed now auto-prints **exactly once** — surviving a locked/backgrounded arrival AND a cold reload — with no double-print (record persists) and no backlog storm on fresh install (first load seeds existing accepted orders as already-handled; a `printedLoadedRef` gate stops the pass firing before the set loads). `KitchenDisplay.tsx`. **Deploys via web — no app rebuild.** Commit `<pending>`.
- **Kitchen top cut-off (NEW issue, raised after Test 1) — FIXED in web, pending re-test.** All content sat under the status bar because `env(safe-area-inset-top)` reports 0 on Android (and iOS without viewport-fit), so the old ~10px top-padding fallback was too small. Raised the floor to `max(2.5rem, env(safe-area-inset-top))` on all 4 kitchen headers (main + reservation `KitchenDisplay.tsx`, `OrderDetail.tsx`, `login/KitchenLoginForm.tsx`). Fixes iOS + Android + the marketing screenshots.
- **Slow resume (issue #2) — NOT yet addressed.** Android appears to kill the backgrounded WebView → full remote-URL reload on resume (splash). Separate perf task (likely native keep-alive / faster reload).

### Verified-good (regression guards — do not break)
- 🔒 Native screen-off alarm rings ~5s once and stops (v1.8).
- 🔒 Single chime + auto-accept for auto-accept-mode orders.
- 🔒 Manual "Print both" prints kitchen + customer on the Direct LAN Star.
- 🔒 Order appears in kitchen with a correct live countdown.

## Session 2026-06-22 — Retest after deploy (Android tablet, app v1.8)

### Test 2 — header + locked-screen auto-accept order
| Aspect | Result | Status |
|---|---|---|
| Header top cut-off (Android) | header sits lower, "looks MUCH better" | ✅ 🔒 spacing fix VERIFIED on Android |
| iOS login (TestFlight build 20) | tapping email field makes the page scroll + text sits in unsafe top area | ❌ OPEN (iOS keyboard + safe-area; iOS pass) |
| New-order ring (locked, auto-accept) | NO ring at all; order already accepted on open | ❌ was OPEN → **fix shipped** |

**Root cause (confirmed in code):** the reliable keep-alive backstop (`GET /api/kitchen/alarm-state`, polled every ~4s — confirmed in tablet logcat) only counts `status:"pending"` orders as ringing. Auto-accepted orders are `status:"accepted"`, so the backstop never rang them — leaving only the flaky FCM push (fired in Test 1, dropped in Test 2). Same "auto-accept skips the pending state" gap as the web ring + auto-print.

**Fix shipped (web, no app rebuild):** `alarm-state` now also counts a just-released auto-accepted order (`status:"accepted"`, `notifiedAt`/`alertAt` within 8s, `acceptedAt ≈ notifiedAt` to exclude a later manual accept) as ringing → the keep-alive rings it **exactly once (~5s) within ~4s of arrival, independent of FCM**. Commit `<pending>`.

**Pending re-test:** locked-screen auto-accept cash order → expect a single ~5s ring within a few seconds (repeat 3-4× to confirm reliability); on wake the order is present + auto-prints.

### Native background printing (print while the app is CLOSED) — BUILT (app v1.9), pending test
Luigi's requirement: a ticket must print the instant an order is accepted (auto OR manual) **even if the app is closed**. Previously printing was web-driven (the WebView's JS), which Android suspends when the app is backgrounded — so it only printed on wake.

Built (server = web deploy; native = app v1.9 rebuild, versionCode 10):
- `Order.kitchenPrintedAt` atomic claim → a ticket prints **exactly once** across the app-open web print + the app-closed native print + restarts + multiple devices (never double-prints).
- `/api/kitchen/alarm-state` now also returns `print:[orderIds]` (accepted, released, unprinted, ≤15 min). `/api/kitchen/print-job-token` (token-auth) claims + returns the kitchen/customer receipt `lines`; `/api/kitchen/claim-print` (session) lets the web claim before it prints.
- `KitchenKeepAliveService` (always-on, polls every 4s while closed) now **fetches + prints straight to the Star** via `StarXpandBridge.printLines`, with release-on-failure retry bounded to the 15-min window.
- `DirectPrinter.saveConfig` mirrors the printer IP/port/width/enabled/autoprint into native SharedPreferences (the background service can't read WebView localStorage); the printer-setup persist effect writes it on every change.
- Shared `buildOrderReceiptPayload` so a background ticket is byte-identical to an app-printed one.

To test: install v1.9 → re-open Printer Setup once (so saveConfig writes native storage) → fully CLOSE the app → place an auto-accept order → it should **ring (~5s) AND print within a few seconds, app closed**. Repeat 3-4×. Also confirm a manually-accepted order prints and that nothing double-prints.

### Test 3 (v1.9): background print WORKS ✅, but no ring → ring must be tap-free in ALL states (FIXED v2.0)
- ✅🔒 **Background print VERIFIED** — order auto-accepted + **printed** (printer IP confirmed mirrored to native SharedPreferences = `192.168.2.43`). The core "print while closed" requirement works.
- ❌ **No ring** (app was likely open at the time). Luigi: *"there should never be a need for a screen tap for sound — as soon as the order comes it should ring whether the screen is open, closed, etc."*

**Root cause:** the OS-level native alarm was SUPPRESSED when the app was foreground (it deferred to the web chime, which needs a Web Audio unlock gesture / screen tap). So app-open orders were silent unless the screen had been tapped.

**Fix (app v2.0, versionCode 11):**
- Native alarm now fires in EVERY state — removed the `if (MainActivity.isForeground) return` gate in `KitchenMessagingService` (FCM push) AND the `!isForeground` gate on the `KitchenKeepAliveService` ring. `OrderAlarmService.isRunning` dedupes the two paths.
- Web chime (`ringBellOnce`) suppressed in the native app (`Capacitor.isNativePlatform()`) so the OS alarm is the single sound source — no double-ring, no tap ever.

### OPEN — mobile checkout not responsive
Customer checkout page (enter-details step) scrolls horizontally + doesn't fit on mobile. Needs a responsive CSS pass on the customer ordering/checkout page. (web)

### Test 4 (v2.0) — ring works in ALL states ✅✅, two polish items
Luigi on hardware (app v2.0):
- ✅🔒 **Auto-accept: rings + prints, app OPEN and CLOSED, no screen tap.**
- ✅🔒 **Pending (auto-accept OFF): correct GloriaFood alert tone, rings until accepted, prints on accept — Luigi: "saved and locked in and never damaged."** Git tag `kitchen-print-ring-verified-2026-06-22` (commit `7a45cf51`).
- ✅🔒 **Missed-order auto-call works.**
- ⚠️ **Auto-accept ring was QUIETER than the pending ring** → the loud native alarm wasn't reliably firing for auto-accept, so the quiet web chime covered it. **FIXED:** removed the brittle `acceptedAt≈notifiedAt` gate in `alarm-state` (auto-accept sets `acceptedAt` a hair before `notifiedAt`; the 3s race could drop the ring) → auto-accept now rings via the loud native alarm on the keep-alive, exactly like pending. Web-only.
- ⚠️ **Missed-order call clipped the first words.** **FIXED:** 2s leading `<Pause>` in `voice-call.ts` before the spoken message (the call audio path isn't open the instant it connects). Web-only.

Both fixes deploy via web — the tablet's keep-alive + the call endpoint pick them up live, **no reinstall.**

### Hot-path regression review (2026-06-22) — 12 findings verified, fixed/triaged
Ran an adversarial no-regression review of the new ring/print/call surface (5 dimensions, every finding independently verified before acting). Outcome:

**FIXED — web (deploys live, no reinstall):**
- 🔴 **Lost ticket on a print blip (HIGH).** The app-open auto-print set the `printedRef` dedupe marker AND claimed `kitchenPrintedAt` BEFORE printing, and on a print failure (printer asleep / LAN blip) released NEITHER → the ticket was lost forever, blocked from the device catch-up AND the native background retry. Now: on a genuine print failure, `autoPrint` clears the marker + releases the server claim (new `claim-print` release branch) so the next 4s poll retries; the error toast is throttled to 1/30s so a down printer doesn't spam. (`KitchenDisplay.tsx`, `api/kitchen/claim-print/route.ts`)
- **Unguarded token release (LOW).** `print-job-token?release=1` could un-claim any in-window order repeatedly (insider/buggy-device). Now guarded to a just-claimed order (`kitchenPrintedAt` ≤5 min old). (`print-job-token/route.ts`)
- **Missing index (MED/LOW — scale rule).** The auto-accept-ring + `toPrint` queries run every ~4s with no `notifiedAt` index → full per-restaurant accepted scan. Added `@@index([restaurantId, status, notifiedAt])`, pushed to both Neon branches.

**FIXED — native (app v2.1, versionCode 12):**
- **Partial-copy reprint storm (MED).** Background print released + reprinted the WHOLE order if one of 2 copies failed → duplicate tickets stacking on a flaky printer. Now: once ≥1 copy has printed, mark done (lose at most one duplicate copy, never a storm). (`KitchenKeepAliveService.java`)
- **Stuck claim on a slow receipt build (LOW).** A claim+build GET timeout (delivery + slow Maps ETA) left `kitchenPrintedAt` stuck → ticket hidden from retry. Now self-heals: release on the timeout so the next poll retries.

**DEFERRED — flagged, NOT go-live-blocking:**
- **Device-token TTL / revocation (MED — physical/insider only).** A retired/stolen tablet's FCM token keeps polling + printing order PII; no logout revoke, no TTL prune. A naive `lastSeenAt` freshness check would break tablets that run for days without relaunch, so it needs a careful pass (periodic `lastSeenAt` bump + generous window + logout DELETE + prune cron). Spun off as its own task.

**CONFIRMED CLEAN:** the 24/7 support line is fully separate from `voice-call.ts` and unaffected by the `<Pause>` change.
