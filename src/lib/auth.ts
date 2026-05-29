import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import prisma from "./db";
import { userBelongsToReseller } from "./reseller-membership";

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
      async authorize(credentials) {
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

          const user = await prisma.user.findUnique({
            where: { email: emailLower },
            include: { restaurant: true, resellerProfile: { select: { id: true } } },
          });

          if (!user || !user.isActive) return null;

          const valid = await bcrypt.compare(credentials.password, user.passwordHash);
          if (!valid) return null;

          // Reseller-scope enforcement. Only runs when the LoginForm
          // included a resellerProfileId in the credentials payload —
          // i.e. when sign-in is happening on a reseller branded
          // domain. Outside that context (direct sign-in on
          // feefreeordering.com), no scope is enforced.
          const resellerScopeId = credentials.resellerProfileId
            ? String(credentials.resellerProfileId).trim()
            : null;
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
