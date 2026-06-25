import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView } from "@/lib/session";
import { ColorsClient } from "./ColorsClient";
import { LoginPageInfo } from "./LoginPageInfo";

/**
 * /reseller/branding/colors
 *
 * Login-page branding: the reseller's brand colors + the custom title
 * shown on their reseller-branded login/signup pages. The colors are
 * persisted on ResellerProfile.brandPrimaryColor / brandAccentColor and
 * the title on brandLoginTitle; all three are read server-side by the
 * branded auth pages (skinned via resolveResellerBranding) when the
 * white-label subscription is active.
 *
 * Same paywall as the Logo + Imprint editors — needs an active
 * White-Label subscription (basic or full). The branded login/signup
 * surface itself is Full-tier in marketing, but the editor mirrors the
 * sibling pages (any active tier can configure; host routing upstream
 * decides what actually renders), keeping the gate logic identical.
 */
export default async function ResellerColorsPage() {
  const user = await getSessionUser();
  if (!user || !isResellerView(user) || !user.resellerProfileId) {
    redirect("/reseller/holding");
  }

  const profile = await prisma.resellerProfile.findUnique({
    where: { id: user.resellerProfileId },
    select: {
      status: true,
      brandLoginTitle: true,
      brandPrimaryColor: true,
      brandAccentColor: true,
      companyName: true,
      whiteLabelStatus: true,
      whiteLabelTier: true,
    },
  });
  if (profile?.status !== "approved") redirect("/reseller/holding");

  // Branded subscribers get the live colors editor; everyone else (Free) gets
  // the login-page explainer (neutral unbranded login + upgrade path + app
  // downloads) instead of being bounced to the overview with no info.
  const wlActive = profile.whiteLabelStatus === "active" &&
    (profile.whiteLabelTier === "basic" || profile.whiteLabelTier === "full");
  if (!wlActive) {
    const neutralHost = (process.env.NEUTRAL_RESELLER_HOST || "restaurantownerlogin.com")
      .replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
    return (
      <LoginPageInfo
        neutralHost={neutralHost}
        appUrl={process.env.NEXT_PUBLIC_APP_URL || "https://feefreeordering.com"}
      />
    );
  }

  return (
    <ColorsClient
      initialTitle={profile.brandLoginTitle ?? ""}
      initialPrimary={profile.brandPrimaryColor ?? ""}
      initialAccent={profile.brandAccentColor ?? ""}
      companyName={profile.companyName ?? null}
    />
  );
}
