import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { cookies } from "next/headers";

export const IMPERSONATE_COOKIE = "sa_impersonate";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  restaurantId: string | undefined;
  restaurantSlug: string | undefined;
  isImpersonating: boolean;
}

/** Returns the effective session user, applying superadmin impersonation if active. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;

  const user = session.user as any;

  if (user.role === "superadmin") {
    const cookieStore = await cookies();
    const impersonateId = cookieStore.get(IMPERSONATE_COOKIE)?.value;
    if (impersonateId) {
      return {
        ...user,
        restaurantId: impersonateId,
        isImpersonating: true,
      };
    }
    return { ...user, isImpersonating: false };
  }

  return { ...user, isImpersonating: false };
}
