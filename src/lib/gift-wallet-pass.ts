/**
 * Gift Wallet Pass — the credential primitive for "Gift Wallet Pass"
 * (DESIGN-gift-wallet-pass.md). Lets the holder of a gifted Reward-Dollars
 * balance SPEND it at ONE restaurant without ever creating an account.
 *
 * ⚠️ THIS AUTHORIZES WALLET SPEND AND NOTHING ELSE. It is never returned by
 * getCurrentRestaurantCustomer(), never sets ff_rest_account, never sets
 * isMember, is never accepted by resolveGrantById/?grant=, cannot read order
 * history / saved addresses / profile, cannot reset a password, cannot earn,
 * cannot cross to a sibling chain restaurant, cannot buy rewardRedeemExcluded
 * items, cannot fund a refundable deposit, and cannot fund a tip. A third
 * call site beyond promo-order-context's walletCustomerId resolution and the
 * admin gift routes requires an explicit design decision, not a copy-paste.
 *
 * Credential form: crypto.randomBytes(10) → 80 bits → 16 chars of Crockford
 * Base32 (no I/L/O/U — visually ambiguous). Displayed grouped as
 * XXXX-XXXX-XXXX-XXXX. The DB stores ONLY sha256(normalized code) — the raw
 * code is never persisted, never logged. Verification is an indexed unique
 * lookup, not a signature/HMAC compare — deliberately NOT built on
 * src/lib/order-status-token.ts, which is a deterministic HMAC with no
 * nonce, no expiry, no single-use, and a NEXTAUTH_SECRET fallback. This
 * credential has no server secret and no key to rotate.
 *
 * Not single-use: the PASS (this credential) expires 90 days after issue,
 * but the underlying GIFT never expires (Luigi's rule) — a new pass can
 * always be minted. What IS single-use is the browser SESSION: each
 * exchange rotates the session secret, killing any previously-authenticated
 * device. The spend itself is single-use per order via
 * RewardLedger @@unique([accountId, orderId, reason]) and reserveCredit's
 * atomic `UPDATE ... WHERE balance >= applied` (see reward-ledger.ts) — this
 * module does not need to re-implement that guarantee.
 */
import crypto from "node:crypto";
import prisma from "@/lib/db";
import { CUSTOMER_ROW_ORDER } from "@/lib/customer-row";
import { isAccountCustomer } from "@/lib/reward-gifts";

// ─── Credential encoding ──────────────────────────────────────────────────

/** 32 symbols, no I/L/O/U — visually ambiguous with 1/1/0/V. */
const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/**
 * 16 chars from a 32-symbol alphabet = 80 bits of entropy. This length is
 * the ENTIRE security model — there is no server secret backing this
 * credential. Do not shorten it "for a friendlier checkout" without
 * re-deriving the entropy budget; see gift-wallet-pass.test.ts's exact
 * length/alphabet assertion, which carries this same warning.
 */
const CODE_LENGTH = 16;

const PASS_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days — the PASS, not the gift.
const SESSION_SLIDING_MS = 60 * 60 * 1000; // 60 minutes, renewed on each /me read
const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000; // hard cap from first exchange
const SESSION_RENEW_THRESHOLD_MS = 5 * 60 * 1000; // only rewrite when <55min remain
export const GIFT_PASS_MAX_EXCHANGES = 25;
export const GIFT_PASS_MAX_FAILED_ATTEMPTS = 25;

/** crypto.randomBytes(10) → 80 bits → 16 Crockford-base32 symbols, no padding
 *  (16 * 5 = 80 bits exactly). CSPRNG — never Math.random(). */
export function generateCode(): string {
  const bytes = crypto.randomBytes(10);
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    const chunk = bits.slice(i * 5, i * 5 + 5);
    out += CROCKFORD_ALPHABET[parseInt(chunk, 2)];
  }
  return out;
}

/**
 * Normalize a user-typed or pasted code before hashing: uppercase, strip
 * anything outside [0-9A-Z] (dashes, spaces, stray punctuation from a
 * copy-paste), map commonly-confused letters (I→1, L→1, O→0, U→V), then
 * require the result to be EXACTLY 16 chars from the real alphabet. Returns
 * null on any malformed input — never throws (this runs on unauthenticated
 * input).
 */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
  s = s.replace(/I/g, "1").replace(/L/g, "1").replace(/O/g, "0").replace(/U/g, "V");
  if (s.length !== CODE_LENGTH) return null;
  const valid = new RegExp(`^[${CROCKFORD_ALPHABET}]+$`);
  if (!valid.test(s)) return null;
  return s;
}

