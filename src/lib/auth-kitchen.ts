// Separate NextAuth config for the kitchen display.
// Uses a different cookie name than the main admin session so both can be
// active in the same browser at the same time (e.g. tab A = /kitchen signed
// in as Account A, tab B = /admin signed in as Account B).

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import prisma from "./db";

// Match the same tunnel-aware logic as the admin auth (lib/auth.ts). Real
// production domain → strict prefixed cookies. Tunnel hosts or dev → plain
// cookies because iOS Safari drops prefixed cookies on shared wildcard hosts.
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
// Different cookie name from the main auth flow → separate cookie jar entries.
const KITCHEN_COOKIE_NAME = USE_SECURE_PREFIX
  ? "__Secure-next-auth.kitchen-session-token"
  : "next-auth.kitchen-session-token";

export const kitchenAuthOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/kitchen/login",
  },
  cookies: {
    sessionToken: {
      name: KITCHEN_COOKIE_NAME,
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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { restaurant: true },
        });

        if (!user || !user.isActive) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        // Single-active-kitchen-session enforcement (Luigi 2026-06-02,
        // GloriaFood parity). On every successful kitchen login we
        // mint a fresh UUID and persist it to Restaurant.kitchenSessionToken.
        // The JWT carries this UUID; getSessionUser({ preferKitchen: true })
        // compares the JWT UUID against the DB row and treats a
        // mismatch as logged-out. So when a new device signs in, the
        // previously-active tablet's next request returns 401 and the
        // kitchen client redirects it to /kitchen/login — exactly how
        // GloriaFood enforces "only one kitchen open at a time".
        //
        // Superadmin / no restaurantId → no token to rotate (those
        // sessions never touch /kitchen anyway).
        let kitchenSessionToken: string | undefined;
        if (user.restaurantId) {
          kitchenSessionToken = randomUUID();
          await prisma.restaurant.update({
            where: { id: user.restaurantId },
            data: { kitchenSessionToken },
          });
          // Retire every existing push token for this restaurant the moment a
          // new device claims the active kitchen session. The push lifecycle
          // MUST track the session lifecycle: this login just superseded
          // whatever device was active, so that device must stop ringing on new
          // orders — even though it won't learn its session is stale until it
          // next heartbeats (it may be asleep). register-device only retired
          // OTHER tokens when a NEW *native* device registered, so a login from
          // a desktop browser (which registers no FCM token) left the old
          // phone's token as the sole push target → it kept ringing while
          // logged out. The newly-active device re-registers its own token on
          // launch (register-device POST), reclaiming sole ownership. Guarded
          // so push cleanup can never block a login. Luigi 2026-06-26 (S23 rang
          // while showing "logged in on another device").
          await prisma.kitchenPushToken
            .deleteMany({ where: { restaurantId: user.restaurantId } })
            .catch((e) => console.error("[auth-kitchen] push-token retire on login failed", e));
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.email,
          role: user.role,
          restaurantId: user.restaurantId ?? undefined,
          restaurantSlug: user.restaurant?.slug ?? undefined,
          kitchenSessionToken,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.restaurantId = (user as any).restaurantId;
        token.restaurantSlug = (user as any).restaurantSlug;
        token.kitchenSessionToken = (user as any).kitchenSessionToken;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub;
        (session.user as any).role = token.role;
        (session.user as any).restaurantId = token.restaurantId;
        (session.user as any).restaurantSlug = token.restaurantSlug;
        (session.user as any).kitchenSessionToken = token.kitchenSessionToken;
      }
      return session;
    },
  },
};
