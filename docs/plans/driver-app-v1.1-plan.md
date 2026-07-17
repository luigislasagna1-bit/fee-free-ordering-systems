# Fee Free Delivery v1.1 — Unified Build Plan

Synthesized 2026-07-16 from three judged design proposals (`unified-login-app-shell`,
`driver_side_v1_1`, `restaurant-side`) with **every judge mustChange applied**.
Where judges conflicted (history ordering: `completedAt` vs `createdAt`), the
majority position (2 of 3 judges: `completedAt`) was adopted; the resolution and
rationale are recorded in §5.1 so the losing argument's real concern (deploy-order
choreography) is still honored explicitly.

---

## 1. Vision

Fee Free Delivery v1.1 turns the `/driver` surface from a single-screen queue plus a
squeezed-in dispatch panel into one real mobile app with one door: drivers and
restaurant owners sign in on the same email+password form, land in the view that
matches their role (with an explicit in-app switcher for dual-role people), and each
get a 4-tab dark-native dashboard — drivers see Jobs / History / Earnings / Profile
("how much did I make", honestly labeled, no fake payroll), owners see Dispatch /
Deliveries / Drivers / Account ("where is my driver", billing history, the enable
toggle, and the first-ever driver-rating write path) — all shipped as web deploys
into the existing Capacitor WebViews with zero store releases, zero auth-config
changes, one coordinated schema migration, and the Play-policy-locked GPS/disclosure
machinery untouched by construction.

---

## 2. Unified login (`/driver/login` — the ONE door)

### 2.1 Architecture (unchanged from proposal, judge-corrected)

Keep the **two-cookie system exactly as-is** (admin `[__Secure-]next-auth.session-token`,
driver `[__Secure-]next-auth.driver-session-token`, kitchen untouched). The client
**cascades** one email+password form across both tables. **Zero changes** to
`auth.ts`, `auth-driver.ts`, `auth-kitchen.ts`, `login-protection.ts`, `session.ts`,
`driver-session.ts`. The server-side unified-provider alternative stays rejected
(would rewrite `getDriverSession` + every dispatch API, or hand-mint JWTs).

### 2.2 The cascade — with pref-aware leg ordering (judge 3 mustChange #1)

- **Step 0 — no pre-clear.** DELETE the `POST /api/auth/clear-session` call at
  `DriverLoginForm.tsx:22`. It is a live bug: a mistyped driver login today nukes the
  admin AND kitchen sessions on a restaurant device. Do **not** add the driver cookie
  to `COOKIES_TO_CLEAR`; the route itself is untouched (other login surfaces keep it).
- **Leg ordering is device-memory-aware** (rate-limit-pollution fix): if
  `ffd-role-pref=restaurant` is present on the device, run the **restaurant leg
  first** and the driver leg only as fallback; driver-first only on unknown devices
  or `ffd-role-pref=driver`. Without this, repeat owner/staff logins burn
  driver-scope failure counters (`login-protection.ts` FAIL_LIMIT 10/5min, keyed
  ip+email AND ip alone) against the restaurant's shared WiFi IP and lock real
  drivers out.
- **Driver leg:** `signIn("credentials", { redirect: false })` on the driver basePath
  (`DriverSessionProvider` routes it). Success → write pref cookie → hard
  `window.location.assign("/driver")`. Failure (incl. `login-rate-limited`) → **fall
  through, never terminal**.
