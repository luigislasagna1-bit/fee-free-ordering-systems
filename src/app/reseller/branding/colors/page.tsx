import { redirect } from "next/navigation";
import prisma from "@/lib/db";
import { getSessionUser, isResellerView } from "@/lib/session";
import { ColorsClient } from "./ColorsClient";

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

  // Paywall — needs an active White-Label subscription (basic or full).
  const wlActive = profile.whiteLabelStatus === "active" &&
    (profile.whiteLabelTier === "basic" || profile.whiteLabelTier === "full");
  if (!wlActive) redirect("/reseller/branding");

  return (
    <ColorsClient
      initialTitle={profile.brandLoginTitle ?? ""}
      initialPrimary={profile.brandPrimaryColor ?? ""}
      initialAccent={profile.brandAccentColor ?? ""}
      companyName={profile.companyName ?? null}
    />
  );
}
