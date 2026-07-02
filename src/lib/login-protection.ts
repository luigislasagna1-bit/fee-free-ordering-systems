/**
 * Login brute-force protection (launch Blocker #9).
 *
 * Two independent layers, both keyed on FAILURES (successful logins never
 * count toward a lockout):
 *
 *   1. Shared-store failure counters — per-IP and per-email, ~10 fails /
 *      5 min, via the Upstash/KV-backed counters in rate-limit.ts so the
 *      limit holds across every Vercel isolate. A broad attempts flood-guard
 *      (30 attempts / 5 min) backstops raw hammering. No store configured →
 *      degrades to the per-isolate Map (dev/local), and layer 2 still holds.
 *      Applied to ALL four login surfaces (admin, kitchen, marketplace
 *      customer, per-restaurant customer).
 *
 *   2. DB-backed lockout on the admin/kitchen `User` row — the accounts that
 *      control money. `failedLoginCount` increments on each wrong password;
 *      at LOCK_THRESHOLD the row gets `lockedUntil = now + LOCK_MINUTES` and
 *      every login (even with the right password) is refused until it
 *      passes. Store-independent and cross-isolate by nature.
 *
 * Every refusal surfaces as the caller's SAME generic "invalid credentials"
 * error — a distinct "locked"/"slow down" message would confirm the account
 * exists (enumeration) and tell the attacker exactly when to resume.
 */
import prisma from "@/lib/db";
import { sharedCounterIncr, sharedCounterGet, localCounterIncr, localCounterGet } from "@/lib/rate-limit";

/** Failed attempts allowed per identity (IP or email) per window. */
const FAIL_LIMIT = 10;
const FAIL_WINDOW_MS = 5 * 60_000;
/** Raw-attempt flood ceiling (successes included) — generous for humans. */
const ATTEMPT_LIMIT = 30;

/** Consecutive wrong passwords on one User row before it hard-locks. */
const LOCK_THRESHOLD = 10;
const LOCK_MINUTES = 15;

const emailKey = (email: string) => email.trim().toLowerCase() || "none";

async function counterIncr(key: string): Promise<number> {
  const shared = await sharedCounterIncr(key, FAIL_WINDOW_MS);
  // Always mirror locally so the fallback (and fast-path reads) stay warm.
  const local = localCounterIncr(key, FAIL_WINDOW_MS);
  return shared ?? local;
}

async function counterGet(key: string): Promise<number> {
  const shared = await sharedCounterGet(key);
  const local = localCounterGet(key, FAIL_WINDOW_MS);
  // Take the max: if the shared store is briefly unreachable (null) or
  // lagging, the local view still counts this isolate's own failures.
  return Math.max(shared ?? 0, local);
}

/**
 * True when this (ip, email) pair may attempt a login right now.
 * Read-only on the failure counters — call recordLoginFailure() on a miss.
 * `scope` separates surfaces ("admin" | "kitchen" | "customer" | "restcust")
 * so a customer-login flood from a restaurant's shared WiFi can't lock the
 * admin surface for the same IP.
 */
export async function loginAttemptAllowed(args: { scope: string; ip: string; email: string }): Promise<boolean> {
  const em = emailKey(args.email);
  const [ipAttempts, emailAttempts, ipFails, emailFails] = await Promise.all([
    counterIncr(`login:${args.scope}:att:ip:${args.ip}`),
    counterIncr(`login:${args.scope}:att:email:${em}`),
    counterGet(`login:${args.scope}:fail:ip:${args.ip}`),
    counterGet(`login:${args.scope}:fail:email:${em}`),
  ]);
  if (ipAttempts > ATTEMPT_LIMIT || emailAttempts > ATTEMPT_LIMIT) return false;
  return ipFails < FAIL_LIMIT && emailFails < FAIL_LIMIT;
}

/** Record a FAILED login for the (ip, email) pair. Never throws. */
export async function recordLoginFailure(args: { scope: string; ip: string; email: string }): Promise<void> {
  try {
    const em = emailKey(args.email);
    await Promise.all([
      counterIncr(`login:${args.scope}:fail:ip:${args.ip}`),
      counterIncr(`login:${args.scope}:fail:email:${em}`),
    ]);
  } catch (e) {
    console.error("[login-protection] recordLoginFailure:", e);
  }
}

/** DB lockout gate for admin/kitchen users — false while the row is locked. */
export function userNotLocked(user: { lockedUntil?: Date | null }): boolean {
  return !user.lockedUntil || user.lockedUntil.getTime() <= Date.now();
}

/** Wrong password on an existing User → bump the counter; lock at threshold. */
export async function registerUserLoginFailure(userId: string): Promise<void> {
  try {
    const u = await prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    if (u.failedLoginCount >= LOCK_THRESHOLD) {
      await prisma.user.update({
        where: { id: userId },
        data: { lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000), failedLoginCount: 0 },
      });
      console.warn(`[login-protection] user ${userId} locked for ${LOCK_MINUTES}m after ${LOCK_THRESHOLD} failed logins`);
    }
  } catch (e) {
    console.error("[login-protection] registerUserLoginFailure:", e);
  }
}

/** Successful login → clear the counter/lock (only writes when needed). */
export async function clearUserLoginFailures(user: { id: string; failedLoginCount?: number; lockedUntil?: Date | null }): Promise<void> {
  if (!user.failedLoginCount && !user.lockedUntil) return;
  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  } catch (e) {
    console.error("[login-protection] clearUserLoginFailures:", e);
  }
}

/** Best-effort client IP from a headers bag (NextAuth authorize gets a plain
 *  object; route handlers can pass their Headers instance). */
export function ipFromHeaderBag(headers: Record<string, string | undefined> | Headers | undefined): string {
  if (!headers) return "unknown";
  const get = (name: string): string | undefined =>
    headers instanceof Headers ? headers.get(name) ?? undefined : headers[name] ?? headers[name.toLowerCase()];
  return get("x-forwarded-for")?.split(",")[0].trim() || get("x-real-ip") || "unknown";
}
