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
