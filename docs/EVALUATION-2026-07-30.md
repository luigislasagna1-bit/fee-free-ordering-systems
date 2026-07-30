# Fee Free Ordering — Project Evaluation (2026-07-30)

**Purpose:** full-system evaluation on the same lenses as the 2026-07-02 launch-readiness audit, updated to today's state. Produced from a 5-agent parallel deep-dive (code-shrink scan, architecture/scalability review, security spot-check, feature inventory, cost inventory) over the live codebase, plus the accumulated project record.

**Then vs now (July 2 → July 30):** 335 tests → **896 tests**; 10 launch blockers → **0** (all shipped); sandbox Stripe/Resend → **live, Mail-Tester 9.9/10**; 2 apps unreleased → **2 live on Google Play, 2 in Apple review**; 0 real stores → **2 production restaurants + a reseller channel**; email in one language → **38-locale emails driven by each customer's own choice**. Every one of the 7 open reseller reports is answered; 6 in testing, 1 awaiting the EU VAT number (registration submitted 2026-07-30).

---

## Report card

| Lens | Grade | One-line verdict |
|---|---|---|
| Money paths (payments, promos, wallet) | **A** | Idempotency keys + P2002 race recovery, webhook claim-tables, atomic usage caps — "genuinely production-grade" (auditor's words) |
| Security | **A–** | July-6 hardening held: 25/25 sampled routes session-checked + tenant-scoped, zero raw-SQL risks, secrets AES-256-GCM at rest; gaps are 4 small rate-limit holes |
| i18n | **A+** | 38 locales at 6,281-key parity (0/0/0/0), per-customer email language, per-recipient staff language — beyond GloriaFood |
| Email/deliverability | **A** | SPF+DKIM+DMARC+MX complete, 9.9/10 Mail-Tester, plain-text on every email, Postmaster registered |
| Feature completeness (vs GloriaFood target) | **A** | At or beyond parity on the entire core; several capabilities GloriaFood doesn't have (reseller channel, own delivery network, 38 languages) |
| Database schema & indexes | **A–** | All hot-path indexes present with intent comments; one gap (Order customerPhone/email for the first-order groupBys) |
| Architecture / scalability | **B** | Solid patterns throughout, but the single biggest weakness of the whole system lives here: **zero caching on the customer order page** |
| Code size & quality | **B+** | ~102K LOC is right-sized for the feature set; only ~440 LOC genuinely dead; monoliths are organizational debt, not bloat |
| Testing | **B** | 896 green unit/integration tests + disciplined manual E2E per change; no automated browser E2E in CI |
| Ops & observability | **B+** | Sentry wired, backup cron, preflight discipline, dual-branch schema rule; Neon PITR tier decision still open |

**Overall: A– for its stage.** The system is production-quality where it counts most (money, security, correctness), feature-complete against its declared competitor, and lean to run. The weaknesses are known, bounded, and none is urgent at 2-store scale.

---

## What's missing / lacking (prioritized)

### Fix soon (cheap, real)
1. **Rate limits on two public endpoints (~10 lines each):** `/api/public/apply-promos` accepts coupon codes with no limiter (bypasses the coupon route's 10/min brute-force guard) and `/api/public/reservations` POST has no per-IP limit (booking spam can ring kitchens and exhaust a FREE plan's 100/month pool). Same pattern as payment-intent.
2. **Dep + dead-code cleanup (zero risk):** remove 6 unused npm packages (date-fns, zod, zustand, react-hook-form, @hookform/resolvers, pdfkit + @types), 6 orphan files (~390 LOC), the duplicate kitchen Countdown (~50 LOC), and the stale `serverExternalPackages` entries. ⚠️ Nine other zero-import deps are load-bearing (Capacitor plugins, @prisma/client, pg/neon peers, dotenv) — never strip via naive depcheck.
3. **Neon PITR decision (open since July 2):** paid tier = 7–30-day point-in-time restore. This is the "instant undo" for a real-money database; the free tier's ~1 day is thin.

### The one real scalability item (before serious growth)
4. **Cache the customer order page.** Every visit costs ~18–25 sequential DB queries for data that's identical for every visitor and changes rarely. Graded C+ — the worst grade in the system, on the highest-traffic page. The seams are already marked in comments; a 30–60s per-restaurant cache (restaurant + menu tree + promos + platform settings) collapses the dominant load before 10K users. Second tier, later: delta/ETag on the kitchen 4s poll, pagination on admin/customers, the Order(customerPhone/email) index.

### Strategic gaps (correctly absent today, in this order when growth resumes)
5. **Table-QR dine-in ordering** — the one gap prospects will actually ask about; cheap because the QR/smart-link infra already exists.
6. **POS integrations** — the #1 objection when selling upmarket against Square/Toast; coming-soon page is correctly collecting demand signal.
7. Everything else surveyed (public reviews display, accounting connectors, SMS marketing, loyalty-tier page, waitlist, catering quotes, franchise rollups, public API, outbound webhooks, staff scheduling, inventory counts) — **all justified deferrals** at this stage; none blocks the current market.

---

## Code-size verdict: right-sized — do NOT shrink the app

- **src/ (~102K LOC) earns its size.** The sweep found only **~440 LOC of genuinely dead code** across 100K+. Apparent duplication is mostly deliberate (thermal vs HTML receipt builders; three auth-form families with genuinely different flows — a merge would save ~400 LOC at medium-high risk for zero user value: **rejected**).
- **The monoliths (OrderingPageClient 7.3K, KitchenDisplay 5.4K, MenuClient 4.2K, orders route 2.9K) are organizational debt, not bloat.** Splitting them saves zero lines and touches hardware-verified locked surfaces. Leave them; extract only when a feature change forces entry.
- **The real weight is scripts/ (20MB, 1,333 files):** ~60% is one-off — 17K LOC of `_`-prefixed diagnostics, 745 one-shot i18n splice-pack files, ~8MB of committed PNGs. Nothing in the build uses them (only two non-underscore scripts). Safe to archive/prune anytime; zero runtime risk.
- **Untouchables reaffirmed:** the GOLDEN printer pipeline (receipt.ts + escpos), locked kitchen display surfaces, the deliberate receipt-builder duplication.

**Bottom line: the codebase is lean for what it does. Total safe shrink ≈ 440 app LOC + 6 deps + ~15MB of repo weight — housekeeping, not surgery.**

---

## Recurring cost breakdown

*(US$ unless noted; "est." = typical published pricing at current usage — exact bills depend on the plan tiers actually selected.)*

### Platform pays — fixed monthly
| Service | What it does here | Now (est.) | What makes it grow |
|---|---|---|---|
| **Vercel Pro** | Hosting, 22 cron jobs, serverless compute | **$20/mo** | Function invocations (kitchen 4s poll × devices; per-minute crons) |
| **Vercel Blob** | Menu/promo images, uploads, APKs, DB backups | ~$0–5/mo | Per-GB storage + bandwidth |
| **Neon Postgres** | The database, 2 branches | $0 free tier today; **~$19/mo recommended** (Launch, for 7–30d PITR) | Compute hours, storage, history retention |
| **Resend** | Every email (transactional + marketing) | **$0** (≤3K/mo) → $20/mo at 50K | Per email; grows with orders × recipients |
| **Twilio** | Order-alert calls, SMS add-on, 1-888 support line | **~$3–10/mo** (number ~$1.15 + usage) | Per SMS (~1¢) / per voice minute (~1.4¢); per-country numbers later |
| **Google Maps** | Maps, Places autocomplete, drive-time ETA | **$0** (within free credit) | Per map load / autocomplete session / matrix element |
| **Anthropic API** | AI menu-PDF import, report AI (Sonnet) | **~$2–10/mo** | Per token — will scale with the /import growth funnel |
| **Sentry** | Error monitoring | **$0** (free tier) → $26/mo Team | Per event — a hot-path error spike burns quota |
| **Upstash Redis** | Shared rate-limit store | **$0** (free tier) | Per command |
| **Codemagic** | iOS cloud builds (no Mac needed) | **$0** (500 free macOS min/mo) | Per build minute — scales with release cadence |
| SerpAPI / Tawk.to / Calendly | Rank report (unset) / chat / demo booking | **$0** | Only if enabled/upgraded |

**Fixed subtotal today: ≈ $25–35/mo actual; ≈ $45–65/mo with the recommended Neon upgrade.**

### Platform pays — annual / one-time
| Item | Cost |
|---|---|
| Apple Developer × **2** (Luigi's Lasagna team — renews **~Aug 3**; Fee Free Ordering ORG) | **$99 × 2 = $198/yr** |
| Google Play Console | $25 one-time (paid) |
| Domains (feefreeordering.com, feefreefood.com, …) | ~$20–40/yr each |
| Accounting: corporate tax return + optional OSS agent for quarterly EU VAT returns | ~CA$500–1,500/yr + €0 (DIY) to €300–1,500/yr |
| BMO business account | ~$0–25/mo plan-dependent |

### Proportional to revenue (not fixed)
| Item | Rate | Note |
|---|---|---|
| Stripe fees on **platform subscription revenue** | ~2.9% + 30¢ per charge | Cost of collecting your own SaaS revenue |
| Stripe Tax (once EU VAT goes live) | ~0.5–0.7% | Only on transactions where tax is calculated |
| FeeFree Delivery driver pay | per-delivery driver comp | **Pass-through by design** — billed to restaurants weekly (auto-billing paused pending A23) |

### Restaurant pays (never the platform)
Stripe/PayPal processing on their own customer orders (key-only model — their account, their fees) · ShipDay per-delivery (their account; platform has a free partner-referral arrangement only) · PrintNode plan (opt-in, default OFF — the Star LAN GOLDEN pipeline is free) · their own custom domain · their own mailbox (e.g. Microsoft 365 for info@luigislasagna.com).

**Headline: the entire platform currently runs on roughly $30–65/month plus ~$200/year in store memberships.** Every cost that grows, grows in proportion to usage or revenue — there is no fixed-cost cliff anywhere before serious scale, and the biggest future cost line (driver pay) is architected as a pass-through.

---

## Recommended actions from this evaluation
1. Polish batch additions (next code session): the 2 public rate limits; dep + dead-file cleanup; Order(customerPhone/email) index.
2. Before the growth push: the order-page cache (single highest-leverage performance change in the system).
3. Owner: Neon paid tier for PITR; watch the Aug 3 Apple renewal.
4. scripts/ housekeeping whenever convenient (archive one-offs; zero risk).
5. Strategic roadmap (already recorded): table-QR dine-in, then POS, after EU-VAT + growth engine.
