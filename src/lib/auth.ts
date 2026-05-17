import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import prisma from "./db";

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
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { restaurant: true, resellerProfile: { select: { id: true } } },
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
          resellerProfileId: user.resellerProfile?.id ?? undefined,
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
