import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import prisma from "./db";
import { userBelongsToReseller } from "./reseller-membership";
import {
  loginAttemptAllowed, recordLoginFailure, userNotLocked,
  registerUserLoginFailure, clearUserLoginFailures, ipFromHeaderBag,
} from "./login-protection";

/**
 * Sentinel error string the credentials authorize() throws when a valid
 * user tries to sign in via a reseller's branded login page but doesn't
 * belong to that reseller's scope. The LoginForm catches this exact
 * string and shows a "this is X's sign-in — go to feefreeordering.com"
 * message rather than the generic "invalid credentials" toast.
 *
 * Exported so the client can match against it without hardcoding the
 * string in two places.
 */
export const RESELLER_SCOPE_ERROR = "reseller-scope-mismatch";
/** Thrown (not null-returned) when the IP/email login rate-limiter blocks an
 *  attempt BEFORE the password is checked, so the client can show "too many
 *  attempts — wait a few minutes" instead of the misleading "invalid password"
 *  (which makes people retry and stay blocked). Mirrored in the login forms. */
export const RATE_LIMITED_ERROR = "login-rate-limited";

/**
 * Given a request host, return the resellerProfileId if it matches an
 * active reseller's branded domain (custom domain OR generic subdomain).
 * Returns null when the host isn't a reseller-branded domain.
 *
 * Mirrors the lookup logic in /api/internal/resolve-host but lives here
 * (no shared module) so the credentials provider doesn't depend on a
 * route-handler import. Same WHERE constraints:
 *   - generic subdomain: active white-label sub on either tier
 *   - custom domain:     verified + active white-label sub on Full tier
 *
 * Used during sign-in to enforce reseller-scoped login.
 */
async function resolveResellerByHost(host: string): Promise<string | null> {
  if (!host) return null;

  const platformDomain = (process.env.PLATFORM_DOMAIN || "feefreeordering.com").toLowerCase();

  // Apex / www on platform domain → not a reseller branded host
  if (host === platformDomain || host === `www.${platformDomain}`) return null;

  // <slug>.<platform> → check genericSubdomain
  if (host.endsWith(`.${platformDomain}`)) {
    const label = host.slice(0, host.length - platformDomain.length - 1);
    if (label.includes(".")) return null; // deep-nested, not a reseller slug
    const reseller = await prisma.resellerProfile.findFirst({
      where: {
        genericSubdomain: label,
        status: "approved",
        whiteLabelStatus: "active",
      },
      select: { id: true },
    });
    return reseller?.id ?? null;
  }

  // Otherwise → custom domain. Apply www-canonicalization the same way
  // resolve-host does.
  const candidates = Array.from(
    new Set([host, host.replace(/^www\./, ""), `www.${host.replace(/^www\./, "")}`]),
  );
  const reseller = await prisma.resellerProfile.findFirst({
    where: {
      customDomain: { in: candidates },
      customDomainStatus: "verified",
      status: "approved",
      whiteLabelStatus: "active",
      whiteLabelTier: "full",
    },
    select: { id: true },
  });
  return reseller?.id ?? null;
}

// Cookie strictness. Use NextAuth's `__Host-`/`__Secure-` prefixed cookies
// only on a real production domain — NOT on dev tunnels (ngrok-free.dev,
// trycloudflare.com, loca.lt, etc.). iOS Safari treats those shared wildcard
// hosts as "trackers" and silently drops prefixed cookies, which makes login
// appear to do nothing. Once we deploy to feefreeordering.com (or whatever
// the real domain is), the URL no longer matches the tunnel-suffix list and
// USE_SECURE_PREFIX flips to true automatically.
function hostnameOf(url: string | undefined): string {
  if (!url) return "";
  try { return new URL(url).hostname.toLowerCase(); } catch { return ""; }
}
const TUNNEL_SUFFIXES = [
  ".ngrok-free.dev", ".ngrok-free.app", ".ngrok.io", ".ngrok.app",
  ".trycloudflare.com", ".loca.lt", ".ts.net",
];
const NEXTAUTH_HOST = hostnameOf(process.env.NEXTAUTH_URL);
const IS_TUNNEL_HOST = TUNNEL_SUFFIXES.some((s) => NEXTAUTH_HOST.endsWith(s));
const USE_SECURE_PREFIX =
  process.env.NODE_ENV === "production" && NEXTAUTH_HOST !== "" && !IS_TUNNEL_HOST;
