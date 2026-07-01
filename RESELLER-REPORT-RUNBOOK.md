# RUNBOOK — Clear out & update all reseller reports

*Fee Free Ordering Systems · reseller "Reports & Requests" tracker. All prod DB writes run by Luigi via `scripts/run-on-prod.ts` (the assistant cannot write prod).*

---

## 0. Ground truth: how the system is wired

- **Models** (`prisma/schema.prisma`): `ResellerReport` (the report; `status` default `"NEW"`), `ResellerReportComment`, `ResellerReportActivity` (append-only audit log), `ResellerReportVerification` (one WORKING/NOT_WORKING vote per person, `@@unique([reportId, voterEmail])`), `ResellerReportUpvote` ("me too"), `ResellerReportSeen` (per-viewer NEW badge), `ResellerNotification` (in-app bell feed, keyed on lowercased `recipientEmail`).
- **Statuses** (`src/lib/reseller-reports-constants.ts`): `NEW → IN_PROGRESS → IN_TESTING → FIXED`, plus terminal `WONT_FIX`. Labels: New / In Progress / In Testing / Fixed / Solved / Won't Fix.
- **`run-on-prod.ts`** flips the commented-out (prod) `DATABASE_URL` in `.env.local` active, runs the target script, then restores `.env.local`. Every script below MUST be launched through it to hit prod data resellers actually see.
- **The scripts write the DB directly** — they do NOT call the app's API, so they can post comments/notifications but they **cannot send the "please verify" email** (see §1 caveat).

---

## 1. Status lifecycle — every transition & its side effects

| Transition | Triggered by | Status write | Comment posted? | Activity row | In-app notification (bell) | Email |
|---|---|---|---|---|---|---|
| create → `NEW` | reseller/SA files report (`POST /api/reseller-reports`) | `status="NEW"` (default) | no | `CREATED` | no | no |
| `NEW → IN_PROGRESS` (and any manual dropdown change) | SA dropdown → `PATCH /api/reseller-reports/[id]` | yes | no | `STATUS_CHANGE` (`from → to`) | yes — `notifyReportStatusChange()` to reporter + upvoters (excludes actor) | **yes** — generic "Status updated" email (runs on Vercel via `after()`) |
| `NEW/IN_PROGRESS → IN_TESTING` ("Mark fix shipped") | SA button → `POST /api/reseller-reports/[id]/ship-fix` → `markFixShipped()` | `status="IN_TESTING"` | **yes** — auto "🔧 A fix shipped… please verify" comment | `STATUS_CHANGE` (`… → IN_TESTING`) | (email path; no separate bell row) | **yes — the "please verify" email** to reporter + upvoters. No-op if already `FIXED`/`WONT_FIX`. |
| `IN_TESTING → FIXED` (**auto-close**) | reseller verify votes → `POST /api/reseller-reports/[id]/verify` → `onVerificationVote()` | `status="FIXED"` **only** when ≥ `VERIFY_QUORUM` (=2) distinct WORKING votes **and** zero NOT_WORKING | no | `STATUS_CHANGE` ("auto-closed after N confirmations") | (email) | **yes** — "Resolved" email to reporter + upvoters |
| `IN_TESTING` stays put + **ops alert** | a NOT_WORKING vote while IN_TESTING | none (status unchanged) | no | `VERIFIED_BROKEN` | no | **yes** — "Fix disputed" email to `REPORTS_OPS_EMAIL` (default `support@feefreeordering.com`) |
| `→ FIXED` (manual) or `→ WONT_FIX` | SA dropdown → `PATCH …/[id]` | yes | no | `STATUS_CHANGE` | yes | yes (generic status email) |
| new comment (no status change) | `POST …/[id]/comments` → `notifyReportComment()` | none | yes | `COMMENTED` | yes — reporter + upvoters + prior commenters (excludes actor) | yes — "New comment" email |
| delete report | SA → `DELETE …/[id]` | row + all children cascade-delete | — | — | — | — |