- **Restaurant leg (manual):** fetch `/api/auth/csrf` **fresh, immediately before the
  POST** (both NextAuth instances share the CSRF cookie; the other leg may rotate it —
  this ordering is load-bearing), then `POST /api/auth/callback/credentials`
  (form-urlencoded, `json:"true"`, the exact pattern `DispatchLogout.tsx:25-29`
  already runs in production). On success: `GET /api/auth/session` **with
  `cache: "no-store"`** (judge 3 mustChange #2) → branch: has `restaurantId` → pref
  cookie + `/driver`; superadmin/platform_support → `/superadmin/drivers` (never
  `/login` — redirect-loop rule); reseller roles → `/reseller`.
- **Restaurant-only mode:** low-key link (`feefreeApp.signInAsRestaurant`) + deep
  links `/driver/login?as=restaurant|driver` — skips a leg, no auth bearing. This is
  the escape hatch for the dual-credential footgun (same password in both tables →
  first leg wins → driver-token rotation supersedes the phone's driver session).
- **Error mapping (enumeration guard):** ONE toast, byte-identical whichever table
  missed. Both-miss → `feefreeApp.loginFailed`; any rate-limit → `auth.tooManyAttempts`;
  reseller-scope sentinel → the existing `/login` copy. **No preflight "which table"
  endpoint, ever.** All navigation is client-side after `redirect:false` flows — no
  cacheable auth-dependent 307 is ever emitted (AGENTS.md no-store redirect rule
  satisfied by construction).

### 2.3 Role routing — `ffd-role-pref` tie-break in `src/app/driver/page.tsx`

Cookie: `ffd-role-pref` = `driver|restaurant`, path `/`, SameSite Lax, ~400d,
non-httpOnly, **`Secure` in prod** (judge 3 mustChange #2). It is a rendering
preference only, never an authz input. **Enforcement, not a comment:** add a
CI/grep gate (preflight step) asserting no file under `src/app/api` reads
`ffd-role-pref`.

| driver session | admin session | pref | renders |
|---|---|---|---|
| ✓ | ✗ | any | DriverQueue (preferred-wins-if-present) |
| ✗ | ✓ (restaurantId) | any | RestaurantApp |
| ✗ | ✓ (no restaurantId) | any | redirect `/superadmin/drivers` |
| ✓ | ✓ (restaurantId) | `restaurant` | RestaurantApp |
| ✓ | ✓ | `driver`/unset | DriverQueue (unset = today's behavior) |
| ✓ | ✓ (no restaurantId) | `restaurant` | redirect `/superadmin/drivers` |
| ✗ | ✗ | any | redirect `/driver/login` |

No `restaurantId` tie-breaking, ever (AGENTS.md session rule). `page.tsx` passes
`role` + `hasOtherRole` into both shells.

**The stale-driver-cookie story is this tie-break** (judge 1 mustChange #4, judge 2
mustChange #4): the login workstream ships **no cookie clear**. The restaurant shell
assumes this truth table; the previously proposed "Not a driver? Switch to
restaurant" header stopgap is **deleted** — `RoleSwitch` is the one component.

### 2.4 RoleSwitch + sign-out semantics (judge 1 mustChange #5)

- `src/app/driver/RoleSwitch.tsx` (new, tiny): header icon that flips
  `ffd-role-pref` and hard-navigates `/driver`; if the other session is absent,
  deep-links `/driver/login?as=<other>`. **Mounts exactly once in each shell's
  header** per this shell contract — dashboard workstreams relocate it, never
  duplicate it.
- Sign-out: driver `signOut()` (driver basePath) and `DispatchLogout` (manual admin
  CSRF+POST) both mechanically unchanged; each **also clears `ffd-role-pref`** — and
  the pref-clear **travels with the relocated sign-out buttons** (driver sign-out
  moves to the Profile tab; dispatch sign-out moves to the Account tab). No pref-clear
  is left on a header button that no longer exists.
- **LoginForm one-liner ships in Phase 0, not later** (judge 2 mustChange #3): when
  `/login` honors `callbackUrl=/driver`, set `ffd-role-pref=restaurant` — required
  for Phase 0's "owner reaches dispatch on a driver-session device" claim to be true.

### 2.5 Task #9 coordination (judges 1/2/3, all)

**Cancel/supersede pending Task #9** ("deploy driver login door-clarity strings ×38"
/ `driver.invalidDriverLogin`) **before** the unified form ships — Phase 1 deletes
that key ×38. Do not deploy translations that are immediately deleted, or the parity
audit and translation vendor whiplash across 38 locales.

### 2.6 Email-in-both-tables policy

Collisions are legal (no cross-table uniqueness). Whichever password matches decides
the role; same password in both → the device-pref-ordered first leg wins (driver on
unknown devices). Escape hatches in order: restaurant-only mode link, `?as=` deep
link, in-app RoleSwitch. Documented in the release note.

---

## 3. Driver dashboard (Jobs / History / Earnings / Profile)

### 3.1 Shell — `src/app/driver/DriverApp.tsx`

- Tab state in **React state, not routes** (no new server redirects → no redirect-
  cache surface; kitchen precedent). Bottom nav: fixed, `bg-gray-800/95` blur,
  `env(safe-area-inset-bottom)`, four tabs (Bike/History/DollarSign/User icons,
  emerald active), Jobs badge = my non-terminal jobs.
- **LOAD-BEARING: Jobs stays mounted always, hidden via CSS** — never unmounted. The
  GPS effect, 8s poll, and 30s heartbeat live inside `DriverQueue`; unmounting kills
  location streaming mid-delivery. History/Earnings/Profile mount lazily, stay
  mounted, manual refresh.
- Header shared across tabs (safe-area-top on the header itself); **sign-out moves to
  Profile** (with pref-clear, §2.4); `RoleSwitch` mounts here.
- Shared building blocks live in **`src/app/driver/shared/`** (judge 2 mustChange #5):
  bottom-nav shell, date-grouped keyset list (Today/Yesterday headers + Load more),
  full-screen detail overlay with stage timeline, terminal status chips, language
  row — used by BOTH the driver and restaurant shells so the two apps stay visually
  identical and the i18n surface halves.

### 3.2 Jobs

Today's queue, behaviorally untouched: sections, JobCard stage machine, disclosure
modal, release confirm. Visual deltas only (nav padding, header sign-out removed).

### 3.3 History

- Day-grouped list (shared component), 30/page keyset "Load more" (no infinite-scroll
  plumbing). Row: restaurant + order #, status chip (Delivered emerald / Failed rose /
  Returned gray), time, **store-to-customer distance** (judge 1 mustChange #8: this
  is restaurant→customer haversine, NOT kilometers driven — label it with the
  `common.kmFromStore` convention, never "trip distance", or drivers comparing
  odometers will file it as a bug), customer **city only** — never the street address
  post-delivery. **`deliveryCity` is nullable (schema:1275)**: when null, render
  nothing — **never fall back to `deliveryAddress`** (judge 2 mustChange #7).
- Money per row via `formatCurrency(amount, row.currency)` — per-row currency; never
  copy the hardcoded `usd()` from `FeeFreeDeliveryOps.tsx:18-20` (the Fabrizio euro/$
  bug class).
- Detail = full-screen overlay from already-fetched row data (zero extra round
  trips): stage timeline with deltas, On time / Late badge (shared late-rule helper,
  §5.3), money card (total / tip amber / frozen `platformFeeCents`), route card,
  rating-received card (graceful empty until write paths ship).
- **Cancelled rows are deliberately excluded** and this is now a stated product
  decision (judge 1 mustChange #9): a "can't complete" recycles the assignment to the
  pool (driverId nulled on reoffer) or closes it as cancelled on dead orders — per-
  event release history needs an event log (deferred). Support answer: Profile's
  "Released" counter is the aggregate trace. Say this in the driver-facing FAQ copy
  if drivers ask.

### 3.4 Earnings

- Pill switcher Today / This week / Last week (device-local day boundaries).
- Stat tiles: Deliveries; Tips (amber, **stacked per currency** for multi-store
  drivers — never summed across currencies); Active time with a HelpTip ⓘ ("time
  between accepting a job and delivering it — not your full shift hours"). No
  `DriverShift` model exists; real hours-worked is out of scope and the seam is
  noted. `hourlyRateCents` is **never** multiplied into any wages figure.
- Daily breakdown rows on week views; conservative `tipsFootnote` (tips = what
  customers added; payout handling unmodeled and unpromised).

### 3.5 Profile

Identity card (initials, name, email/phone, home store, driver-since) · Rating card
(headline `ratingPct` + the three component bars — Reliability 40% / On-time 30% /
Feedback 30% — fed by a `ratingComponents()` helper **extracted from
`computeRatingPct`** in `src/lib/driver-rating.ts` so the math has one home) ·
counters (Delivered / Released / Late) · read-only hourly rate
(`formatCurrency(hourlyRateCents/100, PLATFORM_CURRENCY)`, hidden when 0) · language
row (staff-locale cookie, `AuthLanguageSwitcher` mechanism) · **Sign out** (existing
driver-basePath `signOut()` + pref-clear). No profile editing in v1.1.

---

## 4. Restaurant dashboard (Dispatch / Deliveries / Drivers / Account)

### 4.1 Entry + shell — `src/app/driver/RestaurantApp.tsx`

- `page.tsx` role branch per the §2.3 truth table (its hard-won rules preserved).
  **Dependency corrected** (judge 1 #4, judge 2 #4): the shell depends on the
  `ffd-role-pref` tie-break — which the login workstream actually builds — not on any
  driver-scoped cookie clear (which nobody builds). The header stopgap is deleted;
  `RoleSwitch` is the switcher.
- Dark-native shell (same visual language as DriverQueue; kills the light-panel-in-
  dark-shell seam at `RestaurantDispatch.tsx:56-58`), sticky safe-area header,
  4-tab bottom nav (Bike/Package/Users/Settings), amber badge on Dispatch = held
  count. Built on the same `src/app/driver/shared/` components as the driver shell.
- **One poller for the whole shell**: `GET /api/admin/feefree-delivery/ops` every
  **10s**, paused on `document.hidden`, refetch on focus + after mutations, data
  fanned out via context — tabs never spin their own intervals. 401 → hard nav to
  `/driver/login`.
- Sign-out = relocated `DispatchLogout` (mechanics verbatim) + pref-clear, in Account.

### 4.2 Dispatch (default landing)

Held orders (amber; existing `POST /api/admin/feefree-delivery/dispatch`, existing
keys) → Active deliveries (order #, customer, `common.kmFromStore`, driver +
ratingPct, `st_*` chip; **row tap → Delivery detail overlay**) → empty/off states;
not-enabled card deep-links to the Account tab toggle ("Turn it on in Account →"),
never bounces the owner to desktop. Everything on this tab is ops-poll payload; zero
per-row fetches.

### 4.3 Deliveries

- Segments: **In progress** (same context data as Dispatch, zero extra queries) |
  **Completed** (history endpoint, day-grouped, Load more).
- **Completed keysets on `(completedAt DESC, id DESC)` with
  `completedAt: { not: null }`** — the `createdAt` cursor and
  `[restaurantId, createdAt]` / `[driverId, createdAt]` indexes from the original
  proposal are **dropped entirely**, along with the "createdAt approximates
  completion" rationale (judges 1 & 3; see §5.1). TERMINAL =
  `delivered | failed | returned | cancelled`.
- Detail overlay (`GET .../deliveries/[id]`): terminal/live chip (new
  `st_delivered/failed/returned/cancelled` labels), stage timeline (assigned →
  accepted → heading-to-store → picked up → delivered; rose terminal node for
  failed/returned), door-to-door duration, driver card (name, ratingPct, `tel:` link,
  "last seen {n} min ago" from denormalized `Driver.lastLat/lastLng/lastLocationAt` —
  **no `DriverLocation` trail reads**), order card (customer, address, total + tip via
  `formatCurrency(amount, restaurant.currency)`), billing line (`platformFeeCents` via
  `formatCurrency(cents/100, PLATFORM_CURRENCY)` + settlement state), and — terminal
  with driver only — the **Rate this driver** block (§4.4).

### 4.4 Drivers + the first DriverFeedback write path

- `GET /api/admin/feefree-delivery/drivers`: 3 queries, no N+1 — `groupBy`
  assignments by driverId (delivered, for this restaurant) + `findMany in` +
  home-store drivers; merge, cap 100. Cards: name, rating, "{n} deliveries for you",
  last date, home-store badge, tap-to-call, inactive chip. Detail bottom sheet:
  recent-for-you (history endpoint `?driverId=`) + your own ratings.
- **`POST /api/admin/feefree-delivery/feedback` — race-safe at the DB** (all three
  judges): schema gains **`@@unique([assignmentId, source])`** on `DriverFeedback`
  (Postgres treats NULL `assignmentId` as non-conflicting, so customer/platform rows
  without an assignment are unaffected), and the write is a **real `upsert` keyed on
  that unique** (or create with P2002-catch-then-update) — the proposed
  transaction find-then-create is NOT a race guard; concurrent double-submits would
  create duplicate `source=restaurant` rows and `recomputeDriverRating` (aggregate-
  based) would double-count. Auth: `getSessionUser()` → `restaurantId` from session →
  `findFirst({ id: assignmentId, restaurantId })` ownership fetch → require terminal
  + non-null driver → **`driverId` from the fetched row, never the client** → upsert →
  `recomputeDriverRating(driverId)` after commit. Verify a rating visibly moves
  `ratingPct` end-to-end before calling the phase done.
- **Driver phone exposure to owners — ✅ DECIDED (Luigi, 2026-07-16): VISIBLE.**
  "yes phone number should be visible in app now." Phase 8 ships the phone in the
  restaurant Drivers tab + delivery detail, with a tel: call button (matches the
  driver side, which already exposes customer/restaurant call buttons).

### 4.5 Account

Identity · Fee Free Delivery settings (existing `GET/PUT /api/admin/feefree-delivery`;
enable + auto-send toggles; "More delivery settings" links out to
`/admin/delivery/pool` — money-config UIs are not duplicated into the app) · Billing
(owed / this week / next charge from the ops poll, ALL settlement money in
`PLATFORM_CURRENCY`; billing history via `GET .../settlements`, keyset on
`weekStart`, served by the existing `@@unique([restaurantId, weekStart])`) · App
(language switcher, "Open full dashboard", relocated sign-out, native version string).

### 4.6 Shared query lib — anti-drift, sequenced (judge 2 mustChange #8)

`src/lib/feefree-delivery-ops.ts` (new): extract the five queries inlined in
`FeeFreeDeliveryOps.tsx:35-70` into `getFeeFreeDeliveryOpsData(restaurantId)`; the
desktop RSC and the new `/ops` JSON route both call it. **The extraction lands as its
own commit with side-by-side desktop `/admin/delivery/pool` verification (billing
numbers identical) BEFORE any app tab is built on it.** Never fork the queries as a
schedule escape hatch — that recreates the drift the lib exists to prevent. Desktop
rendering is untouched.

---

## 5. Data + API changes (with scale notes)

### 5.1 ONE schema migration (blocking; resolves the judge conflict)

**Decision: `completedAt`, not `createdAt`.** Judges 1 and 3 mandated
`completedAt` + not-null-guarded keyset; judge 2 preferred converging on `createdAt`
to avoid backfill choreography. Majority adopted, because: (a) `deliveredAt`-only
ordering drops failed/returned rows and no date-ordered index exists today; (b)
`createdAt` is semantically wrong for slow-failing rows (judge 3); (c) the nullable-
keyset objection is void with the `not: null` guard + backfill (judge 1). Judge 2's
real concern — deploy-order risk — is honored by making the choreography an explicit,
separately-shipped phase (Phase 2) with zero user-visible surface.

Contents (one push via `scripts/push-schema-to-both.ts`, **BOTH Neon branches**):

1. `DeliveryAssignment.completedAt DateTime?`
2. `@@index([driverId, completedAt])` — driver history keyset
3. `@@index([restaurantId, completedAt])` — restaurant history keyset
4. `DriverFeedback @@unique([assignmentId, source])` — feedback race guard (§4.4)

No `[restaurantId, createdAt]` / `[driverId, createdAt]` indexes. No other new
columns or tables (no `DriverShift`, no payout ledger). `DeliveryAssignment` is a
one-row-per-delivery side table, not an Order/MenuItem-class hot table — the
AGENTS.md sparse-column concern doesn't bite.

### 5.2 Terminal stamps — EVERY terminal write (judge 1 mustChange #2)

`POST /api/driver/assignments/[id]/status` is the only terminal-status writer
(verified). Stamp `completedAt: now` on **all** terminal writes:

- delivered / failed / returned (the main stage-machine writes), **and**
- **the cancelled write in the dead-order bail branch at `status/route.ts:96`**
  (`{ status: "cancelled", failedAt: new Date() }`) — restaurant TERMINAL includes
  cancelled; unstamped cancelled rows would silently vanish from the Completed tab.

Also extract the promised-time/late rule (`scheduledFor ?? estimatedReady` + 10min
grace, currently inline at `status/route.ts:147-168`) into
`src/lib/driver-assignment.ts` so History's `late` flag and the counter bump can
never drift.

### 5.3 Backfill + deploy order

`scripts/backfill-assignment-completed-at.ts`:
`completedAt = COALESCE(deliveredAt, failedAt, returnedAt)` for terminal rows
(cancelled rows carry `failedAt`, so COALESCE covers them), batched, run on BOTH
branches. **Order: schema push → stamps live → backfill → reading code.** Old code
ignores the column; all new reads guard `completedAt: { not: null }`.

### 5.4 API surface

All driver endpoints: `getDriverSession()` + `checkDriverSessionFresh()` → 401
`session_superseded`; all admin endpoints: `getSessionUser()` first, `restaurantId`
**from the session, never the client**; every list `select`-only, keyset-paginated,
take-capped; no offset pagination; no load-then-filter; no per-row awaits.

| Endpoint | Method | New? | Notes |
|---|---|---|---|
| `/api/driver/assignments` | GET | exists | **8s hot poll — response shape untouched, never widened** |
| `/api/driver/assignments/[id]/status` | POST | touch | additive `completedAt` stamps only (§5.2) |
| `/api/driver/me` | GET | new | one `findUnique` + `ratingComponents()` |
| `/api/driver/history` | GET | new | keyset `(completedAt,id)`, take ≤50, **malformed cursor → 400 not 500**; feedback via ONE batched `IN` query on `[orderId]` (no N+1); returns city only, null-safe (§3.3); list rows carry full detail — no detail endpoint |
| `/api/driver/earnings` | GET | new | §5.5 |
| `/api/admin/feefree-delivery` | GET/PUT | exists | config toggles |
| `/api/admin/feefree-delivery/dispatch` | POST | exists | manual send |
| `/api/admin/feefree-delivery/ops` | GET | new | 10s poll payload `{enabled, autoSend, owedCents, deliveredThisWeek, nextChargeAt, currency, held[≤25], active[≤50]}`; calls the shared lib (§4.6); the seam for a per-restaurant 5s micro-cache is noted in a comment |
| `/api/admin/feefree-delivery/history` | GET | new | keyset `(completedAt,id)` + `not:null`, take 30, TERMINAL incl. cancelled, optional `?driverId=` |
| `/api/admin/feefree-delivery/deliveries/[id]` | GET | new | detail + timeline + myFeedback + settlement state; denormalized last-location only |
| `/api/admin/feefree-delivery/drivers` | GET | new | groupBy + 2 findMany, cap 100 |
| `/api/admin/feefree-delivery/settlements` | GET | new | keyset on `weekStart`, take 26, existing unique index |
| `/api/admin/feefree-delivery/feedback` | POST | new | upsert on `[assignmentId, source]` unique (§4.4) |

### 5.5 Earnings SQL hardening (judges 1/2/3)

- One aggregate query (COUNT / SUM(tip) / SUM(deliveredAt−acceptedAt) / late-case,
  grouped by local day + currency). **The client timezone parameter is a BOUND
  parameter via tagged-template `$queryRaw` — never string-interpolated** — and
  validated: integer offset minutes clamped to **[-840, 840]**, or an IANA name
  checked against a whitelist.
- **Documented limitation:** a fixed offset mis-buckets days across a DST transition
  inside a week view — acceptable because stated, unacceptable silent.
- Range clamp ≤35 days (400 otherwise). Per-currency grouping; tips never summed
  across currencies.
- **Index honesty (judge 2 #6):** this query is actually served by the existing
  `[driverId, status]` index + `deliveredAt` range, NOT the new history index — run
  `EXPLAIN` before the phase ships rather than asserting index-backing.

### 5.6 Scale notes

- Hot paths untouched: kitchen 4s poll, driver 8s poll + 30s heartbeat, customer
  ordering — none widened or slowed.
- Restaurant shell = ONE 10s poller, paused when hidden, 4–5 indexed queries/tick —
  fine at 10k restaurants; micro-cache seam noted for later.
- Every new list: index-backed keyset + take cap. History/earnings/settlements reads
  are all on side tables (DeliveryAssignment/DeliverySettlement/DriverFeedback).
- `DriverLocation` retention job remains the biggest unpruned-table seam — noted,
  not built here (no new reads touch it; detail cards read denormalized
  `Driver.lastLat/lastLng` only).
- Rating recompute stays aggregate-based and off the hot path (`after()`), now safe
  against duplicates via the DB unique.

---

## 6. i18n scope (×38, per standing rule)

- **De-duplicated surface (judge 2 mustChange #5):** generic strings live ONCE in a
  shared namespace (e.g. `feefreeShared`): `today`, `yesterday`, `loadMore`,
  `deliveryFee`, `orderTotal`, `tipLabel`, timeline labels
  (accepted/started/pickedUp/delivered/failed/returned), `hoursMinutes`,
  `minutesOnly`, `onTimeBadge`, `lateBadge`, `language`, `back`, empty-state stems.
  Driver-specific (`driver.*`) and restaurant-specific (`feefreeApp.*`) namespaces
  hold only role-specific copy. This cuts the raw ~100 combined new keys to roughly
  **~60 net new keys ×38 (~2,300 strings)** — the single biggest schedule cost.
- Login: **+7 keys** (`loginHelpUnified`, `loginFailed`, `signInAsRestaurant`,
  `signInAsDriver`, `restaurantModeBadge`, `switchToDispatch`, `switchToDriver`),
  **−1 key ×38** (`driver.invalidDriverLogin` — deleted; Task #9 cancelled first,
  §2.5).
- Restaurant status labels usable by desktop too: `st_delivered`, `st_failed`,
  `st_returned`, `st_cancelled` in `admin.feefreeDelivery`.
- Rules: every key lands in `src/messages/en.json` AND all 37 other locales **in the
  same change**; preserve `{placeholders}`, ICU plurals, rich tags, brand names
  ("Fee Free Delivery" untranslated); run `scripts/i18n-parity-all.ts` (all 38 — NOT
  `i18n-audit.ts`) to 0 missing/extra/placeholder/rich-tag mismatches before each
  deploy. ICU plurals (`ratingAvgCount`, `doorToDoor`, `deliveredForYou`,
  `nDeliveries`, `lastSeenAgo`) are the known low-resource-locale breakage point —
  spot-check them.
- Distance strings reuse the `common.kmFromStore` store-to-customer convention (§3.3).

---

## 7. Build phases — each independently shippable

Ship order per judges 1 & 2: **login routing first → driver shell → restaurant
shell.** Every phase: `npm run preflight` (read bottom-up) + parity audit + the
listed verification gate before push.

| # | Phase | Contents | Effort |
|---|---|---|---|
| 0 | **Login routing + bug fixes** (no visible redesign) | `ffd-role-pref` tie-break in `page.tsx` (Secure cookie); remove the pre-login clear-session call; both existing doors set pref on success **including the `/login` LoginForm one-liner** (judge 2 #3); CI grep gate (no `src/app/api` file reads the pref). Ships two real bug fixes alone: mistyped driver login no longer nukes admin+kitchen sessions; owner login on a driver-session device reaches dispatch. Zero i18n. | 1d |
| 1 | **Unified login form** | Cascade with pref-aware leg ordering (§2.2), restaurant-only mode + `?as=`, error-mapping table, `no-store` session fetch; **cancel Task #9 first**, then +7/−1 keys ×38 + parity. Two-door UI disappears. Verification matrix §7.1. | 1.5d |
| 2 | **Schema migration + terminal stamps** (no UI) | §5.1 migration (both branches) → status-route `completedAt` stamps on ALL terminal writes incl. the `:96` cancelled bail → late-rule helper extraction → backfill both branches. Zero user-visible change. | 0.5d |
| 3 | **Driver shell + Profile** | `src/app/driver/shared/` foundation; `DriverApp` bottom nav (Jobs + Profile only — never dead tabs); Jobs mounted-always rule; `ratingComponents` refactor; `GET /api/driver/me`; Profile (sign-out relocation + pref-clear, language row); RoleSwitch in header; shared + profile i18n ×38. **Device gate: real Android build, active delivery, flip tabs, lock phone — GPS pings keep landing, heartbeat 401 still redirects.** | 2d |
| 4 | **Driver History** | `GET /api/driver/history` (400 on bad cursor, city null-rule, batched feedback); History tab + detail overlay on shared components; store-to-customer distance label. Verify keyset past 30+ rows and failed + returned rendering. i18n ×38. | 1.5d |
| 5 | **Driver Earnings** | `GET /api/driver/earnings` (bound+validated tz, `$queryRaw` tagged template, `EXPLAIN` check, ≤35d clamp); Earnings tab + HelpTip. Verify multi-currency stacking with a seeded second-currency store. i18n ×38. | 1.5d |
| 6 | **Restaurant shell R1** | `getFeeFreeDeliveryOpsData` extraction **as its own commit + side-by-side desktop verification (billing numbers identical)**; then `/ops` route, `RestaurantApp` shell + 10s poller, Dispatch tab (kills the light-in-dark seam), Account tab (toggles, billing summary, relocated `DispatchLogout` + pref-clear, language, link-outs), RoleSwitch. Hidden/absent future tabs — never dead ones. i18n ×38. | 2.5d |
| 7 | **Restaurant Deliveries** | History (completedAt keyset, TERMINAL incl. cancelled) + detail endpoints; Completed segment; detail overlay (timeline, driver last-seen, order card, billing line) — read-only; row-tap wiring from Dispatch. i18n ×38. | 2d |
| 8 | **Restaurant Drivers + ratings** | Drivers endpoint + tab + sheet; feedback POST via **upsert on the unique**; rating block in delivery detail. **Gate: a submitted rating visibly moves `ratingPct` end-to-end** (the pipeline's first live write). **Driver phone: VISIBLE with call button (Luigi decided 2026-07-16).** i18n ×38. | 1.5d |

**Total ≈ 14 days** (three proposals' raw 17d minus shared-shell/i18n dedup and the
merged migration, plus judge-mandated hardening). Judges flagged the original 6d/7d
estimates as optimistic — treat 14d as the honest center, 15–16d with device-gate
retries.

### 7.1 Login verification matrix (Phase 0/1 gate)

(1) driver creds → queue, GPS+heartbeat OK; (2) restaurant creds → dispatch, ops
200s; (3) superadmin → `/superadmin/drivers`; (4) four wrong-credential permutations
→ byte-identical toast; (5) both-tables same password → first-leg-wins + override
link works; (6) dual-session device: owner login → dispatch AND driver session still
fresh (switcher returns without re-login, no heartbeat 401); (7) typo'd driver login
on kitchen tablet → `/admin` + `/kitchen` sessions survive; (8) exhaust driver scope
(10 fails) then correct restaurant creds → fall-through succeeds; **(9) 10 restaurant
logins from one IP, then a correct driver login from the same IP, still succeeds
(judge 3 #1 — leg-ordering/fall-through covers it)**; (10) sign-out from each role →
correct residual view; (11) reseller-scoped account on platform host → same behavior
as `/login`; (12) native Android + iOS pass of 1/2/6, disclosure modal untouched,
kill-and-relaunch persists; (13) preflight bottom-up + parity clean.

---

## 8. DO-NOT-TOUCH list (explicit; all three proposals agreed — synthesis does not relax it)

**Play-policy-locked / hardware-verified:**
- The GPS streaming effect in `DriverQueue.tsx:100-195` (native
  background-geolocation + web watchPosition, ~10s POST throttle).
- The background-location **prominent-disclosure modal** (`DriverQueue.tsx:306-337`)
  and its `ffd:bg-location-disclosure-ok` localStorage key — store-submission-locked.
- Heartbeat 30s / queue poll 8s cadences and the 401 → `/driver/login` hard-redirect
  pattern (`DriverQueue.tsx:59-87`).
- `GET /api/driver/assignments` response shape — the 8s hot poll is never widened;
  new tabs get their own endpoints.
- The JobCard stage machine (Accept → Start driving → Picked up → Delivered),
  release-to-pool confirm, Directions/Call actions.

**Auth / session:**
- `auth.ts`, `auth-driver.ts`, `auth-kitchen.ts`, `login-protection.ts`,
  `session.ts`, `driver-session.ts` — zero changes.
- `/api/auth/clear-session` route and `COOKIES_TO_CLEAR` — never add the driver
  cookie to it.
- Kitchen login/session-token rotation (would bounce the live kitchen tablet), all
  kitchen cookies, `/kitchen/login`, `/account/login`.
- `page.tsx` session-precedence rules: preferred-wins-if-present, **no
  `restaurantId` tie-breaks**, superadmin → `/superadmin/drivers` never `/login`.
- `DispatchLogout` internal mechanics (manual admin-basePath CSRF+POST).
- `driverAuthOptions.pages.signIn` stays `/driver/login`.

**Kitchen surfaces:** the kitchen display, its 4s poll, ring/print pipeline
(GOLDEN — see `project_printer_pipeline_golden`), kitchen push/session lifecycle —
nothing in v1.1 touches them.

**Money / platform:**
- Settlement cron + `src/lib/delivery-settlement.ts`.
- Desktop `FeeFreeDeliveryOps` **rendering** (query source moves to the shared lib;
  output must stay pixel-identical).
- The currency split: order money = `formatCurrency(amount, restaurant.currency)`;
  settlement/platform fees = `PLATFORM_CURRENCY`; the hardcoded `usd()` in
  `FeeFreeDeliveryOps.tsx:18-20` is never copied anywhere.
- Existing `POST dispatch` and `GET/PUT config` endpoint behavior.

**Framework guardrails:** no new `middleware.ts` anywhere (edge logic goes in
`src/proxy.ts`); no new auth-dependent server redirects (tab state is client-side;
login navigation is client-side post-`redirect:false`) — so no new no-store-redirect
surface exists by construction.

---

## 9. Explicit non-goals (surface to Luigi, never build silently)

- Real hours/wages (`DriverShift` clock model — seam noted, "Active time" labeled
  honestly, `hourlyRateCents` never multiplied).
- Driver payout ledger — `platformFeeCents` is restaurant billing, not driver comp;
  UI copy never implies payout.
- Per-event release history (needs an event log; Profile's Released counter is the
  aggregate; History's cancelled-row exclusion is documented in §3.3).
- Customer/platform `DriverFeedback` write UIs (the restaurant write path ships in
  Phase 8; read surfaces degrade gracefully meanwhile).
- Populating `customerFeeChargedCents` / customer-fee revenue widget.
- `DriverLocation` retention job (noted seam).
- Online/offline duty toggle, push job offers, POD, live map — FeeFreeDelivery
  roadmap Phases 2–3.
- Profile editing (password/phone change needs current-password UX — fast-follow).
- Reseller-branded-domain behavior for `/driver` (matrix case 11 pins today's
  platform-host behavior; deliberate revisit if that ever ships).

## 10. Top risks (carried forward, post-correction)

1. **GPS regression** — mitigated architecturally (Jobs mounted-always) + the
   mandatory Phase 3 on-device gate.
2. **Migration/deploy ordering** — mitigated by Phase 2 being its own zero-UI ship
   (schema → stamps → backfill → readers), both Neon branches, `not: null` guards.
3. **next-auth v4 internal contract** (manual callback POST) — production-proven via
   `DispatchLogout`; gate any next-auth bump on matrix #2/#6.
4. **Dual-credential driver-token rotation** — restaurant-only mode + `?as=` +
   release note.
5. **First live rating write** — DB unique + upsert + end-to-end `ratingPct` gate.
6. **i18n volume** (~60 keys ×38 + 1 deletion) — parity audit per phase is the gate;
   ICU plurals spot-checked.
7. **Desktop/app billing drift** — shared-lib-first commit with side-by-side
   verification; queries never forked.
