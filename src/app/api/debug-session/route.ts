import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSessionUser } from "@/lib/session";

/**
 * Temporary diagnostic endpoint. Returns whatever the server sees about
 * the current request's session — JWT contents, getSessionUser() output,
 * cookies. Useful for diagnosing redirect loops where the user reports
 * "I'm logged out" but we suspect they're actually authed and getting
 * bounced by a guard somewhere.
 *
 * To use:
 *   1. Log in to https://fee-free-ordering-systems.vercel.app
 *   2. Visit https://fee-free-ordering-systems.vercel.app/api/debug-session
 *   3. Compare the returned JSON against what each layout/page is checking
 *
 * REMOVE THIS FILE after debugging — it exposes session internals.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const user = await getSessionUser();
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    session: session
      ? {
          // What the session shape looks like according to NextAuth
          email: session.user?.email,
          name: session.user?.name,
          role: (session.user as any)?.role ?? null,
          restaurantId: (session.user as any)?.restaurantId ?? null,
          restaurantSlug: (session.user as any)?.restaurantSlug ?? null,
        }
      : null,
    resolvedUser: user
      ? {
          // What getSessionUser() resolved to after impersonation/etc.
          id: user.id,
          email: user.email,
          role: user.role,
          effectiveRole: user.effectiveRole,
          restaurantId: user.restaurantId,
          restaurantSlug: user.restaurantSlug,
          isImpersonating: user.isImpersonating,
          impersonationMode: user.impersonationMode,
        }
      : null,
    diagnoses: {
      adminLayoutWouldBounceToSuperadmin:
        (session?.user as any)?.role === "superadmin" && !user?.isImpersonating,
      addOnsPageWouldBounceToSuperadmin:
        !!user && !user.restaurantId,
      superadminAddOnsPageWouldBounceToLogin:
        !user || user.role !== "superadmin",
    },
  });
}
