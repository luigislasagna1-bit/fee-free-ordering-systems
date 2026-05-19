<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:owner-context -->
# Who you're working with — and what's at stake

**The owner is Luigi — a restaurant owner, not a software developer.** This is the first software product he has ever built or deployed. He is not going to catch architectural mistakes by reading the code. He cannot evaluate whether a pattern will fail at 10,000 concurrent users. He cannot tell whether a security shortcut today becomes an exploit tomorrow. He is trusting Claude (you) to be the senior engineer in the room.

**This product needs to scale to 100 → 1,000 → 10,000+ concurrent users seamlessly.** That is the explicit growth target. Every architectural decision should be evaluated against that target:

- **Database access patterns:** No N+1 queries hidden behind a Promise.all. No unbounded `findMany` without pagination or a `take` cap. Always add the right index when you add a `where` filter. If a query could go full-table, add `LIMIT`.
- **Schema decisions:** Adding a column to a hot table is expensive at scale. Think before adding nullable columns to `Order` or `MenuItem` — they could be in millions of rows. Prefer separate side-tables for sparse data.
- **Cache TTLs:** Anything read on every customer order request (restaurant lookup by slug, entitlement checks, menu fetch) should be cacheable. Note where caching SHOULD go even if we don't implement it yet, so future Claude knows where the seams are.
- **Webhooks:** Must be idempotent. Stripe / ShipDay / Resend WILL retry events. Code must handle "already processed" gracefully (atomic upserts, claim flags, version checks).
- **Background work:** Don't do slow work in the request path. Customer-facing routes must respond fast even when Resend is down, when a Stripe call is slow, etc. Use fire-and-forget with proper error logging for non-critical side effects.

**Security defaults — these are non-negotiable:**

- Every API route handler must verify the session (`getSessionUser()` or equivalent) before doing anything.
- Restaurant-scoped writes must check the user owns the restaurant (`where: { id, restaurantId: session.restaurantId }` pattern, NOT just `where: { id }`).
- Customer-supplied IDs are never trusted — always re-fetch the resource server-side and validate ownership.
- Credentials (Stripe keys, ShipDay keys, etc.) are encrypted at rest via `encrypt()` / `decrypt()` from `src/lib/encrypt.ts`.
- Never log a password, API key, payment card number, or `passwordHash`.
- CSP / CORS / cookie flags are set by the framework — don't disable them in route handlers.

**Paths NOT to go down (lessons already learned):**

- ❌ Don't add server actions / mutations that touch payment-critical state without an idempotency key — Stripe webhook retries will double-charge.
- ❌ Don't trust a client-provided `restaurantId` — always derive it from the session.
- ❌ Don't load entire tables into memory for filtering. If you find yourself doing it, add the WHERE clause to the DB query instead.
- ❌ Don't introduce blocking awaits inside high-frequency loops (the kitchen display polls every 4 seconds; the customer order page is rendered fresh per request — these are hot paths).
- ❌ Don't redirect to `/login` when the user is authed but lacks a `restaurantId` (e.g. superadmins). That causes infinite redirect loops. Pattern: `if (!user) redirect("/login")` then `if (!user.restaurantId) redirect("/superadmin")`.
- ❌ Don't push schema changes against only one Neon branch. Use `scripts/push-schema-to-both.ts` so both dev and prod stay aligned.

**When you're not sure whether a pattern scales:**

Ask. Or explicitly say "I'm not sure this scales past N users — here's why, here's what we'd do later." Better to have Luigi reject a pattern now than to ship something we have to ream out at 1,000 customers.

**The phased roadmap lives at `ROADMAP.md`.** Read it before starting work to understand where the current task fits. Update it when phases ship or get cut.
<!-- END:owner-context -->
