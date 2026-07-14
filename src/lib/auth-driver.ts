// Separate NextAuth config for the FeeFreeDelivery driver PWA (/driver).
// Its own cookie name (distinct from the admin AND kitchen sessions) so a
// single device can be signed into /admin, /kitchen, and /driver at once.
// Authenticates against the `Driver` table (NOT `User`) — drivers are their
// own pool identity, decoupled from restaurant staff accounts.

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import prisma from "./db";
import { loginAttemptAllowed, recordLoginFailure, ipFromHeaderBag } from "./login-protection";

// Same tunnel-aware cookie logic as auth.ts / auth-kitchen.ts: real production
// host → __Secure- prefixed cookie; tunnels / dev → plain (iOS Safari drops
// prefixed cookies on shared wildcard hosts).
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
export const DRIVER_COOKIE_NAME = USE_SECURE_PREFIX
  ? "__Secure-next-auth.driver-session-token"
  : "next-auth.driver-session-token";

export const driverAuthOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/driver/login",
  },
  cookies: {
    sessionToken: {
      name: DRIVER_COOKIE_NAME,
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
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;
        const emailLower = String(credentials.email).trim().toLowerCase();

        // Shared IP+email brute-force limiter (same as admin/kitchen), scoped
        // "driver". Driver isn't a User, so there is no per-User lockout — the
        // IP+email throttle is the guard.
        const ip = ipFromHeaderBag(req?.headers as Record<string, string | undefined> | undefined);
        if (!(await loginAttemptAllowed({ scope: "driver", ip, email: emailLower }))) return null;

        const driver = await prisma.driver.findUnique({ where: { email: emailLower } });
        if (!driver || !driver.isActive) {
          await recordLoginFailure({ scope: "driver", ip, email: emailLower });
          return null;
        }
        const valid = await bcrypt.compare(credentials.password, driver.passwordHash);
        if (!valid) {
          await recordLoginFailure({ scope: "driver", ip, email: emailLower });
          return null;
        }

        // Single-active-driver-session (mirrors Restaurant.kitchenSessionToken):
        // mint a fresh UUID on every login and persist it to
        // Driver.driverSessionToken. The JWT carries it; getDriverSession()
        // compares JWT vs DB and treats a mismatch as logged-out, so the last
        // login owns the session and a superseded device is bounced to /login.
        const driverSessionToken = randomUUID();
        await prisma.driver.update({
          where: { id: driver.id },
          data: { driverSessionToken },
        });

        return {
          id: driver.id,
          email: driver.email,
          name: driver.name,
          driverSessionToken,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.driverId = (user as any).id;
        token.driverName = (user as any).name;
        token.driverSessionToken = (user as any).driverSessionToken;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.driverId ?? token.sub;
        (session.user as any).driverId = token.driverId ?? token.sub;
        (session.user as any).name = token.driverName;
        (session.user as any).driverSessionToken = token.driverSessionToken;
      }
      return session;
    },
  },
};