**THE FIXED GUARDRAIL (Luigi's hard rule, enforced in `reseller-reports-workflow.ts`):** a report reaches `FIXED` only by (a) a superadmin setting it manually, or (b) auto-close with ≥2 distinct WORKING votes and zero NOT_WORKING. Never a single vote, never the assistant's judgment.

### ⚠️ CRITICAL caveat — the "please verify" email only sends from the Vercel UI button
`markFixShipped()`'s email (`sendReportNotificationEmail`, Resend) **only actually sends from the Vercel runtime** (the superadmin **"Mark fix shipped"** button on `/reseller-reports/[id]`). A local `run-on-prod` script **cannot decrypt the Resend key** → the email is a silent placeholder. So:
- **The scripts** post the comment + write the `ResellerNotification` bell row (that IS what pings the reseller in-app) and flip status — but send **no email**.
- **If you also want the verify email to Fabrizio**, Luigi clicks the "Mark fix shipped" button in the Vercel superadmin UI — **but that double-posts the "fix shipped" comment.** So pick ONE path per report: script (comment + bell, no email) **or** UI button (comment + email). Don't do both.

---

## 2. LIST all current reports with status

Primary (compact one-line-per-report + status counts + last comment):
```
npx tsx scripts/run-on-prod.ts scripts/_list-reports.ts
```
Alternatives:
- Full body + type/priority/reporter/img-count, sorted by status:
  `npx tsx scripts/run-on-prod.ts scripts/list-reseller-reports.ts`
- JSON (best for triage input — includes comment/upvote/verification counts, only NEW/IN_PROGRESS/IN_TESTING):
  `npx tsx scripts/run-on-prod.ts scripts/list-open-reports.ts`
- Full dump of every open report + all comments (deep read before fixing):
  `npx tsx scripts/run-on-prod.ts scripts/dump-reseller-reports.ts`
- Triage view (who has the LAST WORD — 🔴 reporter = needs our action, 🟢 we replied = awaiting their re-test):
  `npx tsx scripts/run-on-prod.ts scripts/_triage-reports.ts`

---

## 3. Mark FIXED / IN_TESTING and post a comment (exact commands)

**Mark a report FIXED (or any status) + optional comment + notify reporter** — `scripts/mark-report-fixed.ts <reportId> [STATUS] [comment…]` (STATUS defaults to `FIXED`; writes status + `STATUS` activity + comment + bell notification, no email):
```
npx tsx scripts/run-on-prod.ts scripts/mark-report-fixed.ts cmqtmfp2n000l04i601k71xdc FIXED "Verified working on the live site."
```
Flip one report to IN_TESTING with a comment:
```
npx tsx scripts/run-on-prod.ts scripts/mark-report-fixed.ts cmqtllluu000x04jsxxm2x33e IN_TESTING "Fix ✓ — moved to testing. Please verify 🙏"
```
Mark WONT_FIX:
```
npx tsx scripts/run-on-prod.ts scripts/mark-report-fixed.ts <reportId> WONT_FIX "Not something we'll change — reasoning: …"
```

**Post a triage/reply comment only (no status change, no email)** — `scripts/post-report-comment.ts <reportId> "body" [authorName] [authorEmail]` (defaults author to Luigi / admin@feefreeordering.com):
```
npx tsx scripts/run-on-prod.ts scripts/post-report-comment.ts cmqp8z9ko000304kykoin8wuw "Corrected: the Promo Popup now lives under Marketing and can deep-link a promotion."
```

**Flip only to IN_PROGRESS (refuses if already FIXED):**
```
npx tsx scripts/run-on-prod.ts scripts/list-reseller-reports.ts --set-in-progress=<reportId>
```

`scripts/mark-reports-in-testing.ts` is a **hard-coded batch** (four specific Fabrizio report IDs + canned comments); it takes no args — run only if those exact reports still apply, otherwise use the per-report commands above.

---

## 4. Recommended triage process (clear out every open report)

1. **Snapshot the queue:**
   `npx tsx scripts/run-on-prod.ts scripts/_triage-reports.ts` (who's waiting on whom) + `scripts/_list-reports.ts` (status counts). Optionally `dump-reseller-reports.ts` for full bodies.
2. **For each open report (NEW/IN_PROGRESS/IN_TESTING), decide bucket:**
   - **Already resolvable** (fix shipped — cross-check §5) → decide FIXED vs IN_TESTING.
   - **Still open / needs work** → leave status; if a fix just shipped but you want the reseller to re-test → `IN_TESTING`.
   - **Won't fix** → `WONT_FIX` with a clear reason comment.
3. **Prefer IN_TESTING over FIXED for shipped fixes** — honor the guardrail: let the reseller (Fabrizio) verify. Use `mark-report-fixed.ts <id> IN_TESTING "<plain-language what we fixed> Please verify 🙏"`. This posts the comment + bell notification.
4. **Send the actual "please verify" email** for the reports you want Fabrizio pinged on: Luigi opens `/reseller-reports/[id]` in the Vercel superadmin UI and clicks **"Mark fix shipped."** ⚠️ Only do this for reports NOT already flipped by script in step 3 (else the comment double-posts). Practically: either (a) script-flip + skip the button, or (b) leave status untouched and use the button for both flip + email.
5. **Triage-only notes** (root cause, dedupe links, "still investigating") → `post-report-comment.ts` (no email, no status change).
6. **Verify quorum:** once ≥2 resellers vote WORKING with no dissent, the report auto-closes to FIXED — no action needed. A NOT_WORKING vote emails ops and leaves it IN_TESTING for a human.
7. **Completeness check:** re-run `scripts/_list-reports.ts` and confirm nothing is stranded in NEW/IN_PROGRESS that should have moved. Anything still NEW after a fix shipped = missed.

---

## 5. MAPPING — reports LIKELY already resolvable (fast-triage)

Cross-referenced from git log (last 60), TODO.md Done `[x]` items, MONDAY_PLAN, and the `_comment-fabrizio-*` / flip scripts (each pre-wired to a specific report ID). **Verify each against the live report body before flipping — bodies/status may have moved since these notes.**

| Report ID | Topic | Evidence it's resolvable | Likely action |
|---|---|---|---|
| `cmqp8l948000004kys6m8xktn` | **Closing-days / exceptional hours** | TODO `[x]` "Closing-days fixes (cmqp8l948) DONE 2026-06-26"; cross-midnight + within-service validation + start-date-required + /info callout. Scripts: `_comment-fabrizio-closing-verified.ts`, `_comment-fabrizio-closuremsg.ts` | IN_TESTING → verify email |
| `cmqp8z9ko000304kykoin8wuw` | **Promo Popup** (relocate to Marketing + deep-link a promo) | TODO `[x]` "Promo Popup report (cmqp8z9ko) test polish DONE 2026-06-26"; MONDAY_PLAN §1 asks to DELETE old comment + post corrected one. Scripts: `_comment-fabrizio-popup.ts`, `-popup-v2.ts` | post corrected comment (`post-report-comment.ts`) then IN_TESTING/verify |
| `cmqtmfp2n000l04i601k71xdc` | **Get-it-Now promo grouping** | Script `_comment-fabrizio-getitnow.ts` ("built, flip NEW→IN_TESTING"); MONDAY_PLAN test #16 | IN_TESTING → verify |
| `cmqtllluu000x04jsxxm2x33e` | **Coupon usage-limit (single-use)** | TODO "coupon usage-LIMIT bug fixed + shipped: 9c504b23 / e9a22828"; script `_comment-fabrizio-coupon.ts`; MONDAY_PLAN test #14 | IN_TESTING → verify |
| `cmqt99i8s001b04jvy9uj7xjn` | **Homepage delivery/pickup timeframes toggle** (service-times) | Script `_comment-fabrizio-hometimes.ts`; MONDAY_PLAN test #20 (Show service times toggle) | IN_TESTING → verify |
| `cmqslaus9001f04l27a2lg6gm` | **ASAP / Scheduled choice** | Script `_comment-fabrizio-asap.ts` ("flip NEW→IN_TESTING") | IN_TESTING → verify |
| `cmqsmbow3000204jsfuz8b6ug` | **Multiple schedules same day (split hours)** | Script `_flip-split-hours-report.ts`; split-hours v1 + deferreds A/B/C shipped (84662c6a). Reservations split-hours is the only remainder | IN_TESTING for the shipped part (note reservations still deferred) |
| `cmqnm3hv0000b04i8tvvxx836` | **Opening hours per service** (Fabrizio re-open) | Script `_comment-fabrizio-hours-fixed.ts`; memory "Fabrizio hours VERIFIED on S23"; MONDAY_PLAN §1 pending-replies | IN_TESTING — **pending Luigi's wording OK** before flipping |
| `cmqnnt5k9000l04k3wolb1yrk` | **Custom ringtone / conflict** | Script `_comment-fabrizio-customsound.ts` ("custom sound now plays") | IN_TESTING → verify |
| `cmqsoloe6000605l1cn2344yn` | **(deeper-fix report)** | Scripts `_comment-report-deeper-fix.ts`, `_flip-report-report.ts` | inspect body; likely IN_TESTING |
| `cmqdm80tz…`, `cmqdmdh5x…`, `cmqdn4ixl…`, `cmqdnh8nk…` (R3–R6) | Reservation marketing box / later-times / dish restriction badge / required-fields enforcement | Canned in `mark-reports-in-testing.ts` (already flipped IN_TESTING 2026-06-14) | likely already IN_TESTING — confirm, else run that batch |
| `cmqdbgmk4…`, `cmqdlwe4u…` (R1–R2) | EOD / kitchen | `move-eod-kitchen-testing.ts` (already IN_TESTING) | confirm status |

**Also likely-resolvable by topic (find the matching report ID in the list, then flip):**
- **Reports order-detail 404** — TODO `[x]` built `admin/orders/[id]/page.tsx`.
- **Reports Export button on every sub-report** — TODO `[x]` DONE 2026-06-26 (labeled top-right on all 16). Note MONDAY_PLAN flags it BUILT-UNTESTED (verify presence on every sub-report before closing).
- **Report reconcile / EOD numbers** — reports-redesign (canonical `reportOrderWhere`) shipped.
- **Ghost-ring logged-out kitchen device** — TODO `[x]` FIXED 2026-06-26 (16b77b18) — but **on-device confirm still pending**; keep IN_TESTING, don't auto-close.
- **Once-per-lifetime promo preview≠charge** — TODO `[x]` FIXED (local/pending-deploy) — confirm deployed before flipping.

**Do NOT pre-close (still genuinely open — leave NEW/IN_PROGRESS):**
- Home-delivery **time slots** (`cmqqxerxs`) — touches the GOLDEN kitchen countdown, not built.
- **Street-name / `addressNumberAfterStreet`** (`cmqsn52d2`) — schema field added, UI not wired.
- **Saved-address form parity** (`cmqqt9zyl`) — Phase 1/2 shipped (f791892e, 5f9c5606) but not the full checkout-UX parity; confirm before flipping.
- The **joint per-type promotion test** items — must be tested WITH Luigi; never auto-verify.

---

## 6. Key file paths (all absolute)

- Engine: `C:\FeeFreeOrderingSystems\src\lib\reseller-reports-workflow.ts`
- Constants (statuses / `VERIFY_QUORUM`=2 / activity kinds): `C:\FeeFreeOrderingSystems\src\lib\reseller-reports-constants.ts`
- Schema models: `C:\FeeFreeOrderingSystems\prisma\schema.prisma` (lines ~3503–3687)
- Ship-fix API (the "please verify" email button): `C:\FeeFreeOrderingSystems\src\app\api\reseller-reports\[id]\ship-fix\route.ts`
- Manual status/priority/reporter PATCH + delete: `C:\FeeFreeOrderingSystems\src\app\api\reseller-reports\[id]\route.ts`
- Verify-vote / auto-close: `C:\FeeFreeOrderingSystems\src\app\api\reseller-reports\[id]\verify\route.ts`
- Scripts: `C:\FeeFreeOrderingSystems\scripts\` — `run-on-prod.ts`, `_list-reports.ts`, `list-reseller-reports.ts`, `list-open-reports.ts`, `dump-reseller-reports.ts`, `_triage-reports.ts`, `mark-report-fixed.ts`, `mark-reports-in-testing.ts`, `post-report-comment.ts`

**One-line reminder for every command below:** they run against **prod** and write real reseller-visible data — the only thing they can't do is send the verify **email** (Vercel UI button only).