const ADMIN_COOKIE_NAME = USE_SECURE_PREFIX
  ? "__Secure-next-auth.session-token"
  : "next-auth.session-token";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  useSecureCookies: USE_SECURE_PREFIX,
  pages: {
    signIn: "/login",
  },
  cookies: {
    sessionToken: {
      name: ADMIN_COOKIE_NAME,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: USE_SECURE_PREFIX,
      },
    },
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        // Branded-login scope hint. The LoginForm sets this to the
        // resellerProfileId when sign-in is happening on a reseller's
        // generic or custom domain. When present, we ENFORCE that the
        // authenticating user belongs to that reseller's scope —
        // restaurants under them, their own admin account, or staff
        // with access. Mismatch throws RESELLER_SCOPE_ERROR so the
        // client can show a clear "wrong sign-in page" message.
        resellerProfileId: { label: "Reseller profile (internal)", type: "text" },
      },
      async authorize(credentials, req) {
        // NextAuth converts any throw or null return from authorize() into
        // a generic "Invalid email or password" error. The try/catch is kept
        // so a thrown exception (e.g. transient DB outage) still surfaces as
        // a clean rejection rather than crashing the request — but verbose
        // diagnostic logging was removed once the channel_binding=require
        // connection-string issue was traced and fixed.
        //
        // Exception: a thrown Error whose message === RESELLER_SCOPE_ERROR
        // is deliberate — we re-throw it instead of swallowing so the
        // LoginForm can detect it via result.error and show specific copy.
        try {
          if (!credentials?.email || !credentials?.password) return null;
          const emailLower = String(credentials.email).trim().toLowerCase();

          // Brute-force guard (Blocker #9): shared-store IP+email failure
          // limiting + DB lockout. Every refusal is the same generic null →
          // "invalid credentials", so nothing leaks about WHY.
          const ip = ipFromHeaderBag(req?.headers as Record<string, string | undefined> | undefined);
          if (!(await loginAttemptAllowed({ scope: "admin", ip, email: emailLower }))) throw new Error(RATE_LIMITED_ERROR);

          const user = await prisma.user.findUnique({
            where: { email: emailLower },
            include: { restaurant: true, resellerProfile: { select: { id: true } } },
          });

          if (!user || !user.isActive) {
            await recordLoginFailure({ scope: "admin", ip, email: emailLower });
            return null;
          }
          if (!userNotLocked(user)) return null; // hard lock — even a correct password waits it out

          const valid = await bcrypt.compare(credentials.password, user.passwordHash);
          if (!valid) {
            await recordLoginFailure({ scope: "admin", ip, email: emailLower });
            await registerUserLoginFailure(user.id);
            return null;
          }
          await clearUserLoginFailures(user);

          // Reseller-scope enforcement — derived SERVER-SIDE from the
          // request host header. We can't trust the client-passed
          // resellerProfileId credential alone because:
          //   (a) the proxy matcher excludes /api/*, so the proxy-set
          //       x-reseller-profile-id header isn't present on the
          //       sign-in POST anyway; and
          //   (b) a malicious user could strip the credential from the
          //       form payload to bypass scope. Host header on the
          //       other hand is set by the browser and arrives on every
          //       request regardless of proxy or client tampering.
          // The client-passed resellerProfileId is kept as a defensive
          // cross-check — if both resolve and don't match, we treat it
          // as suspicious and reject.
          const hostHeader = String(
            (req?.headers as Record<string, string | undefined> | undefined)?.host ?? "",
          ).toLowerCase().split(":")[0].trim();

          const resellerByHost = await resolveResellerByHost(hostHeader);
          const clientPassedId = credentials.resellerProfileId
            ? String(credentials.resellerProfileId).trim()
            : null;

          // Cross-check: if the client passed a different id than the
          // server resolved, that's tampered input — reject with the
          // scope error. (If both are null, we're on a non-branded
          // host: no enforcement.)
          if (clientPassedId && resellerByHost && clientPassedId !== resellerByHost) {
            throw new Error(RESELLER_SCOPE_ERROR);
          }

          // Server-resolved id wins. Authoritative.
          const resellerScopeId = resellerByHost ?? clientPassedId;
          if (resellerScopeId) {
            const allowed = await userBelongsToReseller(user.id, resellerScopeId);
            if (!allowed) {
              // Throw a sentinel so the form can switch the error toast
              // to a scope-specific message. NextAuth turns this into
              // result.error on the client.
              throw new Error(RESELLER_SCOPE_ERROR);
            }
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name ?? user.email,
            role: user.role,
            restaurantId: user.restaurantId ?? undefined,
            restaurantSlug: user.restaurant?.slug ?? undefined,
            resellerProfileId: user.resellerProfile?.id ?? undefined,
          };
        } catch (err: any) {
          // Re-throw the scope sentinel so the client can detect it.
          if (err?.message === RESELLER_SCOPE_ERROR) throw err;
          // One concise log line so a real outage is visible without
          // spamming the runtime logs on every failed login attempt.
          console.error(`[authorize] ${err?.code ?? err?.name ?? "error"}: ${err?.message ?? err}`);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.restaurantId = (user as any).restaurantId;
        token.restaurantSlug = (user as any).restaurantSlug;
        token.resellerProfileId = (user as any).resellerProfileId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub;
        (session.user as any).role = token.role;
        (session.user as any).restaurantId = token.restaurantId;
        (session.user as any).restaurantSlug = token.restaurantSlug;
        (session.user as any).resellerProfileId = token.resellerProfileId;
      }
      return session;
    },
  },
};