/** sha256 hex of the normalized code. No server secret involved — this is a
 *  content hash for an indexed lookup, not an HMAC. */
export function hashCode(normalized: string): string {
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

/** Grouped display form for emails/UI: "4K7P-9RT2-M8XW-QN5D". */
export function formatCode(normalized: string): string {
  return normalized.match(/.{1,4}/g)?.join("-") ?? normalized;
}

// ─── Cookie ────────────────────────────────────────────────────────────────

export const GIFT_PASS_COOKIE_NAME = "ff_gift_pass";
/** Browser-cookie maxAge mirrors the DB sliding window so the two expire
 *  together; the /me route re-sets this on every renewal. */
export const GIFT_PASS_COOKIE_MAX_AGE_SEC = SESSION_SLIDING_MS / 1000;

/** Set-Cookie params. Deliberately NO `domain` attribute — host-only, so a
 *  gift cookie for one restaurant's branded host never rides along to a
 *  sibling host. Distinct name AND distinct table from ff_rest_account so no
 *  existing reader can be fooled into treating this as a logged-in session. */
export function giftPassCookieOptions() {
  return {
    name: GIFT_PASS_COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GIFT_PASS_COOKIE_MAX_AGE_SEC,
  };
}

// ─── Typed refusal reasons (shared by verify/exchange/me/resolveSpender) ──

export type GiftPassRefusalCode =
  | "invalid"
  | "expired"
  | "revoked"
  | "account_exists"
  | "rewards_off"
  | "superseded"
  | "too_many_attempts"
  | "rate_limited"
  | "email_mismatch"
  | "none"
  | "generic";

// ─── Mint (admin create + admin resend re-mint) ───────────────────────────

/**
 * Mint (or re-mint) the spendable code for a gift grant. Upsert on
 * grantId @unique, so it is safe to call again for the same grant — a
 * re-mint always issues a FRESH code (the old one stops verifying
 * immediately) and resets expiresAt to a fresh 90 days + clears any
 * revocation. It deliberately does NOT reset exchangeCount, customerId, or
 * the live browser session: a re-mint (e.g. "resend" after the original
 * expired) re-authenticates the SAME wallet, it doesn't create a new one,
 * and any still-live browser session is left to expire on its own sliding/
 * absolute window rather than being force-killed.
 *
 * Never throws — returns null on failure so the caller can degrade to
 * "send the signup-only email" per the spec (a mint failure must never
 * break gift creation).
 */
export async function mintPassForGrant(opts: {
  restaurantId: string;
  grantId: string;
}): Promise<{ passId: string; code: string; expiresAt: Date } | null> {
  try {
    const normalized = generateCode();
    const codeHash = hashCode(normalized);
    const codeHint = normalized.slice(-4);
    const expiresAt = new Date(Date.now() + PASS_TTL_MS);
    const pass = await prisma.giftWalletPass.upsert({
      where: { grantId: opts.grantId },
      create: { restaurantId: opts.restaurantId, grantId: opts.grantId, codeHash, codeHint, expiresAt },
      update: { codeHash, codeHint, expiresAt, revokedAt: null, revokedReason: null, failedAttempts: 0 },
    });
    return { passId: pass.id, code: formatCode(normalized), expiresAt };
  } catch (e) {
    console.error("[gift-wallet-pass mint]", e);
    return null;
  }
}

// ─── Verify (read-only preview — no writes, no cookie) ────────────────────

export type GiftPassVerifyResult =
  | { ok: true; grantId: string; amount: number; note: string | null }
  | { ok: false; reason: GiftPassRefusalCode };

/**
 * Read-only preview: does this code exist, at this restaurant, and is the
 * gift still pending? NEVER writes (not even failedAttempts — that only
 * accrues on the mutating exchange path) and NEVER sets a cookie. Returns a
 * uniform `{ ok:false, reason:"invalid" }` for not-found/wrong-restaurant so
 * this is not a status oracle for enumeration.
 */
export async function verifyCode(opts: { restaurantId: string; code: string }): Promise<GiftPassVerifyResult> {
  const normalized = normalizeCode(opts.code);
  if (!normalized) return { ok: false, reason: "invalid" };
  try {
    const pass = await prisma.giftWalletPass.findUnique({ where: { codeHash: hashCode(normalized) } });
    if (!pass || pass.restaurantId !== opts.restaurantId) return { ok: false, reason: "invalid" };
    if (pass.revokedAt) return { ok: false, reason: "invalid" };
    if (pass.expiresAt <= new Date()) return { ok: false, reason: "invalid" };
    if (pass.exchangeCount >= GIFT_PASS_MAX_EXCHANGES || pass.failedAttempts >= GIFT_PASS_MAX_FAILED_ATTEMPTS) {
      return { ok: false, reason: "invalid" };
    }
    const gr = await prisma.pendingRewardGrant.findUnique({
      where: { id: pass.grantId },
      select: { id: true, restaurantId: true, status: true, amount: true, note: true },
    });
    if (!gr || gr.restaurantId !== opts.restaurantId || gr.status !== "pending") return { ok: false, reason: "invalid" };
    return { ok: true, grantId: gr.id, amount: gr.amount, note: gr.note };
  } catch (e) {
    console.error("[gift-wallet-pass verify]", e);
    return { ok: false, reason: "generic" };
  }
}

// ─── Exchange (the ONLY place ff_gift_pass is minted) ─────────────────────

export type GiftPassExchangeResult =
  | { ok: true; customerId: string; balance: number; redirectTo: string; sessionSecret: string }
  | { ok: false; reason: GiftPassRefusalCode };

async function bumpFailedAttempts(passId: string): Promise<void> {
  try {
    await prisma.giftWalletPass.update({ where: { id: passId }, data: { failedAttempts: { increment: 1 } } });
  } catch (e) {
    console.error("[gift-wallet-pass bumpFailedAttempts]", e);
  }
}

/**
 * The ONLY function that produces a browser session secret. Resolves the
 * code, refuses uniformly on any not-found/wrong-restaurant, refuses
 * typed refusals otherwise, resolves-or-creates the guest-twin Customer row
 * (never an account-grade row — refuses `account_exists` and tells the
 * caller to sign in instead), claims ONLY this pass's grant (never sweeps
 * every pending gift at the address), and mints a fresh single-active
 * browser session (killing any prior device).
 *
 * NOT wrapped in one big prisma.$transaction: `claimPendingGiftsFor` has its
 * own atomic guarded status flip and is shared with the signup / reset-
 * password / instant-gift paths, so it is called as-is rather than forked
 * into a transaction-aware variant that could drift from those call sites.
 * Each step here is independently idempotent/atomic (deterministic customer
 * resolution + a reconciling re-select to converge concurrent creates onto
 * one canonical row, the grant's guarded pending→claimed flip, and the pass
 * row's own update). A genuinely concurrent double-exchange of the SAME
 * code converges on the same customer row and claims the grant exactly
 * once; the loser simply gets a rotated session pointing at the same
 * wallet, which is the intended "double exchange invalidates the first
 * session, credits once" behaviour.
 */
export async function exchangePass(opts: {
  restaurantId: string;
  restaurantSlug: string;
  code: string;
  ipHash: string | null;
}): Promise<GiftPassExchangeResult> {
  const normalized = normalizeCode(opts.code);
  if (!normalized) return { ok: false, reason: "invalid" };
  try {
    const pass = await prisma.giftWalletPass.findUnique({ where: { codeHash: hashCode(normalized) } });
    if (!pass || pass.restaurantId !== opts.restaurantId) return { ok: false, reason: "invalid" };

    const now = new Date();
    if (pass.revokedAt) return { ok: false, reason: "revoked" };
    if (pass.expiresAt <= now) return { ok: false, reason: "expired" };
    if (pass.exchangeCount >= GIFT_PASS_MAX_EXCHANGES || pass.failedAttempts >= GIFT_PASS_MAX_FAILED_ATTEMPTS) {
      return { ok: false, reason: "too_many_attempts" };
    }

    const grantRow = await prisma.pendingRewardGrant.findUnique({
      where: { id: pass.grantId },
      select: { id: true, restaurantId: true, status: true, email: true, name: true, customerId: true },
    });
    if (!grantRow || grantRow.restaurantId !== opts.restaurantId) {
      await bumpFailedAttempts(pass.id);
      return { ok: false, reason: "invalid" };
    }
    // Only a REVOKED grant refuses here. A "pending" grant proceeds to claim
    // it (below); a "claimed" grant is NOT single-use-refused — re-exchanging
    // the same code from a second device/order is the whole point ("not
    // single-use, by design" — the pass lives for 90 days and the wallet can
    // be spent across many orders). claimPendingGiftsFor's own guard
    // (`status: "pending"` in its findMany) makes re-calling it on an
    // already-claimed grant a safe no-op, so no special-casing is needed
    // there — only the conflict case below needs an explicit check.
    if (grantRow.status === "revoked") {
      await bumpFailedAttempts(pass.id);
      return { ok: false, reason: "superseded" };
    }

    const email = grantRow.email.trim().toLowerCase();

    // Resolve-or-create the guest twin using the SAME deterministic ordering
    // as signup / orders / admin-gift-create, then re-select to converge a
    // concurrent double-exchange onto one canonical row.
    const existing = await prisma.customer.findFirst({
      where: { restaurantId: opts.restaurantId, email: { equals: email, mode: "insensitive" } },
      orderBy: CUSTOMER_ROW_ORDER as any,
      select: { id: true, signedUpAt: true, passwordHash: true, customerAccountId: true },
    });
    if (existing && isAccountCustomer(existing)) {
      // A leaked link must never drain a password-protected wallet — the
      // gift is already credited via the existing instant path or the
      // signup hook.
      await bumpFailedAttempts(pass.id);
      return { ok: false, reason: "account_exists" };
    }
    if (!existing) {
      try {
        await prisma.customer.create({
          data: {
            restaurantId: opts.restaurantId,
            name: grantRow.name || "Guest",
            email,
            signedUpAt: null,
            passwordHash: null,
            customerAccountId: null,
            marketingConsent: false,
            marketingConsentAt: null,
          },
        });
      } catch (e) {
        console.error("[gift-wallet-pass exchange create-twin]", e); // fall through to reconcile
      }
    }
    // Reconcile: whether we just created a row or lost a create race to a
    // concurrent exchange, always converge on the deterministic canonical
    // row before doing anything durable.
    const canonical = await prisma.customer.findFirst({
      where: { restaurantId: opts.restaurantId, email: { equals: email, mode: "insensitive" } },
      orderBy: CUSTOMER_ROW_ORDER as any,
      select: { id: true, signedUpAt: true, passwordHash: true, customerAccountId: true },
    });
    if (!canonical) return { ok: false, reason: "generic" };
    if (isAccountCustomer(canonical)) {
      await bumpFailedAttempts(pass.id);
      return { ok: false, reason: "account_exists" };
    }
    const customerId = canonical.id;
    // Defence-in-depth: if this grant was already claimed but onto a
    // DIFFERENT customer id than the one this exchange just resolved
    // (shouldn't happen given deterministic resolution, but the invariant is
    // cheap to assert), refuse rather than silently re-pointing the pass at
    // a different wallet.
    if (grantRow.status === "claimed" && grantRow.customerId && grantRow.customerId !== customerId) {
      await bumpFailedAttempts(pass.id);
      return { ok: false, reason: "superseded" };
    }

    const { claimPendingGiftsFor } = await import("@/lib/reward-gifts");
    await claimPendingGiftsFor({
      restaurantId: opts.restaurantId,
      customerId,
      email,
      grantIds: [grantRow.id], // scoped — never sweeps other pending gifts
    });

    const sessionSecret = crypto.randomBytes(20).toString("hex");
    const sessionHash = crypto.createHash("sha256").update(sessionSecret).digest("hex");
    const nowTs = Date.now();
    await prisma.giftWalletPass.update({
      where: { id: pass.id },
      data: {
        customerId,
        sessionHash,
        sessionExpiresAt: new Date(nowTs + SESSION_SLIDING_MS),
        sessionAbsoluteExpiresAt: pass.sessionAbsoluteExpiresAt ?? new Date(nowTs + SESSION_ABSOLUTE_MS),
        exchangeCount: { increment: 1 },
        lastExchangeAt: new Date(),
        lastIpHash: opts.ipHash,
      },
    });

    const { getBalance } = await import("@/lib/reward-ledger");
    const balance = await getBalance({ restaurantId: opts.restaurantId, customerId });

    return {
      ok: true,
      customerId,
      balance,
      // Relative path, SAME on both host shapes — never the origin root.
      // proxy.ts rewrites '/' to /site/<slug> for hosted-site tenants, which
      // stranded Luigi's first test recipient; /order/<slug> passes through
      // unchanged on a branded host and is the real path on the platform host.
      redirectTo: `/order/${opts.restaurantSlug}`,
      sessionSecret,
    };
  } catch (e) {
    console.error("[gift-wallet-pass exchange]", e);
    return { ok: false, reason: "generic" };
  }
}

// ─── Session read (shared by /me and resolveGiftPassSpender) ─────────────

type GiftPassSessionInfo = {
  passId: string;
  restaurantId: string;
  customerId: string;
  grantId: string;
  email: string;
};

type GiftPassSessionResult =
  | { ok: true; info: GiftPassSessionInfo }
  | { ok: false; reason: Extract<GiftPassRefusalCode, "none" | "expired" | "superseded" | "account_exists"> };

/** Read the ff_gift_pass cookie (if any), validate the session, and
 *  optionally renew the sliding window. Never throws — fails closed to
 *  `{ ok:false, reason:"none" }` on any error. Self-retires (revokes) a pass
 *  whose Customer row became an account, so a leaked link can never later
 *  drain a password-protected wallet even mid-session. */
async function readGiftPassSession(renew: boolean): Promise<GiftPassSessionResult> {
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    const raw = store.get(GIFT_PASS_COOKIE_NAME)?.value;
    if (!raw) return { ok: false, reason: "none" };
    const sessionHash = crypto.createHash("sha256").update(raw).digest("hex");
    const pass = await prisma.giftWalletPass.findUnique({ where: { sessionHash } });
    if (!pass) return { ok: false, reason: "none" };
    if (pass.revokedAt) return { ok: false, reason: "superseded" };
    const now = new Date();
    if (!pass.sessionExpiresAt || pass.sessionExpiresAt <= now) return { ok: false, reason: "expired" };
    if (!pass.sessionAbsoluteExpiresAt || pass.sessionAbsoluteExpiresAt <= now) return { ok: false, reason: "expired" };
    if (!pass.customerId) return { ok: false, reason: "none" };

    const grantRow = await prisma.pendingRewardGrant.findUnique({
      where: { id: pass.grantId },
      select: { email: true },
    });
    if (!grantRow) return { ok: false, reason: "superseded" };

    const customer = await prisma.customer.findUnique({
      where: { id: pass.customerId },
      select: { id: true, signedUpAt: true, passwordHash: true, customerAccountId: true },
    });
    if (!customer) return { ok: false, reason: "superseded" };
    if (isAccountCustomer(customer)) {
      await revokeGiftWalletPassForGrant(pass.grantId, "became_account");
      return { ok: false, reason: "account_exists" };
    }

    if (renew && pass.sessionExpiresAt.getTime() - now.getTime() < SESSION_SLIDING_MS - SESSION_RENEW_THRESHOLD_MS) {
      await prisma.giftWalletPass
        .update({ where: { id: pass.id }, data: { sessionExpiresAt: new Date(now.getTime() + SESSION_SLIDING_MS) } })
        .catch(() => {});
    }

    return {
      ok: true,
      info: { passId: pass.id, restaurantId: pass.restaurantId, customerId: customer.id, grantId: pass.grantId, email: grantRow.email },
    };
  } catch (e) {
    console.error("[gift-wallet-pass session]", e);
    return { ok: false, reason: "none" };
  }
}

