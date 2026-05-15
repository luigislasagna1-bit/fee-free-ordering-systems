// Separate NextAuth config for the kitchen display.
// Uses a different cookie name than the main admin session so both can be
// active in the same browser at the same time (e.g. tab A = /kitchen signed
// in as Account A, tab B = /admin signed in as Account B).

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import prisma from "./db";

const USE_SECURE_PREFIX = process.env.NODE_ENV === "production";
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

        return {
          id: user.id,
          email: user.email,
          name: user.name ?? user.email,
          role: user.role,
          restaurantId: user.restaurantId ?? undefined,
          restaurantSlug: user.restaurant?.slug ?? undefined,
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
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.sub;
        (session.user as any).role = token.role;
        (session.user as any).restaurantId = token.restaurantId;
        (session.user as any).restaurantSlug = token.restaurantSlug;
      }
      return session;
    },
  },
};
