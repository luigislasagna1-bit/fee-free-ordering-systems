/**
 * Shared auth gate for every Marketing Kit route.
 *
 * Same four-layer pattern as the rest of the reseller API (see
 * src/app/api/reseller/restaurants/route.ts): no session → 401; not acting as a reseller, or
 * no profile id → 403; not approved → 403. The profile id ALWAYS comes from the session and
 * is never accepted from the client.
 */
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView, type SessionUser } from "@/lib/session";
import { RESELLER_KIT_BRAND_SELECT } from "./brand";
import { RESELLER_REFERRAL_URL_SELECT } from "@/lib/reseller/referral-url";

export type KitProfile = Awaited<ReturnType<typeof loadKitProfile>>;

async function loadKitProfile(resellerProfileId: string) {
  return prisma.resellerProfile.findUnique({
    where: { id: resellerProfileId },
    select: {
      id: true,
      ...RESELLER_KIT_BRAND_SELECT,
      ...RESELLER_REFERRAL_URL_SELECT,
      user: { select: { email: true, name: true } },
      kitProfile: true,
    },
  });
}

export interface KitContext {
  user: SessionUser;
  resellerProfileId: string;
  profile: NonNullable<KitProfile>;
}

/**
 * Resolve an approved reseller, or the NextResponse to return instead.
 * Callers do: `const gate = await requireKitReseller(); if (gate instanceof NextResponse) return gate;`
 */
export async function requireKitReseller(): Promise<KitContext | NextResponse> {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isResellerView(user) || !user.resellerProfileId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const profile = await loadKitProfile(user.resellerProfileId);
  if (!profile) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (profile.status !== "approved") {
    return NextResponse.json(
      { error: "Your reseller account is not approved yet." },
      { status: 403 },
    );
  }
  return { user, resellerProfileId: user.resellerProfileId, profile };
}