/**
 * The money-path seam. Returns a bare customerId — deliberately NOT a
 * Customer object — so it's awkward to (mis)use as identity anywhere beyond
 * "the id to spend from". Returns null unless: a live gift-pass session
 * cookie exists, it matches `expectedRestaurantId` EXACTLY (no
 * chainCustomerId walk — a deliberate divergence from
 * getCurrentRestaurantCustomer), and `typedEmail` (already lowercased by the
 * caller) equals the pass's stored gift email. Consult this ONLY when there
 * is no signed-in session at all — see promo-order-context.ts.
 */
export async function resolveGiftPassSpender(opts: {
  expectedRestaurantId: string;
  typedEmail: string | null;
}): Promise<string | null> {
  if (!opts.typedEmail) return null;
  try {
    const res = await readGiftPassSession(true);
    if (!res.ok) return null;
    if (res.info.restaurantId !== opts.expectedRestaurantId) return null;
    if (res.info.email.trim().toLowerCase() !== opts.typedEmail.trim().toLowerCase()) return null;
    return res.info.customerId;
  } catch (e) {
    console.error("[gift-wallet-pass resolveSpender]", e);
    return null;
  }
}

/** Storefront-banner read: `GET /api/public/gift-pass/me`. Renews the
 *  sliding window on a successful read. */
export async function getGiftPassSession(): Promise<GiftPassSessionResult> {
  return readGiftPassSession(true);
}

// ─── Revoke ────────────────────────────────────────────────────────────────

/** Instantly kill the live code AND any live browser session for a grant's
 *  pass. Guarded (only un-revoked rows flip) so it's safe to call more than
 *  once. Called from the admin revoke route and from self-retirement when a
 *  pass holder's row becomes an account. Never throws. */
export async function revokeGiftWalletPassForGrant(grantId: string, reason: string): Promise<void> {
  try {
    await prisma.giftWalletPass.updateMany({
      where: { grantId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  } catch (e) {
    console.error("[gift-wallet-pass revoke]", e);
  }
}
